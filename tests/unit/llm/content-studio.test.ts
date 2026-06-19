/**
 * content-studio.test.ts — C4 content drafting (template fallback path).
 * No ANTHROPIC_API_KEY in the test env → deterministic template drafts.
 * Covers GEO-A2 (no competitor names, no fabrication) + schema.org output.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { generateContent } from "../../../packages/llm/src/content-studio";

beforeEach(() => {
  delete process.env["ANTHROPIC_API_KEY"];
});

describe("generateContent (template fallback)", () => {
  it("drafts a blog post with valid Article schema", async () => {
    const d = await generateContent({ contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "How to pick a CRM" });
    expect(d.generatedBy).toBe("rules");
    expect(d.body.length).toBeGreaterThan(0);
    const schema = JSON.parse(d.schemaMarkup as string);
    expect(schema["@type"]).toBe("Article");
  });

  it("drafts an FAQ entry with valid FAQPage schema", async () => {
    const d = await generateContent({ contentType: "faq", brandName: "Acme CRM", category: "CRM", topic: "Is Acme CRM secure?" });
    const schema = JSON.parse(d.schemaMarkup as string);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity[0]["@type"]).toBe("Question");
  });

  it("drafts a LinkedIn post (no schema markup expected)", async () => {
    const d = await generateContent({ contentType: "linkedin", brandName: "Acme CRM", category: "CRM", topic: "Why GEO matters" });
    expect(d.body.length).toBeGreaterThan(0);
    expect(d.schemaMarkup).toBeNull();
  });

  it("uses [PLACEHOLDER] markers instead of fabricating facts (GEO-A2)", async () => {
    const d = await generateContent({ contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "Our 2026 results" });
    expect(d.body).toContain("[PLACEHOLDER");
  });

  it("does not inject competitor names into the draft (GEO-A2)", async () => {
    const d = await generateContent({ contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "Best CRM options" });
    expect(`${d.title} ${d.body}`).not.toMatch(/HubSpot|Salesforce|Pipedrive/i);
  });

  it("is deterministic in template mode", async () => {
    const req = { contentType: "faq" as const, brandName: "Acme CRM", category: "CRM", topic: "Pricing?" };
    expect(await generateContent(req)).toEqual(await generateContent(req));
  });
});
