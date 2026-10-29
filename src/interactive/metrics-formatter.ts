import chalk from "chalk";
import type { RunReport } from "../report.js";

export interface MetricsTableRow {
  metric: string;
  value: string;
  status?: "pass" | "fail" | "info" | "warning";
}

/**
 * Unicode box drawing characters for table borders
 */
const BOX = {
  TL: "┌",
  TR: "┐",
  BL: "└",
  BR: "┘",
  H: "─",
  V: "│",
  ML: "├",
  MR: "┤",
  MM: "┼",
  T: "┬",
  B: "┴",
};

/**
 * Color palette for enhanced UI
 */
const COLORS = {
  primary: chalk.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  muted: chalk.gray,
  header: chalk.bold.cyan,
  border: chalk.gray,
};

/**
 * Format a number with thousands separators (e.g., 1234 -> "1,234")
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Format latency in milliseconds with 2 decimal places
 */
export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return "N/A";
  }
  return `${ms.toFixed(2)} ms`;
}

/**
 * Format percentage with 2 decimal places
 */
export function formatPercentage(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return "N/A";
  }
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Format requests per second with 2 decimal places
 */
export function formatRPS(requestCount: number, durationMs: number): string {
  if (!Number.isFinite(requestCount) || !Number.isFinite(durationMs) || durationMs <= 0 || requestCount < 0) {
    return "N/A";
  }
  const rps = (requestCount / durationMs) * 1000;
  return `${rps.toFixed(2)} req/s`;
}

/**
 * Parse duration string (e.g., "30s", "1m") to milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const match = /^([1-9]\d*)(ms|s|m|h)$/.exec(duration);
  if (!match) return 0;
  const value = Number(match[1]!);
  const unit = match[2] as "ms" | "s" | "m" | "h";
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return value * multipliers[unit];
}

/**
 * Get visible length of string (accounting for ANSI escape codes)
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Pad a potentially colored string to a fixed width
 */
function colorSafePad(str: string, width: number, direction: "start" | "end" = "end"): string {
  const visibleLength = stripAnsi(str).length;
  const paddingNeeded = Math.max(0, width - visibleLength);
  const padding = " ".repeat(paddingNeeded);
  
  return direction === "end" ? str + padding : padding + str;
}

/**
 * Check if color output is supported
 */
export function isColorSupported(): boolean {
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}

/**
 * Format a single row with optional color and enhanced styling
 */
function formatRow(metric: string, value: string, status?: "pass" | "fail" | "info" | "warning", isHeader: boolean = false): string {
  const useColor = isColorSupported();
  
  if (!useColor) {
    // Plain text fallback
    const paddedMetric = metric.padEnd(35);
    const paddedValue = value.padStart(25);
    return `${paddedMetric} ${paddedValue}`;
  }
  
  // Get status color
  let statusColor = chalk.white;
  let indicator = "";
  
  if (status === "pass") {
    statusColor = chalk.green;
    indicator = " ✓";
  } else if (status === "fail") {
    statusColor = chalk.red;
    indicator = " ✗";
  } else if (status === "warning") {
    statusColor = chalk.yellow;
    indicator = " ⚠";
  } else if (status === "info") {
    statusColor = chalk.blue;
  }
  
  // Format header rows differently
  if (isHeader) {
    const paddedMetric = colorSafePad(chalk.bold(metric), 35);
    const paddedValue = colorSafePad(chalk.bold(value), 25, "start");
    return `${BOX.V} ${paddedMetric} ${BOX.V} ${paddedValue} ${BOX.V}`;
  }
  
  // Format section headers (with no value)
  if (metric !== "" && value === "") {
    const styled = chalk.bold.cyan(metric);
    const paddedLabel = colorSafePad(styled, 35);
    return `${BOX.V} ${paddedLabel} ${BOX.V} ${"".padEnd(25)} ${BOX.V}`;
  }
  
  // Format regular rows
  const paddedMetric = metric.padEnd(35);
  const coloredValue = statusColor(value);
  const paddedValue = colorSafePad(coloredValue, 25, "start");
  
  return `${BOX.V} ${paddedMetric} ${BOX.V} ${paddedValue}${indicator} ${BOX.V}`;
}

/**
 * Create a horizontal line for table borders
 */
function createTableLine(type: "top" | "middle" | "bottom"): string {
  const useColor = isColorSupported();
  
  if (!useColor) {
    return "-".repeat(70);
  }
  
  let line = "";
  
  if (type === "top") {
    line = BOX.TL + BOX.H.repeat(37) + BOX.T + BOX.H.repeat(27) + BOX.TR;
  } else if (type === "middle") {
    line = BOX.ML + BOX.H.repeat(37) + BOX.MM + BOX.H.repeat(27) + BOX.MR;
  } else if (type === "bottom") {
    line = BOX.BL + BOX.H.repeat(37) + BOX.B + BOX.H.repeat(27) + BOX.BR;
  }
  
  return COLORS.border(line);
}

/**
 * Build rows for the metrics table
 */
export function buildMetricsRows(report: RunReport): MetricsTableRow[] {
  const rows: MetricsTableRow[] = [];
  const durationMs = parseDurationToMs(report.workload.duration);
  
  // Overall status
  const overallPass = report.thresholdsPassed;
  rows.push({
    metric: "Overall Status",
    value: overallPass ? "PASS" : "FAIL",
    status: overallPass ? "pass" : "fail",
  });
  
  rows.push({ metric: "", value: "" }); // Blank row for spacing
  
  // Test information section
  rows.push({
    metric: "Test Information",
    value: "",
  });
  
  rows.push({
    metric: "  Profile",
    value: report.profile.toUpperCase(),
  });
  
  const endpoint = report.targetHosts[0] || "Multiple endpoints";
  rows.push({
    metric: "  Target(s)",
    value: report.targetHosts.length === 1 ? endpoint : `${report.targetHosts.length} hosts`,
  });
  
  rows.push({
    metric: "  Virtual Users",
    value: formatNumber(report.workload.vus),
  });
  
  rows.push({
    metric: "  Duration",
    value: report.workload.duration,
  });
  
  rows.push({ metric: "", value: "" }); // Blank row
  
  // Request metrics section
  rows.push({
    metric: "Request Metrics",
    value: "",
  });
  
  rows.push({
    metric: "  Total Requests",
    value: formatNumber(report.metrics.requestCount),
  });
  
  const rps = formatRPS(report.metrics.requestCount, durationMs);
  rows.push({
    metric: "  Requests/sec",
    value: rps,
  });
  
  rows.push({ metric: "", value: "" }); // Blank row
  
  // Response time metrics section
  rows.push({
    metric: "Response Time (ms)",
    value: "",
  });
  
  rows.push({
    metric: "  Average",
    value: formatLatency(report.metrics.avgMs),
  });
  
  // Calculate median (p50) if available from distribution
  // For now, we'll show N/A since k6 doesn't expose p50 directly in summary
  rows.push({
    metric: "  p90",
    value: "N/A", // Not available in current k6 output
  });
  
  rows.push({
    metric: "  p95",
    value: formatLatency(report.metrics.p95Ms),
  });
  
  rows.push({
    metric: "  Maximum",
    value: "N/A", // Not available in current k6 output
  });
  
  rows.push({ metric: "", value: "" }); // Blank row
  
  // Failure metrics section
  rows.push({
    metric: "Failures",
    value: "",
  });
  
  const failedCount = Math.round(report.metrics.requestCount * report.metrics.failedRate);
  const failedLabel = `${formatNumber(failedCount)} failed`;
  rows.push({
    metric: "  HTTP Request Failures",
    value: `${failedLabel} (${formatPercentage(report.metrics.failedRate)})`,
    status: report.metrics.failedRate > 0 ? "warning" : "info",
  });
  
  rows.push({ metric: "", value: "" }); // Blank row
  
  // HTTP status distribution section
  if (report.metrics.httpStatusDistribution && Object.keys(report.metrics.httpStatusDistribution).length > 0) {
    rows.push({
      metric: "HTTP Status Distribution",
      value: "",
    });
    
    const sorted = Object.entries(report.metrics.httpStatusDistribution)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    
    for (const [status, count] of sorted) {
      const statusCode = Number(status);
      let label = "Unknown";
      let statusType: "pass" | "fail" | "info" | "warning" | undefined = "info";
      
      if (statusCode >= 200 && statusCode < 300) {
        label = "Success";
        statusType = "pass";
      } else if (statusCode >= 300 && statusCode < 400) {
        label = "Redirect";
        statusType = "info";
      } else if (statusCode >= 400 && statusCode < 500) {
        label = "Client Error";
        statusType = "warning";
      } else if (statusCode >= 500 && statusCode < 600) {
        label = "Server Error";
        statusType = "fail";
      }
      
      rows.push({
        metric: `  ${status} ${label}`,
        value: formatNumber(count),
        status: statusType,
      });
    }
    
    rows.push({ metric: "", value: "" }); // Blank row
  }
  
  // Threshold results section
  rows.push({
    metric: "Threshold Results",
    value: "",
  });
  
  const p95Passed = (report.metrics.p95Ms ?? 0) <= report.thresholds.p95Ms;
  const failedRatePassed = report.metrics.failedRate <= report.thresholds.failedRate;
  
  rows.push({
    metric: `  p95 < ${report.thresholds.p95Ms}ms`,
    value: p95Passed ? "PASS" : "FAIL",
    status: p95Passed ? "pass" : "fail",
  });
  
  rows.push({
    metric: `  Failed Rate < ${formatPercentage(report.thresholds.failedRate)}`,
    value: failedRatePassed ? "PASS" : "FAIL",
    status: failedRatePassed ? "pass" : "fail",
  });
  
  return rows;
}

/**
 * Display metrics table with enhanced UI
 */
export function displayMetricsTable(report: RunReport): void {
  const rows = buildMetricsRows(report);
  const useColor = isColorSupported();
  
  console.log();
  
  // Top border
  console.log(createTableLine("top"));
  
  // Header
  console.log(formatRow("Metric", "Value", undefined, true));
  console.log(createTableLine("middle"));
  
  // Overall status (always first, highlighted)
  const overallRow = rows[0]!;
  console.log(formatRow(overallRow.metric, overallRow.value, overallRow.status));
  console.log(createTableLine("middle"));
  
  // Rest of the rows
  let rowIndex = 2; // Skip overall status and blank row
  let lastWasSectionHeader = false;
  
  while (rowIndex < rows.length) {
    const row = rows[rowIndex]!;
    rowIndex++;
    
    // Skip blank rows
    if (row.metric === "" && row.value === "") {
      if (rowIndex < rows.length) {
        console.log(createTableLine("middle"));
      }
      continue;
    }
    
    const isSectionHeader = row.metric !== "" && row.value === "";
    
    // Add spacing before section headers
    if (isSectionHeader && lastWasSectionHeader === false) {
      console.log(createTableLine("middle"));
    }
    
    console.log(formatRow(row.metric, row.value, row.status));
    lastWasSectionHeader = isSectionHeader;
  }
  
  // Bottom border
  console.log(createTableLine("bottom"));
  
  console.log();
}
