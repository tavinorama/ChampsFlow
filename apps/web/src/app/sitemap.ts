import type { MetadataRoute } from "next";

/**
 * sitemap.xml — public, AI-crawlable surface of TrustIndex AI.
 *
 * Lists only indexable marketing/content/legal routes. Authenticated app
 * routes (/dashboard, /brands, /account/*), legacy routes (/create, /schedule),
 * and per-buyer Kit delivery tokens (/kit/[token]) are intentionally excluded
 * and also Disallowed in public/robots.txt.
 *
 * GEO note: keeping a clean, current sitemap is one of the levers Google's own
 * AI-search guidance endorses (crawlability) — it helps AI answer engines and
 * traditional crawlers discover and re-index our citation-worthy content.
 */

const SITE = "https://ozvor.com";

export default function sitemap(): MetadataRoute.Sitemap {
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
    ["/blog/watch/trustindex-ai-audit-walkthrough", "monthly", 0.6],

    // Legal / trust pages
    ["/privacy-policy", "yearly", 0.3],
    ["/terms-of-service", "yearly", 0.3],
    ["/legal/dpa", "yearly", 0.3],
    ["/legal/california-privacy", "yearly", 0.3],
    ["/legal/do-not-sell", "yearly", 0.3],
    ["/legal/dsr-request", "yearly", 0.3],
  ];

  return routes.map(([path, changeFrequency, priority]) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
