import { describe, expect, it } from "vitest";
import { makePortableScript } from "../src/runner.js";
import type { Endpoint } from "../src/config.js";

describe("portable generated scripts", () => {
  it("keeps environment-backed secrets as placeholders and redacts literal credentials", () => {
    process.env.K6BOOST_SCRIPT_TEST_TOKEN = "sensitive-token-value";
    const endpoints: Endpoint[] = [{
      name: "bookings",
      url: "https://api.example.test/bookings",
      method: "POST",
      headers: {
        Authorization: "${K6BOOST_SCRIPT_TEST_TOKEN}",
        "X-Api-Key": "literal-api-key",
        "X-Feature": "enabled"
      },
      body: '{"ok":true}',
      bodyType: "json"
    }];
    const script = `const endpoints = ${JSON.stringify([{
      name: "bookings",
      url: endpoints[0]!.url,
      method: endpoints[0]!.method,
      headers: {
        Authorization: process.env.K6BOOST_SCRIPT_TEST_TOKEN,
        "X-Api-Key": "literal-api-key",
        "X-Feature": "enabled"
      },
      body: { ok: true },
      bodyType: "json"
    }])};
export default function () {
  const params = { headers: endpoint.headers, tags: {} };
}
`;
    const portable = makePortableScript(script, endpoints);
    expect(portable).toContain("${K6BOOST_SCRIPT_TEST_TOKEN}");
    expect(portable).toContain("REPLACE_ME");
    expect(portable).toContain("enabled");
    expect(portable).not.toContain("sensitive-token-value");
    expect(portable).not.toContain("literal-api-key");
    expect(portable).toContain("__ENV[match[1]]");
    delete process.env.K6BOOST_SCRIPT_TEST_TOKEN;
  });
});
