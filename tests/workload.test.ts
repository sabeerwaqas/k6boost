import { describe, expect, it } from "vitest";
import { parseDurationToMs } from "../src/runner.js";

describe("Workload utilities", () => {
  describe("parseDurationToMs", () => {
    it("parses milliseconds", () => {
      expect(parseDurationToMs("500ms")).toBe(500);
      expect(parseDurationToMs("1000ms")).toBe(1000);
    });

    it("parses seconds", () => {
      expect(parseDurationToMs("1s")).toBe(1000);
      expect(parseDurationToMs("30s")).toBe(30_000);
    });

    it("parses minutes", () => {
      expect(parseDurationToMs("1m")).toBe(60_000);
      expect(parseDurationToMs("2m")).toBe(120_000);
    });

    it("parses hours", () => {
      expect(parseDurationToMs("1h")).toBe(3_600_000);
      expect(parseDurationToMs("2h")).toBe(7_200_000);
    });

    it("returns 0 for invalid durations", () => {
      expect(parseDurationToMs("invalid")).toBe(0);
      expect(parseDurationToMs("")).toBe(0);
      expect(parseDurationToMs("0s")).toBe(0);
      expect(parseDurationToMs("-5s")).toBe(0);
    });
  });
});
