import { select, confirm, input, checkbox } from "@inquirer/prompts";
import type { ProjectConfig, Endpoint } from "../config.js";
import type { Profile } from "../profiles.js";
import type { RunOptions } from "../runner.js";
import { runTest } from "../runner.js";
import {
  displayHeader,
  displaySuccess,
  displayError,
  displayInfo,
  displayWarning,
} from "./banner.js";
import type { RunReport } from "../report.js";
import { displayMetricsTable } from "./metrics-formatter.js";

type EndpointSelectionMode = "single" | "multiple" | "all" | "cancel";

/**
 * Ask the user which saved endpoints should be included in this run.
 * Selection is based on endpoint names, not array positions, and never
 * mutates the saved project configuration.
 */
export async function selectEndpointsForTest(
  endpoints: Endpoint[]
): Promise<Endpoint[]> {
  if (endpoints.length === 0) return [];

  const mode = (await select({
    message: "What would you like to test?",
    choices: [
      { name: "Select a single endpoint", value: "single" },
      { name: "Select multiple endpoints", value: "multiple" },
      { name: "Select all endpoints", value: "all" },
      { name: "Cancel", value: "cancel" },
    ],
  })) as EndpointSelectionMode;

  if (mode === "cancel") return [];
  if (mode === "all") return [...endpoints];

  if (mode === "single") {
    const selectedName = await select({
      message: "Select an endpoint to test:",
      choices: endpoints.map((endpoint) => ({
        name: `${endpoint.method.padEnd(7)} ${endpoint.name} — ${endpoint.url}`,
        value: endpoint.name,
      })),
      pageSize: 12,
    });
    const selected = endpoints.find((endpoint) => endpoint.name === selectedName);
    return selected ? [selected] : [];
  }

  const selectedNames = await checkbox({
    message: "Select endpoints to test (Space to toggle, Enter to continue):",
    choices: endpoints.map((endpoint) => ({
      name: `${endpoint.method.padEnd(7)} ${endpoint.name} — ${endpoint.url}`,
      value: endpoint.name,
    })),
    pageSize: 12,
    required: false,
  });

  const selectedNameSet = new Set(selectedNames);
  // Keep the original saved-endpoint order for predictable execution.
  return endpoints.filter((endpoint) => selectedNameSet.has(endpoint.name));
}

export async function interactiveTestWorkflow(
  config: ProjectConfig
): Promise<void> {
  if (!config.endpoints.length) {
    displayError("No endpoints configured. Add one first.");
    return;
  }

  displayHeader("Run a Performance Test");

  // Step 1: Explicitly select the endpoints for this run.
  const selectedEndpoints = await selectEndpointsForTest(config.endpoints);
  if (selectedEndpoints.length === 0) {
    displayInfo("No endpoints selected. Test cancelled.");
    return;
  }

  // Step 2: Review the exact selection before configuring or executing it.
  console.log("\nSelected endpoints:");
  selectedEndpoints.forEach((ep, i) => {
    console.log(`  ${i + 1}. ${ep.method.padEnd(7)} ${ep.name} — ${ep.url}`);
  });
  console.log(`\nSelected: ${selectedEndpoints.length} endpoint(s)`);

  const continueTest = await confirm({
    message: `Continue with these ${selectedEndpoints.length} endpoint(s)?`,
    default: false,
  });

  if (!continueTest) {
    displayInfo("Test cancelled. No requests were sent.");
    return;
  }

  // Step 3: Select test profile.
  const profile = (await select({
    message: "Choose test profile:",
    choices: [
      { name: "🚬 Smoke - 1 user, 10 seconds (quick check)", value: "smoke" },
      { name: "📦 Load - 5 users, 30 seconds (realistic load)", value: "load" },
      { name: "🔥 Stress - Progressive load increase (CLI only)", value: "stress" },
      { name: "📍 Spike - Sudden traffic surge (CLI only)", value: "spike" },
      { name: "🛏️  Soak - Extended sustained load (CLI only)", value: "soak" },
      { name: "💥 Breakpoint - Find capacity limit (CLI only)", value: "breakpoint" },
    ],
  })) as Profile | null;

  if (!profile) {
    displayInfo("Test cancelled.");
    return;
  }

  // Step 4: Configure the supported interactive workload.
  let vus: number | undefined;
  let duration: string;

  if (profile === "smoke") {
    duration = "10s";
    vus = 1;
  } else if (profile === "load") {
    duration = "30s";
    vus = 5;

    const customizeLoad = await confirm({
      message: "Use custom number of VUs? (default: 5)",
      default: false,
    });

    if (customizeLoad) {
      const customVUsInput = await input({
        message: "Enter number of virtual users (1-50):",
        default: "5",
        validate: (value: string) => {
          const num = Number(value);
          if (!Number.isInteger(num) || num < 1 || num > 50) {
            return "VUs must be an integer between 1 and 50";
          }
          return true;
        },
      });
      vus = Number(customVUsInput);
    }
  } else {
    displayWarning("Advanced profiles (stress, spike, soak, breakpoint) require command-line options.");
    displayInfo("Use: k6boost test --profile " + profile + " --help");
    return;
  }

  console.log("\nTest configuration:");
  console.log(`  Profile:   ${profile}`);
  console.log(`  Endpoints: ${selectedEndpoints.length}`);
  console.log(`  Users:     ${vus}`);
  console.log(`  Duration:  ${duration}`);

  // Step 5: Confirm remote testing only for the selected endpoints.
  const hasRemote = selectedEndpoints.some((ep) => {
    try {
      const url = new URL(ep.url);
      return (
        !url.hostname.match(/^(localhost|127\\.0\\.0\\.1|::1)$/) &&
        !url.hostname.endsWith(".local") &&
        !url.hostname.endsWith(".internal")
      );
    } catch {
      return false;
    }
  });

  if (hasRemote) {
    displayWarning("You are about to send test traffic to remote endpoints.");
    displayInfo("Ensure you have permission to test these APIs and that they can handle the load.");

    const proceed = await confirm({
      message: "Continue with remote testing?",
      default: false,
    });

    if (!proceed) {
      displayInfo("Test cancelled. No requests were sent.");
      return;
    }
  }

  // Step 6: Execute against a scoped config. The saved config is not mutated.
  console.log("\n");
  displayInfo("Starting test...\n");

  try {
    const options: RunOptions = {
      profile,
      allowRemote: true,
      allowLocal: true,
      vus,
      duration,
    };

    const result = await runTest(
      { ...config, endpoints: selectedEndpoints },
      options
    );

    displayTestResults(result.report);

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
  displayMetricsTable(report);
}
