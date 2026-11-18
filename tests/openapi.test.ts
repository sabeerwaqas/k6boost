import { describe, expect, it } from "vitest";
import { importOpenApi } from "../src/openapi.js";

describe("OpenAPI importer", () => {
  it("imports operations and creates sample JSON bodies from schemas", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      openapi: "3.0.3",
      servers: [{ url: "https://api.example.test" }],
      paths: {
        "/bookings": {
          get: { summary: "List bookings" },
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["email"],
                    properties: {
                      email: { type: "string", format: "email" },
                      guests: { type: "integer", example: 3 },
                      active: { type: "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const endpoints = await importOpenApi("https://spec.example.test/openapi.json", { allowRemote: true });
      expect(endpoints).toHaveLength(2);
      expect(endpoints[0]?.method).toBe("GET");
      expect(JSON.parse(endpoints[1]!.body!)).toEqual({
        email: "user@example.com",
        guests: 3,
        active: true
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires explicit opt-in for local and remote spec hosts", async () => {
    await expect(importOpenApi("http://localhost:8080/v3/api-docs")).rejects.toThrow(/--allow-local/);
    await expect(importOpenApi("https://example.com/openapi.json")).rejects.toThrow(/--allow-remote/);
  });

  it("rejects invalid documents", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch;
    try {
      await expect(importOpenApi("https://example.com/openapi.json", { allowRemote: true })).rejects.toThrow(/not a valid OpenAPI/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
