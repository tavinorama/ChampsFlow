/**
 * json-ld.ts — pure JSON-LD builders for public Ozvor Pages sites
 * (issue #208, PR-6).
 *
 * Every field comes from the site's own stored business facts / sections —
 * NEVER invented. Absent facts are simply omitted from the schema rather
 * than fabricated (audit integrity rule, postmortem PR#90).
 *
 * Pure/DB-free/React-free — unit-testable without a DOM.
 */

interface JsonLdBusiness {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
}

// ---------------------------------------------------------------------------
// safeJsonLd — HTML-script-safe serialization (Hermes review, #216).
//
// The JSON-LD objects contain TENANT-CONTROLLED strings (business name, FAQ
// text). Raw JSON.stringify inside <script type="application/ld+json"> lets a
// stored `</script><script>…` break out of the tag on the PUBLIC site (XSS).
// Escaping <, >, & as \uXXXX keeps the payload byte-identical after
// JSON.parse (unicode escapes are plain JSON) while making it inert as HTML.
// U+2028/2029 are escaped for JS-context safety too.
// ---------------------------------------------------------------------------
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ---------------------------------------------------------------------------
// safeHref — allowlist for STORED website URLs rendered into <a href>
// (Hermes follow-up, #216). Only http(s) survives; anything else — including
// `javascript:`, `data:`, protocol-relative `//evil` — returns null and the
// caller renders plain text instead. A bare domain gets https:// prefixed.
// ---------------------------------------------------------------------------
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    ? value
    : value.startsWith("//")
      ? `https:${value}`
      : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
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
