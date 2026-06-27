/**
 * content-studio.test.ts — C4 content drafting (template fallback path).
 * No ANTHROPIC_API_KEY in the test env → deterministic template drafts.
 * Covers GEO-A2 (no competitor names, no fabrication) + schema.org output.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { generateContent } from "../../../packages/llm/src/content-studio";

beforeEach(() => {
  delete process.env["ANTHROPIC_API_KEY"];
});

afterEach(() => vi.unstubAllGlobals());

// Template fallback tests: key is present but LLM call fails (non-200) → template.
// This is the correct scenario for templateDraft — when a key is configured but
// the provider returns an error (network failure, timeout, 5xx, etc.).
describe("generateContent (template fallback)", () => {
  function stubFailingLLM() {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)));
  }

  it("drafts a blog post with valid Article schema", async () => {
    stubFailingLLM();
    const d = await generateContent(
      { contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "How to pick a CRM" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(d.generatedBy).toBe("rules");
    expect(d.body.length).toBeGreaterThan(0);
    const schema = JSON.parse(d.schemaMarkup as string);
    expect(schema["@type"]).toBe("Article");
  });

  it("drafts an FAQ entry with valid FAQPage schema", async () => {
    stubFailingLLM();
    const d = await generateContent(
      { contentType: "faq", brandName: "Acme CRM", category: "CRM", topic: "Is Acme CRM secure?" },
      { apiKey: "sk-ant-test-key" }
    );
    const schema = JSON.parse(d.schemaMarkup as string);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity[0]["@type"]).toBe("Question");
  });

  it("drafts a LinkedIn post (no schema markup expected)", async () => {
    stubFailingLLM();
    const d = await generateContent(
      { contentType: "linkedin", brandName: "Acme CRM", category: "CRM", topic: "Why GEO matters" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(d.body.length).toBeGreaterThan(0);
    expect(d.schemaMarkup).toBeNull();
  });

  it("uses [PLACEHOLDER] markers instead of fabricating facts (GEO-A2)", async () => {
    stubFailingLLM();
    const d = await generateContent(
      { contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "Our 2026 results" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(d.body).toContain("[PLACEHOLDER");
  });

  it("does not inject competitor names into the draft (GEO-A2)", async () => {
    stubFailingLLM();
    const d = await generateContent(
      { contentType: "blog", brandName: "Acme CRM", category: "CRM", topic: "Best CRM options" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(`${d.title} ${d.body}`).not.toMatch(/HubSpot|Salesforce|Pipedrive/i);
  });

  it("is deterministic in template mode", async () => {
    stubFailingLLM();
    const req = { contentType: "faq" as const, brandName: "Acme CRM", category: "CRM", topic: "Pricing?" };
    const [a, b] = await Promise.all([
      generateContent(req, { apiKey: "sk-ant-test-key" }),
      generateContent(req, { apiKey: "sk-ant-test-key" }),
    ]);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Helpers shared across brand-grounded tests
// ---------------------------------------------------------------------------

function anthropicOkWith(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
  } as unknown as Response;
}

/** Captures the raw fetch body sent to Anthropic and returns parsed JSON. */
let capturedBody: Record<string, unknown> | null = null;
function stubFetchCapture(text = "Generated title\n\nGenerated body for Acme CRM about their specific gap.") {
  capturedBody = null;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.body) {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    }
    return anthropicOkWith(text);
  }));
}

const baseReq = {
  contentType: "blog" as const,
  brandName: "Acme CRM",
  category: "CRM",
  topic: "How to build a better CRM pipeline",
};

describe("generateContent — brand-grounded inputs", () => {
  it("system prompt includes the brand name when brandDescription is supplied", async () => {
    stubFetchCapture();
    await generateContent(
      { ...baseReq, brandDescription: "a CRM tool serving small law firms" },
      { apiKey: "sk-ant-test-key" }
    );
    const system = capturedBody?.["system"] as string ?? "";
    expect(system).toContain("Acme CRM");
    expect(system).toContain("a CRM tool serving small law firms");
  });

  it("system prompt includes absentPrompts when supplied", async () => {
    stubFetchCapture();
    await generateContent(
      { ...baseReq, absentPrompts: ["best CRM for law firms", "CRM for legal teams"] },
      { apiKey: "sk-ant-test-key" }
    );
    const system = capturedBody?.["system"] as string ?? "";
    expect(system).toContain("best CRM for law firms");
  });

  it("graceful error when no key configured and no apiKey", async () => {
    // No env key, no opts.apiKey
    const d = await generateContent(baseReq);
    expect(d.generatedBy).toBe("error");
    expect(d.keyUsed).toBe("none");
    expect(d.body).toContain("Account → AI engines & keys");
  });

  it("rationale is non-null when auditGap is supplied", async () => {
    stubFetchCapture();
    const d = await generateContent(
      { ...baseReq, auditGap: "Brand is absent from buyer prompts about CRM for legal teams" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(d.rationale).not.toBeNull();
    expect(typeof d.rationale).toBe("string");
  });

  it("rationale references the auditGap text", async () => {
    stubFetchCapture();
    const d = await generateContent(
      { ...baseReq, auditGap: "No FAQ content about contract management" },
      { apiKey: "sk-ant-test-key" }
    );
    expect(d.rationale).toContain("No FAQ content about contract management");
  });

  it("weak trait names appear in the user prompt", async () => {
    stubFetchCapture();
    await generateContent(
      { ...baseReq, weakContentTraits: ["statistics", "answerShaped"] },
      { apiKey: "sk-ant-test-key" }
    );
    const messages = (capturedBody?.["messages"] as Array<{ role: string; content: string }>) ?? [];
    const userContent = messages[0]?.content ?? "";
    // Either the trait names or synonyms should appear in the user prompt.
    expect(userContent).toMatch(/statistics|answerShaped/i);
  });

  it("missingSourceNames appear as 'absent from' in rationale, not as confirmed presence", async () => {
    stubFetchCapture();
    const d = await generateContent(
      { ...baseReq, auditGap: "Off-site gap", missingSourceNames: ["G2", "Trustpilot"] },
      { apiKey: "sk-ant-test-key" }
    );
    // Rationale must use language indicating absence, not confirmed presence.
    expect(d.rationale).toMatch(/absent from|missing from/i);
    // Must NOT claim confirmed presence.
    expect(d.rationale).not.toMatch(/confirmed you are on|you are on G2|you are on Trustpilot/i);
  });
});
