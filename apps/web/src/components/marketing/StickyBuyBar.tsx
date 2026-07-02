"use client";

/**
 * StickyBuyBar — bottom-of-viewport persistent bar with primary Growth CTA.
 *
 * Growth CTA now triggers direct Stripe checkout via POST /api/checkout/direct
 * (annual interval by default) instead of routing through /login?plan=...
 * Free test link remains a plain Link to /test.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDirectCheckout } from "../../lib/use-direct-checkout";

export function StickyBuyBar() {
  const [dismissed, setDismissed] = useState(false);
  const { loading, error, startCheckout } = useDirectCheckout();
  // Price claim follows the live founder-offer status so the bar never
  // advertises the $69 founder rate after the first-100 cohort fills.
  const [founderActive, setFounderActive] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem("stickyBarDismissed") === "1") {
      setDismissed(true);
    }
    let live = true;
    fetch("/api/founder-status")
      .then((r) => r.json())
      .then((d: { active?: boolean }) => {
        if (live && typeof d?.active === "boolean") setFounderActive(d.active);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const fromPrice = founderActive ? "$69" : "$99";

  function dismiss() {
    sessionStorage.setItem("stickyBarDismissed", "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className="mk-sticky-bar"
      role="complementary"
      aria-label="Quick purchase options"
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: "var(--space-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            disabled={loading}
            aria-busy={loading}
            aria-label={loading ? "Opening Stripe checkout..." : `Start Growth plan — from ${fromPrice}/mo annual`}
            onClick={() => startCheckout("growth", "year")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "44px",
              padding: "0 var(--space-4)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              fontWeight: 700,
              fontFamily: "var(--font-family)",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Opening…" : `Start Growth · from ${fromPrice}/mo`}
          </button>
          <Link
            href="/test"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-primary)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
              whiteSpace: "nowrap",
            }}
          >
            Free test
          </Link>
        </div>
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              fontFamily: "var(--font-family)",
            }}
          >
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss buy bar"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-muted)",
          fontSize: "1.25rem",
          lineHeight: 1,
          padding: "var(--space-2)",
          minWidth: "44px",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: "var(--font-family)",
        }}
      >
        ×
      </button>
    </div>
  );
}
