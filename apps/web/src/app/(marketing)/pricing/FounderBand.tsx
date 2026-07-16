"use client";

/**
 * FounderBand — the "Founding member · first 100" offer banner on /pricing.
 *
 * Reads the live founder-offer status (GET /api/founder-status). It renders the
 * banner ONLY while the offer is active, and shows the real slots remaining when
 * the count is VERIFIED. When the count is unverified (Stripe read failed), the
 * endpoint returns `remaining: null` and the band shows the generic "first 100"
 * copy instead of a fabricated number — no fake scarcity. Once the first-100
 * cohort is full the banner disappears automatically — no stale "30% off" claim
 * after the offer ends. Optimistic-hidden until the fetch resolves so it never
 * flashes a dead offer.
 */

import { useEffect, useState } from "react";

export function FounderBand() {
  const [active, setActive] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/founder-status")
      .then((r) => r.json())
      .then((d: { active?: boolean; remaining?: number | null }) => {
        if (!live) return;
        setActive(d?.active === true);
        // Only a verified number arrives as a number; null → keep generic copy.
        if (typeof d?.remaining === "number") setRemaining(d.remaining);
      })
      .catch(() => {
        if (live) setActive(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (active !== true) return null;

  return (
    <div
      style={{
        marginTop: "var(--space-10)",
        border: "1px solid rgba(39,201,138,0.4)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        background: "var(--color-surface)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
      }}
    >
      <div>
        <span className="pr-eyebrow" style={{ color: "var(--color-accent-ink)" }}>
          Founding member offer{remaining != null ? ` · ${remaining} of 100 left` : " · first 100"}
        </span>
        <h2 style={{ margin: "var(--space-2) 0 var(--space-1)", fontSize: "var(--font-size-h2)", fontWeight: 800 }}>
          30% founder discount + a free 5-page website
        </h2>
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, maxWidth: "560px" }}>
          Applied only when you pay annually. No countdown, no fake scarcity — when the cohort fills, it fills.
        </p>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-accent-ink)", fontSize: "1.125rem", whiteSpace: "nowrap" }}>
        Growth $69/mo · Agency $384/mo
      </div>
    </div>
  );
}
