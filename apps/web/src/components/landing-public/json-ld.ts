/**
 * json-ld.ts — pure JSON-LD builders for public Ozvor Pages sites
 * (issue #208, PR-6).
 *
 * Every field comes from the site's own stored business facts / sections —
 * NEVER invented. Absent facts are simply omitted from the schema rather
 * than fabricated (audit integrity rule, postmortem PR#90).
 *
 * safeJsonLd + safeHref (Hermes review, #216) moved to
 * ../../lib/safe-json-ld.ts as the single source of truth (QA Audit V2,
 * #238 — every marketing page needs them, not just landing-page sites).
 * Re-exported here so existing `from "../../components/landing-public/json-ld"`
 * imports keep working unchanged.
 *
 * Pure/DB-free/React-free — unit-testable without a DOM.
 */

export { safeJsonLd, safeHref } from "../../lib/safe-json-ld";

interface JsonLdBusiness {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
}

/** home page → LocalBusiness, built ONLY from present business facts. */
export function buildLocalBusinessJsonLd(
  siteSlug: string,
  business: unknown
): Record<string, unknown> | null {
  if (!business || typeof business !== "object") return null;
  const b = business as JsonLdBusiness;
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : null;
  if (!name) return null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: `https://ozvor.com/l/${siteSlug}`,
  };
  if (typeof b.address === "string" && b.address.trim()) jsonLd.address = b.address.trim();
  if (typeof b.phone === "string" && b.phone.trim()) jsonLd.telephone = b.phone.trim();
  if (typeof b.website === "string" && b.website.trim()) jsonLd.sameAs = [b.website.trim()];
  return jsonLd;
}

/**
 * faq page → FAQPage, built from a page's own "faq" section (if any).
 * Returns null when the page carries no faq section or the section has no
 * complete question/answer pairs (never renders an empty FAQPage schema).
 */
export function buildFaqJsonLd(sections: unknown): Record<string, unknown> | null {
  if (!Array.isArray(sections)) return null;
  const faqSection = sections.find(
    (s) => s && typeof s === "object" && !Array.isArray(s) && (s as Record<string, unknown>).type === "faq"
  ) as Record<string, unknown> | undefined;
  if (!faqSection) return null;

  const rawItems = Array.isArray(faqSection.items) ? faqSection.items : [];
  const mainEntity = rawItems
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object" && !Array.isArray(it))
    .map((it) => ({
      q: typeof it.q === "string" ? it.q : "",
      a: typeof it.a === "string" ? it.a : "",
    }))
    .filter((it) => it.q && it.a)
    .map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    }));

  if (mainEntity.length === 0) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity };
}

/** subpages → BreadcrumbList (site home → this page). */
export function buildBreadcrumbJsonLd(
  siteSlug: string,
  siteName: string,
  pageTitle: string,
  pageSlug: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: siteName,
        item: `https://ozvor.com/l/${siteSlug}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: pageTitle || pageSlug,
        item: `https://ozvor.com/l/${siteSlug}/${pageSlug}`,
      },
    ],
  };
}
