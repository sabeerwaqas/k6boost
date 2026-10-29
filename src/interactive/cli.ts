#!/usr/bin/env node

import { loadConfig, saveConfig, defaultConfig, CONFIG_FILE } from "../config.js";
import { access } from "node:fs/promises";
import { displayMainMenu, MenuOption } from "./menu.js";
import { runEndpointWizard } from "./endpoint-wizard.js";
import { interactiveTestWorkflow } from "./test-workflow.js";
import { viewEndpoints } from "./endpoint-management.js";
import { displayHeader, displayInfo, displayError } from "./banner.js";

export async function runInteractiveCLI(): Promise<void> {
  try {
    // Check if config exists, create if not
    let config;
    try {
      await access(CONFIG_FILE);
      config = await loadConfig();
    } catch {
      displayInfo(
        "No configuration found. Creating a new one..."
      );
      config = defaultConfig();
      await saveConfig(config);
    }

    // Main loop
    let running = true;
    while (running) {
      try {
        const choice = await displayMainMenu();

        switch (choice) {
          case MenuOption.AddEndpoint: {
            const endpoint = await runEndpointWizard(config);
            if (endpoint) {
              config.endpoints.push(endpoint);
              await saveConfig(config);
            }
            break;
          }

          case MenuOption.RunTest: {
            await interactiveTestWorkflow(config);
            break;
          }

          case MenuOption.ViewEndpoints: {
            await viewEndpoints(config);
            // Reload config in case it was modified
            config = await loadConfig();
            break;
          }

          case MenuOption.CompareReports: {
            displayHeader("Report Comparison");
            displayInfo(
              "Coming soon! For now, use: k6boost compare <baseline> <current>"
            );
            break;
          }

          case MenuOption.Settings: {
            displayHeader("Settings");
            displayInfo("Settings not yet implemented.");
            displayInfo(
              "You can edit k6boost.json directly to adjust thresholds."
            );
            break;
          }

          case MenuOption.Exit: {
            displayInfo("Goodbye!");
            running = false;
            break;
          }
        }
      } catch (error) {
        // Handle cancellation (Ctrl+C)
        if (
          error instanceof Error &&
          error.message.includes("User force closed the prompt")
        ) {
          displayInfo("Cancelled.");
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    displayError(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    process.exitCode = 1;
  }
}
