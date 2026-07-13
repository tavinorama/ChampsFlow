/**
 * Unit — LLM enrichment for Ozvor Pages (brila-level content, Fase 1).
 *
 * Locks the two guarantees of the widened generation path:
 *  1. FAQ placeholders are replaced by grounded answers — but ONLY when the model
 *     returns a substantive, placeholder-free answer (never a fabrication path).
 *  2. Hero rewrites still apply; everything else is untouched.
 */
import { describe, it, expect } from "vitest";
import { parseLlmEnrichment, applyLlmEnrichment } from "../../packages/llm/src/landing-generate";

// Minimal bundle: one page with a hero + a faq section holding one placeholder
// answer and one already-real answer.
function samplePages() {
  return [
    {
      slug: "home",
      page_type: "home",
      title: "Home",
      sections: [
        { type: "hero", headline: "Old headline", subheadline: "Old sub" },
        {
          type: "faq",
          heading: "FAQ",
          items: [
            { q: "Do you serve East Austin?", a: "Acme answers this: [PLACEHOLDER: 2–3 sentences]." },
            { q: "How do I contact you?", a: "Call 555-1234." },
          ],
        },
      ],
    },
  ] as never;
}

describe("parseLlmEnrichment", () => {
  it("parses pages + faq_answers from strict JSON (tolerating surrounding prose)", () => {
    const text = `sure!\n{"pages":[{"slug":"home","headline":"H","subheadline":"S"}],"faq_answers":[{"q":"Q","a":"A grounded answer here."}]}`;
    const e = parseLlmEnrichment(text);
    expect(e).not.toBeNull();
    expect(e?.pages[0]).toMatchObject({ slug: "home", headline: "H", subheadline: "S" });
    expect(e?.faqAnswers[0]).toMatchObject({ q: "Q", a: "A grounded answer here." });
  });

  it("returns null on non-JSON or empty payloads", () => {
    expect(parseLlmEnrichment("not json")).toBeNull();
    expect(parseLlmEnrichment('{"pages":[],"faq_answers":[]}')).toBeNull();
  });
});

describe("applyLlmEnrichment", () => {
  it("fills a placeholder FAQ answer with the grounded one (matched by question)", () => {
    const out = applyLlmEnrichment(samplePages(), {
      pages: [],
      faqAnswers: [
        { q: "do you serve east austin?", a: "Yes — Acme serves East Austin and nearby neighborhoods; call to confirm your street." },
      ],
    });
    const faq = (out[0].sections as Array<{ type: string; items?: Array<{ q: string; a: string }> }>).find((s) => s.type === "faq");
    expect(faq?.items?.[0].a).toMatch(/Yes — Acme serves East Austin/);
    // The already-real answer is untouched.
    expect(faq?.items?.[1].a).toBe("Call 555-1234.");
  });

  it("NEVER replaces a placeholder with another placeholder or a too-short answer", () => {
    const out = applyLlmEnrichment(samplePages(), {
      pages: [],
      faqAnswers: [
        { q: "Do you serve East Austin?", a: "[PLACEHOLDER: still]" },
      ],
    });
    const faq = (out[0].sections as Array<{ type: string; items?: Array<{ q: string; a: string }> }>).find((s) => s.type === "faq");
    // Original placeholder is preserved (publish guard still catches it).
    expect(faq?.items?.[0].a).toContain("[PLACEHOLDER");
  });

  it("applies hero rewrite and leaves non-hero/non-faq sections alone", () => {
    const out = applyLlmEnrichment(samplePages(), {
      pages: [{ slug: "home", headline: "New headline", subheadline: "New sub" }],
      faqAnswers: [],
    });
    const hero = (out[0].sections as Array<{ type: string; headline?: string; subheadline?: string }>).find((s) => s.type === "hero");
    expect(hero?.headline).toBe("New headline");
    expect(hero?.subheadline).toBe("New sub");
  });
});
