import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RunReport } from "../src/report.js";
import {
  formatNumber,
  formatLatency,
  formatPercentage,
  formatRPS,
  parseDurationToMs,
  buildMetricsRows,
  displayMetricsTable,
  isColorSupported,
  type MetricsTableRow,
} from "../src/interactive/metrics-formatter.js";

describe("Metrics Formatter", () => {
  describe("formatNumber()", () => {
    it("should format numbers with thousands separators", () => {
      expect(formatNumber(1234)).toBe("1,234");
      expect(formatNumber(1000000)).toBe("1,000,000");
    });

    it("should handle zero", () => {
      expect(formatNumber(0)).toBe("0");
    });

    it("should handle small numbers", () => {
      expect(formatNumber(42)).toBe("42");
    });

    it("should return N/A for null/undefined/NaN/Infinity", () => {
      expect(formatNumber(null)).toBe("N/A");
      expect(formatNumber(undefined)).toBe("N/A");
      expect(formatNumber(NaN)).toBe("N/A");
      expect(formatNumber(Infinity)).toBe("N/A");
    });
  });

  describe("formatLatency()", () => {
    it("should format latency in milliseconds with 2 decimal places", () => {
      expect(formatLatency(100.5)).toBe("100.50 ms");
      expect(formatLatency(1000)).toBe("1000.00 ms");
      expect(formatLatency(42.123)).toBe("42.12 ms");
    });

    it("should return N/A for null/undefined/NaN/Infinity", () => {
      expect(formatLatency(null)).toBe("N/A");
      expect(formatLatency(undefined)).toBe("N/A");
      expect(formatLatency(NaN)).toBe("N/A");
      expect(formatLatency(Infinity)).toBe("N/A");
    });
  });

  describe("formatPercentage()", () => {
    it("should format percentage with 2 decimal places", () => {
      expect(formatPercentage(0.05)).toBe("5.00%");
      expect(formatPercentage(0.5)).toBe("50.00%");
      expect(formatPercentage(1.0)).toBe("100.00%");
      expect(formatPercentage(0.0)).toBe("0.00%");
      expect(formatPercentage(0.12345)).toBe("12.35%");
    });

    it("should return N/A for null/undefined/NaN/Infinity", () => {
      expect(formatPercentage(null)).toBe("N/A");
      expect(formatPercentage(undefined)).toBe("N/A");
      expect(formatPercentage(NaN)).toBe("N/A");
      expect(formatPercentage(Infinity)).toBe("N/A");
    });
  });

  describe("formatRPS()", () => {
    it("should calculate requests per second with 2 decimal places", () => {
      // 1000 requests over 10 seconds = 100 req/s
      expect(formatRPS(1000, 10000)).toBe("100.00 req/s");

      // 500 requests over 1 second = 500 req/s
      expect(formatRPS(500, 1000)).toBe("500.00 req/s");

      // 42 requests over 2 seconds = 21 req/s
      expect(formatRPS(42, 2000)).toBe("21.00 req/s");
    });

    it("should return N/A for zero or negative durations", () => {
      expect(formatRPS(100, 0)).toBe("N/A");
      expect(formatRPS(100, -1000)).toBe("N/A");
      expect(formatRPS(-100, 1000)).toBe("N/A");
    });

    it("should return N/A for NaN or Infinity", () => {
      expect(formatRPS(NaN, 1000)).toBe("N/A");
      expect(formatRPS(Infinity, 1000)).toBe("N/A");
    });

    it("should handle zero requests", () => {
      expect(formatRPS(0, 10000)).toBe("0.00 req/s");
    });
  });

  describe("parseDurationToMs()", () => {
    it("should parse milliseconds", () => {
      expect(parseDurationToMs("100ms")).toBe(100);
      expect(parseDurationToMs("1ms")).toBe(1);
    });

    it("should parse seconds", () => {
      expect(parseDurationToMs("10s")).toBe(10000);
      expect(parseDurationToMs("1s")).toBe(1000);
    });

    it("should parse minutes", () => {
      expect(parseDurationToMs("1m")).toBe(60000);
      expect(parseDurationToMs("5m")).toBe(300000);
    });

    it("should parse hours", () => {
      expect(parseDurationToMs("1h")).toBe(3600000);
    });

    it("should return 0 for invalid durations", () => {
      expect(parseDurationToMs("invalid")).toBe(0);
      expect(parseDurationToMs("0s")).toBe(0);
      expect(parseDurationToMs("")).toBe(0);
    });
  });

  describe("isColorSupported()", () => {
    it("should return boolean", () => {
      const result = isColorSupported();
      expect(typeof result).toBe("boolean");
    });

    it("should respect NO_COLOR environment variable", () => {
      const original = process.env.NO_COLOR;
      try {
        process.env.NO_COLOR = "1";
        expect(isColorSupported()).toBe(false);

        delete process.env.NO_COLOR;
        // Result depends on TTY, just ensure it's a boolean
        expect(typeof isColorSupported()).toBe("boolean");
      } finally {
        process.env.NO_COLOR = original;
      }
    });
  });

  describe("buildMetricsRows()", () => {
    let mockReport: RunReport;

    beforeEach(() => {
      mockReport = {
        schemaVersion: 1,
        id: "2024-01-01T12-00-00-000Z",
        createdAt: "2024-01-01T12:00:00.000Z",
        profile: "smoke",
        targetHosts: ["example.com"],
        workload: { vus: 1, duration: "10s" },
        thresholds: { p95Ms: 1000, failedRate: 0.01 },
        metrics: {
          requestCount: 100,
          failedRate: 0.0,
          avgMs: 50.5,
          p95Ms: 95.5,
          httpStatusDistribution: { "200": 100 },
        },
        thresholdsPassed: true,
      };
    });

    it("should build rows with PASS status when thresholds passed", () => {
      const rows = buildMetricsRows(mockReport);

      const overallRow = rows.find((r) => r.metric === "Overall Status");
      expect(overallRow).toBeDefined();
      expect(overallRow?.value).toBe("PASS");
      expect(overallRow?.status).toBe("pass");
    });

    it("should build rows with FAIL status when thresholds failed", () => {
      mockReport.thresholdsPassed = false;
      const rows = buildMetricsRows(mockReport);

      const overallRow = rows.find((r) => r.metric === "Overall Status");
      expect(overallRow?.value).toBe("FAIL");
      expect(overallRow?.status).toBe("fail");
    });

    it("should include test information section", () => {
      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "Test Information")).toBeDefined();
      expect(rows.find((r) => r.metric === "  Profile")?.value).toBe("SMOKE");
      expect(rows.find((r) => r.metric === "  Target(s)")?.value).toBe("example.com");
      expect(rows.find((r) => r.metric === "  Virtual Users")?.value).toBe("1");
      expect(rows.find((r) => r.metric === "  Duration")?.value).toBe("10s");
    });

    it("should include request metrics section", () => {
      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "Request Metrics")).toBeDefined();
      expect(rows.find((r) => r.metric === "  Total Requests")?.value).toBe("100");
      const rpsRow = rows.find((r) => r.metric === "  Requests/sec");
      expect(rpsRow?.value).toContain("req/s");
    });

    it("should include response time metrics section", () => {
      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "Response Time (ms)")).toBeDefined();
      expect(rows.find((r) => r.metric === "  Average")?.value).toBe("50.50 ms");
      expect(rows.find((r) => r.metric === "  p95")?.value).toBe("95.50 ms");
    });

    it("should include failures section", () => {
      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "Failures")).toBeDefined();
      const failureRow = rows.find((r) => r.metric === "  HTTP Request Failures");
      expect(failureRow?.value).toContain("0 failed");
    });

    it("should handle zero requests", () => {
      mockReport.metrics.requestCount = 0;
      mockReport.metrics.avgMs = null;
      mockReport.metrics.p95Ms = null;

      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "  Total Requests")?.value).toBe("0");
      expect(rows.find((r) => r.metric === "  Average")?.value).toBe("N/A");
      expect(rows.find((r) => r.metric === "  p95")?.value).toBe("N/A");
    });

    it("should handle missing metrics gracefully", () => {
      mockReport.metrics.avgMs = null;
      mockReport.metrics.p95Ms = null;

      expect(() => buildMetricsRows(mockReport)).not.toThrow();

      const rows = buildMetricsRows(mockReport);
      expect(rows.find((r) => r.metric === "  Average")?.value).toBe("N/A");
      expect(rows.find((r) => r.metric === "  p95")?.value).toBe("N/A");
    });

    it("should include HTTP status distribution", () => {
      mockReport.metrics.httpStatusDistribution = { "200": 80, "500": 20 };

      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "HTTP Status Distribution")).toBeDefined();
      expect(rows.find((r) => r.metric === "  200 Success")).toBeDefined();
      expect(rows.find((r) => r.metric === "  500 Server Error")).toBeDefined();
    });

    it("should color HTTP status codes appropriately", () => {
      mockReport.metrics.httpStatusDistribution = {
        "200": 70,
        "302": 10,
        "400": 10,
        "500": 10,
      };

      const rows = buildMetricsRows(mockReport);

      const row200 = rows.find((r) => r.metric === "  200 Success");
      const row400 = rows.find((r) => r.metric === "  400 Client Error");
      const row500 = rows.find((r) => r.metric === "  500 Server Error");

      expect(row200?.status).toBe("pass");
      expect(row400?.status).toBe("warning");
      expect(row500?.status).toBe("fail");
    });

    it("should include threshold results section", () => {
      const rows = buildMetricsRows(mockReport);

      expect(rows.find((r) => r.metric === "Threshold Results")).toBeDefined();
      expect(rows.find((r) => r.metric === "  p95 < 1000ms")).toBeDefined();
      expect(rows.find((r) => r.metric === "  Failed Rate < 1.00%")).toBeDefined();
    });

    it("should mark thresholds as PASS or FAIL", () => {
      mockReport.metrics.p95Ms = 500; // Within threshold
      mockReport.metrics.failedRate = 0.005; // Within threshold
      const rows = buildMetricsRows(mockReport);

      const p95Row = rows.find((r) => r.metric === "  p95 < 1000ms");
      const failureRow = rows.find((r) => r.metric === "  Failed Rate < 1.00%");

      expect(p95Row?.value).toBe("PASS");
      expect(p95Row?.status).toBe("pass");
      expect(failureRow?.value).toBe("PASS");
      expect(failureRow?.status).toBe("pass");
    });

    it("should mark thresholds as FAIL when exceeded", () => {
      mockReport.metrics.p95Ms = 1500; // Exceeds threshold
      mockReport.metrics.failedRate = 0.05; // Exceeds threshold
      const rows = buildMetricsRows(mockReport);

      const p95Row = rows.find((r) => r.metric === "  p95 < 1000ms");
      const failureRow = rows.find((r) => r.metric === "  Failed Rate < 1.00%");

      expect(p95Row?.value).toBe("FAIL");
      expect(p95Row?.status).toBe("fail");
      expect(failureRow?.value).toBe("FAIL");
      expect(failureRow?.status).toBe("fail");
    });

    it("should display multiple target hosts", () => {
      mockReport.targetHosts = ["example.com", "api.example.com", "test.example.com"];
      const rows = buildMetricsRows(mockReport);

      const targetRow = rows.find((r) => r.metric === "  Target(s)");
      expect(targetRow?.value).toBe("3 hosts");
    });

    it("should handle failed requests", () => {
      mockReport.metrics.requestCount = 100;
      mockReport.metrics.failedRate = 0.1; // 10% failed

      const rows = buildMetricsRows(mockReport);

      const failureRow = rows.find((r) => r.metric === "  HTTP Request Failures");
      expect(failureRow?.value).toContain("10 failed");
      expect(failureRow?.value).toContain("10.00%");
      expect(failureRow?.status).toBe("warning");
    });
  });

  describe("displayMetricsTable()", () => {
    let mockReport: RunReport;

    beforeEach(() => {
      mockReport = {
        schemaVersion: 1,
        id: "2024-01-01T12-00-00-000Z",
        createdAt: "2024-01-01T12:00:00.000Z",
        profile: "smoke",
        targetHosts: ["example.com"],
        workload: { vus: 1, duration: "10s" },
        thresholds: { p95Ms: 1000, failedRate: 0.01 },
        metrics: {
          requestCount: 100,
          failedRate: 0.0,
          avgMs: 50.5,
          p95Ms: 95.5,
          httpStatusDistribution: { "200": 100 },
        },
        thresholdsPassed: true,
      };

      vi.spyOn(console, "log");
    });

    it("should not throw when displaying metrics", () => {
      expect(() => displayMetricsTable(mockReport)).not.toThrow();
    });

    it("should call console.log", () => {
      displayMetricsTable(mockReport);
      expect(console.log).toHaveBeenCalled();
    });
  });
});
