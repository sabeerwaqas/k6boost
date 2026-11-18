import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isLocalHostname } from "./security.js";

type JsonObject = Record<string, unknown>;
export interface ImportedEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers: Record<string, string>;
  body?: string;
  bodyType?: "json";
  enabled: boolean;
}
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const MAX_SPEC_BYTES = 5 * 1024 * 1024;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function isPrivateAddress(address: string): boolean {
  if (isLocalHostname(address)) return true;
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
      a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168 ||
      a! >= 224;
  }
  if (isIP(address) === 6) {
    const ip = address.toLowerCase();
    return ip === "::" || ip === "::1" || ip.startsWith("fc") ||
      ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") ||
      ip.startsWith("fea") || ip.startsWith("feb") || ip.startsWith("::ffff:127.");
  }
  return true;
}

async function readSpec(source: string, allowLocal: boolean): Promise<string> {
  if (!/^https?:\/\//i.test(source)) {
    const content = await readFile(source, "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_SPEC_BYTES) throw new Error("OpenAPI file exceeds the 5 MB size limit.");
    return content;
  }
  const url = new URL(source);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("OpenAPI source must be an HTTP(S) URL without embedded credentials.");
  }
  if (!allowLocal) {
    if (isLocalHostname(hostname)) throw new Error("Local/private OpenAPI URLs require --allow-local.");
    const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("OpenAPI URL resolves to a local or private address. Use --allow-local only for a trusted development server.");
    }
  }
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json, application/*+json" }
  });
  if (!response.ok) throw new Error(`Could not fetch OpenAPI spec: HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SPEC_BYTES) throw new Error("OpenAPI response exceeds the 5 MB size limit.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_SPEC_BYTES) throw new Error("OpenAPI response exceeds the 5 MB size limit.");
  return text;
}

function resolveRef(root: JsonObject, schema: JsonObject, seen = new Set<string>()): JsonObject {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  if (!ref.startsWith("#/")) throw new Error("External OpenAPI references are not supported yet.");
  if (seen.has(ref)) throw new Error(`Circular OpenAPI schema reference: ${ref}`);
  const target = ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((value, key) => object(value)[key], root);
  const next = new Set(seen);
  next.add(ref);
  return resolveRef(root, object(target), next);
}

function sample(schemaInput: unknown, root: JsonObject, depth = 0): unknown {
  if (depth > 8) return null;
  const schema = resolveRef(root, object(schemaInput));
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return sample(schema.oneOf[0], root, depth + 1);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return sample(schema.anyOf[0], root, depth + 1);
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    return Object.assign({}, ...schema.allOf.map((part) => object(sample(part, root, depth + 1))));
  }
  const type = schema.type;
  if (type === "object" || schema.properties) {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(object(schema.properties))) {
      const childSchema = resolveRef(root, object(child));
      if (childSchema.readOnly === true) continue;
      result[key] = sample(childSchema, root, depth + 1);
    }
    return result;
  }
  if (type === "array") return [sample(schema.items, root, depth + 1)];
  if (type === "integer" || type === "number") return schema.minimum ?? (type === "integer" ? 1 : 1.0);
  if (type === "boolean") return true;
  if (type === "string") {
    if (schema.format === "date") return "2026-01-15";
    if (schema.format === "date-time") return "2026-01-15T10:00:00Z";
    if (schema.format === "email") return "user@example.com";
    if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000001";
    return typeof schema.minLength === "number" && schema.minLength > 0 ? "x".repeat(Math.min(schema.minLength, 32)) : "sample";
  }
  return null;
}

function serverUrl(root: JsonObject, operation: JsonObject, baseUrl?: string): string {
  const servers = Array.isArray(operation.servers) ? operation.servers : root.servers;
  const serverEntry = object(Array.isArray(servers) ? servers[0] : undefined);
  let server = typeof serverEntry.url === "string" ? serverEntry.url : undefined;
  if (baseUrl) server = baseUrl;
  if (!server?.trim()) {
    throw new Error("The OpenAPI document has no server URL. Supply one with --base-url.");
  }
  const variables = object(serverEntry.variables);
  for (const [key, value] of Object.entries(variables)) {
    const variable = object(value);
    const option = variable.default ?? (Array.isArray(variable.enum) ? variable.enum[0] : undefined);
    if (option !== undefined) server = server.replaceAll(`{${key}}`, String(option));
  }
  return new URL(server).toString().replace(/\/$/, "");
}
function parameterValue(parameter: JsonObject, root: JsonObject): string {
  const example = object(parameter.examples).default;
  const value = parameter.example ?? object(example).value ?? example;
  if (value !== undefined) return String(value);
  return String(sample(parameter.schema, root) ?? "1");
}

function makeName(method: string, path: string): string {
  const slug = path.replace(/^\//, "").replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${method.toLowerCase()}-${slug || "root"}`.slice(0, 75);
}

export function parseOpenApiDocument(document: unknown, options: { baseUrl?: string } = {}): ImportedEndpoint[] {
  const root = object(document);
  if (!String(root.openapi ?? "").startsWith("3.")) throw new Error("Only OpenAPI 3.x JSON documents are supported. Swagger 2.0 and YAML are not supported yet.");
  const paths = object(root.paths);
  const endpoints: ImportedEndpoint[] = [];
  for (const [path, pathItemValue] of Object.entries(paths)) {
    const pathItem = object(pathItemValue);
    for (const method of METHODS) {
      const operation = object(pathItem[method]);
      if (!Object.keys(operation).length) continue;
      const base = serverUrl(root, operation, options.baseUrl);
      const params = new Map<string, JsonObject>();
      for (const parameter of [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
        const item = object(parameter);
        if (typeof item.name === "string" && typeof item.in === "string") params.set(`${item.in}:${item.name}`, item);
      }
      let resolvedPath = path;
      const query = new URLSearchParams();
      for (const parameter of params.values()) {
        const name = String(parameter.name);
        if (parameter.in === "path") resolvedPath = resolvedPath.replace(`{${name}}`, encodeURIComponent(parameterValue(parameter, root)));
        if (parameter.in === "query") query.set(name, parameterValue(parameter, root));
      }
      resolvedPath = resolvedPath.replace(/\{[^}]+\}/g, "1");
      const url = new URL(`${base}/${resolvedPath.replace(/^\//, "")}`);
      for (const [key, value] of query) url.searchParams.set(key, value);
      const content = object(object(operation.requestBody).content);
      const jsonMedia = object(content["application/json"]);
      const schema = jsonMedia.schema;
      let body: string | undefined;
      if (schema !== undefined && ["post", "put", "patch", "delete"].includes(method)) {
        const namedExample = object(jsonMedia.examples).default;
        const example = jsonMedia.example ?? object(namedExample).value;
        const payload = example !== undefined ? example : sample(schema, root);
        body = JSON.stringify(payload, null, 2);
      }
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const upperMethod = method.toUpperCase() as ImportedEndpoint["method"];
      endpoints.push({
        name: makeName(upperMethod, path),
        url: url.toString(),
        method: upperMethod,
        headers,
        ...(body !== undefined ? { body, bodyType: "json" as const } : {}),
        enabled: !["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod),
      });
    }
  }
  if (!endpoints.length) throw new Error("No supported HTTP operations were found in the OpenAPI document.");
  const nameCounts = new Map<string, number>();
  for (const endpoint of endpoints) {
    const count = (nameCounts.get(endpoint.name) ?? 0) + 1;
    nameCounts.set(endpoint.name, count);
    if (count > 1) endpoint.name = `${endpoint.name}-${count}`;
  }
  return endpoints;
}

export async function importOpenApi(source: string, options: { allowLocal?: boolean; baseUrl?: string } = {}): Promise<ImportedEndpoint[]> {
  const raw = await readSpec(source, Boolean(options.allowLocal));
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    throw new Error("The OpenAPI document is not valid JSON. YAML import is not supported yet.");
  }
  return parseOpenApiDocument(document, { baseUrl: options.baseUrl });
}
