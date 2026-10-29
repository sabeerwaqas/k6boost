import { select, confirm } from "@inquirer/prompts";
import type { ProjectConfig } from "../config.js";
import type { Profile, RunOptions } from "../runner.js";
import { runTest } from "../runner.js";
import {
  displayHeader,
  displaySuccess,
  displayError,
  displayInfo,
  displayWarning,
} from "./banner.js";
import type { RunReport } from "../report.js";

export async function interactiveTestWorkflow(
  config: ProjectConfig
): Promise<void> {
  if (!config.endpoints.length) {
    displayError("No endpoints configured. Add one first.");
    return;
  }

  displayHeader("Run a Performance Test");

  // Step 1: Show endpoints and confirm
  console.log("\nConfigured endpoints:");
  config.endpoints.forEach((ep, i) => {
    console.log(`  ${i + 1}. ${ep.method.padEnd(6)} ${ep.url} (${ep.name})`);
  });

  const continueTest = await confirm({
    message: "Test these endpoints?",
    default: true,
  });

  if (!continueTest) {
    displayInfo("Test cancelled.");
    return;
  }

  // Step 2: Select test profile
  const profile = (await select({
    message: "Choose test profile:",
    choices: [
      {
        name: "🚬 Smoke - 1 user, 10 seconds (quick check)",
        value: "smoke",
      },
      {
        name: "📦 Load - 5 users, 30 seconds (realistic load)",
        value: "load",
      },
    ],
  })) as Profile | null;

  if (!profile) {
    displayInfo("Test cancelled.");
    return;
  }

  // Step 3: Show workload parameters
  const defaults = {
    smoke: { vus: 1, duration: "10s" },
    load: { vus: 5, duration: "30s" },
  };

  const workload = defaults[profile];

  console.log(`\nTest configuration:`);
  console.log(`  Profile:  ${profile}`);
  console.log(`  Users:    ${workload.vus}`);
  console.log(`  Duration: ${workload.duration}`);

  // Step 4: Confirm before execution
  const hasRemote = config.endpoints.some((ep) => {
    try {
      const url = new URL(ep.url);
      return (
        !url.hostname.match(/^(localhost|127\.0\.0\.1|::1)$/) &&
        !url.hostname.endsWith(".local") &&
        !url.hostname.endsWith(".internal")
      );
    } catch {
      return false;
    }
  });

  if (hasRemote) {
    displayWarning(
      "You are about to send test traffic to remote endpoints."
    );
    displayInfo(
      "Ensure you have permission to test these APIs and that they can handle the load."
    );

    const proceed = await confirm({
      message: "Continue with remote testing?",
      default: false,
    });

    if (!proceed) {
      displayInfo("Test cancelled.");
      return;
    }
  }

  // Step 5: Execute test
  console.log("\n");
  displayInfo("Starting test...\n");

  try {
    const options: RunOptions = {
      profile,
      allowRemote: true,
      allowLocal: true,
    };

    const result = await runTest(config, options);

    // Step 6: Display results
    displayTestResults(result.report);

    // Step 7: Offer next actions
    const nextAction = await select({
      message: "What would you like to do next?",
      choices: [
        { name: "View detailed report", value: "view" },
        { name: "Run another test", value: "again" },
        { name: "Back to main menu", value: "menu" },
      ],
    });

    if (nextAction === "view") {
      console.log(`\nReport saved: ${result.path}`);
      displaySuccess("You can view this report with the file path above.");
    } else if (nextAction === "again") {
      await interactiveTestWorkflow(config);
    }
  } catch (error) {
    displayError(
      `Test failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

interface TestResult {
  report: RunReport;
  path: string;
}

function displayTestResults(report: RunReport): void {
  displayHeader("Test Results");

  const status = report.thresholdsPassed ? "✓ PASS" : "✗ FAIL";
  console.log(`\n  Overall Status: ${status}`);

  console.log(`\n  Requests:       ${report.metrics.requestCount}`);
  console.log(
    `  Avg Response:   ${report.metrics.avgMs?.toFixed(2) ?? "N/A"} ms`
  );
  console.log(
    `  p95 Response:   ${report.metrics.p95Ms?.toFixed(2) ?? "N/A"} ms`
  );
  console.log(
    `  Failed Rate:    ${(report.metrics.failedRate * 100).toFixed(2)}%`
  );

  // HTTP Status Distribution
  if (
    report.metrics.httpStatusDistribution &&
    Object.keys(report.metrics.httpStatusDistribution).length > 0
  ) {
    console.log(`\n  HTTP Status Distribution:`);
    const sorted = Object.entries(report.metrics.httpStatusDistribution)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([status, count]) => {
        let label = "Unknown";
        const code = Number(status);
        if (code >= 200 && code < 300) label = "Success";
        else if (code >= 300 && code < 400) label = "Redirect";
        else if (code >= 400 && code < 500) label = "Client Error";
        else if (code >= 500 && code < 600) label = "Server Error";
        return { status, count, label };
      });

    for (const { status, count, label } of sorted) {
      console.log(`    ${status}  ${label}: ${count}`);
    }
  }

  // Thresholds
  console.log(`\n  Threshold Results:`);
  console.log(
    `    p95 (< ${report.thresholds.p95Ms}ms):     ${
      (report.metrics.p95Ms ?? 0) <= report.thresholds.p95Ms
        ? "✓ PASS"
        : "✗ FAIL"
    }`
  );
  console.log(
    `    Failed (< ${(report.thresholds.failedRate * 100).toFixed(1)}%): ${
      report.metrics.failedRate <= report.thresholds.failedRate
        ? "✓ PASS"
        : "✗ FAIL"
    }`
  );

  console.log(
    `\n  Report saved: ${report.id}.json (.k6boost/reports/)`
  );
}
