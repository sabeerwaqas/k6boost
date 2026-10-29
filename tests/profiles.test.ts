import { describe, expect, it } from "vitest";
import { PROFILE_METADATA, getProfileMetadata, requiresRemoteConfirmation, supportsStages, supportsArrivalRate } from "../src/profiles.js";

describe("Profiles", () => {
  describe("Profile metadata", () => {
    it("defines metadata for all profiles", () => {
      expect(PROFILE_METADATA.smoke).toBeDefined();
      expect(PROFILE_METADATA.load).toBeDefined();
      expect(PROFILE_METADATA.stress).toBeDefined();
      expect(PROFILE_METADATA.spike).toBeDefined();
      expect(PROFILE_METADATA.soak).toBeDefined();
      expect(PROFILE_METADATA.breakpoint).toBeDefined();
      expect(PROFILE_METADATA.regression).toBeDefined();
      expect(PROFILE_METADATA.custom).toBeDefined();
    });

    it("smoke profile has correct metadata", () => {
      const meta = PROFILE_METADATA.smoke;
      expect(meta.requiresRemoteConfirmation).toBe(false);
      expect(meta.supportsStages).toBe(false);
      expect(meta.supportsArrivalRate).toBe(false);
      expect(meta.maxVUs).toBe(1);
      expect(meta.maxDurationMs).toBe(60_000);
      expect(meta.defaultThresholds.p95Ms).toBe(1000);
    });

    it("load profile has correct metadata", () => {
      const meta = PROFILE_METADATA.load;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(false);
      expect(meta.supportsArrivalRate).toBe(false);
      expect(meta.maxVUs).toBe(50);
      expect(meta.maxDurationMs).toBe(600_000);
    });

    it("stress profile has correct metadata", () => {
      const meta = PROFILE_METADATA.stress;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(true);
      expect(meta.supportsArrivalRate).toBe(true);
      expect(meta.maxVUs).toBe(500);
      expect(meta.maxDurationMs).toBe(1_800_000);
      expect(meta.defaultThresholds.p99Ms).toBe(5000);
    });

    it("spike profile has correct metadata", () => {
      const meta = PROFILE_METADATA.spike;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(true);
      expect(meta.maxVUs).toBe(1000);
      expect(meta.defaultThresholds.failedRate).toBe(0.1);
    });

    it("soak profile has correct metadata", () => {
      const meta = PROFILE_METADATA.soak;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(false);
      expect(meta.supportsArrivalRate).toBe(true);
      expect(meta.maxDurationMs).toBe(7_200_000); // 2 hours
    });

    it("breakpoint profile has correct metadata", () => {
      const meta = PROFILE_METADATA.breakpoint;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(true);
      expect(meta.supportsArrivalRate).toBe(true);
      expect(meta.maxVUs).toBe(500);
    });

    it("regression profile has correct metadata", () => {
      const meta = PROFILE_METADATA.regression;
      expect(meta.requiresRemoteConfirmation).toBe(false);
      expect(meta.supportsStages).toBe(false);
      expect(meta.supportsArrivalRate).toBe(false);
      expect(meta.maxVUs).toBe(0); // Reuses baseline
      expect(meta.maxDurationMs).toBe(0);
    });

    it("custom profile has correct metadata", () => {
      const meta = PROFILE_METADATA.custom;
      expect(meta.requiresRemoteConfirmation).toBe(true);
      expect(meta.supportsStages).toBe(true);
      expect(meta.supportsArrivalRate).toBe(true);
      expect(meta.maxVUs).toBe(1000);
      expect(meta.maxDurationMs).toBe(3_600_000); // 1 hour
    });
  });

  describe("Helper functions", () => {
    it("getProfileMetadata returns correct metadata", () => {
      const meta = getProfileMetadata("smoke");
      expect(meta.maxVUs).toBe(1);
    });

    it("requiresRemoteConfirmation returns correct values", () => {
      expect(requiresRemoteConfirmation("smoke")).toBe(false);
      expect(requiresRemoteConfirmation("load")).toBe(true);
      expect(requiresRemoteConfirmation("stress")).toBe(true);
      expect(requiresRemoteConfirmation("regression")).toBe(false);
    });

    it("supportsStages returns correct values", () => {
      expect(supportsStages("smoke")).toBe(false);
      expect(supportsStages("load")).toBe(false);
      expect(supportsStages("stress")).toBe(true);
      expect(supportsStages("breakpoint")).toBe(true);
      expect(supportsStages("soak")).toBe(false);
    });

    it("supportsArrivalRate returns correct values", () => {
      expect(supportsArrivalRate("smoke")).toBe(false);
      expect(supportsArrivalRate("load")).toBe(false);
      expect(supportsArrivalRate("soak")).toBe(true);
      expect(supportsArrivalRate("spike")).toBe(true);
      expect(supportsArrivalRate("custom")).toBe(true);
    });
  });
});
