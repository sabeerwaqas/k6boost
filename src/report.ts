import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Profile } from "./profiles.js";

// Version 1: Legacy schema (preserved for compatibility)
export interface RunReportV1 {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  profile: "smoke" | "load";
  targetHosts: string[];
  workload: { vus: number; duration: string };
  thresholds: { p95Ms: number; failedRate: number };
  metrics: {
    requestCount: number;
    failedRate: number;
    avgMs: number | null;
    p95Ms: number | null;
    httpStatusDistribution?: Record<number, number>;
  };
  thresholdsPassed: boolean;
}

// Version 2: Extended schema with new metrics and features
export interface RunReportV2 {
  schemaVersion: 2;
  id: string;
  createdAt: string;
  profile: Profile;
  targetHosts: string[];
  workload: {
    executor?: string;
    vus?: number;
    arrivalRate?: number;
    duration: string;
    stages?: Array<{ duration: string; target: number }>;
  };
  thresholds: {
    p90Ms?: number;
    p95Ms?: number;
    p99Ms?: number;
    failedRate: number;
    checkPassRate?: number;
  };
  metrics: {
    requestCount: number;
    failedRate: number;
    avgMs: number | null;
    medianMs?: number | null;
    p90Ms?: number | null;
    p95Ms?: number | null;
    p99Ms?: number | null;
    maxMs?: number | null;
    httpStatusDistribution?: Record<number, number>;
    rpsAvg?: number | null;
    droppedIterations?: number;
    timeWindows?: {
      early: { avgMs?: number; p95Ms?: number; failedRate?: number };
      middle: { avgMs?: number; p95Ms?: number; failedRate?: number };
      late: { avgMs?: number; p95Ms?: number; failedRate?: number };
    };
    stageResults?: Array<{
      stage: number;
      target: number;
      avgMs?: number;
      p95Ms?: number;
      p99Ms?: number;
      failedRate?: number;
      checkPassRate?: number;
      meetsThresholds: boolean;
    }>;
  };
  thresholdsPassed: boolean;
  regressionAnalysis?: {
    baselineId: string;
    metrics: {
      p95Change: { value: number; percent: number; pass: boolean };
      failedRateChange: { value: number; percent: number; pass: boolean };
      rpsChange?: { value: number; percent: number };
    };
    passed: boolean;
    reason?: string;
  };
  warnings?: string[];
  interrupted?: boolean;
}

export type RunReport = RunReportV1 | RunReportV2;

type K6Summary = {
  metrics?: Record<string, { values?: Record<string, number> }>;
};

/**
 * Parse duration string to milliseconds
 */
function parseDurationToMs(duration: string): number {
  const match = /^([1-9]\d*)(ms|s|m|h)$/.exec(duration);
  if (!match) return 0;
  const value = Number(match[1]!);
  const unit = match[2] as "ms" | "s" | "m" | "h";
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return value * multipliers[unit];
}

export function reportFromSummary(summary: K6Summary, meta: Omit<RunReportV2, "schemaVersion" | "metrics" | "thresholdsPassed">): RunReportV2 {
  const metrics = summary.metrics ?? {};
  const duration = metrics.http_req_duration?.values ?? {};
  const failed = metrics.http_req_failed?.values ?? {};
  const count = metrics.http_reqs?.values?.count ?? 0;
  const failedRate = failed.rate ?? 0;
  const avgMs = Number.isFinite(duration.avg) ? duration.avg! : null;
  const medianMs = Number.isFinite(duration["p(50)"]) ? duration["p(50)"]! : null;
  const p90Ms = Number.isFinite(duration["p(90)"]) ? duration["p(90)"]! : null;
  const p95Ms = Number.isFinite(duration["p(95)"]) ? duration["p(95)"]! : null;
  const p99Ms = Number.isFinite(duration["p(99)"]) ? duration["p(99)"]! : null;
  const maxMs = Number.isFinite(duration.max) ? duration.max! : null;
  
  // Extract HTTP status code distribution from k6 metrics
  const httpStatusDistribution: Record<number, number> = {};
  for (const [key, metric] of Object.entries(metrics)) {
    const match = /^http_req_duration\{.*status:([\d]+).*\}$/.exec(key);
    if (match) {
      const statusCode = Number(match[1]!);
      const count = metric.values?.count ?? 0;
      if (count > 0) httpStatusDistribution[statusCode] = count;
    }
  }
  
  // Calculate RPS average
  const workloadDurationMs = meta.workload.duration ? parseDurationToMs(meta.workload.duration) : 0;
  const rpsAvg = workloadDurationMs > 0 ? (count / workloadDurationMs) * 1000 : null;
  
  // Evaluate thresholds
  let thresholdsPassed = true;
  
  if (meta.thresholds.p90Ms !== undefined && p90Ms !== null && p90Ms > meta.thresholds.p90Ms) {
    thresholdsPassed = false;
  }
  if (meta.thresholds.p95Ms !== undefined && p95Ms !== null && p95Ms > meta.thresholds.p95Ms) {
    thresholdsPassed = false;
  }
  if (meta.thresholds.p99Ms !== undefined && p99Ms !== null && p99Ms > meta.thresholds.p99Ms) {
    thresholdsPassed = false;
  }
  if (failedRate > meta.thresholds.failedRate) {
    thresholdsPassed = false;
  }
  
  return {
    schemaVersion: 2,
    ...meta,
    metrics: {
      requestCount: count,
      failedRate,
      avgMs,
      medianMs,
      p90Ms,
      p95Ms,
      p99Ms,
      maxMs,
      rpsAvg,
      ...(Object.keys(httpStatusDistribution).length > 0 && { httpStatusDistribution })
    },
    thresholdsPassed
  };
}

export async function saveReport(report: RunReport, outputPath?: string): Promise<string> {
  const dir = resolve(".k6boost", "reports");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  
  let file: string;
  if (outputPath) {
    // K6-001 FIX: Validate that outputPath is safe
    // Do not allow absolute paths or path traversal
    if (outputPath.startsWith("/") || outputPath.startsWith("\\") || outputPath.includes("..")) {
      throw new Error("Output path must be relative and cannot contain '..' or start with a directory separator.");
    }
    
    // Resolve relative to current directory
    const resolved = resolve(outputPath);
    const cwd = process.cwd();
    
    // Ensure the resolved path is within the current working directory
    if (!resolved.startsWith(cwd + "/") && resolved !== cwd) {
      throw new Error("Output path must be within the current working directory.");
    }
    
    file = resolved;
  } else {
    file = resolve(dir, `${report.id}.json`);
  }
  
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return file;
}

export async function readReport(path: string): Promise<RunReport> {
  let data: unknown;
  try {
    data = JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    throw new Error(`Cannot read a valid report from "${path}".`);
  }
  const r = data as Partial<RunReport>;
  const version = (r as any).schemaVersion ?? 1;
  
  if (version === 1) {
    const v1 = r as Partial<RunReportV1>;
    if (v1.metrics && v1.workload && v1.thresholds && Array.isArray(v1.targetHosts)) {
      return v1 as RunReportV1;
    }
  }
  
  if (version === 2) {
    const v2 = r as Partial<RunReportV2>;
    if (v2.metrics && v2.workload && v2.thresholds && Array.isArray(v2.targetHosts)) {
      return v2 as RunReportV2;
    }
  }
  
  throw new Error(`"${path}" is not a supported k6boost report (version ${version}).`);
}
