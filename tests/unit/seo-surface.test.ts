/**
 * Unit — SEO surface honesty (2026-09-02 sweep, PENDING 10.A.11).
 *
 * Three pins:
 *  1. Every public (marketing) route directory has a sitemap entry — derived
 *     from the filesystem, so a new marketing page cannot silently ship
 *     invisible to crawlers. (Noindex or token-delivery routes are excluded
 *     explicitly, with the reason.)
 *  2. Token/delivery routes carry robots noindex, and the two public
 *     privacy-rights forms (/legal/do-not-sell, /legal/dsr-request) do NOT:
 *     they are in the sitemap on purpose (decision 2026-09-11, see their
 *     layout.tsx), so sitemap and robots must keep agreeing in that direction.
 *  3. robots.txt disallows the authenticated app + token subpaths while
 *     keeping the /kit and /ai-audit landing pages indexable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "../../apps/web");
const MARKETING = join(WEB, "src/app/(marketing)");
const SITEMAP_SRC = readFileSync(join(WEB, "src/app/sitemap.ts"), "utf8");

// Routes that exist under (marketing) but must NOT be in the sitemap, and why.
const SITEMAP_EXCLUDED: Record<string, string> = {
  "/welcome": "post-payment confirmation — metadata robots index:false",
};

describe("sitemap covers every public (marketing) route", () => {
  it("each (marketing) dir with a page.tsx appears in sitemap.ts (or is excluded with a reason)", () => {
    const dirs = readdirSync(MARKETING, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => existsSync(join(MARKETING, name, "page.tsx")));
    expect(dirs.length).toBeGreaterThan(10);
    for (const name of dirs) {
      const route = `/${name}`;
      if (SITEMAP_EXCLUDED[route]) continue;
      expect(SITEMAP_SRC, `sitemap.ts is missing ${route}`).toContain(`"${route}"`);
    }
  });

  it("excluded routes really are noindex (the exclusion reason stays true)", () => {
    const welcome = readFileSync(join(MARKETING, "welcome/page.tsx"), "utf8");
    expect(welcome).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("the public privacy-rights forms are in the sitemap AND indexable (no contradiction either way)", () => {
    // 10.A.11 (#572) noindexed these two and pulled them from the sitemap while
    // the P1-04 E2E (#589) still listed them as indexable routes; the suite
    // stayed red on main until the contradiction was resolved in favour of
    // indexable (they are the CCPA opt-out and GDPR/LGPD request channels,
    // linked from the privacy policy, and carry no personal data).
    for (const route of ["/legal/do-not-sell", "/legal/dsr-request"]) {
      expect(SITEMAP_SRC, `sitemap.ts is missing ${route}`).toContain(`"${route}"`);
      const layout = readFileSync(join(WEB, `src/app${route}/layout.tsx`), "utf8");
      expect(layout, `${route} is in the sitemap but its layout says noindex`).not.toMatch(/index:\s*false/);
    }
  });
});

describe("token/delivery routes are noindex", () => {
  for (const rel of [
    "src/app/(marketing)/ai-audit/[token]/layout.tsx",
    "src/app/(marketing)/kit/[token]/layout.tsx",
  ]) {
    it(`${rel} declares robots index:false`, () => {
      const src = readFileSync(join(WEB, rel), "utf8");
      expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
    });
  }
});

describe("robots.txt blocks the app surface, keeps landings indexable", () => {
  const robots = readFileSync(join(WEB, "public/robots.txt"), "utf8");
  const lines = robots.split("\n").map((l) => l.trim());
  for (const path of [
    "/admin",
    "/dashboard",
    "/dashboard-v3",
    "/ai-audit/",
    "/kit/",
    "/r/",
    "/agency",
    "/competitors",
    "/sources",
    "/marketing",
    "/landing-pages",
  ]) {
    it(`disallows ${path}`, () => {
      expect(lines).toContain(`Disallow: ${path}`);
    });
  }
  it("does NOT block the /ai-audit and /kit landing pages themselves", () => {
    expect(lines).not.toContain("Disallow: /ai-audit");
    expect(lines).not.toContain("Disallow: /kit");
  });
});
