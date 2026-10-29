import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Endpoint, ProjectConfig, Workload } from "./config.js";
import { resolveHeaders, resolveBody, validateTargets } from "./security.js";
import { reportFromSummary, saveReport, type RunReport, type RunReportV2 } from "./report.js";
import type { Profile } from "./profiles.js";
import { PROFILE_METADATA } from "./profiles.js";

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: false, windowsHide: true });
    child.once("error", (error) => reject(new Error(`Unable to start k6. Install Grafana k6 and ensure it is on PATH. ${error.message}`)));
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`k6 terminated by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

/**
 * Parse duration string to milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const match = /^([1-9]\d*)(ms|s|m|h)$/.exec(duration);
  if (!match) return 0;
  const value = Number(match[1]!);
  const unit = match[2] as "ms" | "s" | "m" | "h";
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return value * multipliers[unit];
}

/**
 * Generate basic k6 script for simple VU-based tests (smoke, load)
 */
function makeSimpleScript(
  endpoints: Array<Endpoint & { headers: Record<string, string> }>,
  p95Ms: number,
  failedRate: number
): string {
  const endpointsForScript = endpoints.map(e => ({
    name: e.name,
    url: e.url,
    method: e.method,
    headers: e.headers,
    body: e.body ? (e.bodyType === "json" ? JSON.parse(e.body) : e.body) : null,
    bodyType: e.bodyType ?? "text"
  }));
  
  const encoded = JSON.stringify(endpointsForScript);
  return `import http from "k6/http";
import { check } from "k6";
const endpoints = ${encoded};
export const options = {
  thresholds: {
    http_req_duration: ["p(95)<${p95Ms}"],
    http_req_failed: ["rate<${failedRate}"]
  }
};
export default function () {
  for (const endpoint of endpoints) {
    let body = null;
    let params = { headers: endpoint.headers, tags: { endpoint: endpoint.name, method: endpoint.method }, timeout: "30s", redirects: 0 };
    
    if (endpoint.body !== null) {
      if (endpoint.bodyType === "json") {
        body = JSON.stringify(endpoint.body);
        params.headers["Content-Type"] = "application/json";
      } else {
        body = endpoint.body;
      }
    }
    
    const response = http.request(endpoint.method, endpoint.url, body, params);
    check(response, { 
      [endpoint.name + " responds"]: (r) => r.status >= 200 && r.status < 400 
    });
  }
}
export function handleSummary(data) {
  const output = {};
  output[__ENV.K6BOOST_SUMMARY_PATH] = JSON.stringify(data, null, 2);
  output.stdout = JSON.stringify({ metrics: data.metrics }, null, 2);
  return output;
}
`;
}

/**
 * Generate k6 script for stress/breakpoint tests with ramping VUs
 */
function makeStressScript(
  endpoints: Array<Endpoint & { headers: Record<string, string> }>,
  stages: Array<{ duration: string; target: number }>,
  thresholds: { p95Ms?: number; p99Ms?: number; failedRate: number }
): string {
  const endpointsForScript = endpoints.map(e => ({
    name: e.name,
    url: e.url,
    method: e.method,
    headers: e.headers,
    body: e.body ? (e.bodyType === "json" ? JSON.parse(e.body) : e.body) : null,
    bodyType: e.bodyType ?? "text"
  }));
  
  const encoded = JSON.stringify(endpointsForScript);
  const stagesJson = JSON.stringify(stages);
  
  const thresholdLines: string[] = [];
  if (thresholds.p95Ms) thresholdLines.push(`http_req_duration: ["p(95)<${thresholds.p95Ms}"]`);
  if (thresholds.p99Ms) thresholdLines.push(`http_req_duration: ["p(99)<${thresholds.p99Ms}"]`);
  thresholdLines.push(`http_req_failed: ["rate<${thresholds.failedRate}"]`);
  
  const thresholdsObj = `{ ${thresholdLines.join(", ")} }`;
  
  return `import http from "k6/http";
import { check } from "k6";
const endpoints = ${encoded};
const stages = ${stagesJson};
export const options = {
  stages: stages,
  thresholds: ${thresholdsObj}
};
export default function () {
  for (const endpoint of endpoints) {
    let body = null;
    let params = { headers: endpoint.headers, tags: { endpoint: endpoint.name, method: endpoint.method }, timeout: "30s", redirects: 0 };
    
    if (endpoint.body !== null) {
      if (endpoint.bodyType === "json") {
        body = JSON.stringify(endpoint.body);
        params.headers["Content-Type"] = "application/json";
      } else {
        body = endpoint.body;
      }
    }
    
    const response = http.request(endpoint.method, endpoint.url, body, params);
    check(response, { 
      [endpoint.name + " responds"]: (r) => r.status >= 200 && r.status < 400 
    });
  }
}
export function handleSummary(data) {
  const output = {};
  output[__ENV.K6BOOST_SUMMARY_PATH] = JSON.stringify(data, null, 2);
  output.stdout = JSON.stringify({ metrics: data.metrics }, null, 2);
  return output;
}
`;
}

/**
 * Generate k6 script for arrival-rate tests
 */
function makeArrivalRateScript(
  endpoints: Array<Endpoint & { headers: Record<string, string> }>,
  arrivalRate: number,
  duration: string,
  thresholds: { p95Ms?: number; p99Ms?: number; failedRate: number }
): string {
  const endpointsForScript = endpoints.map(e => ({
    name: e.name,
    url: e.url,
    method: e.method,
    headers: e.headers,
    body: e.body ? (e.bodyType === "json" ? JSON.parse(e.body) : e.body) : null,
    bodyType: e.bodyType ?? "text"
  }));
  
  const encoded = JSON.stringify(endpointsForScript);
  
  const thresholdLines: string[] = [];
  if (thresholds.p95Ms) thresholdLines.push(`http_req_duration: ["p(95)<${thresholds.p95Ms}"]`);
  if (thresholds.p99Ms) thresholdLines.push(`http_req_duration: ["p(99)<${thresholds.p99Ms}"]`);
  thresholdLines.push(`http_req_failed: ["rate<${thresholds.failedRate}"]`);
  
  const thresholdsObj = `{ ${thresholdLines.join(", ")} }`;
  
  return `import http from "k6/http";
import { check } from "k6";
const endpoints = ${encoded};
export const options = {
  scenarios: {
    main: {
      executor: "constant-arrival-rate",
      rate: ${arrivalRate},
      timeUnit: "1s",
      duration: "${duration}",
      preAllocatedVUs: Math.ceil(${arrivalRate}),
      maxVUs: Math.ceil(${arrivalRate} * 2)
    }
  },
  thresholds: ${thresholdsObj}
};
export default function () {
  for (const endpoint of endpoints) {
    let body = null;
    let params = { headers: endpoint.headers, tags: { endpoint: endpoint.name, method: endpoint.method }, timeout: "30s", redirects: 0 };
    
    if (endpoint.body !== null) {
      if (endpoint.bodyType === "json") {
        body = JSON.stringify(endpoint.body);
        params.headers["Content-Type"] = "application/json";
      } else {
        body = endpoint.body;
      }
    }
    
    const response = http.request(endpoint.method, endpoint.url, body, params);
    check(response, { 
      [endpoint.name + " responds"]: (r) => r.status >= 200 && r.status < 400 
    });
  }
}
export function handleSummary(data) {
  const output = {};
  output[__ENV.K6BOOST_SUMMARY_PATH] = JSON.stringify(data, null, 2);
  output.stdout = JSON.stringify({ metrics: data.metrics }, null, 2);
  return output;
}
`;
}

export interface RunOptions {
  profile: Profile;
  allowRemote: boolean;
  allowLocal: boolean;
  vus?: number;
  duration?: string;
  arrivalRate?: number;
  stages?: Array<{ duration: string; target: number }>;
  output?: string;
  workload?: Workload;
  thresholdOverrides?: Record<string, number>;
}

export async function runTest(config: ProjectConfig, options: RunOptions): Promise<{ report: RunReportV2; path: string }> {
  if (!config.endpoints.length) throw new Error('No endpoints configured. Add one with "k6boost add-endpoint <name> <url>".');
  
  const profileMeta = PROFILE_METADATA[options.profile];
  
  // Determine workload parameters based on profile
  let vus: number | undefined;
  let duration: string;
  let arrivalRate: number | undefined;
  let stages: Array<{ duration: string; target: number }> | undefined;
  
  if (options.profile === "smoke") {
    vus = options.vus ?? 1;
    duration = options.duration ?? "10s";
  } else if (options.profile === "load") {
    vus = options.vus ?? 5;
    duration = options.duration ?? "30s";
  } else if (options.profile === "stress") {
    // Stress requires explicit stages or use defaults
    if (!options.stages && !options.vus && !options.arrivalRate) {
      throw new Error("Stress test requires --vus, --duration, and --stage-duration, or explicit --stages");
    }
    stages = options.stages;
    duration = options.duration ?? "10m";
  } else if (options.profile === "spike") {
    if (!options.vus || !options.duration) {
      throw new Error("Spike test requires --vus and --duration");
    }
    vus = options.vus;
    duration = options.duration;
  } else if (options.profile === "soak") {
    if (!options.duration) {
      throw new Error("Soak test requires --duration");
    }
    vus = options.vus ?? 5;
    duration = options.duration;
    arrivalRate = options.arrivalRate;
  } else if (options.profile === "breakpoint") {
    if (!options.stages && !options.vus) {
      throw new Error("Breakpoint test requires --stages or --vus with --stage-duration");
    }
    stages = options.stages;
    duration = options.duration ?? "15m";
  } else if (options.profile === "regression") {
    throw new Error("Regression tests are not yet implemented");
  } else if (options.profile === "custom") {
    if (!options.workload) {
      throw new Error("Custom scenario requires workload configuration");
    }
    vus = options.workload.vus;
    arrivalRate = options.workload.arrivalRate;
    duration = options.workload.duration ?? "1m";
    stages = options.workload.stages;
  } else {
    throw new Error(`Unknown profile: ${options.profile}`);
  }
  
  // Validate workload parameters
  if (vus !== undefined) {
    if (!Number.isInteger(vus) || vus < 1 || vus > profileMeta.maxVUs) {
      throw new Error(`VUs must be an integer between 1 and ${profileMeta.maxVUs}.`);
    }
  }
  
  const durationMs = parseDurationToMs(duration);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > profileMeta.maxDurationMs) {
    throw new Error(`Duration must be positive and no longer than ${profileMeta.maxDurationMs / 1000}s.`);
  }
  
  // Validate target authorization
  validateTargets(config.endpoints, options.allowRemote, options.allowLocal);
  
  // Resolve headers and validate bodies
  const endpoints = config.endpoints.map((e) => ({
    ...e,
    headers: resolveHeaders(e.headers, e.name),
    body: resolveBody(e.body, e.bodyType, e.name)
  }));
  
  const workdir = await mkdtemp(join(tmpdir(), "k6boost-"));
  const scriptPath = join(workdir, "test.js");
  const summaryPath = join(workdir, "summary.json");
  
  try {
    // Determine which script generator to use
    let script: string;
    const thresholds = {
      p95Ms: config.thresholds.p95Ms,
      failedRate: config.thresholds.failedRate
    };
    
    if (options.profile === "smoke" || options.profile === "load") {
      script = makeSimpleScript(endpoints, thresholds.p95Ms, thresholds.failedRate);
    } else if (stages) {
      script = makeStressScript(endpoints, stages, thresholds);
    } else if (arrivalRate) {
      script = makeArrivalRateScript(endpoints, arrivalRate, duration, thresholds);
    } else if (vus) {
      script = makeSimpleScript(endpoints, thresholds.p95Ms, thresholds.failedRate);
    } else {
      throw new Error("Unable to determine appropriate k6 script for this profile");
    }
    
    await writeFile(scriptPath, script, { encoding: "utf8", mode: 0o600 });
    
    // Build k6 command arguments
    const args = ["run"];
    
    // For simple VU-based tests, add --vus and --duration
    if (vus !== undefined && !stages && !arrivalRate) {
      args.push("--vus", String(vus), "--duration", duration);
    }
    
    args.push("-e", `K6BOOST_SUMMARY_PATH=${summaryPath}`, scriptPath);
    
    const code = await runProcess("k6", args, { ...process.env, K6BOOST_SUMMARY_PATH: summaryPath });
    
    let summary: unknown;
    try {
      summary = JSON.parse(await readFile(summaryPath, "utf8"));
    } catch {
      throw new Error(`k6 did not produce a readable summary (exit code ${code}). Check the k6 output above.`);
    }
    
    const hosts = [...new Set(config.endpoints.map((e) => new URL(e.url).host))];
    const report = reportFromSummary(summary as Parameters<typeof reportFromSummary>[0], {
      id: new Date().toISOString().replace(/[:.]/g, "-"),
      createdAt: new Date().toISOString(),
      profile: options.profile,
      targetHosts: hosts,
      workload: {
        vus,
        arrivalRate,
        duration,
        stages,
        executor: arrivalRate ? "constant-arrival-rate" : stages ? "ramping-vus" : "constant-vus"
      },
      thresholds
    });
    
    const path = await saveReport(report, options.output);
    console.log(`\nReport saved: ${path}`);
    
    if (code !== 0 || !report.thresholdsPassed) {
      throw new Error("Performance test failed. Review k6 output and the saved report.");
    }
    
    return { report, path };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
