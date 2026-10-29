import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProjectConfig } from "../src/config.js";
import { defaultConfig } from "../src/config.js";

describe("Interactive modules", () => {
  describe("Banner module", () => {
    it("should export display functions", async () => {
      const module = await import("../src/interactive/banner.js");
      expect(module.displayBanner).toBeDefined();
      expect(module.displayHeader).toBeDefined();
      expect(module.displaySuccess).toBeDefined();
      expect(module.displayError).toBeDefined();
      expect(module.displayInfo).toBeDefined();
      expect(module.maskSecret).toBeDefined();
    });

    it("should mask secrets correctly", async () => {
      const module = await import("../src/interactive/banner.js");
      const secret = "super-secret-token-12345";
      const masked = module.maskSecret(secret, 4);
      expect(masked).toContain("***");
      expect(masked).toContain("2345");
      expect(masked).not.toContain("super");
    });
  });

  describe("Menu module", () => {
    it("should export menu options and functions", async () => {
      const module = await import("../src/interactive/menu.js");
      expect(module.MenuOption).toBeDefined();
      expect(module.displayMainMenu).toBeDefined();
      expect(module.confirmAction).toBeDefined();
    });

    it("should have all required menu options", async () => {
      const module = await import("../src/interactive/menu.js");
      const opts = module.MenuOption;
      expect(opts.AddEndpoint).toBe("add");
      expect(opts.RunTest).toBe("test");
      expect(opts.ViewEndpoints).toBe("view");
      expect(opts.CompareReports).toBe("compare");
      expect(opts.Settings).toBe("settings");
      expect(opts.Exit).toBe("exit");
    });
  });

  describe("Endpoint wizard module", () => {
    it("should export endpoint wizard function", async () => {
      const module = await import("../src/interactive/endpoint-wizard.js");
      expect(module.runEndpointWizard).toBeDefined();
    });
  });

  describe("Test workflow module", () => {
    it("should export test workflow function", async () => {
      const module = await import("../src/interactive/test-workflow.js");
      expect(module.interactiveTestWorkflow).toBeDefined();
    });
  });

  describe("Endpoint management module", () => {
    it("should export management functions", async () => {
      const module = await import("../src/interactive/endpoint-management.js");
      expect(module.viewEndpoints).toBeDefined();
    });
  });

  describe("CLI module", () => {
    it("should export runInteractiveCLI function", async () => {
      const module = await import("../src/interactive/cli.js");
      expect(module.runInteractiveCLI).toBeDefined();
    });
  });

  describe("Integration: Non-interactive CLI still works", () => {
    it("should allow config loading and endpoint creation", async () => {
      const config = defaultConfig();
      expect(config.endpoints).toEqual([]);
      expect(config.version).toBe(1);
      expect(config.thresholds.p95Ms).toBe(1000);
      expect(config.thresholds.failedRate).toBe(0.01);
    });
  });
});
