/**
 * landing-generate.ts — Ozvor Pages: 5-page bundle generator (issue #208, PR-4)
 *
 * Pure, DB-free. Builds a deterministic 5-page website bundle (home + 2
 * service/city pages + faq + proof) from a business's real facts: the
 * client's own site content (crawl summary, best-effort), the audit's open
 * gaps (plan_task), and their AUTHORIZED testimonials. Every page interlinks
 * with the other 4 (an internal-links section referencing every other slug).
 *
 * Two modes (same pattern as content-studio.ts):
 *   mock — deterministic template restructuring of the INPUT facts only. No
 *          invented statistics, reviews, ratings, or claims (founder hard
 *          rule — audit integrity postmortem, PR#90). This is the
 *          correctness baseline the unit tests pin.
 *   llm  — the client's BYOK key rewrites ONLY the hero headline/subheadline
 *          per page, grounded in the same input facts (name/category/service
 *          areas — nothing else is sent). Sanitized via prompt-sanitizer. On
 *          ANY failure (no key, network error, non-200, malformed response,
 *          sanitizer rejection) it silently falls back to the mock skeleton —
 *          generation never fails and never fabricates.
 *
 * ai_readiness for each generated page is scored with content-geo's shared
 * primitives (scorePage / computeContentScoreFromTraits) via
 * renderSectionsForScoring() below — the SAME citation-worthiness traits the
 * audit uses, not a reinvented metric.
 */

import { sanitizeUserPrompt } from "./prompt-sanitizer";
import type { ContentProvider } from "./content-studio";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface LandingBusinessInput {
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  serviceAreas?: string[];
  hours?: string | Record<string, string>;
  /** Google Maps rich facts (from resolvePlaceById rich fetch). All optional —
   *  absent for hand-entered businesses; present enables ratings/gallery/GEO. */
  description?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  lat?: number;
  lng?: number;
}

export interface LandingTestimonialInput {
  author: string;
  body: string;
  rating?: number;
}

/** A verbatim Google review — shown WITH `author` + a "Google" source label
 *  (Places ToS attribution; founder-approved 2026-07-11). Distinct from the
 *  owner-entered testimonials above. */
export interface LandingReviewInput {
  author: string;
  body: string;
  rating?: number;
  relativeTime?: string;
}

/** A Google photo reference — `src` is our own proxy URL (bytes never stored),
 *  `attribution` is shown per Places ToS. */
export interface LandingPhotoInput {
  src: string;
  alt: string;
  attribution?: string;
}

export interface LandingFaqInput {
  q: string;
  a: string;
}

export interface LandingCrawlSummary {
  services?: string[];
  faqs?: LandingFaqInput[];
  tone?: string;
}

export interface LandingGenerateInput {
  business: LandingBusinessInput;
  reviewThemes?: string[];
  /** Caller MUST already have filtered these to authorized=true. */
  testimonials?: LandingTestimonialInput[];
  /** Verbatim Google reviews (attributed). Preferred over testimonials for the
   *  proof section when present. Caller passes these straight from the Places
   *  rich fetch — never fabricated. */
  googleReviews?: LandingReviewInput[];
  /** Google Maps photos (proxy URLs + attribution) → gallery + hero image. */
  photos?: LandingPhotoInput[];
  crawlSummary?: LandingCrawlSummary;
  /** Open plan_task gap/action text for the linked brand — our own DB, not user input. */
  auditGaps?: string[];
  /** Client brand colour (hex). Drives the light + brand-derived theme; absent
   *  → the soft pastel default. */
  brandColor?: string;
  locale?: string;
}

export interface LandingGenerateOptions {
  mode?: "mock" | "llm";
  apiKey?: string;
  provider?: ContentProvider;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

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
  | "gallery"
  | "text";

export interface LandingSection {
  type: LandingSectionType;
  [key: string]: unknown;
}

export interface LandingPageSeo {
  title: string;
  description: string;
}

export type LandingBundlePageType = "home" | "service_city" | "faq" | "proof";

export interface LandingBundlePage {
  page_type: LandingBundlePageType;
  slug: string;
  title: string;
  seo: LandingPageSeo;
  sections: LandingSection[];
  /** GEO/SEO structured data (schema.org) for this page — injected as a
   *  <script type="application/ld+json"> by the public renderer. Present only
   *  when there are real facts to describe. */
  jsonLd?: Record<string, unknown>[];
}

/** Light-first palette. Only `primary` is chosen (the client's brand colour or
 *  the pastel default); everything else derives from it at render time via
 *  color-mix, exactly like the approved template mockup. */
export interface LandingTheme {
  base: "light";
  primary: string;
  /** true when `primary` is the fallback (no brand colour was supplied). */
  isDefault: boolean;
}

export interface LandingBundle {
  mode: "mock" | "llm";
  pages: LandingBundlePage[];
  theme: LandingTheme;
}

// ---------------------------------------------------------------------------
// slugify — same algorithm as apps/api/src/routes/landing.ts. Duplicated (not
// imported) so this module stays DB/route-free and the api layer stays
// decoupled from the generator's internals — same trade-off site-crawl.ts and
// content-geo.ts already make with their own independent safeFetch().
// ---------------------------------------------------------------------------
export function landingSlugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/^-|-$/g, "");
}

function uniqueSlug(base: string, taken: Set<string>): string {
  const root = landingSlugify(base) || "page";
  let candidate = root;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------
// deriveReviewThemes — simple, deterministic keyword/theme extraction from
// testimonial bodies. Counts each significant word at most once per
// testimonial (theme PRESENCE across reviews, not raw word frequency), sorted
// by coverage then alphabetically for a stable, testable order. Pure.
// ---------------------------------------------------------------------------

const REVIEW_STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this",
  "that", "have", "from", "was", "were", "they", "them", "their", "just",
  "really", "very", "great", "good", "best", "service", "services",
  "company", "team", "time", "would", "could", "recommend", "highly",
  "definitely", "everything", "always", "back", "when", "what", "will",
  "went", "than", "then", "also",
]);

export function deriveReviewThemes(
  testimonials: LandingTestimonialInput[],
  max = 5
): string[] {
  const freq = new Map<string, number>();
  for (const t of testimonials) {
    const words = (t.body || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !REVIEW_STOPWORDS.has(w));
    const seenInThisReview = new Set<string>();
    for (const w of words) {
      if (seenInThisReview.has(w)) continue;
      seenInThisReview.add(w);
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

// ---------------------------------------------------------------------------
// Business-fact helpers (pure — no invented data, only restructuring)
// ---------------------------------------------------------------------------

function primaryArea(business: LandingBusinessInput): string {
  const areas = (business.serviceAreas ?? []).map((a) => a.trim()).filter(Boolean);
  if (areas.length > 0) return areas[0] as string;
  if (business.address) {
    const parts = business.address.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return (parts[parts.length - 2] || parts[0]) as string;
    if (parts.length === 1) return parts[0] as string;
  }
  return "Your Area";
}

function allServiceAreas(business: LandingBusinessInput): string[] {
  const areas = (business.serviceAreas ?? []).map((a) => a.trim()).filter(Boolean);
  return areas.length > 0 ? areas : [primaryArea(business)];
}

/** Always returns exactly 2 distinct labels: crawled services first, generic fallback fills the rest. */
function topServices(
  business: LandingBusinessInput,
  crawlSummary?: LandingCrawlSummary
): [string, string] {
  const fromCrawl = (crawlSummary?.services ?? []).map((s) => s.trim()).filter(Boolean);
  const category = business.category?.trim();
  const generic = category ? [`${category} Services`, `${category} Consultation`] : ["Our Services", "Get a Quote"];
  const combined: string[] = [];
  for (const s of fromCrawl) {
    if (combined.length >= 2) break;
    if (!combined.some((c) => c.toLowerCase() === s.toLowerCase())) combined.push(s);
  }
  for (const g of generic) {
    if (combined.length >= 2) break;
    if (!combined.some((c) => c.toLowerCase() === g.toLowerCase())) combined.push(g);
  }
  return [combined[0] as string, combined[1] as string];
}

function formatHours(hours: LandingBusinessInput["hours"]): string | null {
  if (!hours) return null;
  if (typeof hours === "string") return hours.trim() || null;
  const parts = Object.entries(hours)
    .filter(([, v]) => Boolean(v && v.trim()))
    .map(([day, range]) => `${day}: ${range}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function extractQuoted(text: string): string | null {
  const m = text.match(/['"“”‘’]([^'"“”‘’]{4,120})['"“”‘’]/);
  return m ? (m[1] as string).trim() : null;
}

/** A gap like `needs FAQ page answering "best plumber austin"` becomes that FAQ entry
 *  verbatim (quoted substring preserved exactly); the answer defers to an honest
 *  placeholder rather than inventing a claim — same pattern as content-studio's
 *  templateDraft (GEO-A2 fabrication rule). */
function faqFromGap(gap: string, business: LandingBusinessInput): LandingFaqInput {
  const quoted = extractQuoted(gap);
  const base = (quoted ?? gap.replace(/\.$/, "")).trim();
  const question = base.endsWith("?") ? base : `${base}?`;
  const area = primaryArea(business);
  const areaClause = area !== "Your Area" ? ` in ${area}` : "";
  const categoryClause = business.category ? `, a ${business.category}` : "";
  const contactClause = business.phone ? ` Call ${business.phone} for details.` : "";
  const answer =
    `${business.name}${categoryClause} answers this${areaClause}: ` +
    `[PLACEHOLDER: 2–3 sentences with your specific answer].${contactClause}`;
  return { q: question, a: answer };
}

/** FAQs that restructure ONLY facts already present in the input — no placeholders needed. */
function genericFaqs(business: LandingBusinessInput): LandingFaqInput[] {
  const list: LandingFaqInput[] = [];
  const areas = allServiceAreas(business);
  if (areas.length > 0) {
    list.push({
      q: `What areas does ${business.name} serve?`,
      a: `${business.name} serves ${areas.join(", ")}.`,
    });
  }
  const contactParts = [
    business.phone ? `call ${business.phone}` : null,
    business.website ? `visit ${business.website}` : null,
  ].filter((v): v is string => Boolean(v));
  if (contactParts.length > 0) {
    list.push({
      q: `How can I contact ${business.name}?`,
      a: `You can ${contactParts.join(" or ")}.`,
    });
  }
  const hours = formatHours(business.hours);
  if (hours) {
    list.push({
      q: `What are ${business.name}'s hours?`,
      a: `${business.name} is open ${hours}.`,
    });
  }
  return list;
}

// ---------------------------------------------------------------------------
// Theme — light-first, brand-derived (matches the approved template mockup).
// ---------------------------------------------------------------------------

/** Soft pastel neutral used when a business has no brand colour on file. */
export const LANDING_DEFAULT_BRAND = "#9aa7b0";

function normalizeHexColor(input?: string): string | null {
  if (!input) return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) return null;
  let hex = m[1] as string;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex.toLowerCase()}`;
}

/** Only `primary` is chosen (client brand colour or the pastel default); the
 *  renderer derives every other token from it via color-mix on a light base. */
export function deriveLandingTheme(brandColor?: string): LandingTheme {
  const primary = normalizeHexColor(brandColor);
  return primary
    ? { base: "light", primary, isDefault: false }
    : { base: "light", primary: LANDING_DEFAULT_BRAND, isDefault: true };
}

// ---------------------------------------------------------------------------
// GEO / SEO — schema.org JSON-LD from REAL facts only (no fabrication). This is
// the structured data AI search + Google rich results read; it is exactly what
// Ozvor's own audit rewards, so a generated site scores well by construction.
// ---------------------------------------------------------------------------

function priceLevelToRange(priceLevel: string): string | null {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE": return "Free";
    case "PRICE_LEVEL_INEXPENSIVE": return "$";
    case "PRICE_LEVEL_MODERATE": return "$$";
    case "PRICE_LEVEL_EXPENSIVE": return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "$$$$";
    default: return null;
  }
}

export function buildLocalBusinessJsonLd(input: LandingGenerateInput): Record<string, unknown> {
  const b = input.business;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
  };
  if (b.description) node["description"] = b.description;
  if (b.website) node["url"] = b.website;
  if (b.phone) node["telephone"] = b.phone;
  if (b.address) node["address"] = { "@type": "PostalAddress", streetAddress: b.address };
  if (b.lat != null && b.lng != null) {
    node["geo"] = { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng };
  }
  const range = b.priceLevel ? priceLevelToRange(b.priceLevel) : null;
  if (range) node["priceRange"] = range;
  const hours = formatHours(b.hours);
  if (hours) node["openingHours"] = hours;
  if (typeof b.rating === "number" && typeof b.reviewCount === "number" && b.reviewCount > 0) {
    node["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: b.rating,
      reviewCount: b.reviewCount,
    };
  }
  const reviews = (input.googleReviews ?? []).filter((r) => r.author && r.body).slice(0, 5);
  if (reviews.length > 0) {
    node["review"] = reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      ...(typeof r.rating === "number" ? { reviewRating: { "@type": "Rating", ratingValue: r.rating } } : {}),
      reviewBody: r.body,
    }));
  }
  return node;
}

/** FAQPage schema — only from FAQs with a REAL answer (placeholder answers are
 *  excluded so we never emit "[PLACEHOLDER…]" into structured data). */
export function buildFaqPageJsonLd(faqs: LandingFaqInput[]): Record<string, unknown> | null {
  const real = faqs.filter((f) => f.a && !f.a.includes("[PLACEHOLDER"));
  if (real.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: real.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// ---------------------------------------------------------------------------
// Section factories
// ---------------------------------------------------------------------------

interface NavLink {
  label: string;
  slug: string;
  page_type: LandingBundlePageType;
}

function seoFor(title: string, description: string): LandingPageSeo {
  return { title: title.slice(0, 70), description: description.slice(0, 160) };
}

function heroSection(
  business: LandingBusinessInput,
  headline: string,
  subheadline: string,
  heroImage?: LandingPhotoInput
): LandingSection {
  return {
    type: "hero",
    headline,
    subheadline,
    business_name: business.name,
    cta_label: "Get a Quote",
    // Rich fields only when Google Maps supplied them → existing hand-entered
    // businesses render byte-identically (no rating/image keys).
    ...(typeof business.rating === "number" ? { rating: business.rating } : {}),
    ...(typeof business.reviewCount === "number" ? { review_count: business.reviewCount } : {}),
    ...(heroImage
      ? { image: heroImage.src, image_alt: heroImage.alt, image_attribution: heroImage.attribution ?? null }
      : {}),
  };
}

function gallerySection(photos: LandingPhotoInput[]): LandingSection {
  return {
    type: "gallery",
    heading: "Photos",
    source: "Google",
    items: photos.slice(0, 12).map((p) => ({
      src: p.src,
      alt: p.alt,
      attribution: p.attribution ?? null,
    })),
  };
}

function servicesSection(services: string[]): LandingSection {
  return { type: "services", heading: "What We Do", items: services };
}

function mapNapSection(business: LandingBusinessInput): LandingSection {
  return {
    type: "map_nap",
    name: business.name,
    address: business.address ?? null,
    phone: business.phone ?? null,
    website: business.website ?? null,
    ...(typeof business.rating === "number" ? { rating: business.rating } : {}),
    ...(typeof business.reviewCount === "number" ? { review_count: business.reviewCount } : {}),
    ...(business.lat != null && business.lng != null ? { lat: business.lat, lng: business.lng } : {}),
  };
}

function hoursSection(business: LandingBusinessInput): LandingSection | null {
  const formatted = formatHours(business.hours);
  if (!formatted) return null;
  return { type: "hours", heading: "Hours", hours: formatted };
}

function areasSection(areas: string[]): LandingSection {
  return { type: "areas", heading: "Areas We Serve", items: areas };
}

function ctaSection(business: LandingBusinessInput): LandingSection {
  return {
    type: "cta",
    heading: `Ready to talk to ${business.name}?`,
    cta_label: "Contact Us",
    phone: business.phone ?? null,
    website: business.website ?? null,
  };
}

function trustSection(reviewThemes: string[], testimonialCount: number): LandingSection {
  return {
    type: "trust",
    heading: "Why Customers Choose Us",
    themes: reviewThemes,
    testimonial_count: testimonialCount,
  };
}

function proofSection(
  testimonials: LandingTestimonialInput[],
  googleReviews?: LandingReviewInput[]
): LandingSection {
  // Prefer verbatim Google reviews (attributed) when present — founder-approved.
  const gr = (googleReviews ?? []).filter((r) => r.author && r.body);
  if (gr.length > 0) {
    return {
      type: "proof",
      heading: "What people say",
      source: "Google",
      items: gr.slice(0, 6).map((r) => ({
        author: r.author,
        body: r.body,
        rating: r.rating ?? null,
        relative_time: r.relativeTime ?? null,
        source: "Google",
      })),
    };
  }
  if (testimonials.length === 0) {
    return { type: "proof", heading: "Customer Reviews", empty: true, note: "Reviews coming soon.", items: [] };
  }
  return {
    type: "proof",
    heading: "What Customers Say",
    items: testimonials.map((t) => ({
      author: t.author || "Verified customer",
      body: t.body,
      rating: t.rating ?? null,
    })),
  };
}

function faqSection(faqs: LandingFaqInput[]): LandingSection {
  return { type: "faq", heading: "Frequently Asked Questions", items: faqs };
}

function navLinksSection(links: NavLink[]): LandingSection {
  return {
    type: "text",
    role: "internal_links",
    heading: "Explore More",
    links: links.map((l) => ({ label: l.label, slug: l.slug })),
  };
}

// ---------------------------------------------------------------------------
// buildMockBundle — the deterministic correctness baseline
// ---------------------------------------------------------------------------

function buildMockBundle(input: LandingGenerateInput): LandingBundlePage[] {
  const business = input.business;
  const testimonials = (input.testimonials ?? []).slice(0, 20);
  const googleReviews = (input.googleReviews ?? []).filter((r) => r.author && r.body);
  const photos = (input.photos ?? []).filter((p) => p.src);
  const heroImage = photos[0];
  // Themes come from the richer source: Google reviews if we have them, else
  // the owner's authorized testimonials (both expose a `.body`).
  const reviewThemes =
    input.reviewThemes && input.reviewThemes.length > 0
      ? input.reviewThemes
      : deriveReviewThemes(
          (googleReviews.length > 0 ? googleReviews : testimonials) as LandingTestimonialInput[]
        );
  const area = primaryArea(business);
  const areas = allServiceAreas(business);
  const [svc1, svc2] = topServices(business, input.crawlSummary);
  const allServicesList = Array.from(
    new Set([...(input.crawlSummary?.services ?? []), svc1, svc2].map((s) => s.trim()).filter(Boolean))
  );

  // Slugs — computed once, shared "taken" set guarantees uniqueness across the bundle.
  const taken = new Set<string>(["", "faq", "proof"]);
  const homeSlug = "";
  const svc1Slug = uniqueSlug(`${svc1}-${area}`, taken);
  const svc2Slug = uniqueSlug(`${svc2}-${area}`, taken);
  const faqSlug = "faq";
  const proofSlug = "proof";

  const navLinks: NavLink[] = [
    { label: "Home", slug: homeSlug, page_type: "home" },
    { label: svc1, slug: svc1Slug, page_type: "service_city" },
    { label: svc2, slug: svc2Slug, page_type: "service_city" },
    { label: "FAQ", slug: faqSlug, page_type: "faq" },
    { label: "Reviews", slug: proofSlug, page_type: "proof" },
  ];
  const linksExcept = (slug: string): NavLink[] => navLinks.filter((l) => l.slug !== slug);

  // FAQ content: crawled (verbatim) → audit-gap-derived (targeted) → generic (fact-only filler).
  const crawlFaqs = (input.crawlSummary?.faqs ?? []).slice(0, 4).map((f) => ({ q: f.q, a: f.a }));
  const gapFaqs = (input.auditGaps ?? []).slice(0, 4).map((g) => faqFromGap(g, business));
  const generic = genericFaqs(business);
  const seenQ = new Set<string>();
  const faqs: LandingFaqInput[] = [];
  for (const f of [...crawlFaqs, ...gapFaqs, ...generic]) {
    const key = f.q.toLowerCase().trim();
    if (seenQ.has(key)) continue;
    seenQ.add(key);
    faqs.push(f);
    if (faqs.length >= 8) break;
  }

  const pages: LandingBundlePage[] = [];

  // 1. HOME
  pages.push({
    page_type: "home",
    slug: homeSlug,
    title: business.name,
    seo: seoFor(
      `${business.name}${business.category ? ` — ${business.category}` : ""}`,
      `${business.name} serves ${areas.join(", ")}.${business.category ? ` ${business.category}.` : ""}`
    ),
    sections: [
      heroSection(
        business,
        business.name,
        business.category ? `${business.category} serving ${areas.join(", ")}` : `Serving ${areas.join(", ")}`,
        heroImage
      ),
      ...(photos.length > 0 ? [gallerySection(photos)] : []),
      servicesSection(allServicesList),
      ...(hoursSection(business) ? [hoursSection(business) as LandingSection] : []),
      mapNapSection(business),
      trustSection(reviewThemes, googleReviews.length || testimonials.length),
      ...(googleReviews.length > 0 ? [proofSection(testimonials, googleReviews)] : []),
      ctaSection(business),
      navLinksSection(linksExcept(homeSlug)),
    ],
    jsonLd: [buildLocalBusinessJsonLd(input)],
  });

  // 2 & 3. SERVICE_CITY
  for (const [service, slug] of [[svc1, svc1Slug], [svc2, svc2Slug]] as const) {
    pages.push({
      page_type: "service_city",
      slug,
      title: `${service} in ${area}`,
      seo: seoFor(
        `${service} in ${area} | ${business.name}`,
        `${business.name} provides ${service} in ${area}.`
      ),
      sections: [
        heroSection(business, `${service} in ${area}`, `Local ${service.toLowerCase()} from ${business.name}`),
        servicesSection([service]),
        areasSection(areas),
        mapNapSection(business),
        ctaSection(business),
        navLinksSection(linksExcept(slug)),
      ],
    });
  }

  // 4. FAQ
  const faqJsonLd = buildFaqPageJsonLd(faqs);
  pages.push({
    page_type: "faq",
    slug: faqSlug,
    title: `FAQ — ${business.name}`,
    seo: seoFor(`Frequently Asked Questions | ${business.name}`, `Answers to common questions about ${business.name}.`),
    sections: [faqSection(faqs), ctaSection(business), navLinksSection(linksExcept(faqSlug))],
    ...(faqJsonLd ? { jsonLd: [faqJsonLd] } : {}),
  });

  // 5. PROOF
  pages.push({
    page_type: "proof",
    slug: proofSlug,
    title: `Reviews — ${business.name}`,
    seo: seoFor(`Customer Reviews | ${business.name}`, `What customers say about ${business.name}.`),
    sections: [
      proofSection(testimonials, googleReviews),
      trustSection(reviewThemes, googleReviews.length || testimonials.length),
      ctaSection(business),
      navLinksSection(linksExcept(proofSlug)),
    ],
    jsonLd: [buildLocalBusinessJsonLd(input)],
  });

  return pages;
}

// ---------------------------------------------------------------------------
// LLM enrichment — rewrites ONLY the hero headline/subheadline per page,
// grounded in facts already in the skeleton. Any failure → null (caller falls
// back to the mock skeleton). No new facts are ever introduced.
// ---------------------------------------------------------------------------

async function callProviderText(
  provider: ContentProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          // Haiku by default — 4× cheaper and plenty for fact-grounded page
          // composition (founder decision 2026-07-11); ANTHROPIC_MODEL overrides
          // per premium site.
          model: process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null;
    }
    if (provider === "openai" || provider === "perplexity") {
      const url =
        provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.perplexity.ai/chat/completions";
      const model =
        provider === "openai" ? process.env["OPENAI_MODEL"] ?? "gpt-4o" : process.env["PERPLEXITY_MODEL"] ?? "sonar";
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return (data.choices?.[0]?.message?.content ?? "").trim() || null;
    }
    // gemini
    const model = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichWithLlm(
  pages: LandingBundlePage[],
  input: LandingGenerateInput,
  apiKey: string,
  provider: ContentProvider
): Promise<LandingBundlePage[] | null> {
  const business = input.business;
  const nameCheck = sanitizeUserPrompt(business.name);
  if (nameCheck.rejected) return null;

  const systemPrompt = [
    "You write concise marketing headlines for local business websites.",
    "Use ONLY the facts given below — never invent statistics, reviews, awards, or claims not stated.",
    'Respond with STRICT JSON only: an array of {"slug": string, "headline": string, "subheadline": string}',
    "matching the page list given, one object per page, no extra commentary.",
  ].join(" ");

  const pageList = pages.map((p) => ({ slug: p.slug, page_type: p.page_type, title: p.title }));
  const userPromptParts = [
    `Business: ${nameCheck.sanitized}${business.category ? ` (${business.category})` : ""}.`,
    business.serviceAreas && business.serviceAreas.length > 0
      ? `Service areas: ${business.serviceAreas.join(", ")}.`
      : "",
    `Pages: ${JSON.stringify(pageList)}.`,
    "Write a short headline (max 70 chars) and subheadline (max 120 chars) for each page.",
  ].filter(Boolean);
  const userPrompt = userPromptParts.join(" ");

  const text = await callProviderText(provider, apiKey, systemPrompt, userPrompt, 800);
  if (!text) return null;

  let parsed: unknown;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const bySlug = new Map<string, { headline?: string; subheadline?: string }>();
  for (const entry of parsed as Array<{ slug?: unknown; headline?: unknown; subheadline?: unknown }>) {
    if (entry && typeof entry.slug === "string") {
      bySlug.set(entry.slug, {
        headline: typeof entry.headline === "string" ? entry.headline : undefined,
        subheadline: typeof entry.subheadline === "string" ? entry.subheadline : undefined,
      });
    }
  }
  if (bySlug.size === 0) return null;

  return pages.map((page) => {
    const rewrite = bySlug.get(page.slug);
    if (!rewrite?.headline) return page;
    return {
      ...page,
      sections: page.sections.map((sec) => {
        if (sec.type !== "hero") return sec;
        const fallbackSub = (sec["subheadline"] as string) ?? "";
        return {
          ...sec,
          headline: rewrite.headline!.slice(0, 70),
          subheadline: (rewrite.subheadline ?? fallbackSub).slice(0, 120),
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// buildLandingBundle — the exported entry point
// ---------------------------------------------------------------------------

/**
 * Build a 5-page bundle from real business facts. `mode: 'mock'` (default, or
 * whenever no apiKey is supplied) is the deterministic correctness baseline.
 * `mode: 'llm'` with an apiKey attempts a narrow, fact-grounded rewrite of
 * hero copy on the client's own key; on ANY failure it silently returns the
 * mock skeleton (never fails, never fabricates).
 */
export async function buildLandingBundle(
  input: LandingGenerateInput,
  opts?: LandingGenerateOptions
): Promise<LandingBundle> {
  const theme = deriveLandingTheme(input.brandColor);
  const skeleton = buildMockBundle(input);
  const wantsLlm = opts?.mode === "llm" && Boolean(opts.apiKey);
  if (!wantsLlm) {
    return { mode: "mock", pages: skeleton, theme };
  }
  try {
    const enriched = await enrichWithLlm(skeleton, input, opts!.apiKey as string, opts!.provider ?? "anthropic");
    return enriched ? { mode: "llm", pages: enriched, theme } : { mode: "mock", pages: skeleton, theme };
  } catch {
    return { mode: "mock", pages: skeleton, theme };
  }
}

// ---------------------------------------------------------------------------
// renderSectionsForScoring — turns a page's sections back into a small,
// synthetic HTML document so content-geo's scorePage() (built for real HTML)
// can score generated section JSON with the same primitives. Pure, no I/O.
// ---------------------------------------------------------------------------

export function renderSectionsForScoring(sections: LandingSection[]): string {
  const parts: string[] = [];
  for (const sec of sections) {
    switch (sec.type) {
      case "hero":
        parts.push(`<h1>${String(sec["headline"] ?? "")}</h1>`);
        parts.push(`<p>${String(sec["subheadline"] ?? "")}</p>`);
        break;
      case "services": {
        const items = Array.isArray(sec["items"]) ? (sec["items"] as unknown[]) : [];
        parts.push(`<h2>${String(sec["heading"] ?? "Services")}</h2>`);
        parts.push(`<ul>${items.map((i) => `<li>${String(i)}</li>`).join("")}</ul>`);
        break;
      }
      case "faq": {
        const items = Array.isArray(sec["items"]) ? (sec["items"] as LandingFaqInput[]) : [];
        parts.push(`<h2>${String(sec["heading"] ?? "FAQ")}</h2>`);
        parts.push('<script type="application/ld+json">{"@type":"FAQPage"}</script>');
        for (const it of items) {
          parts.push(`<h3>${String(it.q ?? "")}</h3><p>${String(it.a ?? "")}</p>`);
        }
        break;
      }
      case "proof": {
        const items = Array.isArray(sec["items"])
          ? (sec["items"] as Array<{ author?: string; body?: string }>)
          : [];
        parts.push(`<h2>${String(sec["heading"] ?? "Reviews")}</h2>`);
        parts.push(`<ul>${items.map((i) => `<li>"${String(i.body ?? "")}" — ${String(i.author ?? "")}</li>`).join("")}</ul>`);
        break;
      }
      case "map_nap":
        parts.push(`<p>${String(sec["name"] ?? "")} ${String(sec["address"] ?? "")} ${String(sec["phone"] ?? "")}</p>`);
        if (sec["website"]) parts.push(`<a href="${String(sec["website"])}">Website</a>`);
        break;
      case "areas": {
        const items = Array.isArray(sec["items"]) ? (sec["items"] as unknown[]) : [];
        parts.push(`<h3>${String(sec["heading"] ?? "Areas")}</h3><ul>${items.map((i) => `<li>${String(i)}</li>`).join("")}</ul>`);
        break;
      }
      case "hours":
        parts.push(`<p>${String(sec["hours"] ?? "")}</p>`);
        break;
      case "trust": {
        const themes = Array.isArray(sec["themes"]) ? (sec["themes"] as unknown[]) : [];
        parts.push(`<h3>${String(sec["heading"] ?? "")}</h3><p>${themes.join(", ")}</p>`);
        break;
      }
      case "cta":
        parts.push(`<h2>${String(sec["heading"] ?? "")}</h2>`);
        break;
      case "text": {
        const links = Array.isArray(sec["links"]) ? (sec["links"] as Array<{ label?: string }>) : [];
        parts.push(
          `<p>${String(sec["heading"] ?? "")} ${links.map((l) => `<a href="#">${String(l.label ?? "")}</a>`).join(" ")}</p>`
        );
        break;
      }
      default:
        break;
    }
  }
  return `<html><body>${parts.join("\n")}</body></html>`;
}
