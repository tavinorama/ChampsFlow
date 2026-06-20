/**
 * C1 GEO Audit Engine — unit tests
 *
 * Verifies the core platform-agnostic logic of the AI Visibility Audit:
 *  - Provider routing gate (GEO-A3): EU excludes Perplexity/OpenAI/Gemini by default
 *  - runProbes mock mode: runs without live API keys, reports blocked providers
 *  - Citation parser: mention / position / sources
 *  - Scoring engine: deterministic, bounded 0–100, documented weights
 *  - GEO-A2: competitor brand names never leak into strategy prompt input
 */

import { describe, it, expect } from "vitest";
import {
  routeProvider,
  permittedProviders,
  runProbes,
  parseCitation,
  computeGeoScore,
  buildStrategyPromptInput,
  type GeoLLMProvider,
  type ProbeQuery,
  type GeoScoreInputs,
} from "@organic-posts/llm";

// ---------------------------------------------------------------------------
// Routing gate (GEO-A3)
// ---------------------------------------------------------------------------

describe("routing gate (GEO-A3)", () => {
  it("allows anthropic and serp in both regions", () => {
    for (const region of ["EU", "US"] as const) {
      expect(routeProvider("anthropic", region)).toBe(true);
      expect(routeProvider("serp", region)).toBe(true);
    }
  });

  it("blocks Perplexity for EU by default (no SCCs confirmed)", () => {
    expect(routeProvider("perplexity", "EU")).toBe(false);
  });

  it("allows Perplexity for US", () => {
    expect(routeProvider("perplexity", "US")).toBe(true);
  });

  it("blocks OpenAI and Gemini for EU by default (pending Gate 3→4 DPA)", () => {
    expect(routeProvider("openai", "EU")).toBe(false);
    expect(routeProvider("gemini", "EU")).toBe(false);
  });

  it("permittedProviders filters an EU request down to the allowed subset", () => {
    const requested: GeoLLMProvider[] = [
      "anthropic",
      "openai",
      "gemini",
      "perplexity",
      "serp",
    ];
    const allowed = permittedProviders("EU", requested);
    expect(allowed).toContain("anthropic");
    expect(allowed).toContain("serp");
    expect(allowed).not.toContain("perplexity");
    expect(allowed).not.toContain("openai");
    expect(allowed).not.toContain("gemini");
  });
});

// ---------------------------------------------------------------------------
// runProbes — mock mode (no API keys present in test env)
// ---------------------------------------------------------------------------

describe("runProbes (mock mode)", () => {
  const queries: ProbeQuery[] = [
    {
      queryHash: "hash-1",
      queryText: "What is the best CRM for SMBs?",
      brandName: "Acme",
    },
  ];

  it("returns deterministic responses for permitted providers without live keys", async () => {
    const result = await runProbes(queries, {
      region: "US",
      requestedProviders: ["anthropic", "serp"],
    });
    expect(result.responses.length).toBeGreaterThan(0);
    for (const r of result.responses) {
      expect(typeof r.mentioned).toBe("boolean");
      expect(Array.isArray(r.sources)).toBe(true);
    }
  });

  it("reports Perplexity as blocked for an EU audit (GEO-A3)", async () => {
    const result = await runProbes(queries, {
      region: "EU",
      requestedProviders: ["anthropic", "perplexity"],
    });
    expect(result.blockedProviders).toContain("perplexity");
    // No response should come from a blocked provider
    expect(result.responses.every((r) => r.provider !== "perplexity")).toBe(true);
  });

  it("is deterministic — same input yields same mention verdict", async () => {
    const a = await runProbes(queries, {
      region: "US",
      requestedProviders: ["anthropic"],
    });
    const b = await runProbes(queries, {
      region: "US",
      requestedProviders: ["anthropic"],
    });
    expect(a.responses[0]?.mentioned).toBe(b.responses[0]?.mentioned);
  });
});

// ---------------------------------------------------------------------------
// Citation parser
// ---------------------------------------------------------------------------

describe("parseCitation", () => {
  it("detects a brand mention and its position", () => {
    const raw = "The top options are Acme, then Globex, then Initech.";
    const res = parseCitation(raw, "Acme");
    expect(res.mentioned).toBe(true);
    expect(res.position).toBe(1);
  });

  it("reports not mentioned when the brand is absent", () => {
    const res = parseCitation("We recommend Globex and Initech.", "Acme");
    expect(res.mentioned).toBe(false);
    expect(res.position).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scoring engine — TrustIndex Score
// ---------------------------------------------------------------------------

describe("computeGeoScore", () => {
  const inputs: GeoScoreInputs = {
    brand: { entityCompleteness: 0.5, citationVolume: 0.5, eeaSignal: 0.5 },
    performance: {
      schemaCoverage: 0.5,
      llmsTxtPresent: true,
      aiCrawlerAccess: 0.5,
      citationShareVsCompetitors: 0.5,
      aioPresence: false,
    },
    ai: { citationRate: 0.5, avgPositionScore: 0.5, sentimentScore: 0.5 },
  };

  it("returns all four scores within [0, 100]", () => {
    const s = computeGeoScore(inputs);
    for (const v of [s.brand, s.performance, s.ai, s.overall]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(computeGeoScore(inputs)).toEqual(computeGeoScore(inputs));
  });

  it("scores a fully-present brand at or near 100 and an absent one at 0", () => {
    const perfect = computeGeoScore({
      brand: { entityCompleteness: 1, citationVolume: 1, eeaSignal: 1 },
      performance: {
        schemaCoverage: 1,
        llmsTxtPresent: true,
        aiCrawlerAccess: 1,
        citationShareVsCompetitors: 1,
        aioPresence: true,
      },
      ai: { citationRate: 1, avgPositionScore: 1, sentimentScore: 1 },
    });
    expect(perfect.overall).toBe(100);

    const absent = computeGeoScore({
      brand: { entityCompleteness: 0, citationVolume: 0, eeaSignal: 0 },
      performance: {
        schemaCoverage: 0,
        llmsTxtPresent: false,
        aiCrawlerAccess: 0,
        citationShareVsCompetitors: 0,
        aioPresence: false,
      },
      ai: { citationRate: 0, avgPositionScore: 0, sentimentScore: 0 },
    });
    expect(absent.overall).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GEO-A2 — competitor isolation
// ---------------------------------------------------------------------------

describe("buildStrategyPromptInput (GEO-A2)", () => {
  const clientScores = { brand: 40, performance: 50, ai: 30, overall: 41 };
  const competitorScores = { brand: 80, performance: 70, ai: 90, overall: 80 };

  it("never includes a competitor brand name in the output", () => {
    const out = buildStrategyPromptInput("Acme", clientScores, [
      { brandName: "Globex", scores: competitorScores },
    ]);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain("Globex");
    expect(out.competitorBenchmarks[0]?.rank).toBe(1);
    // Client's own name is permitted
    expect(out.clientBrandName).toBe("Acme");
  });

  it("anonymises competitors to numeric benchmarks only", () => {
    const out = buildStrategyPromptInput("Acme", clientScores, [
      { brandName: "Globex", scores: competitorScores },
      { brandName: "Initech", scores: { brand: 60, performance: 60, ai: 60, overall: 60 } },
    ]);
    expect(out.competitorBenchmarks).toHaveLength(2);
    for (const b of out.competitorBenchmarks) {
      expect(typeof b.aiScore).toBe("number");
      expect(typeof b.brandScore).toBe("number");
    }
  });
});
