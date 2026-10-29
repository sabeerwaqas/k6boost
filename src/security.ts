import type { Endpoint } from "./config.js";

const PRIVATE_IPV4 = [
  /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./
];

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" ||
    host === "0.0.0.0" || PRIVATE_IPV4.some((pattern) => pattern.test(host));
}

export function validateTargets(endpoints: Endpoint[], allowRemote: boolean, allowLocal: boolean): void {
  for (const endpoint of endpoints) {
    const url = new URL(endpoint.url);
    if (url.username || url.password) throw new Error(`Endpoint "${endpoint.name}" must not embed credentials in its URL.`);
    if (isLocalHostname(url.hostname)) {
      if (!allowLocal) throw new Error(`Endpoint "${endpoint.name}" targets a local/private address. Re-run with --allow-local only if you intend to test it.`);
    } else if (!allowRemote) {
      throw new Error(`Endpoint "${endpoint.name}" targets a remote host. Confirm you are authorized, then re-run with --allow-remote.`);
    }
  }
}

export function resolveHeaders(headers: Record<string, string>, endpointName: string): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
    if (value.includes("${") && !match) throw new Error(`Header "${key}" on "${endpointName}" has an invalid environment-variable reference.`);
    if (match) {
      const secret = process.env[match[1]!];
      if (secret === undefined) throw new Error(`Environment variable ${match[1]} required by endpoint "${endpointName}" is not set.`);
      resolved[key] = secret;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
