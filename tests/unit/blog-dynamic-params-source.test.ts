/**
 * Source guard — registry-backed blog routes must pin `dynamicParams = false`
 * (launch-day incident, issue #261).
 *
 * Both /blog/[slug] and /blog/watch/[slug] render exclusively from the static
 * posts registry, so every valid slug is known at build time. Without
 * `dynamicParams = false`, Next attempts ON-DEMAND static generation for an
 * unknown slug; that render hits the layout's per-request CSP-nonce headers()
 * and throws digest DYNAMIC_SERVER_USAGE — a customer-facing 500 instead of a
 * 404. Worst case is /blog/watch: with zero published (non-placeholder)
 * videos, the route pre-renders zero pages and EVERY hit 500s. This test walks
 * the real source files so removing the guard fails CI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  "../../apps/web/src/app/(marketing)/blog/[slug]/page.tsx",
  "../../apps/web/src/app/(marketing)/blog/watch/[slug]/page.tsx",
];

describe("registry-backed blog routes 404 (never 500) on unknown slugs", () => {
  for (const rel of ROUTES) {
    it(`${rel.split("app/")[1]} exports dynamicParams = false`, () => {
      const src = readFileSync(join(__dirname, rel), "utf8");
      expect(src).toMatch(/export\s+const\s+dynamicParams\s*=\s*false/);
      // Sanity: it still statically pre-renders the registry slugs.
      expect(src).toMatch(/export\s+function\s+generateStaticParams/);
    });
  }
});
