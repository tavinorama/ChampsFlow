/**
 * competitor-detect.test.ts — word-boundary-safe competitor mention detection.
 * GEO-A2: detection runs over the model's OWN answer text; competitor names are
 * never sent to providers.
 */
import { describe, it, expect } from "vitest";
import { detectCompetitors, tallyCompetitors } from "../../../packages/llm/src/competitor-detect";
import type { CompetitorProbe } from "../../../packages/llm/src/competitor-detect";

describe("detectCompetitors", () => {
  it("finds competitors mentioned in the answer text", () => {
    const text = "For CRM, HubSpot and Salesforce are popular choices.";
    expect(detectCompetitors(text, ["HubSpot", "Salesforce", "Pipedrive"]).sort()).toEqual(["HubSpot", "Salesforce"]);
  });

  it("is case-insensitive", () => {
    expect(detectCompetitors("i love hubspot", ["HubSpot"])).toEqual(["HubSpot"]);
  });

  it("does not match substrings across word boundaries", () => {
    // "Sap" must not match inside "Salesforce".
    expect(detectCompetitors("Salesforce is great", ["Sap"])).toEqual([]);
  });

  it("returns an empty array when no competitor is mentioned", () => {
    expect(detectCompetitors("Acme CRM is the only option here", ["HubSpot"])).toEqual([]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(detectCompetitors("", ["HubSpot"])).toEqual([]);
    expect(detectCompetitors("HubSpot rules", [])).toEqual([]);
  });

  it("does not duplicate a competitor mentioned multiple times", () => {
    expect(detectCompetitors("HubSpot, and again HubSpot", ["HubSpot"])).toEqual(["HubSpot"]);
  });

  it("handles competitor names with punctuation/spaces", () => {
    expect(detectCompetitors("We compared Acme Corp. to others", ["Acme Corp"])).toEqual(["Acme Corp"]);
  });
});

describe("tallyCompetitors — per-engine benchmark (Batch D)", () => {
  const probes: CompetitorProbe[] = [
    // ChatGPT cites HubSpot; client absent → displacement.
    { provider: "openai", text: "Try HubSpot for that.", clientAbsent: true },
    // Claude cites HubSpot; client present → mention only, no displacement.
    { provider: "anthropic", text: "HubSpot or YourBrand both work.", clientAbsent: false },
    // Perplexity cites Salesforce; client absent → displacement.
    { provider: "perplexity", text: "Salesforce is the leader.", clientAbsent: true },
    // ChatGPT cites both; client absent → displacement for both.
    { provider: "openai", text: "HubSpot and Salesforce are options.", clientAbsent: true },
  ];
  const names = ["HubSpot", "Salesforce"];

  it("aggregates overall mentions + displacement (unchanged from the old tally)", () => {
    const out = tallyCompetitors(probes, names);
    const hub = out.find((c) => c.name === "HubSpot")!;
    const sf = out.find((c) => c.name === "Salesforce")!;
    expect(hub).toMatchObject({ mentions: 3, displacement: 2 });
    expect(sf).toMatchObject({ mentions: 2, displacement: 2 });
  });

  it("splits mentions + displacement per engine", () => {
    const hub = tallyCompetitors(probes, names).find((c) => c.name === "HubSpot")!;
    expect(hub.providers.find((p) => p.provider === "openai")).toMatchObject({ mentions: 2, displacement: 2 });
    expect(hub.providers.find((p) => p.provider === "anthropic")).toMatchObject({ mentions: 1, displacement: 0 });
    expect(hub.providers.map((p) => p.provider).sort()).toEqual(["anthropic", "openai"]);
  });

  it("per-engine sums equal the aggregate (no drift / double-count)", () => {
    for (const c of tallyCompetitors(probes, names)) {
      expect(c.providers.reduce((s, p) => s + p.mentions, 0)).toBe(c.mentions);
      expect(c.providers.reduce((s, p) => s + p.displacement, 0)).toBe(c.displacement);
    }
  });

  it("ranks most-displacing first, ties broken by mentions", () => {
    // HubSpot (disp 2, mentions 3) outranks Salesforce (disp 2, mentions 2).
    expect(tallyCompetitors(probes, names).map((c) => c.name)).toEqual(["HubSpot", "Salesforce"]);
  });

  it("returns [] with no competitors or no probes", () => {
    expect(tallyCompetitors(probes, [])).toEqual([]);
    expect(tallyCompetitors([], names)).toEqual([]);
  });
});
