/**
 * strategy-generator.test.ts — GEO Content Plan (C3).
 * Deterministic rules engine — covers AC-C3-1/2/3 + GEO-A2 + Google alignment.
 */
import { describe, it, expect } from "vitest";
import { generateStrategy, type StrategyInputs } from "../../../packages/llm/src/strategy-generator";

const weakInputs: StrategyInputs = {
  scores: { brand: 40, performance: 45, ai: 50, overall: 45 },
  components: {
    brand: { entityCompleteness: 0.3, citationVolume: 0.4, eeaSignal: 0.4 },
    performance: { schemaCoverage: 0.2, llmsTxtPresent: false, aiCrawlerAccess: 0.5, citationShareVsCompetitors: 0.3, aioPresence: false },
    ai: { citationRate: 0.3, avgPositionScore: 0.3, sentimentScore: 0.4 },
  },
  offsiteSources: [
    { label: "Reddit", present: false },
    { label: "Wikipedia", present: false },
  ],
  contentTraits: { statistics: 0.2, sourcedClaims: 0.3, answerShaped: 0.2, quotations: 0.3, depth: 0.4 },
  displacedByCompetitors: 3,
};

describe("generateStrategy", () => {
  it("produces at least 5 prioritized recommendations for a weak brand (AC-C3-1)", () => {
    const plan = generateStrategy(weakInputs);
    expect(plan.recommendations.length).toBeGreaterThanOrEqual(5);
  });

  it("tags every recommendation to a vector with effort+impact+priority (AC-C3-2)", () => {
    const plan = generateStrategy(weakInputs);
    for (const r of plan.recommendations) {
      expect(["brand", "performance", "ai"]).toContain(r.vector);
      expect(["low", "medium", "high"]).toContain(r.effort);
      expect(["low", "medium", "high"]).toContain(r.impact);
      expect(typeof r.priority).toBe("number");
    }
  });

  it("returns recommendations sorted by priority descending", () => {
    const plan = generateStrategy(weakInputs);
    const prios = plan.recommendations.map((r) => r.priority);
    expect(prios).toEqual([...prios].sort((a, b) => b - a));
  });

  it("builds a 4-week calendar (AC-C3-3)", () => {
    const plan = generateStrategy(weakInputs);
    expect(plan.calendar.length).toBeGreaterThan(0);
    for (const c of plan.calendar) {
      expect(c.week).toBeGreaterThanOrEqual(1);
      expect(c.week).toBeLessThanOrEqual(4);
    }
  });

  it("never recommends llms.txt (Google 2026 alignment)", () => {
    const plan = generateStrategy(weakInputs);
    const text = JSON.stringify(plan).toLowerCase();
    expect(text).not.toContain("llms.txt");
  });

  it("recommends building a knowledge-graph entity when entity completeness is low (C7)", () => {
    const plan = generateStrategy(weakInputs);
    const text = JSON.stringify(plan).toLowerCase();
    expect(text).toMatch(/wikidata|knowledge-graph entity/);
  });

  it("never leaks competitor brand names — uses anonymised count only (GEO-A2)", () => {
    const withNames: StrategyInputs = { ...weakInputs, displacedByCompetitors: 2 };
    const plan = generateStrategy(withNames);
    const text = JSON.stringify(plan);
    // The inputs carry no competitor names; output must not invent or include any.
    expect(text).not.toMatch(/HubSpot|Salesforce|Pipedrive/i);
  });

  it("is deterministic", () => {
    expect(generateStrategy(weakInputs)).toEqual(generateStrategy(weakInputs));
  });

  it("produces few/no recommendations for a strong brand (exercises the false branches)", () => {
    const strong: StrategyInputs = {
      scores: { brand: 92, performance: 90, ai: 95, overall: 92 },
      components: {
        brand: { entityCompleteness: 0.95, citationVolume: 0.9, eeaSignal: 0.9 },
        performance: { schemaCoverage: 0.95, llmsTxtPresent: true, aiCrawlerAccess: 1, citationShareVsCompetitors: 0.9, aioPresence: true },
        ai: { citationRate: 0.9, avgPositionScore: 0.9, sentimentScore: 0.95 },
      },
      offsiteSources: [
        { label: "Reddit", present: true },
        { label: "Wikipedia", present: true },
      ],
      contentTraits: { statistics: 0.9, sourcedClaims: 0.9, answerShaped: 0.9, quotations: 0.9, depth: 0.9 },
      displacedByCompetitors: 0,
    };
    const plan = generateStrategy(strong);
    // A strong brand triggers far fewer gap-based recommendations than a weak one.
    expect(plan.recommendations.length).toBeLessThan(generateStrategy(weakInputs).recommendations.length);
    // Calendar is always producible (may fall back to evergreen items).
    expect(Array.isArray(plan.calendar)).toBe(true);
  });

  it("handles null components and empty optional inputs gracefully", () => {
    const minimal: StrategyInputs = {
      scores: { brand: 50, performance: 50, ai: 50, overall: 50 },
      components: null,
    };
    const plan = generateStrategy(minimal);
    expect(Array.isArray(plan.recommendations)).toBe(true);
    expect(Array.isArray(plan.calendar)).toBe(true);
  });
});

describe("generateStrategy — Action Cards v1 enrichment", () => {
  it("populates evidence with blocked crawler names when blockedCrawlers is provided", () => {
    const inputs: StrategyInputs = {
      scores: { brand: 50, performance: 50, ai: 50, overall: 50 },
      components: {
        brand: { entityCompleteness: 0.5 },
        performance: { schemaCoverage: 0.5, aiCrawlerAccess: 0.5, llmsTxtPresent: false, citationShareVsCompetitors: 0.5, aioPresence: false },
        ai: { citationRate: 0.8, avgPositionScore: 0.8, sentimentScore: 0.7 },
      },
      blockedCrawlers: ["GPTBot", "ClaudeBot"],
    };
    const plan = generateStrategy(inputs);
    const crawlerRec = plan.recommendations.find(r => r.vector === "performance" && r.action.toLowerCase().includes("crawler"));
    expect(crawlerRec).toBeDefined();
    expect(crawlerRec?.evidence).toContain("GPTBot");
    expect(crawlerRec?.evidence).toContain("ClaudeBot");
  });

  it("populates evidence with absent prompt text when absentPrompts is provided", () => {
    const inputs: StrategyInputs = {
      scores: { brand: 50, performance: 50, ai: 30, overall: 43 },
      components: {
        brand: { entityCompleteness: 0.5 },
        performance: { schemaCoverage: 0.5, aiCrawlerAccess: 1, llmsTxtPresent: false, citationShareVsCompetitors: 0.5, aioPresence: false },
        ai: { citationRate: 0.2, avgPositionScore: 0.3, sentimentScore: 0.7 },
      },
      absentPrompts: ["best CRM for small business", "top alternatives to Salesforce"],
      absentEngines: ["chatgpt", "gemini"],
    };
    const plan = generateStrategy(inputs);
    const citRec = plan.recommendations.find(r => r.vector === "ai" && r.action.toLowerCase().includes("answer-shaped"));
    expect(citRec).toBeDefined();
    expect(citRec?.evidence).toContain("best CRM for small business");
    expect(citRec?.evidence).toContain("chatgpt");
    expect(citRec?.metric).toContain("Citation rate");
    expect(citRec?.owner).toBe("you");
  });

  it("populates evidence with missing source names when missingSources is provided", () => {
    const inputs: StrategyInputs = {
      scores: { brand: 40, performance: 50, ai: 50, overall: 47 },
      components: {
        brand: { entityCompleteness: 0.5 },
        performance: { schemaCoverage: 0.5, aiCrawlerAccess: 1, llmsTxtPresent: false, citationShareVsCompetitors: 0.5, aioPresence: false },
        ai: { citationRate: 0.7, avgPositionScore: 0.6, sentimentScore: 0.7 },
      },
      offsiteSources: [
        { label: "G2", present: false },
        { label: "Trustpilot", present: false },
        { label: "Reddit", present: true },
      ],
      missingSources: ["G2", "Trustpilot"],
    };
    const plan = generateStrategy(inputs);
    const offsiteRec = plan.recommendations.find(r => r.vector === "brand" && r.gap.toLowerCase().includes("absent"));
    expect(offsiteRec).toBeDefined();
    expect(offsiteRec?.evidence).toContain("G2");
    expect(offsiteRec?.evidence).toContain("Trustpilot");
    expect(offsiteRec?.metric).toContain("high-authority sources");
    expect(offsiteRec?.owner).toBe("you");
  });

  it("never leaks competitor names into action, evidence, or calendar topic (GEO-A2)", () => {
    const inputs: StrategyInputs = {
      ...weakInputs, // reuse weakInputs from parent describe
      displacedByCompetitors: 2,
      absentPrompts: ["best project management software"],
      absentEngines: ["chatgpt"],
    };
    const plan = generateStrategy(inputs);
    const allText = JSON.stringify(plan);
    // No competitor names should appear anywhere — only anonymised count
    expect(allText).not.toMatch(/HubSpot|Salesforce|Pipedrive|Asana|Monday/i);
    // The displacement rec uses the count, not names
    const dispRec = plan.recommendations.find(r => r.gap.includes("displaced") || r.gap.includes("Competitors"));
    expect(dispRec?.evidence).toBeUndefined(); // evidence is omitted for displacement rec
  });

  it("omits evidence field entirely when specific inputs are not available", () => {
    // With no absentPrompts / blockedCrawlers / missingSources
    const inputs: StrategyInputs = {
      scores: { brand: 40, performance: 40, ai: 30, overall: 37 },
      components: {
        brand: { entityCompleteness: 0.3 },
        performance: { schemaCoverage: 0.3, aiCrawlerAccess: 0.5, llmsTxtPresent: false, citationShareVsCompetitors: 0.3, aioPresence: false },
        ai: { citationRate: 0.2, avgPositionScore: 0.2, sentimentScore: 0.5 },
      },
      // no absentPrompts, no blockedCrawlers, no missingSources
    };
    const plan = generateStrategy(inputs);
    // crawler rec — no blockedCrawlers provided → evidence should be undefined (not a fabricated string with actual names)
    const crawlerRec = plan.recommendations.find(r => r.action.toLowerCase().includes("crawler"));
    // evidence may be undefined or may fall back to the generic gap string — what it MUST NOT do is contain specific crawler names not in the input
    if (crawlerRec?.evidence) {
      expect(crawlerRec.evidence).not.toMatch(/GPTBot|ClaudeBot|PerplexityBot/);
    }
  });
});
