/**
 * prompt-portfolio.test.ts — B1 intent classification of the default portfolio.
 *
 * Contract: the 10 default prompt TEXTS and their ORDER are IDENTICAL to the
 * pre-B1 portfolio (the free-tier cap slices this array, and the Prompt
 * Library UI renders it in order) — B1 only adds intent/formulation metadata.
 */
import { describe, it, expect } from "vitest";
import {
  buildIntentPortfolio,
  PORTFOLIO_INTENTS,
} from "../../../packages/llm/src/prompt-portfolio";

describe("buildIntentPortfolio", () => {
  it("keeps the exact legacy texts and order (10 prompts)", () => {
    const texts = buildIntentPortfolio("Acme", "CRM").map((p) => p.text);
    expect(texts).toEqual([
      "What is the best CRM for small businesses?",
      "Top CRM providers in 2026",
      "CRM alternatives worth considering",
      "Which CRM do experts recommend?",
      "Most trusted CRM companies",
      "Best CRM for SMBs on a budget",
      "Acme vs competitors",
      "Is Acme a good choice?",
      "Pros and cons of leading CRM options",
      "How to choose a CRM vendor",
    ]);
  });

  it("classifies into exactly 5 intents × 2 formulations (ix 0 and 1)", () => {
    const portfolio = buildIntentPortfolio("Acme", "CRM");
    const byIntent = new Map<string, number[]>();
    for (const p of portfolio) {
      byIntent.set(p.intentId, [...(byIntent.get(p.intentId) ?? []), p.formulationIx]);
    }
    expect([...byIntent.keys()].sort()).toEqual([...PORTFOLIO_INTENTS].sort());
    for (const ixs of byIntent.values()) {
      expect(ixs.sort()).toEqual([0, 1]);
    }
  });

  it("falls back to the 'solution' category like the legacy builder", () => {
    const texts = buildIntentPortfolio("Acme", null).map((p) => p.text);
    expect(texts[0]).toBe("What is the best solution for small businesses?");
    expect(buildIntentPortfolio("Acme", "   ")[0]!.text).toBe(
      "What is the best solution for small businesses?"
    );
  });

  it("puts the brand-direct formulations on the brand name", () => {
    const brandDirect = buildIntentPortfolio("Acme", "CRM").filter(
      (p) => p.intentId === "brand_direct"
    );
    expect(brandDirect.map((p) => p.text)).toEqual(["Acme vs competitors", "Is Acme a good choice?"]);
  });
});
