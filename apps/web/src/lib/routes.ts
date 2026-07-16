/**
 * Authenticated app route prefixes — the single source of truth used by BOTH
 * the middleware (to redirect unauthenticated visitors to /login) and, over
 * time, the root layout chrome logic. Keep in sync with layout.tsx's
 * AUTHED_APP_PREFIXES.
 */
export const AUTHED_APP_PREFIXES = [
  "/dashboard",
  "/dashboard-v3",
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

export function isAuthedAppPath(pathname: string): boolean {
  return AUTHED_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
