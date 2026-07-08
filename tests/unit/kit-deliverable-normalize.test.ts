import { describe, expect, it } from "vitest";
import { normalizeDeliverable, type Deliverable } from "../../apps/web/src/app/(marketing)/kit/[token]/deliverable-normalize";

const validDeliverable: Deliverable = {
  brand: "Ozvor",
  generatedAt: "2026-07-08T00:00:00.000Z",
  live: false,
  fromTest: null,
  score: { brand: 80, performance: 70, ai: 60, overall: 70 },
  topFixes: [
    { vector: "citation", gap: "Missing proof", action: "Add comparison page", effort: "low", impact: "high", priority: 1 },
  ],
  drafts: [
    { contentType: "FAQ", title: "How to get cited", body: "Answer buyer questions clearly.", schemaMarkup: null, generatedBy: "fallback" },
  ],
  publishChecklist: ["Publish the FAQ", "Request indexing"],
  meta: { probesTotal: 12, probesCited: 3, enginesUsed: ["ChatGPT", "Perplexity"] },
};

describe("normalizeDeliverable", () => {
  it("accepts a proper deliverable object", () => {
    expect(normalizeDeliverable(validDeliverable)).toEqual(validDeliverable);
  });

  it("accepts a legacy double-encoded deliverable string", () => {
    expect(normalizeDeliverable(JSON.stringify(validDeliverable))).toEqual(validDeliverable);
  });

  it("rejects invalid JSON strings", () => {
    expect(normalizeDeliverable("{not-json")).toBeNull();
  });

  it("rejects partial objects that would crash KitView rendering", () => {
    expect(normalizeDeliverable({ score: validDeliverable.score })).toBeNull();
    expect(normalizeDeliverable({ ...validDeliverable, topFixes: undefined })).toBeNull();
    expect(normalizeDeliverable({ ...validDeliverable, drafts: undefined })).toBeNull();
    expect(normalizeDeliverable({ ...validDeliverable, publishChecklist: undefined })).toBeNull();
    expect(normalizeDeliverable({ ...validDeliverable, meta: { probesTotal: 1, probesCited: 0 } })).toBeNull();
  });
});
