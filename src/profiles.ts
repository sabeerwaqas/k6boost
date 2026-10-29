/**
 * Profile definitions and metadata for k6boost performance testing
 */

export type Profile = "smoke" | "load" | "stress" | "spike" | "soak" | "breakpoint" | "regression" | "custom";

export interface ProfileMetadata {
  description: string;
  requiresRemoteConfirmation: boolean;
  requiresExplicitAuth: boolean;
  supportsStages: boolean;
  supportsArrivalRate: boolean;
  maxDurationMs: number;
  maxVUs: number;
  defaultThresholds: {
    p90Ms?: number;
    p95Ms?: number;
    p99Ms?: number;
    failedRate: number;
    checkPassRate?: number;
  };
}

export const PROFILE_METADATA: Record<Profile, ProfileMetadata> = {
  smoke: {
    description: "Quick health check: 1 VU, 10 seconds",
    requiresRemoteConfirmation: false,
    requiresExplicitAuth: false,
    supportsStages: false,
    supportsArrivalRate: false,
    maxDurationMs: 60_000,
    maxVUs: 1,
    defaultThresholds: { p95Ms: 1000, failedRate: 0.01 },
  },
  load: {
    description: "Realistic load: 5 VUs, 30 seconds",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: false,
    supportsStages: false,
    supportsArrivalRate: false,
    maxDurationMs: 600_000,
    maxVUs: 50,
    defaultThresholds: { p95Ms: 1000, failedRate: 0.01 },
  },
  stress: {
    description: "Capacity testing: progressive load increase",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: true,
    supportsStages: true,
    supportsArrivalRate: true,
    maxDurationMs: 1_800_000, // 30 min
    maxVUs: 500,
    defaultThresholds: { p95Ms: 2000, p99Ms: 5000, failedRate: 0.05 },
  },
  spike: {
    description: "Sudden load surge: baseline + spike + recovery",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: true,
    supportsStages: true,
    supportsArrivalRate: true,
    maxDurationMs: 1_200_000, // 20 min
    maxVUs: 1000,
    defaultThresholds: { p95Ms: 3000, p99Ms: 8000, failedRate: 0.1 },
  },
  soak: {
    description: "Sustained load: detect degradation over time",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: true,
    supportsStages: false,
    supportsArrivalRate: true,
    maxDurationMs: 7_200_000, // 2 hours
    maxVUs: 100,
    defaultThresholds: { p95Ms: 1500, failedRate: 0.01 },
  },
  breakpoint: {
    description: "Capacity discovery: increment load until thresholds fail",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: true,
    supportsStages: true,
    supportsArrivalRate: true,
    maxDurationMs: 2_400_000, // 40 min
    maxVUs: 500,
    defaultThresholds: { p95Ms: 2000, p99Ms: 5000, failedRate: 0.05 },
  },
  regression: {
    description: "Compare current run against baseline",
    requiresRemoteConfirmation: false,
    requiresExplicitAuth: false,
    supportsStages: false,
    supportsArrivalRate: false,
    maxDurationMs: 0, // Reuses baseline workload
    maxVUs: 0, // Reuses baseline workload
    defaultThresholds: { p95Ms: 1000, failedRate: 0.01 },
  },
  custom: {
    description: "User-defined executor configuration",
    requiresRemoteConfirmation: true,
    requiresExplicitAuth: true,
    supportsStages: true,
    supportsArrivalRate: true,
    maxDurationMs: 3_600_000, // 1 hour
    maxVUs: 1000,
    defaultThresholds: { p95Ms: 2000, failedRate: 0.05 },
  },
};

/**
 * Get profile metadata by name
 */
export function getProfileMetadata(profile: Profile): ProfileMetadata {
  return PROFILE_METADATA[profile];
}

/**
 * Check if a profile requires high-load confirmation
 */
export function requiresRemoteConfirmation(profile: Profile): boolean {
  return PROFILE_METADATA[profile].requiresRemoteConfirmation;
}

/**
 * Check if a profile supports stage-based workloads
 */
export function supportsStages(profile: Profile): boolean {
  return PROFILE_METADATA[profile].supportsStages;
}

/**
 * Check if a profile supports arrival-rate based workloads
 */
export function supportsArrivalRate(profile: Profile): boolean {
  return PROFILE_METADATA[profile].supportsArrivalRate;
}
