/**
 * landing-generate-rich.test.ts — PR B: the brila.ai-level generator upgrade.
 *
 * Pins the NEW capabilities that ride on the Google Places rich fetch:
 *  - theme derived from the client's brand colour (light base) + pastel default;
 *  - a gallery section from Maps photos;
 *  - hero rating/review-count + hero image;
 *  - the proof section built from VERBATIM, ATTRIBUTED Google reviews;
 *  - GEO/SEO JSON-LD: LocalBusiness + AggregateRating + Review + FAQPage —
 *    from REAL facts only (no fabrication, no placeholder answers in schema).
 *
 * The honesty guard is re-asserted: with no rich data the output is unchanged
 * (no gallery, no invented reviews) — that's covered by the existing suite;
 * here we assert the rich path never invents either.
 */
import { describe, it, expect } from "vitest";
import {
  buildLandingBundle,
  deriveLandingTheme,
  buildLocalBusinessJsonLd,
  buildFaqPageJsonLd,
  LANDING_DEFAULT_BRAND,
  type LandingGenerateInput,
} from "../../packages/llm/src/landing-generate";

const richInput: LandingGenerateInput = {
  business: {
    name: "Marigold Café",
    category: "Café",
    address: "1123 E 6th St, Austin, TX 78702",
    phone: "(512) 555-0142",
    website: "https://marigold.example",
    description: "Neighborhood café and bakery.",
    rating: 4.7,
    reviewCount: 328,
    priceLevel: "PRICE_LEVEL_MODERATE",
    lat: 30.26,
    lng: -97.72,
    hours: "Mon–Fri 7am–6pm",
  },
  brandColor: "#c07d12",
  googleReviews: [
    { author: "Marcus R.", body: "Best cortado on the East Side.", rating: 5, relativeTime: "2 weeks ago" },
    { author: "Dana L.", body: "They knew my order by my third visit.", rating: 5, relativeTime: "1 month ago" },
  ],
  photos: [
    { src: "/api/landing/photo/abc", alt: "Storefront", attribution: "A. Photographer" },
    { src: "/api/landing/photo/def", alt: "Cortado", attribution: "B. Barista" },
  ],
};

describe("deriveLandingTheme", () => {
  it("uses the client brand colour on a light base", () => {
    // No category → the default 'modern' template.
    expect(deriveLandingTheme("#c07d12")).toEqual({ base: "light", primary: "#c07d12", isDefault: false, template: "modern" });
  });
  it("expands #rgb shorthand and lowercases", () => {
    expect(deriveLandingTheme("#ABC")).toEqual({ base: "light", primary: "#aabbcc", isDefault: false, template: "modern" });
  });
  it("falls back to the pastel default when absent or invalid", () => {
    for (const bad of [undefined, "", "not-a-colour", "#12"]) {
      expect(deriveLandingTheme(bad as string)).toEqual({
        base: "light",
        primary: LANDING_DEFAULT_BRAND,
        isDefault: true,
        template: "modern",
      });
    }
  });
});

describe("buildLocalBusinessJsonLd", () => {
  it("emits LocalBusiness with AggregateRating + Review from real facts", () => {
    const node = buildLocalBusinessJsonLd(richInput);
    expect(node["@type"]).toBe("LocalBusiness");
    expect(node["name"]).toBe("Marigold Café");
    expect(node["telephone"]).toBe("(512) 555-0142");
    expect(node["priceRange"]).toBe("$$");
    expect(node["geo"]).toMatchObject({ latitude: 30.26, longitude: -97.72 });
    expect(node["aggregateRating"]).toMatchObject({ ratingValue: 4.7, reviewCount: 328 });
    const reviews = node["review"] as Record<string, unknown>[];
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      "@type": "Review",
      author: { "@type": "Person", name: "Marcus R." },
      reviewBody: "Best cortado on the East Side.",
    });
  });
  it("omits AggregateRating when there is no rating/count", () => {
    const node = buildLocalBusinessJsonLd({ business: { name: "X" } });
    expect(node["aggregateRating"]).toBeUndefined();
    expect(node["review"]).toBeUndefined();
  });
});

describe("buildFaqPageJsonLd", () => {
  it("includes only FAQs with a real answer", () => {
    const node = buildFaqPageJsonLd([
      { q: "Real?", a: "Yes, absolutely." },
      { q: "Placeholder?", a: "Marigold answers: [PLACEHOLDER: your answer]." },
    ]);
    expect(node).not.toBeNull();
    const entities = node!["mainEntity"] as Record<string, unknown>[];
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ name: "Real?" });
  });
  it("returns null when every answer is a placeholder", () => {
    expect(buildFaqPageJsonLd([{ q: "Q", a: "[PLACEHOLDER: x]" }])).toBeNull();
  });
});

describe("buildLandingBundle — rich path", () => {
  it("themes the bundle to the brand colour", async () => {
    const bundle = await buildLandingBundle(richInput);
    // "Café" category → the classic (serif) template.
    expect(bundle.theme).toEqual({ base: "light", primary: "#c07d12", isDefault: false, template: "classic" });
  });

  it("adds a gallery from Maps photos and a hero image + rating on home", async () => {
    const bundle = await buildLandingBundle(richInput);
    const home = bundle.pages.find((p) => p.page_type === "home")!;
    const gallery = home.sections.find((s) => s.type === "gallery");
    expect(gallery).toBeTruthy();
    expect((gallery!["items"] as unknown[]).length).toBe(2);
    const hero = home.sections.find((s) => s.type === "hero")!;
    expect(hero["rating"]).toBe(4.7);
    expect(hero["review_count"]).toBe(328);
    expect(hero["image"]).toBe("/api/landing/photo/abc");
    expect(hero["image_alt"]).toBe("Storefront");
  });

  it("builds proof from verbatim Google reviews WITH attribution", async () => {
    const bundle = await buildLandingBundle(richInput);
    const proofPage = bundle.pages.find((p) => p.page_type === "proof")!;
    const proof = proofPage.sections.find((s) => s.type === "proof")!;
    expect(proof["source"]).toBe("Google");
    const items = proof["items"] as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ author: "Marcus R.", body: "Best cortado on the East Side.", source: "Google" });
  });

  it("attaches LocalBusiness JSON-LD to home + proof, FAQPage to faq", async () => {
    const bundle = await buildLandingBundle(richInput);
    const home = bundle.pages.find((p) => p.page_type === "home")!;
    const faq = bundle.pages.find((p) => p.page_type === "faq")!;
    expect(home.jsonLd?.[0]?.["@type"]).toBe("LocalBusiness");
    expect(faq.jsonLd?.[0]?.["@type"]).toBe("FAQPage");
  });

  it("never fabricates: no photos → no gallery; no Google reviews → no attributed proof", async () => {
    const bare: LandingGenerateInput = { business: { name: "Bare Co", serviceAreas: ["Austin"] } };
    const bundle = await buildLandingBundle(bare);
    const home = bundle.pages.find((p) => p.page_type === "home")!;
    expect(home.sections.find((s) => s.type === "gallery")).toBeUndefined();
    expect(bundle.theme.isDefault).toBe(true); // pastel default, not invented
    const proofPage = bundle.pages.find((p) => p.page_type === "proof")!;
    const proof = proofPage.sections.find((s) => s.type === "proof")!;
    expect(proof["source"]).toBeUndefined(); // not sourced from Google
  });
});
