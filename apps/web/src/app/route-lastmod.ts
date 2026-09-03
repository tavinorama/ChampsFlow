/**
 * route-lastmod.ts — real content dates for the sitemap. P1-04.
 *
 * The sitemap stamped every static route with `new Date()`, i.e. the moment the
 * page was rendered. That tells a crawler "all 30 pages changed just now",
 * every single deploy, whether or not a word moved. The signal is worse than
 * useless: a sitemap that cries wolf on every route trains crawlers to ignore
 * lastmod entirely, including on the routes that genuinely did change.
 *
 * Blog posts and Ozvor Pages already carry real dates (publishedAt /
 * updated_at). These are the static routes, which have no date anywhere in the
 * system — so the date lives here, next to the route, and is bumped by whoever
 * meaningfully changes the page. Being explicit is the point: a value a human
 * has to touch is a value that means something, and a stale entry here is
 * honest (the page really has not changed) in a way `new Date()` never is.
 *
 * Anything absent from this map falls back to the build date, which is at least
 * no worse than today's behaviour — and the CI guard in
 * tests/unit/seo-routes.test.ts fails when a sitemap route has no entry, so the
 * fallback should stay unused.
 */

/** ISO date (YYYY-MM-DD) each static route's content last meaningfully changed. */
export const ROUTE_LAST_MODIFIED: Record<string, string> = {
  "/": "2026-08-17",
  "/how-it-works": "2026-06-27",
  "/pricing": "2026-08-10",
  "/test": "2026-08-17",
  "/kit": "2026-07-20",
  "/ai-audit": "2026-08-13",
  "/organicposts": "2026-07-20",
  "/results": "2026-06-27",
  "/play": "2026-07-10",
  "/compare": "2026-09-03",
  "/vs": "2026-09-03",
  "/resources": "2026-07-20",
  "/research": "2026-06-27",
  "/how-we-measure": "2026-06-27",
  "/faq": "2026-06-27",
  "/local-pages": "2026-07-10",
  // Rotas que o #572 acrescentou ao sitemap; datas = último commit real que
  // tocou cada página (git log), não a data do merge.
  "/agencies": "2026-09-02",
  "/learn": "2026-08-22",
  "/support": "2026-06-27",
  "/blog": "2026-08-17",
  "/privacy-policy": "2026-06-13",
  "/terms-of-service": "2026-06-13",
  "/legal/dpa": "2026-06-13",
  "/legal/california-privacy": "2026-06-13",
  "/legal/do-not-sell": "2026-06-13",
  "/legal/dsr-request": "2026-06-13",
  "/legal/cookies": "2026-06-13",
  "/legal/sub-processors": "2026-06-13",
  "/refund": "2026-06-13",
  "/resources/what-is-geo-search": "2026-07-20",
  "/resources/geo-visibility-guide": "2026-07-20",
  "/resources/5-high-citation-post-templates": "2026-07-20",
  "/resources/llm-citation-tracker": "2026-07-20",
  "/book": "2026-08-13",
};

/**
 * The date to publish for a static route.
 *
 * NOT VERIFIED: the dates above were taken from the "last updated" strings the
 * legal pages render and from the dated notes in each file's header comment.
 * They were not derived from git history, so treat them as a floor — a page may
 * have changed more recently than its entry says. Under-claiming freshness is
 * the safe direction; over-claiming it is what the old behaviour did.
 */
export function lastModifiedFor(path: string, fallback: Date): Date {
  const iso = ROUTE_LAST_MODIFIED[path];
  if (!iso) return fallback;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}
