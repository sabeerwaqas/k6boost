import { beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => ({
  select: vi.fn(),
  checkbox: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  select: promptMocks.select,
  checkbox: promptMocks.checkbox,
}));

import { selectEndpointsForTest } from "../src/interactive/test-workflow.js";
import { EndpointSchema } from "../src/config.js";

const endpoints = [
  EndpointSchema.parse({
    name: "users-list",
    url: "https://api.example.test/users",
    method: "GET",
  }),
  EndpointSchema.parse({
    name: "users-create",
    url: "https://api.example.test/users",
    method: "POST",
    body: "{\"name\":\"Example\"}",
    bodyType: "json",
  }),
  EndpointSchema.parse({
    name: "products-list",
    url: "https://api.example.test/products",
    method: "GET",
  }),
];

describe("selectEndpointsForTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the endpoint selected in single-selection mode", async () => {
    promptMocks.select
      .mockResolvedValueOnce("single")
      .mockResolvedValueOnce("users-create");

    const selected = await selectEndpointsForTest(endpoints);

    expect(selected.map((endpoint) => endpoint.name)).toEqual(["users-create"]);
    expect(promptMocks.checkbox).not.toHaveBeenCalled();
  });

  it("returns only checked endpoints in multiple-selection mode", async () => {
    promptMocks.select.mockResolvedValueOnce("multiple");
    promptMocks.checkbox.mockResolvedValueOnce(["products-list", "users-list"]);

    const selected = await selectEndpointsForTest(endpoints);

    // Selection is returned in saved endpoint order, not checkbox interaction order.
    expect(selected.map((endpoint) => endpoint.name)).toEqual([
      "users-list",
      "products-list",
    ]);
  });

  it("returns every saved endpoint in select-all mode", async () => {
    promptMocks.select.mockResolvedValueOnce("all");

    const selected = await selectEndpointsForTest(endpoints);

    expect(selected).toEqual(endpoints);
    expect(promptMocks.checkbox).not.toHaveBeenCalled();
  });

  it("returns an empty list when the user cancels", async () => {
    promptMocks.select.mockResolvedValueOnce("cancel");

    await expect(selectEndpointsForTest(endpoints)).resolves.toEqual([]);
    expect(promptMocks.checkbox).not.toHaveBeenCalled();
  });

  it("returns an empty list when there are no configured endpoints", async () => {
    await expect(selectEndpointsForTest([])).resolves.toEqual([]);
    expect(promptMocks.select).not.toHaveBeenCalled();
  });

  it("does not include endpoints that were not selected", async () => {
    promptMocks.select.mockResolvedValueOnce("multiple");
    promptMocks.checkbox.mockResolvedValueOnce(["users-create"]);

    const selected = await selectEndpointsForTest(endpoints);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.name).toBe("users-create");
    expect(selected.some((endpoint) => endpoint.name === "users-list")).toBe(false);
  });
});
