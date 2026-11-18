#!/usr/bin/env node
import { Command } from "commander";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { checkbox } from "@inquirer/prompts";
import { importOpenApi } from "./openapi.js";
import { generateK6Script } from "./script.js";
import { loadConfig, saveConfig, defaultConfig, CONFIG_FILE, EndpointSchema } from "./config.js";
import { readReport } from "./report.js";
import { runTest } from "./runner.js";
import type { Profile } from "./profiles.js";

const program = new Command();
program.name("k6boost").description("Repeatable API performance testing powered by Grafana k6").version("0.2.0");

// Check if running interactively (no arguments and TTY)
const isInteractive = process.argv.length === 2 && process.stdout.isTTY;

if (isInteractive) {
  // Launch interactive CLI
  import("./interactive/cli.js").then((module) => {
    module.runInteractiveCLI().catch((error: unknown) => {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  });
} else {
  // Use existing command-based CLI
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
      let url = opts.url;
      if (!url) {
        throw new Error("URL is required. Use: k6boost add-endpoint <name> --url <url> [options]");
      }
      
      const config = await loadConfig();
      const method = opts.method.toUpperCase();
      
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
      console.log("Name\tMethod\tEnabled\tURL\tBody");
      for (const e of config.endpoints) {
        const bodyInfo = e.body ? `${e.bodyType ?? "text"} (${e.body.length}B)` : "-";
        console.log(`${e.name}\t${e.method}\t${e.enabled ? "yes" : "no"}\t${e.url}\t${bodyInfo}`);
      }
    });

  program.command("test")
    .description("Run an API performance test using Grafana k6")
    .option("-p, --profile <profile>", "Test profile: smoke, load, stress, spike, soak, breakpoint, regression, or custom", "smoke")
    .option("--allow-remote", "Confirm authorization to send requests to remote hosts")
    .option("--allow-local", "Allow localhost and private-network targets")
    .option("--vus <count>", "Virtual users", (v) => Number(v))
    .option("--duration <duration>", "Test duration, e.g. 10s or 1m")
    .option("--arrival-rate <rate>", "Requests per second (arrival-rate based workload)", (v) => Number(v))
    .option("--stage-duration <duration>", "Duration for each load stage")
    .option("--max-vus <count>", "Maximum VUs to reach", (v) => Number(v))
    .option("-o, --output <path>", "Write report to this path")
    .action(async (opts: any) => {
      const validProfiles = ["smoke", "load", "stress", "spike", "soak", "breakpoint", "regression", "custom"];
      if (!validProfiles.includes(opts.profile)) {
        throw new Error(`Profile must be one of: ${validProfiles.join(", ")}`);
      }
      
      const stages = opts.maxVus && opts.stageDuration 
        ? generateStages(opts.vus || 1, opts.maxVus, opts.stageDuration)
        : undefined;
      
      await runTest(await loadConfig(), {
        profile: opts.profile as Profile,
        allowRemote: Boolean(opts.allowRemote),
        allowLocal: Boolean(opts.allowLocal),
        vus: opts.vus,
        duration: opts.duration,
        arrivalRate: opts.arrivalRate,
        stages: stages,
        output: opts.output
      });
    });

  function generateStages(start: number, end: number, stageDuration: string): Array<{ duration: string; target: number }> {
    const stages: Array<{ duration: string; target: number }> = [];
    const step = Math.max(1, Math.floor((end - start) / 5));
    for (let vus = start; vus <= end; vus += step) {
      stages.push({ duration: stageDuration, target: vus });
    }
    if (stages[stages.length - 1]?.target !== end) {
      stages.push({ duration: stageDuration, target: end });
    }
    return stages;
  }

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


  program.command("import-openapi")
    .description("Import API endpoints from an OpenAPI 3.x JSON document")
    .argument("<source>", "OpenAPI JSON file path or HTTP(S) URL")
    .option("--base-url <url>", "Override the first OpenAPI server URL")
    .option("--allow-local", "Allow importing a spec from localhost or a private network")
    .option("--all", "Import every supported operation without the selection prompt")
    .action(async (source: string, opts: { baseUrl?: string; allowLocal?: boolean; all?: boolean }) => {
      const config = await loadConfig();
      const discovered = await importOpenApi(source, { baseUrl: opts.baseUrl, allowLocal: opts.allowLocal });
      const choices = discovered.map((endpoint) => ({
        name: `${endpoint.method.padEnd(7)} ${endpoint.url}${endpoint.body ? "  [sample JSON body]" : ""}${endpoint.enabled ? "" : "  [disabled by default]"}`,
        value: endpoint.name,
        checked: endpoint.enabled
      }));
      const selectedNames = opts.all ? discovered.map((endpoint) => endpoint.name) : await checkbox({
        message: "Select endpoints to import (write operations remain disabled until enabled in k6boost.json):",
        choices
      });
      if (!selectedNames.length) {
        console.log("No endpoints selected; configuration was not changed.");
        return;
      }
      const selected = discovered.filter((endpoint) => selectedNames.includes(endpoint.name));
      const existing = new Set(config.endpoints.map((endpoint) => endpoint.name));
      const added = selected.filter((endpoint) => !existing.has(endpoint.name));
      const skipped = selected.filter((endpoint) => existing.has(endpoint.name));
      config.endpoints.push(...added);
      if (added.length) await saveConfig(config);
      console.log(`Imported ${added.length} endpoint(s) from OpenAPI.`);
      if (skipped.length) console.log(`Skipped ${skipped.length} existing endpoint(s); their saved configuration and edited payloads were preserved.`);
      const writeCount = added.filter((endpoint) => !endpoint.enabled).length;
      if (writeCount) console.log(`${writeCount} write operation(s) were imported disabled. Set "enabled": true for an endpoint in k6boost.json only when you intend to send those requests.`);
      console.log("Sample JSON bodies are starting points, not proof of business-valid data. Review them before testing.");
    });

  program.command("generate-script")
    .description("Write an inspectable standalone k6 JavaScript script from enabled endpoints")
    .option("-o, --output <path>", "Output file", ".k6boost/scripts/generated.js")
    .action(async (opts: { output: string }) => {
      const config = await loadConfig();
      const script = generateK6Script(config.endpoints, config.thresholds);
      await mkdir(dirname(opts.output), { recursive: true });
      await writeFile(opts.output, script, { encoding: "utf8", mode: 0o600 });
      console.log(`Generated standalone k6 script: ${opts.output}`);
      console.log("Inspect or edit the file, then run it independently with: k6 run " + opts.output);
      console.log("Use whole-value ${VAR_NAME} placeholders for secrets; literal header values are copied into the generated script as configured.");
    });

  program.showHelpAfterError();
  program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
