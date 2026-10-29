import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Endpoint, ProjectConfig } from "./config.js";
import { resolveHeaders, validateTargets } from "./security.js";
import { reportFromSummary, saveReport, type RunReport } from "./report.js";

export type Profile = "smoke" | "load";

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

function makeScript(endpoints: Array<Endpoint & { headers: Record<string, string> }>, p95Ms: number, failedRate: number): string {
  const encoded = JSON.stringify(endpoints);
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
    const response = http.request(endpoint.method, endpoint.url, endpoint.body ?? null, {
      headers: endpoint.headers,
      tags: { endpoint: endpoint.name, method: endpoint.method },
      timeout: "30s",\n      redirects: 0
    });
    check(response, { [endpoint.name + " responds"]: (r) => r.status >= 200 && r.status < 400 });
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
  output?: string;
}

export async function runTest(config: ProjectConfig, options: RunOptions): Promise<{ report: RunReport; path: string }> {
  if (!config.endpoints.length) throw new Error('No endpoints configured. Add one with "k6boost add-endpoint <name> <url>".');
  const defaults = options.profile === "smoke" ? { vus: 1, duration: "10s" } : { vus: 5, duration: "30s" };
  const vus = options.vus ?? defaults.vus;
  const duration = options.duration ?? defaults.duration;
  if (!Number.isInteger(vus) || vus < 1 || vus > 50) throw new Error("VUs must be an integer between 1 and 50.");
  const durationMatch = /^([1-9]\d*)(ms|s|m|h)$/.exec(duration);
  const unit = durationMatch?.[2] as "ms" | "s" | "m" | "h" | undefined;
  const durationMs = durationMatch ? Number(durationMatch[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit!]) : Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(durationMs) || durationMs > 600_000) throw new Error("Duration must be positive and no longer than 10 minutes (for example 10s or 1m).");
  if (options.profile === "smoke" && vus > 1) throw new Error("Smoke profile is limited to 1 VU.");
  if (options.profile === "load" && !options.allowRemote && !options.allowLocal) {
    // The target-specific guard below gives a more useful error; this is intentionally not a bypass.
  }
  validateTargets(config.endpoints, options.allowRemote, options.allowLocal);
  const endpoints = config.endpoints.map((e) => ({ ...e, headers: resolveHeaders(e.headers, e.name) }));
  const workdir = await mkdtemp(join(tmpdir(), "k6boost-"));
  const scriptPath = join(workdir, "test.js");
  const summaryPath = join(workdir, "summary.json");
  try {
    await writeFile(scriptPath, makeScript(endpoints, config.thresholds.p95Ms, config.thresholds.failedRate), { encoding: "utf8", mode: 0o600 });
    const args = ["run", "--vus", String(vus), "--duration", duration, "-e", `K6BOOST_SUMMARY_PATH=${summaryPath}`, scriptPath];
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
      workload: { vus, duration },
      thresholds: config.thresholds
    });
    const path = await saveReport(report, options.output);
    console.log(`\nReport saved: ${path}`);
    console.log(`Requests: ${report.metrics.requestCount} | p95: ${report.metrics.p95Ms ?? "n/a"} ms | failed: ${(report.metrics.failedRate * 100).toFixed(2)}%`);
    if (code !== 0 || !report.thresholdsPassed) throw new Error("Performance test failed. Review k6 output and the saved report.");
    return { report, path };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
