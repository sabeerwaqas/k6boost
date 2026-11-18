import { isLocalHostname } from "./security.js";

type JsonObject = Record<string, unknown>;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const MAX_SPEC_BYTES = 5 * 1024 * 1024;

export interface ImportedEndpoint {
  name: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  bodyType?: "json";
}

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function resolveLocalRef(root: JsonObject, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  return ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, key) => asObject(current)?.[key], root);
}

function sampleValue(schemaValue: unknown, root: JsonObject, depth = 0): unknown {
  if (depth > 8) return "REPLACE_ME";
  const schema = asObject(schemaValue);
  if (!schema) return "REPLACE_ME";

  if (typeof schema.$ref === "string") {
    const resolved = resolveLocalRef(root, schema.$ref);
    return resolved === undefined ? "REPLACE_ME" : sampleValue(resolved, root, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  const type = schema.type;
  if (type === "object" || schema.properties) {
    const properties = asObject(schema.properties) ?? {};
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(properties)) {
      result[key] = sampleValue(value, root, depth + 1);
    }
    return result;
  }
  if (type === "array") {
    return [sampleValue(schema.items, root, depth + 1)];
  }
  if (type === "integer" || type === "number") {
    const minimum = typeof schema.minimum === "number" ? schema.minimum : 1;
    const maximum = typeof schema.maximum === "number" ? schema.maximum : undefined;
    return maximum !== undefined && minimum > maximum ? minimum : minimum;
  }
  if (type === "boolean") return true;
  if (type === "string") {
    if (schema.format === "email") return "user@example.com";
    if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000000";
    if (schema.format === "date") return "2026-01-01";
    if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
    return "REPLACE_ME";
  }
  return "REPLACE_ME";
}

function safeName(method: string, path: string, used: Set<string>): string {
  const base = `${method.toLowerCase()}-${path.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root"}`.slice(0, 70);
  let name = base;
  let suffix = 2;
  while (used.has(name)) name = `${base.slice(0, 75 - String(suffix).length)}-${suffix++}`;
  used.add(name);
  return name;
}

function validateSpecUrl(source: string, allowLocal: boolean, allowRemote: boolean): URL {
  let url: URL;
  try { url = new URL(source); } catch { throw new Error("OpenAPI source must be a valid HTTP(S) URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("OpenAPI source must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Do not embed credentials in the OpenAPI URL.");
  const local = isLocalHostname(url.hostname);
  if (local && !allowLocal) throw new Error("OpenAPI URL targets a local/private host. Re-run with --allow-local if this is your own development API.");
  if (!local && !allowRemote) throw new Error("OpenAPI URL targets a remote host. Re-run with --allow-remote only if you trust the source.");
  return url;
}

export async function importOpenApi(source: string, options: {
  baseUrl?: string;
  allowLocal?: boolean;
  allowRemote?: boolean;
} = {}): Promise<ImportedEndpoint[]> {
  const sourceUrl = validateSpecUrl(source, Boolean(options.allowLocal), Boolean(options.allowRemote));
  const response = await fetch(sourceUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Unable to download OpenAPI document: HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SPEC_BYTES) throw new Error("OpenAPI document exceeds the 5 MB size limit.");

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_SPEC_BYTES) throw new Error("OpenAPI document exceeds the 5 MB size limit.");

  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("OpenAPI import currently supports JSON documents only. The response was not valid JSON."); }
  const root = asObject(parsed);
  if (!root || !(typeof root.openapi === "string" || typeof root.swagger === "string") || !asObject(root.paths)) {
    throw new Error("Document is not a valid OpenAPI/Swagger JSON document (expected openapi/swagger and paths).");
  }

  const serverList = Array.isArray(root.servers) ? root.servers : [];
  const firstServer = asObject(serverList[0]);
  const serverUrl = typeof firstServer?.url === "string" ? firstServer.url : "/";
  const baseUrl = options.baseUrl ?? new URL(serverUrl, sourceUrl).toString();
  let base: URL;
  try { base = new URL(baseUrl); } catch { throw new Error("The OpenAPI server URL is invalid. Supply a valid --base-url."); }
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("API base URL must use HTTP or HTTPS.");

  const endpoints: ImportedEndpoint[] = [];
  const used = new Set<string>();
  for (const [path, rawItem] of Object.entries(root.paths as JsonObject)) {
    const pathItem = asObject(rawItem);
    if (!pathItem) continue;
    for (const method of METHODS) {
      const operation = asObject(pathItem[method.toLowerCase()]);
      if (!operation) continue;
      const url = new URL(path.replace(/^\//, ""), base.toString().endsWith("/") ? base : new URL(base.toString() + "/"));
      const endpoint: ImportedEndpoint = {
        name: safeName(method, path, used),
        url: url.toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}"),
        method,
        headers: {}
      };
      const requestBody = asObject(operation.requestBody);
      const content = asObject(requestBody?.content);
      const jsonContent = asObject(content?.["application/json"]) ?? asObject(content?.["application/*+json"]);
      if (jsonContent?.schema) {
        endpoint.body = JSON.stringify(sampleValue(jsonContent.schema, root), null, 2);
        endpoint.bodyType = "json";
        endpoint.headers["Content-Type"] = "application/json";
      }
      endpoints.push(endpoint);
    }
  }
  if (!endpoints.length) throw new Error("No supported HTTP operations were found in the OpenAPI document.");
  return endpoints;
}
