"use client";

/**
 * PageViewBeacon — best-effort page_view analytics beacon fired once on
 * mount (issue #208, PR-6). Posts directly to
 * `/api/public/landing/[siteSlug]/event`, relying on next.config.js's
 * catch-all `/api/:path*` rewrite to the Hono API (no dedicated proxy route
 * needed for this fire-and-forget counter — client-IP precision matters far
 * less here than it does for lead capture). Failures are always silent: a
 * blocked/slow analytics call must never affect the page.
 */

import { useEffect } from "react";

interface PageViewBeaconProps {
  siteSlug: string;
  pageSlug?: string;
}

export function PageViewBeacon({ siteSlug, pageSlug }: PageViewBeaconProps) {
  useEffect(() => {
    fetch(`/api/public/landing/${encodeURIComponent(siteSlug)}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "page_view",
        ...(pageSlug ? { page_slug: pageSlug } : {}),
      }),
      keepalive: true,
    }).catch(() => {
      // Best-effort — never surface a failed analytics beacon to the visitor.
    });
  }, [siteSlug, pageSlug]);

  return null;
}
