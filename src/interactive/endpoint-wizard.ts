import {
  input,
  select,
  confirm,
  checkbox,
  editor,
  password,
} from "@inquirer/prompts";
import type { Endpoint, ProjectConfig } from "../config.js";
import { EndpointSchema } from "../config.js";
import {
  displayHeader,
  displaySuccess,
  displayError,
  displayInfo,
  maskSecret,
} from "./banner.js";

interface WizardEndpoint {
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  bodyType?: string;
}

export async function runEndpointWizard(
  config: ProjectConfig
): Promise<Endpoint | null> {
  try {
    displayHeader("Create a New Endpoint");
    displayInfo("Complete these steps to configure your API endpoint");

    // Step 1: Endpoint Identity
    const name = await promptEndpointName(config);
    if (!name) return null;

    const url = await promptURL();
    if (!url) return null;

    // Step 2: HTTP Method
    const method = await promptMethod();
    if (!method) return null;

    // Step 3: Headers
    const headers = await promptHeaders();
    if (headers === null) return null;

    // Step 4: Authentication
    const authHeaders = await promptAuthentication();
    if (authHeaders === null) return null;
    const finalHeaders = { ...headers, ...authHeaders };

    // Step 5: Request Body (conditional on method)
    let body: string | undefined;
    let bodyType: string | undefined;

    if (["POST", "PUT", "PATCH"].includes(method)) {
      const bodyConfig = await promptBody(method);
      if (bodyConfig === null) return null;
      body = bodyConfig.body;
      bodyType = bodyConfig.bodyType;
    }

    // Step 6: Review
    const shouldSave = await reviewEndpoint({
      name,
      url,
      method,
      headers: finalHeaders,
      body,
      bodyType,
    });

    if (!shouldSave) {
      displayInfo("Endpoint not saved.");
      return null;
    }

    // Validate and create endpoint
    const endpoint = EndpointSchema.parse({
      name,
      url,
      method,
      headers: finalHeaders,
      body,
      bodyType,
    });

    displaySuccess(`Endpoint "${name}" created successfully!`);
    return endpoint;
  } catch (error) {
    displayError(
      `Failed to create endpoint: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return null;
  }
}

async function promptEndpointName(config: ProjectConfig): Promise<string | null> {
  const existingNames = config.endpoints.map((e) => e.name);

  while (true) {
    const name = await input({
      message: "Endpoint name (unique, alphanumeric + . _ -):",
      validate: (value) => {
        if (!value) return "Name is required";
        if (value.length > 80) return "Name must be 80 characters or less";
        if (!/^[a-zA-Z0-9._-]+$/.test(value))
          return "Use only letters, numbers, dots, underscores, or hyphens";
        if (existingNames.includes(value))
          return `Endpoint "${value}" already exists`;
        return true;
      },
    });

    if (name === "") return null; // Handle Ctrl+C gracefully
    return name;
  }
}

async function promptURL(): Promise<string | null> {
  while (true) {
    const url = await input({
      message: "API endpoint URL (http/https):",
      validate: (value) => {
        if (!value) return "URL is required";
        try {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol))
            return "Only HTTP and HTTPS URLs are supported";
          if (parsed.username || parsed.password)
            return "URLs must not contain embedded credentials";
          return true;
        } catch {
          return "Invalid URL format";
        }
      },
    });

    if (url === "") return null;
    return url;
  }
}

async function promptMethod(): Promise<string | null> {
  const method = await select({
    message: "HTTP method:",
    choices: [
      { name: "GET - Retrieve data", value: "GET" },
      { name: "POST - Create resource", value: "POST" },
      { name: "PUT - Replace resource", value: "PUT" },
      { name: "PATCH - Update resource", value: "PATCH" },
      { name: "DELETE - Remove resource", value: "DELETE" },
      { name: "HEAD - Like GET, no response body", value: "HEAD" },
      { name: "OPTIONS - Describe communication options", value: "OPTIONS" },
    ],
  });

  return method || null;
}

async function promptHeaders(): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = {};

  displayInfo("Add headers to your request (press Enter to skip)");

  while (true) {
    const addHeader = await confirm({
      message: "Add a header?",
      default: false,
    });

    if (!addHeader) break;

    const headerKey = await input({
      message: "Header name (e.g., Authorization, Accept):",
      validate: (value) => {
        if (!value) return "Header name is required";
        // Validate header name (no spaces, colons, etc.)
        if (!/^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(value))
          return "Invalid header name";
        return true;
      },
    });

    if (!headerKey) return null; // Ctrl+C
    if (headerKey.toLowerCase() === "quit") break;

    const headerValue = await input({
      message: `Value for ${headerKey}:`,
    });

    if (headerValue === undefined) return null;

    headers[headerKey] = headerValue;
    displaySuccess(`Added: ${headerKey}`);
  }

  return headers;
}

async function promptAuthentication(): Promise<Record<string, string> | null> {
  const authHeaders: Record<string, string> = {};

  displayInfo("Configure authentication (optional)");

  const authType = await select({
    message: "Authentication type:",
    choices: [
      { name: "None", value: "none" },
      { name: "Bearer token (e.g., OAuth 2.0)", value: "bearer" },
      { name: "API key", value: "apikey" },
      { name: "Basic auth (username:password)", value: "basic" },
      { name: "Custom header", value: "custom" },
    ],
  });

  if (authType === "bearer") {
    const token = await password({
      message: "Enter bearer token (or ${VAR} for environment variable):",
      mask: true,
    });
    if (token !== undefined) {
      authHeaders.Authorization = `Bearer ${token}`;
    }
  } else if (authType === "apikey") {
    const keyName = await input({
      message: "API key header name (e.g., X-API-Key):",
    });
    if (keyName) {
      const keyValue = await password({
        message: `Enter ${keyName} (or ${"{"}VAR${"}"} for environment variable):`,
        mask: true,
      });
      if (keyValue !== undefined) {
        authHeaders[keyName] = keyValue;
      }
    }
  } else if (authType === "basic") {
    const username = await input({ message: "Username:" });
    const passwd = await password({ message: "Password:", mask: true });
    if (username && passwd !== undefined) {
      const encoded = Buffer.from(`${username}:${passwd}`).toString("base64");
      authHeaders.Authorization = `Basic ${encoded}`;
    }
  } else if (authType === "custom") {
    const customKey = await input({
      message: "Header name:",
    });
    if (customKey) {
      const customValue = await password({
        message: "Header value:",
        mask: true,
      });
      if (customValue !== undefined) {
        authHeaders[customKey] = customValue;
      }
    }
  }

  return authHeaders;
}

interface BodyConfig {
  body?: string;
  bodyType?: string;
}

async function promptBody(method: string): Promise<BodyConfig | null> {
  const needsBody = await confirm({
    message: `Add a request body to ${method}?`,
    default: false,
  });

  if (!needsBody) {
    return { body: undefined, bodyType: undefined };
  }

  const bodyType = await select({
    message: "Body type:",
    choices: [
      { name: "JSON (application/json)", value: "json" },
      { name: "Form data (x-www-form-urlencoded)", value: "form" },
      { name: "Plain text", value: "text" },
      { name: "From file", value: "file" },
    ],
  });

  if (bodyType === "json") {
    const isMultiline = await confirm({
      message: "Use multiline editor for JSON?",
      default: true,
    });

    let jsonBody: string;

    if (isMultiline) {
      jsonBody = await editor({
        message: "Enter JSON body (save and close editor):",
        postfix: ".json",
      });
    } else {
      jsonBody = await input({
        message: "JSON body:",
        validate: (value) => {
          if (!value) return true; // Allow empty
          try {
            JSON.parse(value);
            return true;
          } catch {
            return "Invalid JSON format";
          }
        },
      });
    }

    if (!jsonBody) return { body: undefined, bodyType: undefined };

    return {
      body: jsonBody,
      bodyType: "json",
    };
  } else if (bodyType === "form") {
    const formData: Record<string, string> = {};

    displayInfo("Add form fields (press Enter to skip field name when done)");

    while (true) {
      const fieldName = await input({
        message: "Field name:",
      });

      if (!fieldName) break;

      const fieldValue = await input({
        message: `Value for ${fieldName}:`,
      });

      if (fieldValue !== undefined) {
        formData[fieldName] = fieldValue;
      }
    }

    if (Object.keys(formData).length === 0) {
      return { body: undefined, bodyType: undefined };
    }

    const bodyString = Object.entries(formData)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      )
      .join("&");

    return {
      body: bodyString,
      bodyType: "text",
    };
  } else if (bodyType === "text") {
    const textBody = await input({
      message: "Plain text body:",
    });

    if (!textBody) return { body: undefined, bodyType: undefined };

    return {
      body: textBody,
      bodyType: "text",
    };
  } else if (bodyType === "file") {
    displayInfo(
      "File-based bodies are not yet supported. Use JSON or text instead."
    );
    return { body: undefined, bodyType: undefined };
  }

  return { body: undefined, bodyType: undefined };
}

interface ReviewEndpointData {
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  bodyType?: string;
}

async function reviewEndpoint(data: ReviewEndpointData): Promise<boolean> {
  displayHeader("Review Endpoint Configuration");

  console.log(`\n  Name:     ${data.name}`);
  console.log(`  Method:   ${data.method}`);
  console.log(`  URL:      ${data.url}`);

  if (Object.keys(data.headers).length > 0) {
    console.log(`\n  Headers:`);
    for (const [key, value] of Object.entries(data.headers)) {
      const isSensitive =
        key.toLowerCase().includes("auth") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("key") ||
        key.toLowerCase().includes("password");
      const displayValue = isSensitive ? maskSecret(value) : value;
      console.log(`    ${key}: ${displayValue}`);
    }
  }

  if (data.body) {
    console.log(`\n  Body (${data.bodyType || "text"}):`);
    const preview =
      data.body.length > 100 ? data.body.slice(0, 100) + "..." : data.body;
    console.log(`    ${preview}`);
  }

  console.log();
  const shouldSave = await confirm({
    message: "Save this endpoint?",
    default: true,
  });

  return shouldSave;
}
