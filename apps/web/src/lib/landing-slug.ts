/**
 * landing-slug.ts — client-side mirror of apps/api/src/routes/landing.ts's
 * slugify()/validateSiteSlug()/RESERVED_SITE_SLUGS.
 *
 * Duplicated (not imported) on purpose: apps/web never imports apps/api
 * source, so the "New site" wizard can only give live validation feedback
 * (before the round trip) by keeping its own copy of the exact same rule.
 * The API remains the source of truth — this only improves the UX for the
 * common case; a stale copy here can, at worst, under- or over-warn, never
 * grant something the server would reject (same trade-off as
 * packages/llm/src/landing-generate.ts's landingSlugify()).
 */

const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const RESERVED_SITE_SLUGS = new Set([
  "admin", "api", "app", "assets", "blog", "dashboard", "kit", "l", "legal",
  "login", "ozvor", "pricing", "privacy", "results", "static", "terms",
  "test", "www",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/^-|-$/g, "");
}

/** Returns an error message, or null if the slug is valid. */
export function validateSiteSlug(slug: string): string | null {
  if (RESERVED_SITE_SLUGS.has(slug)) {
    return "That slug is reserved. Pick another.";
  }
  if (!SITE_SLUG_RE.test(slug)) {
    return "Slug must be 3–64 chars: lowercase letters, digits and hyphens (no leading/trailing hyphen).";
  }
  return null;
}
