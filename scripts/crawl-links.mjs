#!/usr/bin/env node
/**
 * crawl-links.mjs — sitemap + internal-link 200 crawler (P3.4).
 *
 * WHY: our sitemap.xml is generated (static routes + blog posts + Ozvor Pages)
 * and the marketing site has hand-authored nav/footer/CTA links. Both have
 * broken before — e.g. hardcoded `/blog/watch/*` slugs that 500'd until they
 * were tied to PUBLISHED_POSTS. A cheap GET-everything crawl catches a 404/500
 * the moment it ships instead of when a buyer (or an AI crawler) hits it.
 *
 * WHAT it checks:
 *   1. Every <loc> in `${BASE_URL}/sitemap.xml` (the canonical public surface).
 *   2. One hop of internal <a href> discovery from first-party "hub" pages
 *      (home, pricing, how-it-works, faq, compare, research, blog, resources,
 *      legal) — so a broken nav/footer link that ISN'T in the sitemap is caught.
 *
 * Same-origin only. Honors robots.txt Disallow prefixes (auth/app/token routes
 * are excluded on purpose — a login redirect there is not a "broken link").
 * External links, mailto:, tel:, and #fragments are skipped.
 *
 * USAGE:
 *   node scripts/crawl-links.mjs                      # crawls https://ozvor.com
 *   BASE_URL=http://localhost:3000 node scripts/crawl-links.mjs
 *   node scripts/crawl-links.mjs https://staging.ozvor.com
 *
 * EXIT: 0 = all reachable; 1 = one or more broken URLs (or the sitemap itself
 * could not be fetched). Non-zero fails the scheduled workflow loudly.
 */

const BASE_URL = (process.argv[2] || process.env.BASE_URL || "https://ozvor.com").replace(/\/+$/, "");
const ORIGIN = new URL(BASE_URL).origin;
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY || 10);
const TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS || 15000);
const USER_AGENT = "OzvorLinkCrawler/1.0 (+https://ozvor.com; launch link-health check)";

// Robots Disallow prefixes — kept in sync with apps/web/public/robots.txt. These
// are intentionally non-indexable (auth / app / per-buyer token routes); a
// redirect-to-login there is expected, not a broken link, so we never enqueue them.
const DISALLOW_PREFIXES = [
  "/account/",
  "/dashboard",
  "/brands",
  "/login",
  "/create",
  "/schedule",
  "/drafts/",
  "/kit/", // the /kit landing page stays indexable; only /kit/<token> is excluded
];

// First-party hub pages we extract internal links from (depth-1 discovery beyond
// the sitemap). We do NOT extract from client /l/* pages or individual blog
// posts — those are leaves; we only status-check them.
const HUB_PATHS = [
  "/",
  "/how-it-works",
  "/pricing",
  "/test",
  "/kit",
  "/organicposts",
  "/compare",
  "/faq",
  "/research",
  "/vs",
  "/blog",
  "/book",
  "/resources/what-is-geo-search",
];

/** Normalize a URL for dedupe: same-origin, strip fragment + trailing slash. */
function normalize(rawHref, fromUrl) {
  let u;
  try {
    u = new URL(rawHref, fromUrl);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null; // same-origin only
  if (!/^https?:$/.test(u.protocol)) return null; // no mailto:/tel:/etc.
  u.hash = "";
  // Collapse a bare trailing slash (but keep "/") so "/pricing" and "/pricing/"
  // are one bucket.
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;
  return u.toString();
}

function isDisallowed(pathname) {
  return DISALLOW_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")
  );
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml" },
    });
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("html") || ct.includes("xml") ? await res.text() : "";
    return { status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

/** Extract same-origin hrefs from an HTML string. */
function extractLinks(html, fromUrl) {
  const out = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = normalize(m[1], fromUrl);
    if (n) out.add(n);
  }
  return out;
}

/** Parse <loc>…</loc> entries out of a sitemap.xml body. */
function parseSitemap(xml) {
  const out = new Set();
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const n = normalize(m[1].replace(/&amp;/g, "&"), BASE_URL);
    if (n) out.add(n);
  }
  return out;
}

/** Run `worker` over `items` with a fixed concurrency. */
async function pool(items, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(`[crawl] base = ${BASE_URL}  (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS}ms)`);

  // --- Seed frontier: sitemap locs + hub pages ---
  const frontier = new Map(); // url -> foundOn (for reporting)
  const enqueue = (url, foundOn) => {
    if (!url) return;
    const path = new URL(url).pathname;
    if (isDisallowed(path)) return;
    if (!frontier.has(url)) frontier.set(url, foundOn);
  };

  let sitemapCount = 0;
  try {
    const sm = await fetchText(`${BASE_URL}/sitemap.xml`);
    if (sm.status !== 200) {
      console.error(`[crawl] FATAL: sitemap.xml returned ${sm.status}`);
      process.exit(1);
    }
    const locs = parseSitemap(sm.body);
    sitemapCount = locs.size;
    for (const u of locs) enqueue(u, "sitemap.xml");
  } catch (err) {
    console.error(`[crawl] FATAL: could not fetch sitemap.xml — ${err?.message || err}`);
    process.exit(1);
  }
  for (const p of HUB_PATHS) enqueue(`${ORIGIN}${p}`, "hub-seed");

  const hubUrls = new Set(HUB_PATHS.map((p) => `${ORIGIN}${p}`));
  console.log(`[crawl] seeded ${frontier.size} URLs (${sitemapCount} from sitemap + hubs)`);

  // --- Pass 1: check every seed; discover depth-1 links from hub pages ---
  const results = new Map(); // url -> { status, foundOn }
  const discovered = new Map(); // url -> foundOn
  await pool([...frontier.keys()], async (url) => {
    const foundOn = frontier.get(url);
    try {
      const { status, body } = await fetchText(url);
      results.set(url, { status, foundOn });
      if (status >= 200 && status < 300 && hubUrls.has(url) && body) {
        for (const link of extractLinks(body, url)) {
          const path = new URL(link).pathname;
          if (isDisallowed(path)) continue;
          if (!frontier.has(link) && !discovered.has(link)) discovered.set(link, url);
        }
      }
    } catch (err) {
      results.set(url, { status: `ERR:${err?.name || "fetch"}`, foundOn });
    }
  });

  // --- Pass 2: status-check newly discovered links (no further crawl) ---
  const newLinks = [...discovered.keys()].filter((u) => !results.has(u));
  await pool(newLinks, async (url) => {
    try {
      const { status } = await fetchText(url);
      results.set(url, { status, foundOn: discovered.get(url) });
    } catch (err) {
      results.set(url, { status: `ERR:${err?.name || "fetch"}`, foundOn: discovered.get(url) });
    }
  });

  // --- Report ---
  const broken = [];
  for (const [url, { status, foundOn }] of results) {
    const ok = typeof status === "number" && status >= 200 && status < 300;
    if (!ok) broken.push({ url, status, foundOn });
  }

  console.log(`[crawl] checked ${results.size} URLs (${newLinks.length} discovered beyond sitemap)`);
  if (broken.length === 0) {
    console.log(`[crawl] ✓ all URLs returned 2xx`);
    process.exit(0);
  }

  broken.sort((a, b) => a.url.localeCompare(b.url));
  console.error(`\n[crawl] ✗ ${broken.length} broken URL(s):`);
  for (const b of broken) {
    console.error(`  ${String(b.status).padEnd(10)} ${b.url}   (found on: ${b.foundOn})`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`[crawl] unexpected error: ${err?.stack || err}`);
  process.exit(1);
});
