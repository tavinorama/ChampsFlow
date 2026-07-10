/**
 * apps/web/src/lib/landing-sections.ts — section-vocabulary + placeholder
 * guard helpers used by the Ozvor Pages builder UI (issue #208, PR-5).
 */

import { describe, it, expect } from "vitest";
import {
  KNOWN_SECTION_TYPES,
  SECTION_TYPE_LABELS,
  createSection,
  isKnownSectionType,
  sectionTypeLabel,
  pageTypeLabel,
  containsPlaceholder,
  sectionsWithPlaceholder,
  PAGE_TYPES,
  ADDABLE_PAGE_TYPES,
} from "../../apps/web/src/lib/landing-sections";

describe("isKnownSectionType / sectionTypeLabel", () => {
  it("recognizes every type in the shared vocabulary", () => {
    for (const t of KNOWN_SECTION_TYPES) {
      expect(isKnownSectionType(t)).toBe(true);
      expect(sectionTypeLabel(t)).toBe(SECTION_TYPE_LABELS[t]);
    }
  });

  it("falls back gracefully for an unknown type — never throws", () => {
    expect(isKnownSectionType("mystery")).toBe(false);
    expect(sectionTypeLabel("mystery")).toBe("Unknown (mystery)");
    expect(sectionTypeLabel("")).toBe("Unknown section");
  });
});

describe("createSection — one sensible default per known type", () => {
  it("produces a section object carrying its own type for every known type", () => {
    for (const t of KNOWN_SECTION_TYPES) {
      const sec = createSection(t);
      expect(sec.type).toBe(t);
    }
  });

  it("hero starts with empty headline/subheadline and a default CTA label", () => {
    expect(createSection("hero")).toEqual({
      type: "hero",
      headline: "",
      subheadline: "",
      cta_label: "Get a Quote",
    });
  });

  it("services/areas/faq/proof/trust start with empty list fields", () => {
    expect(createSection("services").items).toEqual([]);
    expect(createSection("areas").items).toEqual([]);
    expect(createSection("faq").items).toEqual([]);
    expect(createSection("proof").items).toEqual([]);
    expect(createSection("trust").themes).toEqual([]);
  });
});

describe("pageTypeLabel", () => {
  it("labels every known page_type", () => {
    for (const t of ["home", "service_city", "service", "area", "faq", "proof", "campaign"]) {
      expect(pageTypeLabel(t)).not.toBe(t === "home" ? "" : undefined);
    }
    expect(pageTypeLabel("home")).toBe("Home");
    expect(pageTypeLabel("service_city")).toBe("Service / City");
  });

  it("falls back to the raw value for an unknown page_type", () => {
    expect(pageTypeLabel("mystery_type")).toBe("mystery_type");
  });
});

describe("ADDABLE_PAGE_TYPES", () => {
  it("excludes 'home' — the home page is created automatically, never manually added", () => {
    expect(PAGE_TYPES).toContain("home");
    expect(ADDABLE_PAGE_TYPES).not.toContain("home");
  });

  it("contains every other page type", () => {
    for (const t of PAGE_TYPES.filter((x) => x !== "home")) {
      expect(ADDABLE_PAGE_TYPES).toContain(t);
    }
  });
});

describe("containsPlaceholder / sectionsWithPlaceholder", () => {
  it("detects the generator's exact placeholder marker", () => {
    const sections = [
      { type: "hero", headline: "Acme Plumbing" },
      { type: "faq", items: [{ q: "Do you offer 24/7 service?", a: "[PLACEHOLDER: 2–3 sentences with your specific answer]." }] },
    ];
    expect(containsPlaceholder(sections)).toBe(true);
    expect(sectionsWithPlaceholder(sections)).toEqual([1]);
  });

  it("is false for clean, fully-written sections", () => {
    const sections = [
      { type: "hero", headline: "Acme Plumbing", subheadline: "Serving Austin" },
      { type: "cta", heading: "Ready to talk?", phone: "555-0100" },
    ];
    expect(containsPlaceholder(sections)).toBe(false);
    expect(sectionsWithPlaceholder(sections)).toEqual([]);
  });

  it("handles empty/undefined input without throwing", () => {
    expect(containsPlaceholder(undefined)).toBe(false);
    expect(containsPlaceholder([])).toBe(false);
    expect(sectionsWithPlaceholder([])).toEqual([]);
  });

  it("does not false-positive on text that merely mentions the word placeholder", () => {
    const sections = [{ type: "text", body: "This is a placeholder-free page." }];
    expect(containsPlaceholder(sections)).toBe(false);
  });
});
