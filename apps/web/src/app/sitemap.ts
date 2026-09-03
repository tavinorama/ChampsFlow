import type { MetadataRoute } from "next";
import { PUBLISHED_POSTS } from "./(marketing)/blog/posts";
import { lastModifiedFor } from "./route-lastmod";

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
    ["/ai-audit", "monthly", 0.8],
    ["/organicposts", "monthly", 0.8],
    ["/results", "monthly", 0.4],

    // GEO Search Runner — interactive game + lead magnet (top-of-funnel hook)
    ["/play", "monthly", 0.6],

    // Satellite pages (nav simplification) — friendly indexes that carry the
    // complexity moved off the home page.
    ["/compare", "monthly", 0.7],
    ["/faq", "monthly", 0.7],
    ["/research", "monthly", 0.7],

    // Comparison pages (P2) — high buyer-intent
    ["/vs", "monthly", 0.7],
    // P0-05: the six /vs/<competitor> pages are frozen and noindexed until their
    // claims are re-verified against each competitor's published pricing (see
    // (marketing)/vs/_claims.ts). A sitemap that advertises a noindexed page is
    // a contradiction we would only find out about in Search Console, so they
    // come out of the sitemap for as long as the freeze lasts and go back in
    // with the claims. /vs itself (the index) stays: it still lists them.

    // Resources — the premium GEO content (high-value citation-worthy assets)
    ["/resources", "monthly", 0.7],
    ["/resources/what-is-geo-search", "monthly", 0.9],
    ["/resources/geo-visibility-guide", "monthly", 0.8],
    ["/resources/5-high-citation-post-templates", "monthly", 0.8],
    ["/resources/llm-citation-tracker", "monthly", 0.8],

    // Booking
    ["/book", "monthly", 0.7],

    // Blog — index (individual articles + published videos are appended below,
    // generated from PUBLISHED_POSTS so the sitemap never advertises an
    // unpublished/placeholder page — the /blog/watch/* 500s came from hardcoding
    // placeholder video slugs here).
    ["/blog", "weekly", 0.7],

    // Legal / trust pages
    ["/privacy-policy", "yearly", 0.3],
    ["/terms-of-service", "yearly", 0.3],
    ["/legal/dpa", "yearly", 0.3],
    ["/legal/california-privacy", "yearly", 0.3],
    ["/legal/do-not-sell", "yearly", 0.3],
    ["/legal/dsr-request", "yearly", 0.3],
  ];

  // P1-04: lastModified is the date the CONTENT last changed, not the moment
  // this function ran. Stamping `now` told crawlers that all ~27 static routes
  // changed on every deploy, which trains them to ignore lastmod altogether —
  // including on the routes that genuinely did change.
  const staticEntries: MetadataRoute.Sitemap = routes.map(([path, changeFrequency, priority]) => ({
    url: `${SITE}${path}`,
    lastModified: lastModifiedFor(path, now),
    changeFrequency,
    priority,
  }));

  // Blog posts (articles at /blog/<slug>, published videos at /blog/watch/<slug>)
  // straight from PUBLISHED_POSTS — placeholder/unpublished videos are already
  // filtered out there, so the sitemap can never advertise a page that 404/500s.
  const blogEntries: MetadataRoute.Sitemap = PUBLISHED_POSTS.map((post) => ({
    url: post.type === "video"
      ? `${SITE}/blog/watch/${post.slug}`
      : `${SITE}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: "monthly",
    priority: post.type === "video" ? 0.6 : 0.7,
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

  return [...staticEntries, ...blogEntries, ...ozvorPagesEntries];
}
