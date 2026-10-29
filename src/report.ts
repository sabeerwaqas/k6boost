import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface RunReport {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  profile: "smoke" | "load";
  targetHosts: string[];
  workload: { vus: number; duration: string };
  thresholds: { p95Ms: number; failedRate: number };
  metrics: { requestCount: number; failedRate: number; avgMs: number | null; p95Ms: number | null };
  thresholdsPassed: boolean;
}

type K6Summary = {
  metrics?: Record<string, { values?: Record<string, number> }>;
};

export function reportFromSummary(summary: K6Summary, meta: Omit<RunReport, "schemaVersion" | "metrics" | "thresholdsPassed">): RunReport {
  const metrics = summary.metrics ?? {};
  const duration = metrics.http_req_duration?.values ?? {};
  const failed = metrics.http_req_failed?.values ?? {};
  const count = metrics.http_reqs?.values?.count ?? 0;
  const failedRate = failed.rate ?? 0;
  const avgMs = Number.isFinite(duration.avg) ? duration.avg! : null;
  const p95Ms = Number.isFinite(duration["p(95)"]) ? duration["p(95)"]! : null;
  const thresholdsPassed = p95Ms !== null && p95Ms <= meta.thresholds.p95Ms &&
    failedRate <= meta.thresholds.failedRate;
  return {
    schemaVersion: 1,
    ...meta,
    metrics: { requestCount: count, failedRate, avgMs, p95Ms },
    thresholdsPassed
  };
}

export async function saveReport(report: RunReport, outputPath?: string): Promise<string> {
  const dir = resolve(".k6boost", "reports");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = resolve(outputPath ?? `${dir}/${report.id}.json`);
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
  if (r.schemaVersion !== 1 || !r.metrics || !r.workload || !r.thresholds || !Array.isArray(r.targetHosts)) {
    throw new Error(`"${path}" is not a supported k6boost report.`);
  }
  return r as RunReport;
}
