import { select, confirm } from "@inquirer/prompts";
import type { ProjectConfig } from "../config.js";
import { saveConfig } from "../config.js";
import { displayHeader, displaySuccess, displayError, displayInfo, maskSecret } from "./banner.js";

export async function viewEndpoints(config: ProjectConfig): Promise<void> {
  if (!config.endpoints.length) {
    displayInfo("No endpoints configured.");
    return;
  }

  displayHeader("Saved Endpoints");

  config.endpoints.forEach((ep, i) => {
    console.log(`\n  ${i + 1}. ${ep.name}`);
    console.log(`     Method: ${ep.method}`);
    console.log(`     URL:    ${ep.url}`);

    if (Object.keys(ep.headers).length > 0) {
      console.log(`     Headers: ${Object.keys(ep.headers).join(", ")}`);
    }

    if (ep.body) {
      console.log(`     Body:    ${ep.bodyType || "text"} (${ep.body.length}B)`);
    }
  });

  console.log();

  const action = await select({
    message: "Select an endpoint to manage:",
    choices: [
      ...config.endpoints.map((ep, i) => ({
        name: `${ep.name} (${ep.method})`,
        value: i,
      })),
      { name: "← Back", value: -1 },
    ],
  });

  if (action === -1) return;

  const endpoint = config.endpoints[action]!;
  await manageEndpoint(config, action, endpoint);
}

async function manageEndpoint(
  config: ProjectConfig,
  index: number,
  endpoint: ProjectConfig["endpoints"][0]
): Promise<void> {
  console.log(`\nManaging: ${endpoint.name}`);

  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "View details", value: "view" },
      { name: "Delete", value: "delete" },
      { name: "← Back", value: "back" },
    ],
  });

  if (action === "view") {
    displayHeader(`Endpoint: ${endpoint.name}`);

    console.log(`\n  Method:   ${endpoint.method}`);
    console.log(`  URL:      ${endpoint.url}`);

    if (Object.keys(endpoint.headers).length > 0) {
      console.log(`\n  Headers:`);
      for (const [key, value] of Object.entries(endpoint.headers)) {
        const isSensitive =
          key.toLowerCase().includes("auth") ||
          key.toLowerCase().includes("token") ||
          key.toLowerCase().includes("key");
        const displayValue = isSensitive ? maskSecret(value) : value;
        console.log(`    ${key}: ${displayValue}`);
      }
    }

    if (endpoint.body) {
      console.log(`\n  Body (${endpoint.bodyType || "text"}):`);
      const preview =
        endpoint.body.length > 200
          ? endpoint.body.slice(0, 200) + "..."
          : endpoint.body;
      console.log(`    ${preview}`);
    }

    console.log();
  } else if (action === "delete") {
    const confirm_delete = await confirm({
      message: `Delete endpoint "${endpoint.name}"?`,
      default: false,
    });

    if (confirm_delete) {
      config.endpoints.splice(index, 1);
      await saveConfig(config);
      displaySuccess(`Endpoint "${endpoint.name}" deleted.`);
    }
  }
}
