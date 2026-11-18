import { describe, expect, it } from "vitest";
import { parseOpenApiDocument } from "../src/openapi.js";

const document = {
  openapi: "3.0.3",
  servers: [{ url: "https://api.example.test/v1" }],
  paths: {
    "/users": {
      get: { operationId: "listUsers" },
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "role"],
                properties: {
                  name: { type: "string", example: "Ada" },
                  email: { type: "string", format: "email" },
                  role: { type: "string", enum: ["member", "admin"] },
                  active: { type: "boolean", default: false }
                }
              }
            }
          }
        }
      }
    },
    "/users/{userId}": {
      get: {
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "integer", example: 42 } }],
        responses: { "200": { description: "OK" } }
      }
    }
  }
};

describe("OpenAPI importer", () => {
  it("extracts supported operations and applies the declared server", () => {
    const endpoints = parseOpenApiDocument(document);
    expect(endpoints.map(({ method }) => method)).toEqual(["GET", "POST", "GET"]);
    expect(endpoints[0]?.url).toBe("https://api.example.test/v1/users");
    expect(endpoints[2]?.url).toBe("https://api.example.test/v1/users/42");
  });

  it("generates JSON request samples and disables write operations", () => {
    const endpoints = parseOpenApiDocument(document);
    const create = endpoints.find(({ method }) => method === "POST");
    expect(create?.enabled).toBe(false);
    expect(create?.bodyType).toBe("json");
    expect(JSON.parse(create!.body!)).toEqual({
      name: "Ada",
      email: "user@example.com",
      role: "member",
      active: false
    });
    expect(endpoints.find(({ method }) => method === "GET")?.enabled).toBe(true);
  });

  it("supports a caller-provided server URL", () => {
    const endpoints = parseOpenApiDocument(document, { baseUrl: "http://localhost:8080" });
    expect(endpoints[0]?.url).toBe("http://localhost:8080/users");
  });

  it("rejects Swagger 2.0 documents", () => {
    expect(() => parseOpenApiDocument({ swagger: "2.0", paths: {} })).toThrow(/OpenAPI 3.x/);
  });
});
