/**
 * invisibility-test.test.ts — "The AI Invisibility Test" lead magnet.
 * Mock mode (no provider keys in test env) → deterministic.
 */
import { describe, it, expect } from "vitest";
import { runInvisibilityTest, buildTestPrompt } from "../../../packages/llm/src/invisibility-test";

describe("buildTestPrompt", () => {
  it("builds a category buyer prompt", () => {
    expect(buildTestPrompt("CRM")).toMatch(/best CRM for small businesses/i);
  });
  it("falls back gracefully on empty category", () => {
    expect(buildTestPrompt("")).toContain("solution");
  });
});

describe("runInvisibilityTest (mock mode)", () => {
  it("returns one row per engine with a valid status", async () => {
    const r = await runInvisibilityTest("Demo CRM", "HubSpot", "CRM", "US");
    expect(r.engines.length).toBeGreaterThan(0);
    expect(["invisible", "trailing", "competitive", "leading"]).toContain(r.status);
    expect(r.totalEngines).toBe(r.engines.length);
    expect(r.brandEngineCount).toBeLessThanOrEqual(r.totalEngines);
    expect(r.verdict.length).toBeGreaterThan(0);
  });

  it("EU region excludes Perplexity (routing gate)", async () => {
    const eu = await runInvisibilityTest("Demo CRM", null, "CRM", "EU");
    expect(eu.engines.map((e) => e.engine)).not.toContain("perplexity");
  });

  it("US region may include Perplexity", async () => {
    const us = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(us.engines.map((e) => e.engine)).toContain("perplexity");
  });

  it("is deterministic in mock mode", async () => {
    const a = await runInvisibilityTest("Acme CRM", "Rival", "CRM", "US");
    const b = await runInvisibilityTest("Acme CRM", "Rival", "CRM", "US");
    expect(a).toEqual(b);
  });

  it("status is 'invisible' only when the brand is cited on zero engines", async () => {
    const r = await runInvisibilityTest("Totally Unknown Brand Xyz", null, "underwater basket weaving", "US");
    if (r.brandEngineCount === 0) expect(r.status).toBe("invisible");
    else expect(r.status).not.toBe("invisible");
  });
});
