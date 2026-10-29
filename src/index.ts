#!/usr/bin/env node
import { Command } from "commander";
import { access } from "node:fs/promises";
import { loadConfig, saveConfig, defaultConfig, CONFIG_FILE, EndpointSchema } from "./config.js";
import { readReport } from "./report.js";
import { runTest, type Profile } from "./runner.js";

const program = new Command();
program.name("k6boost").description("Repeatable API performance testing powered by Grafana k6").version("0.1.0");

program.command("init")
  .description("Create a starter k6boost.json configuration")
  .action(async () => {
    try {
      await access(CONFIG_FILE);
      throw new Error(`${CONFIG_FILE} already exists; refusing to overwrite it.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await saveConfig(defaultConfig());
    console.log(`Created ${CONFIG_FILE}. Add endpoints with "k6boost add-endpoint <name> <url>".`);
  });

program.command("add-endpoint")
  .description("Add an HTTP endpoint to k6boost.json")
  .argument("<name>", "Unique endpoint name")
  .option("--url <url>", "HTTP(S) URL (required)")
  .option("-X, --method <method>", "HTTP method", "GET")
  .option("--header <header>", "Request header in key:value format (repeatable)", (val, prev: string[] = []) => [...prev, val])
  .option("--body <body>", "Request body (JSON or plain text)")
  .option("--body-type <type>", "Body type: json or text (inferred from Content-Type if not specified)")
  .action(async (name: string, opts: { url?: string; method: string; header?: string[]; body?: string; bodyType?: string }) => {
    // Support both old format (positional URL) and new format (--url flag)
    let url = opts.url;
    if (!url) {
      throw new Error("URL is required. Use: k6boost add-endpoint <name> --url <url> [options]");
    }
    
    const config = await loadConfig();
    const method = opts.method.toUpperCase();
    
    // Parse headers
    const headers: Record<string, string> = {};
    if (opts.header) {
      for (const header of opts.header) {
        const colonIdx = header.indexOf(":");
        if (colonIdx <= 0) throw new Error(`Header "${header}" must be in key:value format.`);
        const key = header.slice(0, colonIdx).trim();
        const value = header.slice(colonIdx + 1).trim();
        if (!key) throw new Error("Header key cannot be empty.");
        headers[key] = value;
      }
    }
    
    // Infer body type from Content-Type header if not specified
    let bodyType = opts.bodyType;
    if (opts.body && !bodyType) {
      if (headers["Content-Type"]?.includes("application/json") || headers["content-type"]?.includes("application/json")) {
        bodyType = "json";
      }
    }
    
    const endpoint = EndpointSchema.parse({
      name,
      url,
      method,
      headers,
      body: opts.body,
      bodyType
    });
    
    if (config.endpoints.some((e) => e.name === endpoint.name)) throw new Error(`Endpoint "${endpoint.name}" already exists.`);
    config.endpoints.push(endpoint);
    await saveConfig(config);
    console.log(`Added ${endpoint.method} ${endpoint.url} as "${endpoint.name}".`);
    if (opts.body) console.log(`  Body (${bodyType ?? "text"}): ${opts.body.length} bytes`);
    console.log("For authentication, set headers in k6boost.json using values like ${API_TOKEN} as an environment-variable reference.");
  });

program.command("list-endpoints")
  .description("List configured endpoints without displaying headers or bodies")
  .action(async () => {
    const config = await loadConfig();
    if (!config.endpoints.length) return console.log("No endpoints configured.");
    console.log("Name\tMethod\tURL\tBody");
    for (const e of config.endpoints) {
      const bodyInfo = e.body ? `${e.bodyType ?? "text"} (${e.body.length}B)` : "-";
      console.log(`${e.name}\t${e.method}\t${e.url}\t${bodyInfo}`);
    }
  });

program.command("test")
  .description("Run an API performance test using Grafana k6")
  .option("-p, --profile <profile>", "Workload profile: smoke or load", "smoke")
  .option("--allow-remote", "Confirm authorization to send requests to remote hosts")
  .option("--allow-local", "Allow localhost and private-network targets")
  .option("--vus <count>", "Virtual users (1-50)", (v) => Number(v))
  .option("--duration <duration>", "Test duration, e.g. 10s or 1m")
  .option("-o, --output <path>", "Write report to this path")
  .action(async (opts: { profile: string; allowRemote?: boolean; allowLocal?: boolean; vus?: number; duration?: string; output?: string }) => {
    if (opts.profile !== "smoke" && opts.profile !== "load") throw new Error('Profile must be "smoke" or "load".');
    await runTest(await loadConfig(), {
      profile: opts.profile as Profile,
      allowRemote: Boolean(opts.allowRemote),
      allowLocal: Boolean(opts.allowLocal),
      vus: opts.vus,
      duration: opts.duration,
      output: opts.output
    });
  });

program.command("compare")
  .description("Compare two saved JSON reports")
  .argument("<baseline>", "Path to baseline report")
  .argument("<current>", "Path to current report")
  .action(async (baselinePath: string, currentPath: string) => {
    const [baseline, current] = await Promise.all([readReport(baselinePath), readReport(currentPath)]);
    const compatible = baseline.profile === current.profile &&
      JSON.stringify(baseline.targetHosts.slice().sort()) === JSON.stringify(current.targetHosts.slice().sort()) &&
      baseline.workload.vus === current.workload.vus && baseline.workload.duration === current.workload.duration;
    console.log(`Baseline: ${baseline.createdAt} (${baseline.id})`);
    console.log(`Current:  ${current.createdAt} (${current.id})`);
    if (!compatible) console.warn("WARNING: workload profile, targets, VUs, or duration differ; comparisons may be misleading.");
    const rows = [
      ["Requests", baseline.metrics.requestCount, current.metrics.requestCount, null],
      ["Average latency (ms)", baseline.metrics.avgMs, current.metrics.avgMs, "lower"],
      ["p95 latency (ms)", baseline.metrics.p95Ms, current.metrics.p95Ms, "lower"],
      ["Failed rate (%)", baseline.metrics.failedRate * 100, current.metrics.failedRate * 100, "lower"]
    ] as const;
    console.log("\nMetric\tBaseline\tCurrent\tChange");
    for (const [label, before, after, direction] of rows) {
      const change = typeof before === "number" && typeof after === "number" && before !== 0
        ? `${(((after - before) / before) * 100).toFixed(2)}%`
        : "n/a";
      console.log(`${label}\t${before ?? "n/a"}\t${after ?? "n/a"}\t${change}`);
      if (direction === "lower" && typeof before === "number" && typeof after === "number" && before > 0) {
        console.log(`  ${after > before ? "Regression" : after < before ? "Improvement" : "No change"}`);
      }
    }
    console.log(`\nThresholds: baseline ${baseline.thresholdsPassed ? "PASS" : "FAIL"}; current ${current.thresholdsPassed ? "PASS" : "FAIL"}`);
  });

program.showHelpAfterError();
program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
