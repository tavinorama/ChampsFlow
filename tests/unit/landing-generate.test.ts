/**
 * landing-generate.test.ts — Ozvor Pages 5-page bundle generator (#208 PR-4).
 *
 * Pins the MOCK mode as the correctness baseline: deterministic, exactly 5
 * pages with the right page_types + unique slugs, every page interlinks with
 * the other 4, FAQ content is built from provided facts/gaps only, and
 * nothing in the output is invented — a testimonial in the output must exist
 * in the input verbatim (founder hard rule: no fabricated reviews/metrics).
 */
import { describe, it, expect } from "vitest";
import {
  buildLandingBundle,
  deriveReviewThemes,
  landingSlugify,
  type LandingGenerateInput,
  type LandingBundlePage,
} from "../../packages/llm/src/landing-generate";

const baseInput: LandingGenerateInput = {
  business: {
    name: "Joe's Plumbing",
    category: "Plumbing",
    address: "123 Main St, Austin, TX 78701",
    phone: "512-555-0100",
    website: "joesplumbing.example.com",
    serviceAreas: ["Austin", "Round Rock"],
    hours: "Mon-Fri 8am-6pm",
  },
  testimonials: [
    { author: "Maria G.", body: "Fast, friendly, and fixed our leak in an hour.", rating: 5 },
    { author: "Dan R.", body: "Great communication and fair pricing throughout.", rating: 4 },
  ],
};

function linksOf(page: LandingBundlePage): string[] {
  const nav = page.sections.find((s) => s.type === "text" && s["role"] === "internal_links");
  const links = (nav?.["links"] as Array<{ slug: string }> | undefined) ?? [];
  return links.map((l) => l.slug);
}

describe("buildLandingBundle — mock mode (deterministic correctness baseline)", () => {
  it("produces exactly 5 pages with the correct page_types", async () => {
    const bundle = await buildLandingBundle(baseInput);
    expect(bundle.mode).toBe("mock");
    expect(bundle.pages).toHaveLength(5);
    const types = bundle.pages.map((p) => p.page_type).sort();
    expect(types).toEqual(["faq", "home", "proof", "service_city", "service_city"].sort());
  });

  it("home page uses the root slug ''", async () => {
    const bundle = await buildLandingBundle(baseInput);
    const home = bundle.pages.find((p) => p.page_type === "home");
    expect(home?.slug).toBe("");
  });

  it("every page has a unique slug", async () => {
    const bundle = await buildLandingBundle(baseInput);
    const slugs = bundle.pages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("same input produces the same output (deterministic)", async () => {
    const [a, b] = await Promise.all([buildLandingBundle(baseInput), buildLandingBundle(baseInput)]);
    expect(a).toEqual(b);
  });

  it("every page interlinks with exactly the other 4 pages", async () => {
    const bundle = await buildLandingBundle(baseInput);
    const allSlugs = bundle.pages.map((p) => p.slug);
    for (const page of bundle.pages) {
      const linked = linksOf(page).sort();
      const expected = allSlugs.filter((s) => s !== page.slug).sort();
      expect(linked).toEqual(expected);
    }
  });

  it("a testimonial in the proof page exists in the input verbatim (no fabrication)", async () => {
    const bundle = await buildLandingBundle(baseInput);
    const proof = bundle.pages.find((p) => p.page_type === "proof");
    const proofSection = proof?.sections.find((s) => s.type === "proof");
    const items = (proofSection?.["items"] as Array<{ author: string; body: string }> | undefined) ?? [];
    expect(items.length).toBe(2);
    for (const item of items) {
      const match = baseInput.testimonials?.some((t) => t.author === item.author && t.body === item.body);
      expect(match).toBe(true);
    }
  });

  it("does not invent testimonials when none are provided (honest empty state)", async () => {
    const bundle = await buildLandingBundle({ business: baseInput.business });
    const proof = bundle.pages.find((p) => p.page_type === "proof");
    const proofSection = proof?.sections.find((s) => s.type === "proof");
    expect(proofSection?.["empty"]).toBe(true);
    expect((proofSection?.["items"] as unknown[]).length).toBe(0);
  });

  it("FAQ page uses crawlSummary.faqs verbatim when present", async () => {
    const bundle = await buildLandingBundle({
      ...baseInput,
      crawlSummary: { faqs: [{ q: "Do you offer emergency service?", a: "Yes, 24/7 emergency plumbing." }] },
    });
    const faq = bundle.pages.find((p) => p.page_type === "faq");
    const faqSection = faq?.sections.find((s) => s.type === "faq");
    const items = (faqSection?.["items"] as Array<{ q: string; a: string }> | undefined) ?? [];
    expect(items.some((i) => i.q === "Do you offer emergency service?" && i.a === "Yes, 24/7 emergency plumbing.")).toBe(
      true
    );
  });

  it("an audit gap visibly influences the FAQ page (quoted phrase preserved verbatim)", async () => {
    const bundle = await buildLandingBundle({
      ...baseInput,
      auditGaps: ['needs FAQ page answering "best plumber austin"'],
    });
    const faq = bundle.pages.find((p) => p.page_type === "faq");
    const faqSection = faq?.sections.find((s) => s.type === "faq");
    const items = (faqSection?.["items"] as Array<{ q: string; a: string }> | undefined) ?? [];
    expect(items.some((i) => i.q.includes("best plumber austin"))).toBe(true);
  });

  it("FAQ answers derived from gaps use an honest placeholder, never an invented claim", async () => {
    const bundle = await buildLandingBundle({
      ...baseInput,
      auditGaps: ['needs FAQ page answering "do you offer financing"'],
    });
    const faq = bundle.pages.find((p) => p.page_type === "faq");
    const faqSection = faq?.sections.find((s) => s.type === "faq");
    const items = (faqSection?.["items"] as Array<{ q: string; a: string }> | undefined) ?? [];
    const gapAnswer = items.find((i) => i.q.includes("do you offer financing"));
    expect(gapAnswer?.a).toContain("[PLACEHOLDER");
  });

  it("service_city pages are named from crawled services when present", async () => {
    const bundle = await buildLandingBundle({
      ...baseInput,
      crawlSummary: { services: ["Drain Cleaning", "Water Heater Repair"] },
    });
    const serviceCityTitles = bundle.pages.filter((p) => p.page_type === "service_city").map((p) => p.title);
    expect(serviceCityTitles.some((t) => t.startsWith("Drain Cleaning"))).toBe(true);
    expect(serviceCityTitles.some((t) => t.startsWith("Water Heater Repair"))).toBe(true);
  });

  it("falls back to generic service pages when no crawled services are given", async () => {
    const bundle = await buildLandingBundle(baseInput);
    const serviceCityTitles = bundle.pages.filter((p) => p.page_type === "service_city").map((p) => p.title);
    expect(serviceCityTitles.some((t) => t.includes("Plumbing Services"))).toBe(true);
  });

  it("does not fabricate service areas when none are given (honest 'Your Area' placeholder)", async () => {
    const bundle = await buildLandingBundle({
      business: { name: "No Area Co" },
    });
    const home = bundle.pages.find((p) => p.page_type === "home");
    expect(home?.seo.description).toContain("Your Area");
  });

  it("SEO title/description stay within safe length caps", async () => {
    const bundle = await buildLandingBundle(baseInput);
    for (const page of bundle.pages) {
      expect(page.seo.title.length).toBeLessThanOrEqual(70);
      expect(page.seo.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("mock mode is used even when mode:'llm' is requested without an apiKey", async () => {
    const bundle = await buildLandingBundle(baseInput, { mode: "llm" });
    expect(bundle.mode).toBe("mock");
  });
});

describe("deriveReviewThemes — deterministic keyword extraction (no fabrication)", () => {
  it("returns themes present in the testimonial text only", () => {
    const themes = deriveReviewThemes([
      { author: "A", body: "Fast response and friendly technician." },
      { author: "B", body: "Fast service, fair pricing, friendly staff." },
    ]);
    expect(themes.length).toBeGreaterThan(0);
    for (const theme of themes) {
      const found = /fast|friendly|response|technician|service|fair|pricing|staff/i.test(theme);
      expect(found).toBe(true);
    }
  });

  it("is deterministic for the same input", () => {
    const input = [
      { author: "A", body: "Excellent work, highly professional team." },
      { author: "B", body: "Professional team, excellent results every time." },
    ];
    expect(deriveReviewThemes(input)).toEqual(deriveReviewThemes(input));
  });

  it("returns an empty array for no testimonials", () => {
    expect(deriveReviewThemes([])).toEqual([]);
  });
});

describe("landingSlugify — matches the DB CHECK-constraint shape", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(landingSlugify("Café São João")).toBe("cafe-sao-joao");
  });

  it("collapses repeats and trims hyphen edges", () => {
    expect(landingSlugify("  Joe's --- Plumbing!  ")).toBe("joe-s-plumbing");
  });
});
