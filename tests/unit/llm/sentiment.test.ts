/**
 * sentiment.test.ts — AI-vector brand perception classifier
 */
import { describe, it, expect } from "vitest";
import { analyzeSentiment } from "../../../packages/llm/src/sentiment";

describe("analyzeSentiment", () => {
  it("returns neutral 0.5 baseline when no brand mention is found", () => {
    const r = analyzeSentiment([{ text: "nothing relevant here", mentioned: false }], "Acme CRM");
    expect(r.analyzed).toBe(false);
    expect(r.sentimentScore).toBe(0.5);
    expect(r.mentionsClassified).toBe(0);
  });

  it("classifies a clearly positive answer as positive", () => {
    const r = analyzeSentiment(
      [{ text: "Acme CRM is the best and most trusted, highly recommended and reliable.", mentioned: true }],
      "Acme CRM"
    );
    expect(r.analyzed).toBe(true);
    expect(r.positive).toBe(1);
    expect(r.negative).toBe(0);
    expect(r.sentimentScore).toBe(1);
  });

  it("classifies a clearly negative answer as negative", () => {
    const r = analyzeSentiment(
      [{ text: "Acme CRM is expensive, clunky, confusing and unreliable.", mentioned: true }],
      "Acme CRM"
    );
    expect(r.negative).toBe(1);
    expect(r.positive).toBe(0);
    expect(r.sentimentScore).toBe(0);
  });

  it("treats a purely factual answer as neutral", () => {
    const r = analyzeSentiment(
      [{ text: "Acme CRM is a CRM platform headquartered in Berlin offering contact management.", mentioned: true }],
      "Acme CRM"
    );
    expect(r.neutral).toBe(1);
    expect(r.sentimentScore).toBe(0.5);
  });

  it("handles negation ('not reliable') as negative", () => {
    const r = analyzeSentiment(
      [{ text: "Honestly Acme CRM is not reliable and feels outdated.", mentioned: true }],
      "Acme CRM"
    );
    expect(r.negative).toBe(1);
  });

  it("aggregates a mixed portfolio into a fractional score", () => {
    const r = analyzeSentiment(
      [
        { text: "Acme CRM is excellent and trusted.", mentioned: true },
        { text: "Acme CRM is a CRM tool based in Berlin.", mentioned: true },
        { text: "Acme CRM is overpriced and clunky.", mentioned: true },
      ],
      "Acme CRM"
    );
    expect(r.mentionsClassified).toBe(3);
    expect(r.positive + r.neutral + r.negative).toBe(3);
    expect(r.sentimentScore).toBeGreaterThan(0);
    expect(r.sentimentScore).toBeLessThan(1);
  });

  it("ignores probes where the brand was not mentioned", () => {
    const r = analyzeSentiment(
      [
        { text: "Acme CRM is excellent.", mentioned: true },
        { text: "Some competitor is great too.", mentioned: false },
      ],
      "Acme CRM"
    );
    expect(r.mentionsClassified).toBe(1);
  });

  it("is deterministic", () => {
    const probes = [{ text: "Acme CRM is reliable and recommended.", mentioned: true }];
    expect(analyzeSentiment(probes, "Acme CRM")).toEqual(analyzeSentiment(probes, "Acme CRM"));
  });
});
