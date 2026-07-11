/**
 * section-render-model.ts — pure section → render-model mapper for the
 * public Ozvor Pages renderer (issue #208, PR-6).
 *
 * Mirrors the section-type vocabulary + exact shapes produced by
 * packages/llm/src/landing-generate.ts (LandingSectionType) and the builder
 * UI's apps/web/src/lib/landing-sections.ts. Kept INDEPENDENT (duplicated,
 * not imported) — same web/worker decoupling trade-off those two modules
 * already make with each other, and this file additionally avoids depending
 * on/touching apps/web/src/lib/landing-*.ts per the PR-6 isolation rule.
 *
 * `mapSectionToRenderModel` never throws: malformed fields fall back to safe
 * defaults, and an unrecognized `type` returns `null` so the caller can skip
 * that section silently (a page must still render even if it carries a
 * section shape from a future generator version).
 *
 * Pure/DB-free/React-free — unit-testable without a DOM.
 */

export interface HeroRenderModel {
  kind: "hero";
  headline: string;
  subheadline: string;
  businessName: string;
  ctaLabel: string;
  /** Google Maps rich extras (present only when generation had them). */
  image: string | null;
  imageAlt: string;
  imageAttribution: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface GalleryPhoto {
  src: string;
  alt: string;
  attribution: string | null;
}

export interface GalleryRenderModel {
  kind: "gallery";
  heading: string;
  items: GalleryPhoto[];
}

export interface ServicesRenderModel {
  kind: "services";
  heading: string;
  items: string[];
}

export interface MapNapRenderModel {
  kind: "map_nap";
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface CtaRenderModel {
  kind: "cta";
  heading: string;
  ctaLabel: string;
  phone: string | null;
  website: string | null;
}

export interface ProofItem {
  author: string;
  body: string;
  rating: number | null;
  /** "Google" when the review is a verbatim Google review (attribution). */
  source: string | null;
  relativeTime: string | null;
}

export interface ProofRenderModel {
  kind: "proof";
  heading: string;
  items: ProofItem[];
  empty: boolean;
  note: string | null;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqRenderModel {
  kind: "faq";
  heading: string;
  items: FaqItem[];
}

export interface AreasRenderModel {
  kind: "areas";
  heading: string;
  items: string[];
}

export interface HoursRenderModel {
  kind: "hours";
  heading: string;
  hours: string;
}

export interface TrustRenderModel {
  kind: "trust";
  heading: string;
  themes: string[];
  testimonialCount: number;
}

export interface NavLink {
  label: string;
  slug: string;
}

export interface LinksRenderModel {
  kind: "links";
  heading: string;
  links: NavLink[];
}

export interface TextRenderModel {
  kind: "text";
  heading: string;
  body: string;
}

export type SectionRenderModel =
  | HeroRenderModel
  | GalleryRenderModel
  | ServicesRenderModel
  | MapNapRenderModel
  | CtaRenderModel
  | ProofRenderModel
  | FaqRenderModel
  | AreasRenderModel
  | HoursRenderModel
  | TrustRenderModel
  | LinksRenderModel
  | TextRenderModel;

// ---------------------------------------------------------------------------
// Defensive field readers — never throw, always return a safe fallback.
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function nullableStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// mapSectionToRenderModel — the pure mapper
// ---------------------------------------------------------------------------

export function mapSectionToRenderModel(section: unknown): SectionRenderModel | null {
  if (!isObject(section)) return null;
  const type = typeof section.type === "string" ? section.type : "";

  switch (type) {
    case "hero":
      return {
        kind: "hero",
        headline: str(section.headline),
        subheadline: str(section.subheadline),
        businessName: str(section.business_name),
        ctaLabel: str(section.cta_label, "Get a Quote"),
        image: nullableStr(section.image),
        imageAlt: str(section.image_alt),
        imageAttribution: nullableStr(section.image_attribution),
        rating: num(section.rating),
        reviewCount: num(section.review_count),
      };

    case "gallery": {
      const rawItems = Array.isArray(section.items) ? section.items : [];
      const items: GalleryPhoto[] = rawItems
        .filter(isObject)
        .map((it) => ({
          src: str(it.src),
          alt: str(it.alt),
          attribution: nullableStr(it.attribution),
        }))
        .filter((it) => it.src.length > 0);
      if (items.length === 0) return null;
      return { kind: "gallery", heading: str(section.heading, "Photos"), items };
    }

    case "services":
      return {
        kind: "services",
        heading: str(section.heading, "What We Do"),
        items: strArray(section.items),
      };

    case "map_nap":
      return {
        kind: "map_nap",
        name: str(section.name),
        address: nullableStr(section.address),
        phone: nullableStr(section.phone),
        website: nullableStr(section.website),
        rating: num(section.rating),
        reviewCount: num(section.review_count),
      };

    case "cta":
      return {
        kind: "cta",
        heading: str(section.heading),
        ctaLabel: str(section.cta_label, "Contact Us"),
        phone: nullableStr(section.phone),
        website: nullableStr(section.website),
      };

    case "proof": {
      const rawItems = Array.isArray(section.items) ? section.items : [];
      const items: ProofItem[] = rawItems
        .filter(isObject)
        .map((it) => ({
          author: str(it.author, "Verified customer"),
          body: str(it.body),
          rating: num(it.rating),
          source: nullableStr(it.source),
          relativeTime: nullableStr(it.relative_time),
        }))
        .filter((it) => it.body.length > 0);
      return {
        kind: "proof",
        heading: str(section.heading, "Customer Reviews"),
        items,
        empty: section.empty === true || items.length === 0,
        note: nullableStr(section.note),
      };
    }

    case "faq": {
      const rawItems = Array.isArray(section.items) ? section.items : [];
      const items: FaqItem[] = rawItems
        .filter(isObject)
        .map((it) => ({ q: str(it.q), a: str(it.a) }))
        .filter((it) => it.q.length > 0 && it.a.length > 0);
      return {
        kind: "faq",
        heading: str(section.heading, "Frequently Asked Questions"),
        items,
      };
    }

    case "areas":
      return {
        kind: "areas",
        heading: str(section.heading, "Areas We Serve"),
        items: strArray(section.items),
      };

    case "hours":
      return {
        kind: "hours",
        heading: str(section.heading, "Hours"),
        hours: str(section.hours),
      };

    case "trust":
      return {
        kind: "trust",
        heading: str(section.heading, "Why Customers Choose Us"),
        themes: strArray(section.themes),
        testimonialCount: num(section.testimonial_count) ?? 0,
      };

    case "text": {
      // Two variants share `type: "text"`: the generator's internal-links nav
      // block (role: "internal_links", links: [...]) and a plain freeform
      // paragraph the builder UI's "Add section" creates (heading/body).
      if (section.role === "internal_links" && Array.isArray(section.links)) {
        const links: NavLink[] = section.links
          .filter(isObject)
          .map((l) => ({ label: str(l.label), slug: str(l.slug) }))
          .filter((l) => l.label.length > 0);
        return {
          kind: "links",
          heading: str(section.heading, "Explore More"),
          links,
        };
      }
      return {
        kind: "text",
        heading: str(section.heading),
        body: str(section.body),
      };
    }

    default:
      // Unknown/future section type — skip silently rather than crash a page.
      return null;
  }
}

/** Maps a full sections array, dropping unrecognized/malformed entries. */
export function mapSectionsToRenderModels(sections: unknown): SectionRenderModel[] {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s) => mapSectionToRenderModel(s))
    .filter((m): m is SectionRenderModel => m !== null);
}
