import { describe, expect, it } from "vitest";
import { reportFromSummary, type RunReportV2 } from "../src/report.js";

describe("Report schema v2", () => {
  describe("reportFromSummary with extended metrics", () => {
    it("extracts p90, p99, and max latencies", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { 
            avg: 100, 
            "p(50)": 90,
            "p(90)": 150,
            "p(95)": 180,
            "p(99)": 250,
            max: 500 
          } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "load",
        targetHosts: ["api.example.com"],
        workload: { duration: "30s" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      expect(report.metrics.medianMs).toBe(90);
      expect(report.metrics.p90Ms).toBe(150);
      expect(report.metrics.p95Ms).toBe(180);
      expect(report.metrics.p99Ms).toBe(250);
      expect(report.metrics.maxMs).toBe(500);
    });

    it("calculates RPS average from request count and duration", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 300 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "load",
        targetHosts: ["api.example.com"],
        workload: { duration: "30s" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      // 300 requests in 30 seconds = 10 req/s
      expect(report.metrics.rpsAvg).toBe(10);
    });

    it("evaluates p90, p95, and p99 thresholds", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { 
            avg: 100,
            "p(90)": 200,
            "p(95)": 300,
            "p(99)": 400
          } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "stress",
        targetHosts: ["api.example.com"],
        workload: { duration: "1m" },
        thresholds: { 
          p90Ms: 150,  // Will fail
          p95Ms: 300,  // Will pass
          p99Ms: 500,  // Will pass
          failedRate: 0.01 
        }
      });
      
      // Should fail because p90 exceeds threshold
      expect(report.thresholdsPassed).toBe(false);
    });

    it("handles missing optional percentiles gracefully", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "load",
        targetHosts: ["api.example.com"],
        workload: { duration: "30s" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      // Missing percentiles should be null
      expect(report.metrics.p90Ms).toBeNull();
      expect(report.metrics.p99Ms).toBeNull();
      expect(report.metrics.maxMs).toBeNull();
      expect(report.metrics.medianMs).toBeNull();
      // But report should still pass since only p95 threshold is set
      expect(report.thresholdsPassed).toBe(true);
    });

    it("includes executor type in workload", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "stress",
        targetHosts: ["api.example.com"],
        workload: { 
          executor: "ramping-vus",
          duration: "10m",
          stages: [{ duration: "2m", target: 10 }]
        },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      expect(report.workload.executor).toBe("ramping-vus");
      expect(report.workload.stages).toBeDefined();
    });

    it("supports stage results for breakpoint tests", () => {
      // This is a structural test - actual stage results would be populated by analysis
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "breakpoint",
        targetHosts: ["api.example.com"],
        workload: { duration: "10m" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      // Report is v2 format
      expect(report.schemaVersion).toBe(2);
      expect(report.profile).toBe("breakpoint");
    });
  });

  describe("schema versioning", () => {
    it("creates v2 reports", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "load",
        targetHosts: ["api.example.com"],
        workload: { duration: "30s" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      expect(report.schemaVersion).toBe(2);
    });

    it("includes all v2 fields", () => {
      const report = reportFromSummary({
        metrics: {
          http_req_duration: { values: { avg: 100, "p(95)": 200 } },
          http_req_failed: { values: { rate: 0 } },
          http_reqs: { values: { count: 100 } }
        }
      }, {
        id: "test-run",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: "load",
        targetHosts: ["api.example.com"],
        workload: { vus: 5, duration: "30s" },
        thresholds: { p95Ms: 200, failedRate: 0.01 }
      });
      
      expect(report).toHaveProperty("schemaVersion", 2);
      expect(report).toHaveProperty("id");
      expect(report).toHaveProperty("createdAt");
      expect(report).toHaveProperty("profile");
      expect(report).toHaveProperty("targetHosts");
      expect(report).toHaveProperty("workload");
      expect(report).toHaveProperty("thresholds");
      expect(report).toHaveProperty("metrics");
      expect(report).toHaveProperty("thresholdsPassed");
    });
  });
});
