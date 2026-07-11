/**
 * Unit tests for the public Ozvor Pages section → render-model mapper
 * (issue #208, PR-6). Pure logic only — no DOM, no React.
 */

import { describe, it, expect } from "vitest";
import {
  mapSectionToRenderModel,
  mapSectionsToRenderModels,
} from "../../apps/web/src/components/landing-public/section-render-model";

describe("mapSectionToRenderModel — every known generator section shape", () => {
  it("maps a hero section", () => {
    expect(
      mapSectionToRenderModel({
        type: "hero",
        headline: "Acme Plumbing",
        subheadline: "Serving Austin",
        business_name: "Acme Plumbing",
        cta_label: "Get a Quote",
      })
    ).toEqual({
      kind: "hero",
      headline: "Acme Plumbing",
      subheadline: "Serving Austin",
      businessName: "Acme Plumbing",
      ctaLabel: "Get a Quote",
      // Rich Google-Maps extras are null/"" when absent (never invented).
      image: null,
      imageAlt: "",
      imageAttribution: null,
      rating: null,
      reviewCount: null,
    });
  });

  it("maps a services section", () => {
    expect(
      mapSectionToRenderModel({ type: "services", heading: "What We Do", items: ["Drains", "Leaks"] })
    ).toEqual({ kind: "services", heading: "What We Do", items: ["Drains", "Leaks"] });
  });

  it("maps a map_nap section, omitting absent fields as null (never invented)", () => {
    expect(
      mapSectionToRenderModel({ type: "map_nap", name: "Acme", address: "123 Main St", phone: null, website: null })
    ).toEqual({ kind: "map_nap", name: "Acme", address: "123 Main St", phone: null, website: null, rating: null, reviewCount: null });
  });

  it("maps a cta section", () => {
    expect(
      mapSectionToRenderModel({ type: "cta", heading: "Ready?", cta_label: "Contact Us", phone: "555-0100", website: null })
    ).toEqual({ kind: "cta", heading: "Ready?", ctaLabel: "Contact Us", phone: "555-0100", website: null });
  });

  it("maps a non-empty proof section", () => {
    const model = mapSectionToRenderModel({
      type: "proof",
      heading: "What Customers Say",
      items: [{ author: "Jane", body: "Great service!", rating: 5 }],
    });
    expect(model).toEqual({
      kind: "proof",
      heading: "What Customers Say",
      items: [{ author: "Jane", body: "Great service!", rating: 5, source: null, relativeTime: null }],
      empty: false,
      note: null,
    });
  });

  it("maps an empty proof section (empty:true, no fabricated reviews)", () => {
    const model = mapSectionToRenderModel({
      type: "proof",
      heading: "Customer Reviews",
      empty: true,
      note: "Reviews coming soon.",
      items: [],
    });
    expect(model).toEqual({
      kind: "proof",
      heading: "Customer Reviews",
      items: [],
      empty: true,
      note: "Reviews coming soon.",
    });
  });

  it("drops proof items with no body text", () => {
    const model = mapSectionToRenderModel({
      type: "proof",
      items: [{ author: "Jane", body: "" }, { author: "Bob", body: "Solid work." }],
    });
    expect(model?.kind).toBe("proof");
    if (model?.kind === "proof") {
      expect(model.items).toHaveLength(1);
      expect(model.items[0]?.author).toBe("Bob");
    }
  });

  it("maps a faq section", () => {
    const model = mapSectionToRenderModel({
      type: "faq",
      items: [{ q: "Do you offer 24/7 service?", a: "Yes, call any time." }],
    });
    expect(model).toEqual({
      kind: "faq",
      heading: "Frequently Asked Questions",
      items: [{ q: "Do you offer 24/7 service?", a: "Yes, call any time." }],
    });
  });

  it("drops faq items missing a question or answer", () => {
    const model = mapSectionToRenderModel({
      type: "faq",
      items: [{ q: "", a: "Answer" }, { q: "Question", a: "" }, { q: "Full", a: "Pair" }],
    });
    expect(model?.kind).toBe("faq");
    if (model?.kind === "faq") {
      expect(model.items).toEqual([{ q: "Full", a: "Pair" }]);
    }
  });

  it("maps an areas section", () => {
    expect(mapSectionToRenderModel({ type: "areas", items: ["Austin", "Round Rock"] })).toEqual({
      kind: "areas",
      heading: "Areas We Serve",
      items: ["Austin", "Round Rock"],
    });
  });

  it("maps an hours section", () => {
    expect(mapSectionToRenderModel({ type: "hours", hours: "Mon-Fri 8am-6pm" })).toEqual({
      kind: "hours",
      heading: "Hours",
      hours: "Mon-Fri 8am-6pm",
    });
  });

  it("maps a trust section", () => {
    expect(
      mapSectionToRenderModel({ type: "trust", themes: ["Fast", "Reliable"], testimonial_count: 12 })
    ).toEqual({
      kind: "trust",
      heading: "Why Customers Choose Us",
      themes: ["Fast", "Reliable"],
      testimonialCount: 12,
    });
  });

  it("maps the generator's internal-links text section as 'links'", () => {
    const model = mapSectionToRenderModel({
      type: "text",
      role: "internal_links",
      heading: "Explore More",
      links: [{ label: "FAQ", slug: "faq" }],
    });
    expect(model).toEqual({
      kind: "links",
      heading: "Explore More",
      links: [{ label: "FAQ", slug: "faq" }],
    });
  });

  it("maps a plain freeform text section (builder UI shape: heading/body)", () => {
    expect(mapSectionToRenderModel({ type: "text", heading: "About us", body: "We've been in business since 2010." })).toEqual({
      kind: "text",
      heading: "About us",
      body: "We've been in business since 2010.",
    });
  });

  it("returns null for an unrecognized section type (skip silently)", () => {
    expect(mapSectionToRenderModel({ type: "carousel", items: [] })).toBeNull();
  });

  it("returns null for a non-object input", () => {
    expect(mapSectionToRenderModel(null)).toBeNull();
    expect(mapSectionToRenderModel(undefined)).toBeNull();
    expect(mapSectionToRenderModel("hero")).toBeNull();
    expect(mapSectionToRenderModel(42)).toBeNull();
    expect(mapSectionToRenderModel([])).toBeNull();
  });

  it("returns null for an object with a missing/non-string type", () => {
    expect(mapSectionToRenderModel({ headline: "No type field" })).toBeNull();
  });

  it("never throws on malformed field types (defensive readers)", () => {
    expect(() =>
      mapSectionToRenderModel({ type: "hero", headline: 123, subheadline: null, cta_label: {} })
    ).not.toThrow();
    expect(() => mapSectionToRenderModel({ type: "services", items: "not-an-array" })).not.toThrow();
    expect(() => mapSectionToRenderModel({ type: "faq", items: "nope" })).not.toThrow();
  });
});

describe("mapSectionsToRenderModels — full page arrays", () => {
  it("maps a full 3-section array in order", () => {
    const models = mapSectionsToRenderModels([
      { type: "hero", headline: "H" },
      { type: "cta", heading: "C" },
      { type: "areas", items: ["Austin"] },
    ]);
    expect(models.map((m) => m.kind)).toEqual(["hero", "cta", "areas"]);
  });

  it("drops unknown section types but keeps the rest (partial-failure resilience)", () => {
    const models = mapSectionsToRenderModels([
      { type: "hero", headline: "H" },
      { type: "some_future_type", x: 1 },
      { type: "faq", items: [{ q: "Q", a: "A" }] },
    ]);
    expect(models.map((m) => m.kind)).toEqual(["hero", "faq"]);
  });

  it("returns an empty array for a non-array input", () => {
    expect(mapSectionsToRenderModels(null)).toEqual([]);
    expect(mapSectionsToRenderModels(undefined)).toEqual([]);
    expect(mapSectionsToRenderModels("nope")).toEqual([]);
  });

  it("returns an empty array for an empty sections array", () => {
    expect(mapSectionsToRenderModels([])).toEqual([]);
  });
});

describe("mapSectionToRenderModel — rich Google-Maps shapes (PR D)", () => {
  it("maps a hero with rating, review count, and image", () => {
    const m = mapSectionToRenderModel({
      type: "hero",
      headline: "Marigold Café",
      business_name: "Marigold Café",
      rating: 4.7,
      review_count: 328,
      image: "/api/public/landing-photo?ref=places/x/photos/y",
      image_alt: "Storefront",
      image_attribution: "A. Photographer",
    });
    expect(m).toMatchObject({
      kind: "hero",
      rating: 4.7,
      reviewCount: 328,
      image: "/api/public/landing-photo?ref=places/x/photos/y",
      imageAlt: "Storefront",
      imageAttribution: "A. Photographer",
    });
  });

  it("maps a gallery section, dropping items with no src, else null when empty", () => {
    const m = mapSectionToRenderModel({
      type: "gallery",
      heading: "Photos",
      items: [
        { src: "/api/public/landing-photo?ref=a", alt: "one", attribution: "Ann" },
        { alt: "no src — dropped" },
      ],
    });
    expect(m).toEqual({
      kind: "gallery",
      heading: "Photos",
      items: [{ src: "/api/public/landing-photo?ref=a", alt: "one", attribution: "Ann" }],
    });
    // No usable photos → skipped entirely (renders nothing rather than an empty grid).
    expect(mapSectionToRenderModel({ type: "gallery", items: [{ alt: "x" }] })).toBeNull();
  });

  it("maps a proof section built from attributed Google reviews", () => {
    const m = mapSectionToRenderModel({
      type: "proof",
      heading: "What people say",
      source: "Google",
      items: [{ author: "Marcus R.", body: "Best cortado.", rating: 5, relative_time: "2 weeks ago", source: "Google" }],
    });
    expect(m).toMatchObject({
      kind: "proof",
      items: [{ author: "Marcus R.", body: "Best cortado.", rating: 5, relativeTime: "2 weeks ago", source: "Google" }],
    });
  });
});
