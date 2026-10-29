import { select } from "@inquirer/prompts";
import { displayBanner, displayHeader } from "./banner.js";

export enum MenuOption {
  AddEndpoint = "add",
  RunTest = "test",
  ViewEndpoints = "view",
  CompareReports = "compare",
  Settings = "settings",
  Exit = "exit",
}

export async function displayMainMenu(): Promise<MenuOption> {
  displayBanner();
  displayHeader("Main Menu");

  const choice = await select({
    message: "What would you like to do?",
    choices: [
      { name: "➕  Add a new endpoint", value: MenuOption.AddEndpoint },
      { name: "🚀  Run a performance test", value: MenuOption.RunTest },
      { name: "👁️   View saved endpoints", value: MenuOption.ViewEndpoints },
      { name: "📊  Compare test reports", value: MenuOption.CompareReports },
      { name: "⚙️   Settings", value: MenuOption.Settings },
      { name: "🚪  Exit", value: MenuOption.Exit },
    ],
  });

  return choice as MenuOption;
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await import("@inquirer/prompts");
  return confirm({ message });
}
