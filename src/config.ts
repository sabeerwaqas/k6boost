import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

export const EndpointSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens for endpoint names."),
  url: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Endpoint URL must use HTTP or HTTPS."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  bodyType: z.enum(["json", "text"]).optional()
}).refine((data) => {
  // Validate that bodyType and body are consistent
  if (data.body && data.bodyType === "json") {
    try {
      JSON.parse(data.body);
    } catch {
      return false;
    }
  }
  return true;
}, { message: "body must be valid JSON when bodyType is 'json'", path: ["body"] });

// Workload configuration for stages and arrival rate
export const WorkloadSchema = z.object({
  executor: z.enum(["constant-vus", "ramping-vus", "constant-arrival-rate", "ramping-arrival-rate", "shared-iterations", "per-vu-iterations"]).optional(),
  vus: z.number().int().min(1).optional(),
  duration: z.string().optional(),
  arrivalRate: z.number().positive().optional(),
  timeUnit: z.enum(["1s", "1m"]).default("1s"),
  stages: z.array(z.object({
    duration: z.string(),
    target: z.number().int().positive()
  })).optional(),
  maxVUs: z.number().int().positive().optional(),
  preAllocatedVUs: z.number().int().min(0).optional(),
  gracefulStop: z.string().optional(),
  startTime: z.string().optional()
});

// Profile-specific thresholds
export const ProfileThresholdsSchema = z.object({
  p90Ms: z.number().positive().optional(),
  p95Ms: z.number().positive().optional(),
  p99Ms: z.number().positive().optional(),
  failedRate: z.number().min(0).max(1).optional(),
  checkPassRate: z.number().min(0).max(1).optional(),
  droppedIterations: z.number().int().min(0).optional()
});

// Profile configuration (per-profile overrides)
export const ProfileConfigSchema = z.object({
  profile: z.string(),
  workload: WorkloadSchema.optional(),
  thresholds: ProfileThresholdsSchema.optional(),
  regressionConfig: z.object({
    baselineReportId: z.string(),
    tolerances: z.object({
      p95Percent: z.number().min(0).default(10),
      p95Absolute: z.number().optional(),
      failedRatePercent: z.number().min(0).default(100),
      checkPassRatePercent: z.number().min(0).default(0)
    }).optional()
  }).optional()
});

// Safety limits configuration
export const SafetyLimitsSchema = z.object({
  maxVUs: z.number().int().positive().default(1000),
  maxDuration: z.string().default("1h"),
  maxTotalRuntime: z.string().default("4h")
});

export const ProjectConfigSchema = z.object({
  version: z.literal(1),
  endpoints: z.array(EndpointSchema).default([]),
  thresholds: z.object({
    p95Ms: z.number().positive().default(1000),
    failedRate: z.number().min(0).max(1).default(0.01)
  }).default({ p95Ms: 1000, failedRate: 0.01 }),
  profileConfigs: z.record(ProfileConfigSchema).optional(),
  safetyLimits: SafetyLimitsSchema.optional()
});

export type Endpoint = z.infer<typeof EndpointSchema>;
export type Workload = z.infer<typeof WorkloadSchema>;
export type ProfileThresholds = z.infer<typeof ProfileThresholdsSchema>;
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;
export type SafetyLimits = z.infer<typeof SafetyLimitsSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export const CONFIG_FILE = "k6boost.json";

export function defaultConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ version: 1, endpoints: [], thresholds: { p95Ms: 1000, failedRate: 0.01 } });
}

export async function loadConfig(file = CONFIG_FILE): Promise<ProjectConfig> {
  let raw: string;
  try {
    raw = await readFile(resolve(file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Could not find ${file}. Run "k6boost init" first.`);
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${file} is not valid JSON.`);
  }
  const result = ProjectConfigSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Invalid ${file}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const names = result.data.endpoints.map((e) => e.name);
  if (new Set(names).size !== names.length) throw new Error("Endpoint names must be unique.");
  return result.data;
}

export async function saveConfig(config: ProjectConfig, file = CONFIG_FILE): Promise<void> {
  const validated = ProjectConfigSchema.parse(config);
  const resolvedPath = resolve(file);
  const tempFile = `${resolvedPath}.tmp`;
  
  // K6-005 FIX: Write to temporary file first for atomic updates
  // If the process crashes mid-write, the original file remains intact
  await writeFile(tempFile, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  
  // Atomic rename - if crash happens here, temp file is left but original is safe
  await rename(tempFile, resolvedPath);
}
