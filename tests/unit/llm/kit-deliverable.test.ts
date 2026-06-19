/**
 * kit-deliverable.test.ts — "The Get-Cited Kit" deliverable assembly.
 * Mock mode (no keys, no domain) → deterministic, no network.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildKitDeliverable } from "../../../packages/llm/src/kit-deliverable";

beforeEach(() => {
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["SERP_API_KEY"];
});

describe("buildKitDeliverable (mock mode, no domain)", () => {
  it("returns a complete deliverable: score + 3 fixes + 3 drafts + checklist", async () => {
    const k = await buildKitDeliverable({ brand: "Demo CRM", domain: null, category: "CRM", region: "US" });
    expect(k.brand).toBe("Demo CRM");
    expect(k.score.overall).toBeGreaterThanOrEqual(0);
    expect(k.score.overall).toBeLessThanOrEqual(100);
    expect(k.topFixes.length).toBeLessThanOrEqual(3);
    expect(k.drafts.map((d) => d.contentType)).toEqual(["blog", "linkedin", "faq"]);
    expect(k.publishChecklist.length).toBeGreaterThan(0);
  });

  it("blog draft carries Article schema, FAQ carries FAQPage schema", async () => {
    const k = await buildKitDeliverable({ brand: "Demo CRM", domain: null, category: "CRM", region: "US" });
    const blog = k.drafts.find((d) => d.contentType === "blog");
    const faq = k.drafts.find((d) => d.contentType === "faq");
    expect(blog?.schemaMarkup && JSON.parse(blog.schemaMarkup)["@type"]).toBe("Article");
    expect(faq?.schemaMarkup && JSON.parse(faq.schemaMarkup)["@type"]).toBe("FAQPage");
  });

  it("never fabricates facts — template drafts use [PLACEHOLDER] (GEO-A2)", async () => {
    const k = await buildKitDeliverable({ brand: "Demo CRM", domain: null, category: "CRM", region: "US" });
    const blog = k.drafts.find((d) => d.contentType === "blog");
    expect(blog?.body).toContain("[PLACEHOLDER");
  });

  it("does not leak competitor names into the deliverable (GEO-A2)", async () => {
    const k = await buildKitDeliverable({ brand: "Demo CRM", domain: null, category: "CRM", region: "US" });
    expect(JSON.stringify(k)).not.toMatch(/HubSpot|Salesforce|Pipedrive/i);
  });

  it("marks live=false without provider keys", async () => {
    const k = await buildKitDeliverable({ brand: "Demo CRM", domain: null, category: "CRM", region: "US" });
    expect(k.live).toBe(false);
  });
});
