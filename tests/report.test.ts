import { describe, expect, it } from "vitest";
import { reportFromSummary } from "../src/report.js";

describe("reportFromSummary", () => {
  it("normalizes actual k6 metrics and evaluates thresholds", () => {
    const report = reportFromSummary({
      metrics: {
        http_req_duration: { values: { avg: 80, "p(95)": 120 } },
        http_req_failed: { values: { rate: 0.001 } },
        http_reqs: { values: { count: 42 } }
      }
    }, {
      id: "test-run",
      createdAt: "2026-01-01T00:00:00.000Z",
      profile: "smoke",
      targetHosts: ["api.example.com"],
      workload: { vus: 1, duration: "10s" },
      thresholds: { p95Ms: 200, failedRate: 0.01 }
    });
    expect(report.metrics).toEqual({ requestCount: 42, failedRate: 0.001, avgMs: 80, p95Ms: 120 });
    expect(report.thresholdsPassed).toBe(true);
  });

  it("fails when latency exceeds the configured threshold", () => {
    const report = reportFromSummary({
      metrics: {
        http_req_duration: { values: { avg: 80, "p(95)": 300 } },
        http_req_failed: { values: { rate: 0 } },
        http_reqs: { values: { count: 42 } }
      }
    }, {
      id: "test-run",
      createdAt: "2026-01-01T00:00:00.000Z",
      profile: "smoke",
      targetHosts: ["api.example.com"],
      workload: { vus: 1, duration: "10s" },
      thresholds: { p95Ms: 200, failedRate: 0.01 }
    });
    expect(report.thresholdsPassed).toBe(false);
  });

  it("extracts HTTP status code distribution from k6 metrics", () => {
    const report = reportFromSummary({
      metrics: {
        http_req_duration: { values: { avg: 80, "p(95)": 120 } },
        "http_req_duration{status:200}": { values: { count: 38 } },
        "http_req_duration{status:400}": { values: { count: 2 } },
        "http_req_duration{status:500}": { values: { count: 2 } },
        http_req_failed: { values: { rate: 0.1 } },
        http_reqs: { values: { count: 42 } }
      }
    }, {
      id: "test-run",
      createdAt: "2026-01-01T00:00:00.000Z",
      profile: "smoke",
      targetHosts: ["api.example.com"],
      workload: { vus: 1, duration: "10s" },
      thresholds: { p95Ms: 200, failedRate: 0.2 }
    });
    expect(report.metrics.httpStatusDistribution).toEqual({ 200: 38, 400: 2, 500: 2 });
    expect(report.thresholdsPassed).toBe(true);
  });
});
