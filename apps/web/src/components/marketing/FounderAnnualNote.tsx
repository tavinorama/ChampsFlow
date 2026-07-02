"use client";

/**
 * FounderAnnualNote — the small-print annual pricing line used on the kit pages.
 *
 * Follows the live founder-offer status (GET /api/founder-status) so the copy
 * can never go stale: while the first-100 offer is active it shows the founder
 * annual prices ($831 / $2,091, 30% off); once the cohort fills it switches to
 * the list annual prices ($1,188 / $2,988) automatically. Optimistic-founder
 * until the fetch resolves (same convention as PricingPlans).
 */

import { useEffect, useState } from "react";

export function FounderAnnualNote({
  suffix,
  style,
}: {
  /** Trailing sentence(s) appended after the pricing line (page-specific). */
  suffix?: string;
  style?: React.CSSProperties;
}) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let live = true;
    fetch("/api/founder-status")
      .then((r) => r.json())
      .then((d: { active?: boolean }) => {
        if (live && typeof d?.active === "boolean") setActive(d.active);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <p style={style}>
      {active
        ? "Founder annual: Growth $831/yr (~$69/mo), Agency $2,091/yr (~$174/mo) — 30% off, first 100 founders, annual only."
        : "Annual: Growth $1,188/yr (~$99/mo), Agency $2,988/yr (~$249/mo)."}
      {suffix ? ` ${suffix}` : ""}
    </p>
  );
}
