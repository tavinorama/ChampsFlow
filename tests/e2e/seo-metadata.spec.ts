/**
 * seo-metadata.spec.ts — P1-04, the rendered half.
 *
 * tests/unit/seo-routes.test.ts locks what a source scan can honestly answer
 * (doubled brand suffix, canonical declared, OG images, sitemap lastmod). Two
 * things it cannot: how many H1s a page actually renders, and what the served
 * document title ends up being once the layout template has been applied. A
 * static count reads three <h1> in mutually exclusive early-return branches as
 * a bug, and reads a page that delegates its heading to a child component as
 * having none. Both were false positives; only a rendered document answers it.
 *
 * Run against a running stack:
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/seo-metadata.spec.ts --project=chromium-desktop
 *
 * The route list is the sitemap's static routes. Dynamic routes are covered by
 * one representative each.
 */
import { test, expect } from "@playwright/test";

const ROUTES = [
  "/",
  "/how-it-works",
  "/pricing",
  "/test",
  "/kit",
  "/ai-audit",
  "/organicposts",
  "/results",
  "/compare",
  "/vs",
  "/resources",
  "/resources/what-is-geo-search",
  "/resources/geo-visibility-guide",
  "/resources/5-high-citation-post-templates",
  "/resources/llm-citation-tracker",
  "/research",
  "/how-we-measure",
  "/faq",
  "/local-pages",
  "/support",
  "/book",
  "/blog",
  "/privacy-policy",
  "/terms-of-service",
  "/refund",
  "/legal/dpa",
  "/legal/cookies",
  "/legal/sub-processors",
  "/legal/california-privacy",
] as const;

/**
 * Rotas deliberadamente FORA do sitemap e marcadas noindex (10.A.11): são
 * formulários de pedido de dados pessoais, que nunca devem aparecer na busca.
 * Estavam na lista acima — que se descreve como "as rotas estáticas do
 * sitemap" — e por isso o E2E exigia delas o oposto do que o produto decidiu,
 * falhando com "in the sitemap but noindexed". A contradição era do teste, não
 * do produto. Aqui elas continuam cobertas, pelo contrato certo: têm de estar
 * noindex E fora do sitemap.
 */
const NOINDEX_ROUTES = ["/legal/do-not-sell", "/legal/dsr-request"] as const;

test.describe("P1-04 — every indexable route", () => {
  test.use({ reducedMotion: "reduce" });

  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      // "load", not "domcontentloaded": the App Router streams metadata, so on a
      // cold dev compile the <head> tags can still be arriving when DOM content
      // is done — which made this suite fail on 12 routes that were in fact
      // correct. Waiting for load removes that race.
      const resp = await page.goto(route, { waitUntil: "load" });

      // Status. A route the sitemap advertises must actually serve.
      expect(resp?.status(), `${route} did not answer 200`).toBe(200);

      // Title: present, and the brand appears at most once. The root layout's
      // template appends "| Ozvor"; a page that appends it too renders
      // "X | Ozvor | Ozvor", which is what the audit found on 38 pages.
      const title = await page.title();
      expect(title.length, `${route} has an empty <title>`).toBeGreaterThan(0);
      // Precise: the brand may legitimately appear inside a title ("Compare
      // Ozvor to other AI-visibility tools"). What must never happen is the
      // SUFFIX appearing twice at the end.
      expect(
        title,
        `${route} title ends with a doubled brand suffix: "${title}"`
      ).not.toMatch(/[|—–-]\s*Ozvor\s*[|—–-]\s*Ozvor\s*$/i);

      // Canonical.
      const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href");
      expect(canonical, `${route} has no canonical`).toBeTruthy();
      expect(canonical, `${route} canonical is not absolute`).toMatch(/^https?:\/\//);

      // OG image — either the page's own or the root layout's default.
      const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
      expect(og, `${route} has no og:image`).toBeTruthy();

      // Robots: a route in the sitemap must not tell crawlers to stay out.
      const robots = await page.locator('meta[name="robots"]').first().getAttribute("content").catch(() => null);
      if (robots) {
        expect(robots, `${route} is in the sitemap but noindexed`).not.toMatch(/\bnoindex\b/);
      }

      // Exactly one VISIBLE H1. Counting visible ones is what makes this
      // meaningful where a static scan is not: mutually exclusive branches
      // contribute at most one to the rendered document.
      const h1s = page.locator("h1:visible");
      await expect(h1s, `${route} must render exactly one visible <h1>`).toHaveCount(1);
    });
  }
});

test.describe("P1-04 — sitemap", () => {
  test("lastmod is a content date, not this morning's deploy", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const mods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
    expect(mods.length).toBeGreaterThan(10);

    // The defect: every static route stamped with `new Date()`, so all of them
    // shared one timestamp and all of them were "today". If more than half the
    // entries carry the same value, we are back to stamping the deploy.
    const counts = new Map<string, number>();
    for (const m of mods) counts.set(m, (counts.get(m) ?? 0) + 1);
    const biggest = Math.max(...counts.values());
    expect(
      biggest,
      `${biggest}/${mods.length} sitemap entries share one lastmod — that is a deploy timestamp, not content dates`
    ).toBeLessThan(mods.length / 2);
  });

  test("does not advertise a noindexed page", async ({ request, page }) => {
    // The /vs/<competitor> pages are frozen and noindexed under P0-05; the
    // sitemap must not still be pointing crawlers at them.
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toMatch(/<loc>[^<]*\/vs\/[a-z-]+<\/loc>/);
    // …and the freeze is real, not just absent from the sitemap.
    await page.goto("/vs/profound", { waitUntil: "domcontentloaded" });
    const robots = await page.locator('meta[name="robots"]').first().getAttribute("content");
    expect(robots).toMatch(/noindex/);
  });
});

test.describe("10.A.11 — rotas de pedido de dados ficam fora da busca", () => {
  for (const route of NOINDEX_ROUTES) {
    test(`${route} é noindex e não está no sitemap`, async ({ page, baseURL }) => {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${route} não respondeu 200`).toBe(200);

      const robots = await page
        .locator('meta[name="robots"]')
        .first()
        .getAttribute("content")
        .catch(() => null);
      expect(robots, `${route} devia declarar noindex e não declara`).toMatch(/\bnoindex\b/);

      const sitemap = await page.request.get(`${baseURL}/sitemap.xml`);
      expect(sitemap.ok(), "sitemap.xml não respondeu").toBe(true);
      const xml = await sitemap.text();
      expect(xml, `${route} é noindex mas está anunciado no sitemap`).not.toContain(`${route}<`);
    });
  }
});
