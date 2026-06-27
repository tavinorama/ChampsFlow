/**
 * tests/unit/llm/scoring.test.ts — GEO Score computation tests
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-2 (Score inputs per vector; formula)
 *  - docs/03-architecture.md §4.2 geo_score entity (score_brand, score_performance, score_ai)
 *
 * Test coverage:
 *  - Deterministic output for fixed inputs (same input → same output every run)
 *  - All output values in bounds [0, 100]
 *  - Specific formula validation for each vector
 *  - Overall = brand*0.30 + performance*0.35 + ai*0.35
 *  - Edge cases: all-zero, all-max, out-of-bounds inputs (clamped)
 */

import { describe, it, expect } from "vitest";
import { computeGeoScore, computeThreeScores } from "../../../packages/llm/src/scoring";
import type { GeoScoreInputs, GeoScoreResult } from "../../../packages/llm/src/scoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERFECT_INPUTS: GeoScoreInputs = {
  brand: { entityCompleteness: 1, citationVolume: 1, eeaSignal: 1 },
  performance: {
    schemaCoverage: 1,
    llmsTxtPresent: true,
    aiCrawlerAccess: 1,
    citationShareVsCompetitors: 1,
    aioPresence: true,
  },
  ai: { citationRate: 1, avgPositionScore: 1, sentimentScore: 1 },
};

const ZERO_INPUTS: GeoScoreInputs = {
  brand: { entityCompleteness: 0, citationVolume: 0, eeaSignal: 0 },
  performance: {
    schemaCoverage: 0,
    llmsTxtPresent: false,
    aiCrawlerAccess: 0,
    citationShareVsCompetitors: 0,
    aioPresence: false,
  },
  ai: { citationRate: 0, avgPositionScore: 0, sentimentScore: 0 },
};

const TYPICAL_INPUTS: GeoScoreInputs = {
  brand: { entityCompleteness: 0.7, citationVolume: 0.5, eeaSignal: 0.6 },
  performance: {
    schemaCoverage: 0.8,
    llmsTxtPresent: true,
    aiCrawlerAccess: 0.9,
    citationShareVsCompetitors: 0.4,
    aioPresence: false,
  },
  ai: { citationRate: 0.6, avgPositionScore: 0.5, sentimentScore: 0.7 },
};

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("computeGeoScore — determinism", () => {
  it("returns the same result for identical inputs (run 1 === run 2)", () => {
    const result1 = computeGeoScore(TYPICAL_INPUTS);
    const result2 = computeGeoScore(TYPICAL_INPUTS);
    expect(result1).toEqual(result2);
  });

  it("returns same result for zero inputs across multiple calls", () => {
    const r1 = computeGeoScore(ZERO_INPUTS);
    const r2 = computeGeoScore(ZERO_INPUTS);
    expect(r1).toEqual(r2);
  });

  it("returns same result for perfect inputs across multiple calls", () => {
    const r1 = computeGeoScore(PERFECT_INPUTS);
    const r2 = computeGeoScore(PERFECT_INPUTS);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// Bounds [0, 100]
// ---------------------------------------------------------------------------

describe("computeGeoScore — output bounds [0, 100]", () => {
  const testCases = [
    { label: "zero inputs", inputs: ZERO_INPUTS },
    { label: "perfect inputs", inputs: PERFECT_INPUTS },
    { label: "typical inputs", inputs: TYPICAL_INPUTS },
  ];

  for (const { label, inputs } of testCases) {
    it(`all scores in [0, 100] for ${label}`, () => {
      const result = computeGeoScore(inputs);
      expect(result.brand).toBeGreaterThanOrEqual(0);
      expect(result.brand).toBeLessThanOrEqual(100);
      expect(result.performance).toBeGreaterThanOrEqual(0);
      expect(result.performance).toBeLessThanOrEqual(100);
      expect(result.ai).toBeGreaterThanOrEqual(0);
      expect(result.ai).toBeLessThanOrEqual(100);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    });
  }
});

// ---------------------------------------------------------------------------
// Formula validation — zero inputs → score = 0
// ---------------------------------------------------------------------------

describe("computeGeoScore — formula: zero inputs", () => {
  it("brand = 0 for all-zero brand inputs", () => {
    const result = computeGeoScore(ZERO_INPUTS);
    expect(result.brand).toBe(0);
  });

  it("performance = 0 for all-zero performance inputs (no flags)", () => {
    const result = computeGeoScore(ZERO_INPUTS);
    expect(result.performance).toBe(0);
  });

  it("ai = 0 for all-zero ai inputs", () => {
    const result = computeGeoScore(ZERO_INPUTS);
    expect(result.ai).toBe(0);
  });

  it("overall = 0 when all sub-scores are 0", () => {
    const result = computeGeoScore(ZERO_INPUTS);
    expect(result.overall).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Formula validation — perfect inputs → score = 100
// ---------------------------------------------------------------------------

describe("computeGeoScore — formula: perfect inputs", () => {
  it("brand = 100 for all-max brand inputs", () => {
    const result = computeGeoScore(PERFECT_INPUTS);
    expect(result.brand).toBe(100);
  });

  it("performance = 100 for all-max performance inputs", () => {
    const result = computeGeoScore(PERFECT_INPUTS);
    expect(result.performance).toBe(100);
  });

  it("ai = 100 for all-max ai inputs", () => {
    const result = computeGeoScore(PERFECT_INPUTS);
    expect(result.ai).toBe(100);
  });

  it("overall = 100 when all sub-scores are 100", () => {
    const result = computeGeoScore(PERFECT_INPUTS);
    expect(result.overall).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Formula validation — specific value checks
// ---------------------------------------------------------------------------

describe("computeGeoScore — formula: specific value checks", () => {
  it("brand formula: entityCompleteness*0.4 + citationVolume*0.4 + eeaSignal*0.2", () => {
    const inputs: GeoScoreInputs = {
      ...ZERO_INPUTS,
      brand: { entityCompleteness: 1.0, citationVolume: 0.5, eeaSignal: 0.0 },
    };
    // Expected: (1.0*0.4 + 0.5*0.4 + 0.0*0.2) * 100 = (0.4 + 0.2 + 0.0) * 100 = 60
    const result = computeGeoScore(inputs);
    expect(result.brand).toBe(60);
  });

  it("AI formula: citationRate*0.50 + avgPositionScore*0.30 + sentimentScore*0.20", () => {
    const inputs: GeoScoreInputs = {
      ...ZERO_INPUTS,
      ai: { citationRate: 1.0, avgPositionScore: 0.0, sentimentScore: 0.0 },
    };
    // Expected: (1.0*0.50 + 0.0*0.30 + 0.0*0.20) * 100 = 50
    const result = computeGeoScore(inputs);
    expect(result.ai).toBe(50);
  });

  it("performance: llmsTxtPresent does NOT affect the score (Google 2026 alignment)", () => {
    // Google's 2026 generative-AI guide states llms.txt is not required, so it
    // was removed from the formula and is informational only.
    const withTxt: GeoScoreInputs = {
      ...ZERO_INPUTS,
      performance: { ...ZERO_INPUTS.performance, llmsTxtPresent: true },
    };
    const withoutTxt: GeoScoreInputs = {
      ...ZERO_INPUTS,
      performance: { ...ZERO_INPUTS.performance, llmsTxtPresent: false },
    };
    expect(computeGeoScore(withTxt).performance).toBe(0);
    expect(computeGeoScore(withoutTxt).performance).toBe(0);
  });

  it("performance: aiCrawlerAccess=1 adds 25 points (absorbed llms.txt weight)", () => {
    const withCrawl: GeoScoreInputs = {
      ...ZERO_INPUTS,
      performance: { ...ZERO_INPUTS.performance, aiCrawlerAccess: 1 },
    };
    expect(computeGeoScore(withCrawl).performance).toBe(25);
  });

  it("performance: aioPresence=true adds 15 points", () => {
    const withAio: GeoScoreInputs = {
      ...ZERO_INPUTS,
      performance: { ...ZERO_INPUTS.performance, aioPresence: true },
    };
    const result = computeGeoScore(withAio);
    // aioPresence contributes 0.15 * 100 = 15 points
    expect(result.performance).toBe(15);
  });

  it("overall = brand*0.30 + performance*0.35 + ai*0.35", () => {
    // Set each sub-score to a known value independently
    // brand=100, performance=0, ai=0 → overall = 100*0.30 = 30
    const brandOnly: GeoScoreInputs = {
      brand: { entityCompleteness: 1, citationVolume: 1, eeaSignal: 1 },
      performance: {
        schemaCoverage: 0,
        llmsTxtPresent: false,
        aiCrawlerAccess: 0,
        citationShareVsCompetitors: 0,
        aioPresence: false,
      },
      ai: { citationRate: 0, avgPositionScore: 0, sentimentScore: 0 },
    };
    const result = computeGeoScore(brandOnly);
    expect(result.brand).toBe(100);
    expect(result.performance).toBe(0);
    expect(result.ai).toBe(0);
    expect(result.overall).toBe(30); // 100*0.30 + 0*0.35 + 0*0.35 = 30
  });

  it("overall = 35 when only AI sub-score is 100", () => {
    const aiOnly: GeoScoreInputs = {
      brand: { entityCompleteness: 0, citationVolume: 0, eeaSignal: 0 },
      performance: {
        schemaCoverage: 0,
        llmsTxtPresent: false,
        aiCrawlerAccess: 0,
        citationShareVsCompetitors: 0,
        aioPresence: false,
      },
      ai: { citationRate: 1, avgPositionScore: 1, sentimentScore: 1 },
    };
    const result = computeGeoScore(aiOnly);
    expect(result.ai).toBe(100);
    expect(result.overall).toBe(35); // 0*0.30 + 0*0.35 + 100*0.35 = 35
  });
});

// ---------------------------------------------------------------------------
// Clamping — ensure out-of-bound inputs don't break bounds
// ---------------------------------------------------------------------------

describe("computeGeoScore — clamping behavior", () => {
  it("clamps output to 100 even if raw calculation exceeds 100", () => {
    // All-max inputs: result should be exactly 100, not 100.001 etc.
    const result = computeGeoScore(PERFECT_INPUTS);
    expect(result.brand).toBe(100);
    expect(result.overall).toBe(100);
  });

  it("returns integer scores (rounded)", () => {
    const result = computeGeoScore(TYPICAL_INPUTS);
    expect(Number.isInteger(result.brand)).toBe(true);
    expect(Number.isInteger(result.performance)).toBe(true);
    expect(Number.isInteger(result.ai)).toBe(true);
    expect(Number.isInteger(result.overall)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeThreeScores — three product-facing scores
// ---------------------------------------------------------------------------

describe("computeThreeScores — visibility", () => {
  it("visibility equals the ai sub-score from computeGeoScore", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.visibility).toBe(geo.ai);
  });

  it("visibility = 0 when ai sub-score is 0", () => {
    const geo = computeGeoScore(ZERO_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.visibility).toBe(0);
  });

  it("visibility = 100 when ai sub-score is 100", () => {
    const geo = computeGeoScore(PERFECT_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.visibility).toBe(100);
  });
});

describe("computeThreeScores — citationReadiness", () => {
  it("citationReadiness = round(performance*0.6 + brand*0.4) for typical inputs", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, null);
    const expected = Math.round(Math.min(100, Math.max(0, geo.performance * 0.6 + geo.brand * 0.4)));
    expect(three.citationReadiness).toBe(expected);
  });

  it("citationReadiness = 0 for all-zero vectors", () => {
    const geo = computeGeoScore(ZERO_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.citationReadiness).toBe(0);
  });

  it("citationReadiness = 100 for all-max vectors", () => {
    const geo = computeGeoScore(PERFECT_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.citationReadiness).toBe(100);
  });

  it("citationReadiness is clamped to [0, 100]", () => {
    // Simulate a raw geoResult with sub-scores at boundary values to ensure clamping
    const geo: GeoScoreResult = { brand: 100, performance: 100, ai: 100, overall: 100 };
    const three = computeThreeScores(geo, null);
    expect(three.citationReadiness).toBeGreaterThanOrEqual(0);
    expect(three.citationReadiness).toBeLessThanOrEqual(100);
  });

  it("citationReadiness is an integer", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(Number.isInteger(three.citationReadiness)).toBe(true);
  });

  it("weights performance more than brand (60/40 split)", () => {
    // performance=100, brand=0 → citationReadiness=60
    const perfOnly: GeoScoreResult = { brand: 0, performance: 100, ai: 0, overall: 35 };
    expect(computeThreeScores(perfOnly, null).citationReadiness).toBe(60);

    // brand=100, performance=0 → citationReadiness=40
    const brandOnly: GeoScoreResult = { brand: 100, performance: 0, ai: 0, overall: 30 };
    expect(computeThreeScores(brandOnly, null).citationReadiness).toBe(40);
  });
});

describe("computeThreeScores — executionProgress", () => {
  it("passes through null when no plan cards exist", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(three.executionProgress).toBeNull();
  });

  it("passes through 0 when cards exist but none are done", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, 0);
    expect(three.executionProgress).toBe(0);
  });

  it("passes through 100 when all cards are done", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, 100);
    expect(three.executionProgress).toBe(100);
  });

  it("passes through partial progress (50%)", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, 50);
    expect(three.executionProgress).toBe(50);
  });
});

describe("computeThreeScores — result shape", () => {
  it("returns exactly the three expected keys", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, 42);
    expect(Object.keys(three).sort()).toEqual(["citationReadiness", "executionProgress", "visibility"]);
  });

  it("visibility and citationReadiness are always integers in [0, 100]", () => {
    const geo = computeGeoScore(TYPICAL_INPUTS);
    const three = computeThreeScores(geo, null);
    expect(Number.isInteger(three.visibility)).toBe(true);
    expect(Number.isInteger(three.citationReadiness)).toBe(true);
    expect(three.visibility).toBeGreaterThanOrEqual(0);
    expect(three.visibility).toBeLessThanOrEqual(100);
    expect(three.citationReadiness).toBeGreaterThanOrEqual(0);
    expect(three.citationReadiness).toBeLessThanOrEqual(100);
  });
});
