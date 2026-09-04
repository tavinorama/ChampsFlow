/**
 * seo-routes.test.ts — P1-04, the cheap technical SEO the audit found broken.
 *
 * Findings this locks:
 *   - 38 pages titled "… | Ozvor | Ozvor" (the root layout template already
 *     appends the brand, and pages appended it again by hand),
 *   - 5 indexable routes with no canonical,
 *   - 11 pages with no OG image,
 *   - sitemap lastmod stamped with the deploy timestamp instead of the content
 *     date.
 *
 * The check is a source scan rather than a crawl. That is deliberate: a crawl
 * needs a running stack and lands in the Playwright job, which on this repo has
 * been red-and-invisible, so it would not actually stop a regression. This runs
 * in the default `npx vitest run` gate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { bareTitle, canonicalUrl, pageMetadata } from "../../apps/web/src/lib/seo";
import { ROUTE_LAST_MODIFIED, lastModifiedFor } from "../../apps/web/src/app/route-lastmod";

const APP = "apps/web/src/app";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Every static route the sitemap advertises, parsed from sitemap.ts itself so
 * the test cannot drift from what is actually published.
 */
function sitemapRoutes(): string[] {
  const src = read(`${APP}/sitemap.ts`);
  const block = src.slice(src.indexOf("const routes:"), src.indexOf("const staticEntries"));
  return [...block.matchAll(/\["(\/[^"]*)",/g)].map((m) => m[1]!);
}

/**
 * The page file that serves a route, if it is a plain static page. Dynamic
 * routes (/blog/[slug]) and rewrites (/play is static HTML) have no single
 * file here and are skipped by the callers that need one.
 */
function pageFileFor(route: string): string | null {
  const rel = route === "/" ? "" : route;
  for (const dir of [`${APP}/(marketing)${rel}`, `${APP}${rel}`]) {
    for (const ext of ["page.tsx", "page.ts"]) {
      const p = `${dir}/${ext}`.replace(/\/+/g, "/");
      if (existsSync(resolve(process.cwd(), p))) return p;
    }
  }
  return null;
}

describe("P1-04 — the metadata helper", () => {
  it("strips a doubled brand suffix, however many times it was appended", () => {
    expect(bareTitle("Privacy Policy | Ozvor")).toBe("Privacy Policy");
    expect(bareTitle("Privacy Policy | Ozvor | Ozvor")).toBe("Privacy Policy");
    expect(bareTitle("How we measure — Ozvor")).toBe("How we measure");
    // A title that legitimately contains the brand mid-string keeps it.
    expect(bareTitle("Compare Ozvor to other tools")).toBe("Compare Ozvor to other tools");
  });

  it("builds a canonical without a trailing slash, and keeps root as root", () => {
    expect(canonicalUrl("/")).toBe("https://ozvor.com");
    expect(canonicalUrl("/pricing")).toBe("https://ozvor.com/pricing");
    expect(canonicalUrl("/pricing/")).toBe("https://ozvor.com/pricing");
  });

  it("always emits canonical, OG image and a social title carrying the brand", () => {
    const m = pageMetadata({ title: "Pricing | Ozvor", description: "d", path: "/pricing" });
    expect(m.title).toBe("Pricing"); // document title — template adds the brand
    expect(m.alternates?.canonical).toBe("https://ozvor.com/pricing");
    // The Next.js title template does NOT apply to OG, so the brand must be
    // explicit there. Getting this asymmetry wrong in one direction or the
    // other is exactly what produced the doubled titles.
    expect(m.openGraph?.title).toBe("Pricing | Ozvor");
    expect(JSON.stringify(m.openGraph?.images)).toContain("/og-default.png");
    expect(JSON.stringify(m.twitter)).toContain("/og-default.png");
  });
});

describe("P1-04 — no route ships a doubled brand suffix", () => {
  it("no top-level title: field ends in the brand", () => {
    // The root layout owns the suffix (template: "%s | Ozvor"). A page-level
    // title that also carries it renders "X | Ozvor | Ozvor".
    const src = read(`${APP}/layout.tsx`);
    expect(src).toContain("template: `%s | ${SITE_NAME}`");

    const offenders: string[] = [];
    for (const route of sitemapRoutes()) {
      const f = pageFileFor(route);
      if (!f) continue;
      const body = read(f);
      // Indentation alone cannot tell a top-level title from a nested one: in
      // `export const metadata = {…}` the openGraph keys sit at 4 spaces, and
      // in a `generateMetadata` return the TOP-LEVEL keys sit at 4 too. So
      // track whether we are inside an openGraph/twitter block, where the
      // brand suffix is CORRECT (the Next.js title template does not reach it).
      let inSocial = 0;
      for (const line of body.split("\n")) {
        if (inSocial > 0) {
          inSocial += (line.match(/\{/g) ?? []).length;
          inSocial -= (line.match(/\}/g) ?? []).length;
          continue;
        }
        if (/^\s*(openGraph|twitter):\s*\{/.test(line)) {
          inSocial = 1 + (line.match(/\{/g) ?? []).length - 1 - (line.match(/\}/g) ?? []).length;
          if (inSocial < 1) inSocial = 0;
          continue;
        }
        if (/^\s*title:/.test(line) && /\|\s*Ozvor\s*[`"'],?$/.test(line.trim())) {
          offenders.push(`${f}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, `doubled brand suffix in:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("P1-04 — every indexable route carries canonical, OG and a single H1", () => {
  const routes = sitemapRoutes();

  it("the sitemap actually lists routes (guard against a broken parse)", () => {
    expect(routes.length).toBeGreaterThan(15);
    expect(routes).toContain("/pricing");
  });

  it("each static route declares a canonical", () => {
    const missing: string[] = [];
    for (const route of routes) {
      const f = pageFileFor(route);
      if (!f) continue;
      // A client-component page cannot export metadata, so its canonical may
      // legitimately live in a sibling layout.tsx (see /legal/do-not-sell).
      const layout = f.replace(/page\.tsx?$/, "layout.tsx");
      const sources = [read(f)];
      if (existsSync(resolve(process.cwd(), layout))) sources.push(read(layout));
      const hasCanonical = sources.some(
        (src) => /alternates:\s*\{[^}]*canonical/s.test(src) || /pageMetadata\(/.test(src)
      );
      if (!hasCanonical) missing.push(`${route} (${f})`);
    }
    expect(missing, `no canonical on:\n${missing.join("\n")}`).toEqual([]);
  });

  it("each static route resolves an OG image", () => {
    // Either the page names its own, or it inherits the root layout's default.
    // The root default is what makes the second case safe, so assert it exists.
    expect(read(`${APP}/layout.tsx`)).toContain("/og-default.png");
    const missing: string[] = [];
    for (const route of routes) {
      const f = pageFileFor(route);
      if (!f) continue;
      const body = read(f);
      // A page that opens an openGraph block MUST fill in images: a page-level
      // openGraph REPLACES the layout's, so a partial block ships no social
      // card at all. The `images:` key has to be found INSIDE that block — an
      // earlier version of this check looked anywhere in the file and so missed
      // four routes (/support, /refund, /legal/cookies, /legal/sub-processors)
      // that were confirmed by curl to serve zero og:image tags.
      const ogAt = body.indexOf("openGraph: {");
      if (ogAt === -1) continue; // inherits the layout's block wholesale — fine
      let depth = 0;
      let end = ogAt;
      for (let i = body.indexOf("{", ogAt); i < body.length; i++) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (!/images:/.test(body.slice(ogAt, end))) missing.push(`${route} (${f})`);
    }
    expect(missing, `openGraph block with no images on:\n${missing.join("\n")}`).toEqual([]);
  });

  // H1 is asserted in tests/e2e/seo-metadata.spec.ts instead. A source scan
  // cannot distinguish three <h1> in mutually exclusive early-return branches
  // (/legal/do-not-sell: form / success / rate-limited) from three that render
  // together, and pages that delegate the heading to a child component look
  // like they have none. Both were false positives here; only a rendered
  // document can answer the question.

  it("no indexable route quietly noindexes itself", () => {
    // A route in the sitemap that also says noindex is a contradiction we
    // should see in CI rather than in Search Console.
    const contradictions: string[] = [];
    for (const route of routes) {
      const f = pageFileFor(route);
      if (!f) continue;
      if (/index:\s*false/.test(read(f))) contradictions.push(`${route} (${f})`);
    }
    expect(contradictions, `in the sitemap but noindexed:\n${contradictions.join("\n")}`).toEqual([]);
  });
});

describe("P1-04 — sitemap lastmod is a content date, not the deploy time", () => {
  it("sitemap.ts no longer stamps static routes with `now`", () => {
    const src = read(`${APP}/sitemap.ts`);
    expect(src).toContain("lastModified: lastModifiedFor(path, now)");
    // Blog and Ozvor Pages keep their own real dates; `now` survives only as
    // their fallback, never as the value for a static route.
    expect(src).not.toMatch(/url: `\$\{SITE\}\$\{path\}`,\s*lastModified: now,/);
  });

  it("every static sitemap route has a recorded content date", () => {
    const missing = sitemapRoutes().filter((r) => !ROUTE_LAST_MODIFIED[r]);
    expect(missing, `no content date recorded for:\n${missing.join("\n")}`).toEqual([]);
  });

  it("falls back rather than throwing on an unknown or malformed date", () => {
    const fb = new Date("2026-01-01T00:00:00Z");
    expect(lastModifiedFor("/does-not-exist", fb)).toEqual(fb);
    expect(lastModifiedFor("/pricing", fb).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });
});
