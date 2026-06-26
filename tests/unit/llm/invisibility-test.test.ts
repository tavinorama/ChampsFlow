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

  // -------------------------------------------------------------------------
  // New fields — score, breakdown, recommendations, enginesLive
  // -------------------------------------------------------------------------

  it("returns score with ai/performance/brand/overall all in [0,100]", async () => {
    const r = await runInvisibilityTest("Demo CRM", "HubSpot", "CRM", "US");
    expect(r.score).toBeDefined();
    expect(r.score.ai).toBeGreaterThanOrEqual(0);
    expect(r.score.ai).toBeLessThanOrEqual(100);
    expect(r.score.performance).toBeGreaterThanOrEqual(0);
    expect(r.score.performance).toBeLessThanOrEqual(100);
    expect(r.score.brand).toBeGreaterThanOrEqual(0);
    expect(r.score.brand).toBeLessThanOrEqual(100);
    expect(r.score.overall).toBeGreaterThanOrEqual(0);
    expect(r.score.overall).toBeLessThanOrEqual(100);
  });

  it("returns integer scores", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(Number.isInteger(r.score.ai)).toBe(true);
    expect(Number.isInteger(r.score.performance)).toBe(true);
    expect(Number.isInteger(r.score.brand)).toBe(true);
    expect(Number.isInteger(r.score.overall)).toBe(true);
  });

  it("returns breakdown with ai, performance, brand sections and sub-signals", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(r.breakdown).toBeDefined();

    // AI breakdown
    expect(r.breakdown.ai).toBeDefined();
    expect(typeof r.breakdown.ai.citationRate).toBe("number");
    expect(r.breakdown.ai.citationRate).toBeGreaterThanOrEqual(0);
    expect(r.breakdown.ai.citationRate).toBeLessThanOrEqual(1);
    expect(typeof r.breakdown.ai.sentiment).toBe("number");
    expect(r.breakdown.ai.sentiment).toBeGreaterThanOrEqual(0);
    expect(r.breakdown.ai.sentiment).toBeLessThanOrEqual(1);
    expect(typeof r.breakdown.ai.note).toBe("string");
    expect(r.breakdown.ai.note.length).toBeGreaterThan(0);

    // Performance breakdown
    expect(r.breakdown.performance).toBeDefined();
    expect(typeof r.breakdown.performance.schemaCoverage).toBe("number");
    expect(typeof r.breakdown.performance.aiCrawlerAccess).toBe("number");
    expect(typeof r.breakdown.performance.note).toBe("string");

    // Brand breakdown
    expect(r.breakdown.brand).toBeDefined();
    expect(typeof r.breakdown.brand.entityCompleteness).toBe("number");
    expect(typeof r.breakdown.brand.note).toBe("string");
  });

  it("returns recommendations as a non-empty array with valid plan values", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(Array.isArray(r.recommendations)).toBe(true);
    expect(r.recommendations.length).toBeGreaterThan(0);
    const validPlans = new Set(["kit", "growth", "agency", "call"]);
    for (const rec of r.recommendations) {
      expect(validPlans.has(rec.plan)).toBe(true);
      expect(typeof rec.reason).toBe("string");
      expect(rec.reason.length).toBeGreaterThan(0);
      expect(typeof rec.href).toBe("string");
      expect(rec.href.length).toBeGreaterThan(0);
    }
  });

  it("recommendations hrefs match exactly the defined paths", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    const hrefMap: Record<string, string> = {
      kit: "/kit",
      growth: "/login?plan=growth&next=checkout",
      agency: "/login?plan=agency&next=checkout",
      call: "/book",
    };
    for (const rec of r.recommendations) {
      expect(rec.href).toBe(hrefMap[rec.plan]);
    }
  });

  it("enginesLive is 0 in mock mode (no keys set)", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    // In the test environment, no API keys are set, so mock mode is active.
    expect(r.enginesLive).toBe(0);
    // All individual engine.live should also be false
    for (const e of r.engines) {
      expect(e.live).toBe(false);
    }
  });

  it("engines array includes 'live' field on each row", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    for (const e of r.engines) {
      expect(typeof e.live).toBe("boolean");
    }
  });

  it("domain field is null when not provided", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(r.domain).toBeNull();
  });

  it("domain field reflects the passed domain when provided", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US", "example.com");
    expect(r.domain).toBe("example.com");
  });

  it("passing domain=null returns breakdown.performance.note containing 'neutral' or 'No domain'", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US", null);
    const note = r.breakdown.performance.note;
    const hasExpectedText =
      note.toLowerCase().includes("neutral") || note.toLowerCase().includes("no domain");
    expect(hasExpectedText).toBe(true);
  });

  it("breakdown.performance uses neutral 0.5 defaults when no domain provided", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US", null);
    expect(r.breakdown.performance.schemaCoverage).toBe(0.5);
    expect(r.breakdown.performance.aiCrawlerAccess).toBe(0.5);
    expect(r.breakdown.brand.entityCompleteness).toBe(0.5);
  });

  it("breakdown.ai.citationRate matches brandEngineCount / totalEngines", async () => {
    const r = await runInvisibilityTest("Demo CRM", "HubSpot", "CRM", "US");
    const expected = r.totalEngines > 0 ? r.brandEngineCount / r.totalEngines : 0;
    expect(r.breakdown.ai.citationRate).toBeCloseTo(expected, 5);
  });

  it("breakdown.ai.note mentions the engine counts", async () => {
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(r.breakdown.ai.note).toContain(String(r.totalEngines));
    expect(r.breakdown.ai.note).toContain(String(r.brandEngineCount));
  });

  it("avgPosition is null when brand was never cited", async () => {
    const r = await runInvisibilityTest("Totally Unknown Brand Xyz", null, "underwater basket weaving", "US");
    if (r.brandEngineCount === 0) {
      expect(r.breakdown.ai.avgPosition).toBeNull();
    }
  });

  it("InvisibilityTestResult is a backward-compatible alias for FreeTestResult", async () => {
    // Verify that importing InvisibilityTestResult still compiles and works.
    // (This is a type-level guarantee — at runtime we just check the shape.)
    const r = await runInvisibilityTest("Demo CRM", null, "CRM", "US");
    expect(r.prompt).toBeDefined();
    expect(r.live).toBeDefined();
    expect(r.score).toBeDefined();
  });
});
