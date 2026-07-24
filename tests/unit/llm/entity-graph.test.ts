/**
 * entity-graph.test.ts — cross-source entity consistency (C7).
 * Uses mockMode to stay deterministic and offline.
 */
import { describe, it, expect } from "vitest";
import { analyzeEntityGraph, pickEntityCompleteness } from "../../../packages/llm/src/entity-graph";

describe("analyzeEntityGraph (mock mode)", () => {
  it("is deterministic for a given brand", async () => {
    const a = await analyzeEntityGraph("Acme CRM", "acme.com", { mockMode: true });
    const b = await analyzeEntityGraph("Acme CRM", "acme.com", { mockMode: true });
    expect(a).toEqual(b);
  });

  it("returns a 0–1 completeness and marks live=false in mock mode", async () => {
    const r = await analyzeEntityGraph("Stripe", "stripe.com", { mockMode: true });
    expect(r.live).toBe(false);
    expect(r.entityCompleteness).toBeGreaterThanOrEqual(0);
    expect(r.entityCompleteness).toBeLessThanOrEqual(1);
  });

  it("emits a high-value-gap finding when no entity is found", async () => {
    // Find a brand string that hashes to not-found (h % 4 === 0).
    let notFound = "";
    for (const cand of ["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff", "gggg", "hhhh"]) {
      const r = await analyzeEntityGraph(cand, null, { mockMode: true });
      if (!r.found) { notFound = cand; break; }
    }
    expect(notFound).not.toBe("");
    const r = await analyzeEntityGraph(notFound, null, { mockMode: true });
    expect(r.found).toBe(false);
    expect(r.findings.join(" ")).toMatch(/no wikidata entity/i);
  });

  it("produces a wikidata id + properties when an entity is found", async () => {
    let found: string | null = null;
    for (const cand of ["Stripe", "Notion", "Linear", "Vercel", "Acme CRM"]) {
      const r = await analyzeEntityGraph(cand, `${cand.toLowerCase()}.com`, { mockMode: true });
      if (r.found) { found = cand; break; }
    }
    expect(found).not.toBeNull();
    const r = await analyzeEntityGraph(found as string, "example.com", { mockMode: true });
    expect(r.wikidataId).toMatch(/^Q\d+$/);
    expect(typeof r.properties.officialWebsite).toBe("boolean");
    expect(typeof r.hasWikipedia).toBe("boolean");
  });
});

describe("pickEntityCompleteness (Brand-vector entity signal)", () => {
  const onSite = 1.0; // a well-marked-up site that would otherwise inflate Brand

  it("trusts the entity value when a Wikidata entity was resolved (found)", () => {
    const entity = { found: true, live: true, entityCompleteness: 0.7 };
    expect(pickEntityCompleteness(entity, onSite)).toBe(0.7);
  });

  it("trusts the honest low value when the graph ran but found NO entity (the fix)", () => {
    // live:true, found:false → the 0.3 floor. Must NOT fall back to the on-site 1.0.
    const entity = { found: false, live: true, entityCompleteness: 0.3 };
    expect(pickEntityCompleteness(entity, onSite)).toBe(0.3);
  });

  it("falls back to the on-site estimate only when Wikidata was unreachable", () => {
    // live:false && found:false → genuine infra failure; don't punish the brand.
    const entity = { found: false, live: false, entityCompleteness: 0.3 };
    expect(pickEntityCompleteness(entity, onSite)).toBe(onSite);
  });

  it("keeps deterministic mock results (live:false, found:true) on their synthetic value", () => {
    const entity = { found: true, live: false, entityCompleteness: 0.62 };
    expect(pickEntityCompleteness(entity, onSite)).toBe(0.62);
  });
});
