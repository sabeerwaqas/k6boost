import { describe, expect, it } from "vitest";
import { isLocalHostname, resolveHeaders, resolveBody, validateTargets } from "../src/security.js";
import type { Endpoint } from "../src/config.js";

const endpoint = (url: string): Endpoint => ({ name: "api", url, method: "GET", headers: {} });

describe("target safety", () => {
  it("recognizes localhost and private IPv4 ranges", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("192.168.1.10")).toBe(true);
    expect(isLocalHostname("example.com")).toBe(false);
  });

  it("requires explicit opt-in for remote hosts", () => {
    expect(() => validateTargets([endpoint("https://example.com")], false, false)).toThrow(/--allow-remote/);
    expect(() => validateTargets([endpoint("https://example.com")], true, false)).not.toThrow();
  });

  it("requires explicit opt-in for local/private targets", () => {
    expect(() => validateTargets([endpoint("http://127.0.0.1:3000")], false, false)).toThrow(/--allow-local/);
    expect(() => validateTargets([endpoint("http://127.0.0.1:3000")], false, true)).not.toThrow();
  });

  it("rejects credentials embedded in URLs", () => {
    expect(() => validateTargets([endpoint("https://user:pass@example.com")], true, false)).toThrow(/must not embed credentials/);
  });
});

describe("environment-backed headers", () => {
  it("resolves environment references without logging their values", () => {
    process.env.K6BOOST_TEST_TOKEN = "test-secret";
    expect(resolveHeaders({ Authorization: "${K6BOOST_TEST_TOKEN}" }, "api")).toEqual({ Authorization: "test-secret" });
    delete process.env.K6BOOST_TEST_TOKEN;
  });

  it("fails when a required environment variable is missing", () => {
    delete process.env.K6BOOST_MISSING;
    expect(() => resolveHeaders({ Authorization: "${K6BOOST_MISSING}" }, "api")).toThrow(/is not set/);
  });
});

describe("body resolution and validation", () => {
  it("accepts valid JSON bodies with bodyType json", () => {
    const body = '{"key": "value"}';
    expect(resolveBody(body, "json", "test")).toBe(body);
  });

  it("rejects invalid JSON bodies with bodyType json", () => {
    expect(() => resolveBody("{invalid json}", "json", "test")).toThrow(/not valid JSON/);
  });

  it("accepts plain text bodies", () => {
    const body = "plain text";
    expect(resolveBody(body, "text", "test")).toBe(body);
  });

  it("returns undefined for missing bodies", () => {
    expect(resolveBody(undefined, "text", "test")).toBeUndefined();
  });
});
