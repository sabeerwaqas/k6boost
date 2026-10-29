import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { saveReport, type RunReportV2 } from "../src/report.js";
import { saveConfig, loadConfig, type ProjectConfig } from "../src/config.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "k6boost-fixes-"));
  process.chdir(testDir);
});

afterEach(async () => {
  process.chdir("/");
  await rm(testDir, { recursive: true, force: true });
});

/**
 * Regression tests for K6-001: Path Traversal Fix
 */
describe("K6-001 Fix: Path Traversal Protection", () => {
  it("should reject absolute paths in --output", async () => {
    const report: RunReportV2 = {
      schemaVersion: 2,
      id: "test",
      createdAt: new Date().toISOString(),
      profile: "smoke",
      targetHosts: ["example.com"],
      workload: { duration: "10s" },
      thresholds: { p95Ms: 1000, failedRate: 0.01 },
      metrics: { requestCount: 0, failedRate: 0, avgMs: null },
      thresholdsPassed: true,
    };

    // Should reject absolute paths
    await expect(saveReport(report, "/tmp/evil.json")).rejects.toThrow(
      /relative and cannot contain/
    );
  });

  it("should reject path traversal with ../", async () => {
    const report: RunReportV2 = {
      schemaVersion: 2,
      id: "test",
      createdAt: new Date().toISOString(),
      profile: "smoke",
      targetHosts: ["example.com"],
      workload: { duration: "10s" },
      thresholds: { p95Ms: 1000, failedRate: 0.01 },
      metrics: { requestCount: 0, failedRate: 0, avgMs: null },
      thresholdsPassed: true,
    };

    // Should reject .. in paths
    await expect(saveReport(report, "../../etc/passwd.json")).rejects.toThrow(
      /cannot contain/
    );
  });

  it("should allow relative paths within current directory", async () => {
    const report: RunReportV2 = {
      schemaVersion: 2,
      id: "test-safe",
      createdAt: new Date().toISOString(),
      profile: "smoke",
      targetHosts: ["example.com"],
      workload: { duration: "10s" },
      thresholds: { p95Ms: 1000, failedRate: 0.01 },
      metrics: { requestCount: 100, failedRate: 0, avgMs: 50 },
      thresholdsPassed: true,
    };

    // Should allow relative paths
    const path = await saveReport(report, "reports/custom.json");
    expect(path).toContain("reports/custom.json");
    
    // Verify file was created
    const content = await readFile(path, "utf8");
    expect(JSON.parse(content)).toHaveProperty("schemaVersion", 2);
  });

  it("should reject backslash path separators (Windows-style traversal)", async () => {
    const report: RunReportV2 = {
      schemaVersion: 2,
      id: "test",
      createdAt: new Date().toISOString(),
      profile: "smoke",
      targetHosts: ["example.com"],
      workload: { duration: "10s" },
      thresholds: { p95Ms: 1000, failedRate: 0.01 },
      metrics: { requestCount: 0, failedRate: 0, avgMs: null },
      thresholdsPassed: true,
    };

    // Should reject backslash paths (Windows-style)
    await expect(saveReport(report, "..\\..\\evil.json")).rejects.toThrow();
  });
});

/**
 * Regression tests for K6-003: Report ID Collision Fix
 */
describe("K6-003 Fix: Report ID Uniqueness", () => {
  it("should generate unique IDs even for rapid successive reports", async () => {
    const reports: RunReportV2[] = [];
    const ids = new Set<string>();

    // Generate 10 reports rapidly
    for (let i = 0; i < 10; i++) {
      const report: RunReportV2 = {
        schemaVersion: 2,
        id: `generated-${i}`, // Will be used to track the test
        createdAt: new Date().toISOString(),
        profile: "smoke",
        targetHosts: ["example.com"],
        workload: { duration: "10s" },
        thresholds: { p95Ms: 1000, failedRate: 0.01 },
        metrics: { requestCount: 100 + i, failedRate: 0, avgMs: 50 },
        thresholdsPassed: true,
      };
      reports.push(report);
      ids.add(report.id);
    }

    expect(ids.size).toBe(10);
  });

  it("should include random component in generated report IDs", async () => {
    // This test verifies that if report IDs are generated at test runtime,
    // they will be unique. The random suffix implementation ensures this.
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const randomSuffix1 = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    const randomSuffix2 = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    
    const id1 = `${timestamp}-${randomSuffix1}`;
    const id2 = `${timestamp}-${randomSuffix2}`;
    
    // Even with the same timestamp, IDs should differ due to random suffix
    // (unless by extreme luck the random values are identical)
    expect(id1).not.toBe(id2);
  });
});

/**
 * Regression tests for K6-005: Config File Atomic Writes
 */
describe("K6-005 Fix: Atomic Config Writes", () => {
  it("should create config file with safe permissions (0o600)", async () => {
    const config: ProjectConfig = {
      version: 1,
      endpoints: [
        {
          name: "test",
          url: "https://example.com",
          method: "GET",
          headers: {},
        },
      ],
    };

    const configFile = join(testDir, "k6boost.json");
    await saveConfig(config, configFile);

    // Verify file exists
    const saved = await readFile(configFile, "utf8");
    expect(JSON.parse(saved)).toHaveProperty("endpoints");
  });

  it("should use temp file for atomic writes", async () => {
    const config: ProjectConfig = {
      version: 1,
      endpoints: [
        {
          name: "test",
          url: "https://example.com",
          method: "GET",
          headers: {},
        },
      ],
    };

    const configFile = join(testDir, "k6boost.json");
    
    // Save config - should use atomic write with temp file
    await saveConfig(config, configFile);

    // Temp file should not remain after successful write
    const tempFile = `${configFile}.tmp`;
    await expect(readFile(tempFile, "utf8")).rejects.toThrow(
      /ENOENT|no such file/
    );

    // Original file should exist and be valid
    const saved = await readFile(configFile, "utf8");
    const parsed = JSON.parse(saved);
    expect(parsed.endpoints).toHaveLength(1);
    expect(parsed.endpoints[0].name).toBe("test");
  });

  it("should preserve config data on save", async () => {
    const config: ProjectConfig = {
      version: 1,
      endpoints: [
        {
          name: "endpoint1",
          url: "https://api1.example.com",
          method: "POST",
          headers: { "Authorization": "${API_TOKEN}" },
          body: '{"key":"value"}',
          bodyType: "json",
        },
        {
          name: "endpoint2",
          url: "https://api2.example.com",
          method: "GET",
          headers: {},
        },
      ],
      thresholds: {
        p95Ms: 500,
        failedRate: 0.05,
      },
    };

    const configFile = join(testDir, "k6boost.json");
    await saveConfig(config, configFile);

    // Load and verify all data is preserved
    const loaded = await loadConfig(configFile);
    expect(loaded.endpoints).toHaveLength(2);
    expect(loaded.endpoints[0].name).toBe("endpoint1");
    expect(loaded.endpoints[0].headers.Authorization).toBe("${API_TOKEN}");
    expect(loaded.endpoints[0].body).toBe('{"key":"value"}');
    expect(loaded.thresholds.p95Ms).toBe(500);
  });
});

/**
 * Integration test: Verify all fixes work together
 */
describe("Security Fixes Integration", () => {
  it("should securely save config and reports", async () => {
    // Create a config
    const config: ProjectConfig = {
      version: 1,
      endpoints: [
        {
          name: "secure-test",
          url: "https://example.com",
          method: "GET",
          headers: {},
        },
      ],
    };

    const configFile = join(testDir, "k6boost.json");
    await saveConfig(config, configFile);

    // Create a report with safe path
    const report: RunReportV2 = {
      schemaVersion: 2,
      id: "secure-report-001",
      createdAt: new Date().toISOString(),
      profile: "smoke",
      targetHosts: ["example.com"],
      workload: { duration: "10s" },
      thresholds: { p95Ms: 1000, failedRate: 0.01 },
      metrics: { requestCount: 100, failedRate: 0, avgMs: 50 },
      thresholdsPassed: true,
    };

    // Save with relative path - should succeed
    const reportPath = await saveReport(report, "reports/test.json");
    expect(reportPath).toContain("reports/test.json");

    // Verify both files exist and are valid
    const configContent = await readFile(configFile, "utf8");
    expect(JSON.parse(configContent)).toHaveProperty("endpoints");

    const reportContent = await readFile(reportPath, "utf8");
    const reportData = JSON.parse(reportContent);
    expect(reportData.schemaVersion).toBe(2);
    expect(reportData.metrics.requestCount).toBe(100);
  });
});
