"use client";

/**
 * FreeTestCta — the single highlighted "run the free test" call to action.
 *
 * Used by the public navbar (and anywhere else that needs the same tracked
 * link). Pulled into its own client component because the marketing navbar
 * lives in a Server Component (`(marketing)/layout.tsx`) — an onClick handler
 * can only be attached from inside a "use client" boundary.
 *
 * Fires a GA4 event on click, gated the same way the rest of the app treats
 * gtag: it may not exist yet (no consent, GA4 not configured), so every call
 * is optional-chained — never assumed present (#117 consent-gated GA4).
 */

import Link from "next/link";

interface FreeTestCtaProps {
  className?: string;
  label?: string;
  ariaLabel?: string;
}

export function FreeTestCta({
  className,
  label = "Check my brand — free →",
  ariaLabel = "Check my brand — run the free AI visibility test",
}: FreeTestCtaProps) {
  return (
    <Link
      href="/test"
      className={className}
      aria-label={ariaLabel}
      onClick={() => {
        window.gtag?.("event", "cta_free_test_click");
      }}
    >
      {label}
    </Link>
  );
}
