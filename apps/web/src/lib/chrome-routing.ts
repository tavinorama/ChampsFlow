/**
 * chrome-routing.ts — the ONE place that decides which app chrome a request
 * pathname gets. Pure + dependency-free so the root layout AND unit tests can
 * share it (the layout can't be imported in tests: it pulls next/font).
 *
 * Categories:
 *   - "public-landing" (/l/*) — a CUSTOMER's published Ozvor Pages site. Gets
 *     ZERO Ozvor chrome (no marketing footer, no CCPA/California banner, no
 *     Ozvor cookie manager, no Ozvor GA4, no Ozvor aurora background). The page
 *     supplies its own header/footer with a tiny "Made with Ozvor" credit.
 *   - "marketing" — the (marketing) route group owns its own chrome.
 *   - "authed-app" — the logged-in product shell (sidebar, DPA gate, etc.).
 *   - "other-public" — legal, login, shared report: Ozvor footer + banner only.
 */

export const MARKETING_PREFIXES = [
  "/blog",
  "/resources",
  "/book",
  "/how-it-works",
  "/how-we-measure",
  "/kit",
  "/learn",
  "/organicposts",
  "/pricing",
  "/results",
  "/test",
];

export const AUTHED_APP_PREFIXES = [
  "/dashboard",
  "/brands",
  "/account",
  "/admin",
  "/create",
  "/drafts",
  "/schedule",
  "/marketing",
  "/landing-pages",
  "/sources",
  "/competitors",
  "/agency",
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// PUBLIC TENANT SITES — /l/[siteSlug]. Note: /landing-pages (the authed BUILDER)
// is NOT /l/*, and /learn, /legal, /login don't start with "/l/" either.
export function isPublicLandingPath(pathname: string): boolean {
  return pathname === "/l" || pathname.startsWith("/l/");
}

export function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return matchesPrefix(pathname, MARKETING_PREFIXES);
}

export function isAuthedAppPath(pathname: string): boolean {
  return matchesPrefix(pathname, AUTHED_APP_PREFIXES);
}

export type ChromeCategory = "public-landing" | "marketing" | "authed-app" | "other-public";

/** Single source of truth used by the root layout — order matters. */
export function chromeCategory(pathname: string): ChromeCategory {
  if (isPublicLandingPath(pathname)) return "public-landing";
  if (isMarketingPath(pathname)) return "marketing";
  if (isAuthedAppPath(pathname)) return "authed-app";
  return "other-public";
}
