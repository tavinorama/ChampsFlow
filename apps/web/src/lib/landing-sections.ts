/**
 * landing-sections.ts — pure helpers for the Ozvor Pages builder UI
 * (issue #208, PR-5).
 *
 * Mirrors the section-type vocabulary produced by
 * packages/llm/src/landing-generate.ts (LandingSectionType) so the page
 * editor can label, create, and generically render every known section
 * shape without importing the worker's LLM package into the web bundle.
 * Kept independent (duplicated, not imported) — same web/worker decoupling
 * trade-off packages/llm/src/landing-generate.ts already makes with its own
 * landingSlugify() vs apps/api/src/routes/landing.ts's slugify().
 *
 * Pure/DB-free — no React, no fetch — so it is unit-testable in isolation.
 */

export type LandingSectionType =
  | "hero"
  | "services"
  | "map_nap"
  | "cta"
  | "proof"
  | "faq"
  | "areas"
  | "hours"
  | "trust"
  | "text";

/** A section as it round-trips through the API — free-form beyond `type`. */
export interface LandingSection {
  type: string;
  [key: string]: unknown;
}

export const KNOWN_SECTION_TYPES: LandingSectionType[] = [
  "hero",
  "services",
  "map_nap",
  "cta",
  "proof",
  "faq",
  "areas",
  "hours",
  "trust",
  "text",
];

export const SECTION_TYPE_LABELS: Record<LandingSectionType, string> = {
  hero: "Hero",
  services: "Services",
  map_nap: "Business info (name/address/phone)",
  cta: "Call to action",
  proof: "Reviews",
  faq: "FAQ",
  areas: "Service areas",
  hours: "Hours",
  trust: "Trust signals",
  text: "Text block",
};

export function isKnownSectionType(type: string): type is LandingSectionType {
  return (KNOWN_SECTION_TYPES as string[]).includes(type);
}

/** Human label for a section type — known types get their display name, anything
 *  else (a shape from a future generator version, or hand-edited JSON) falls back
 *  to a readable "Unknown (type)" label rather than crashing. */
export function sectionTypeLabel(type: string): string {
  if (isKnownSectionType(type)) return SECTION_TYPE_LABELS[type];
  return type ? `Unknown (${type})` : "Unknown section";
}

/** Default shape for "Add section" — one sensible empty instance per known type. */
export function createSection(type: LandingSectionType): LandingSection {
  switch (type) {
    case "hero":
      return { type, headline: "", subheadline: "", cta_label: "Get a Quote" };
    case "services":
      return { type, heading: "What We Do", items: [] };
    case "map_nap":
      return { type, name: "", address: "", phone: "", website: "" };
    case "cta":
      return { type, heading: "", cta_label: "Contact Us", phone: "", website: "" };
    case "proof":
      return { type, heading: "What Customers Say", items: [] };
    case "faq":
      return { type, heading: "Frequently Asked Questions", items: [] };
    case "areas":
      return { type, heading: "Areas We Serve", items: [] };
    case "hours":
      return { type, heading: "Hours", hours: "" };
    case "trust":
      return { type, heading: "Why Customers Choose Us", themes: [] };
    case "text":
      return { type, heading: "", body: "" };
    /* istanbul ignore next -- exhaustiveness guard, KNOWN_SECTION_TYPES covers every case above */
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// page_type vocabulary (apps/api/src/routes/landing.ts PAGE_TYPES)
// ---------------------------------------------------------------------------

export const PAGE_TYPES: string[] = ["home", "service_city", "service", "area", "faq", "proof", "campaign"];

/** page_type values selectable in the "Add page" picker — 'home' is created
 *  automatically with the site and is never manually addable again. */
export const ADDABLE_PAGE_TYPES: string[] = PAGE_TYPES.filter((t) => t !== "home");

export const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "Home",
  service_city: "Service / City",
  service: "Service",
  area: "Area",
  faq: "FAQ",
  proof: "Reviews",
  campaign: "Campaign",
};

export function pageTypeLabel(pageType: string): string {
  return PAGE_TYPE_LABELS[pageType] ?? pageType;
}

// ---------------------------------------------------------------------------
// Placeholder guard — client-side mirror of apps/api/src/routes/landing.ts's
// containsPlaceholder(). Lets the UI block a publish attempt (and explain
// which sections are unfinished) before round-tripping to the server; the
// server re-checks authoritatively on the PATCH (never trust the client).
// ---------------------------------------------------------------------------

const PLACEHOLDER_MARKER = "[PLACEHOLDER:";

/** True if any section (stringified) still contains an unfilled generator placeholder. */
export function containsPlaceholder(sections: unknown): boolean {
  try {
    return JSON.stringify(sections ?? []).includes(PLACEHOLDER_MARKER);
  } catch {
    return false;
  }
}

/** Indices of the sections (within a single page's array) that still contain a
 *  placeholder — used to give a specific "Section 3 (FAQ) still has placeholder
 *  content" message instead of a generic block. */
export function sectionsWithPlaceholder(sections: unknown[]): number[] {
  const out: number[] = [];
  sections.forEach((sec, i) => {
    try {
      if (JSON.stringify(sec ?? {}).includes(PLACEHOLDER_MARKER)) out.push(i);
    } catch {
      // Non-serializable section content — can't check it; skip rather than crash.
    }
  });
  return out;
}
