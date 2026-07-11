import type { MetadataRoute } from "next";

/**
 * sitemap.xml — public, AI-crawlable surface of Ozvor.
 *
 * Lists only indexable marketing/content/legal routes, PLUS every published
 * Ozvor Pages site/page (issue #208, PR-6) fetched from the lightweight
 * `GET /api/public/landing-sitemap` (slugs + updated_at only, capped 500).
 * Authenticated app routes (/dashboard, /brands, /account/*), legacy routes
 * (/create, /schedule), and per-buyer Kit delivery tokens (/kit/[token]) are
 * intentionally excluded and also Disallowed in public/robots.txt.
 *
 * The Ozvor Pages fetch is wrapped in try/catch with a short timeout so the
 * sitemap NEVER breaks (falls back to the static routes only) if the API is
 * down — a broken sitemap.xml would hurt every OTHER page's crawlability too.
 *
 * GEO note: keeping a clean, current sitemap is one of the levers Google's own
 * AI-search guidance endorses (crawlability) — it helps AI answer engines and
 * traditional crawlers discover and re-index our citation-worthy content.
 */

const SITE = "https://ozvor.com";
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

interface LandingSitemapEntry {
  site_slug: string;
  page_slug: string;
  updated_at: string;
}

/**
 * Fetches published Ozvor Pages site/page slugs for the sitemap. Never
 * throws — any failure (network, non-200, malformed JSON, timeout) resolves
 * to an empty array so the rest of the sitemap always renders.
 */
async function fetchLandingSitemapEntries(): Promise<LandingSitemapEntry[]> {
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/public/landing-sitemap`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { pages?: LandingSitemapEntry[] };
    return Array.isArray(data.pages) ? data.pages : [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // [path, changeFrequency, priority]
  const routes: Array<[string, MetadataRoute.Sitemap[number]["changeFrequency"], number]> = [
    ["/", "weekly", 1.0],
    ["/how-it-works", "monthly", 0.9],
    ["/pricing", "monthly", 0.95],
    ["/test", "weekly", 0.9],
    ["/kit", "monthly", 0.8],
    ["/organicposts", "monthly", 0.8],
    ["/results", "monthly", 0.4],

    // Satellite pages (nav simplification) — friendly indexes that carry the
    // complexity moved off the home page.
    ["/compare", "monthly", 0.7],
    ["/faq", "monthly", 0.7],
    ["/research", "monthly", 0.7],

    // Comparison pages (P2) — high buyer-intent
    ["/vs", "monthly", 0.7],
    ["/vs/profound", "monthly", 0.7],
    ["/vs/peec", "monthly", 0.7],
    ["/vs/otterly", "monthly", 0.7],
    ["/vs/athenahq", "monthly", 0.7],
    ["/vs/semrush-ai", "monthly", 0.6],
    ["/vs/ahrefs-brand-radar", "monthly", 0.6],

    // Resources — the premium GEO content (high-value citation-worthy assets)
    ["/resources/what-is-geo-search", "monthly", 0.9],
    ["/resources/geo-visibility-guide", "monthly", 0.8],
    ["/resources/5-high-citation-post-templates", "monthly", 0.8],
    ["/resources/llm-citation-tracker", "monthly", 0.8],

    // Booking
    ["/book", "monthly", 0.7],

    // Blog — articles
    ["/blog", "weekly", 0.7],
    ["/blog/how-small-businesses-get-cited-by-chatgpt", "monthly", 0.7],
    ["/blog/why-small-businesses-stop-posting", "monthly", 0.6],

    // Blog — videos (placeholder slugs; update when real videos are published)
    ["/blog/watch/what-is-geo-and-why-it-matters", "monthly", 0.6],
    ["/blog/watch/ozvor-audit-walkthrough", "monthly", 0.6],

    // Legal / trust pages
    ["/privacy-policy", "yearly", 0.3],
    ["/terms-of-service", "yearly", 0.3],
    ["/legal/dpa", "yearly", 0.3],
    ["/legal/california-privacy", "yearly", 0.3],
    ["/legal/do-not-sell", "yearly", 0.3],
    ["/legal/dsr-request", "yearly", 0.3],
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map(([path, changeFrequency, priority]) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  const landingEntries = await fetchLandingSitemapEntries();
  const ozvorPagesEntries: MetadataRoute.Sitemap = landingEntries.map((entry) => ({
    url: entry.page_slug
      ? `${SITE}/l/${entry.site_slug}/${entry.page_slug}`
      : `${SITE}/l/${entry.site_slug}`,
    lastModified: entry.updated_at ? new Date(entry.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticEntries, ...ozvorPagesEntries];
}
