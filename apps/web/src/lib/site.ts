/**
 * site.ts — Single source of truth for the public site URL and brand name.
 * Set NEXT_PUBLIC_SITE_URL in Railway/env to flip from the current Railway
 * domain to ozvor.com when DNS is ready.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ozvor.com";

export const SITE_NAME = "Ozvor";
