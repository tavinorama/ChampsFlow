"use client";

/**
 * PricingPlans — the interactive plan cards on the public /pricing page.
 *
 * Founder ask: the displayed price defaults to ANNUAL, and the visitor can flip
 * to Monthly right in the box. The chosen interval is carried into the checkout
 * funnel (?interval=…) so what they pick is what they're charged.
 *
 * Annual prices are the founder price (30% off the 12× list), which is the only
 * annual price offered pre-launch (mirrors components/PlanCard + the founder
 * band on this page). Annual is the default selection.
 *
 * Growth/Agency CTAs now POST to /api/checkout/direct via useDirectCheckout —
 * skipping the /login?plan=... funnel and going straight to Stripe Checkout.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDirectCheckout, type CheckoutPlan } from "../../../lib/use-direct-checkout";

type Interval = "year" | "month";

type Plan = {
  id: "free" | CheckoutPlan;
  name: string;
  monthly: string; // headline price when Monthly is selected
  annualYear: string; // founder annual /yr total (while the offer is active)
  annualYearList?: string; // LIST annual /yr total (shown once the founder offer ends)
  annualPerMonth: string; // "≈ $69/mo" helper shown under the founder annual price
  sub: string;
  features: string[];
  cta: string;
  paid: boolean;
  accent: "muted" | "emerald";
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: "$0",
    annualYear: "$0",
    annualPerMonth: "",
    sub: "See where you stand — no card.",
    features: ["1 brand", "10-prompt snapshot audit", "1 competitor", "All 5 AI engines", "Instant Ozvor AI Visibility Score"],
    cta: "Run my test — free",
    paid: false,
    accent: "muted",
  },
  {
    id: "growth",
    name: "Growth",
    monthly: "$99",
    annualYear: "$831",
    annualYearList: "$1,188",
    annualPerMonth: "≈ $69/mo · 30% founder discount",
    sub: "For one brand you want cited.",
    features: ["Unlimited audits", "Weekly monitoring", "Up to 5 competitors", "GEO content plan + Content Studio", "CSV export", "Email support"],
    cta: "Start Growth",
    paid: true,
    accent: "emerald",
    featured: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthly: "$249",
    annualYear: "$2,091",
    annualYearList: "$2,988",
    annualPerMonth: "≈ $174/mo · 30% founder discount",
    sub: "For agencies & multi-brand teams.",
    features: ["Multi-client dashboard (up to 25 brands)", "10 competitors per brand", "Weekly monitoring on every client", "White-label reports", "Client approval workflow", "Priority support · 4h SLA", "Annual: website + 3 client landings"],
    cta: "Start Agency",
    paid: true,
    accent: "emerald",
  },
];

export function PricingPlans() {
  // Annual is the default (better value + unlocks the founder discount).
  const [interval, setInterval] = useState<Interval>("year");
  const { loadingPlan, error, startCheckout } = useDirectCheckout();

  // Founder-offer status drives the displayed annual price: while active, show
  // the 30%-off founder price; once the first-100 cohort is full it flips to
  // list price automatically (same source the checkout uses). Optimistic-active
  // until the fetch resolves so the page never flashes list→founder.
  const [founderActive, setFounderActive] = useState(true);
  const [founderRemaining, setFounderRemaining] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/founder-status")
      .then((r) => r.json())
      .then((d: { active?: boolean; remaining?: number }) => {
        if (!live) return;
        if (typeof d?.active === "boolean") setFounderActive(d.active);
        if (typeof d?.remaining === "number") setFounderRemaining(d.remaining);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div style={{ marginTop: "var(--space-10)" }}>
      {/* Interval toggle — Annual default, switch to Monthly in place */}
      <div
        role="group"
        aria-label="Billing interval"
        style={{
          display: "inline-flex",
          margin: "0 auto var(--space-6)",
          padding: "4px",
          gap: "4px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
        }}
      >
        {([
          { v: "year" as const, label: "Annual", note: founderActive ? "Save 30%" : null },
          { v: "month" as const, label: "Monthly", note: null },
        ]).map((opt) => {
          const active = interval === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => setInterval(opt.v)}
              aria-pressed={active}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                minHeight: "var(--min-tap-target, 44px)",
                padding: "0 var(--space-4)",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: 700,
                background: active ? "linear-gradient(135deg,#27c98a,#0c7d54)" : "transparent",
                color: active ? "#06140e" : "var(--color-text)",
              }}
            >
              {opt.label}
              {opt.note && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.625rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    background: active ? "rgba(6,20,14,0.18)" : "rgba(39,201,138,0.16)",
                    color: active ? "#06140e" : "var(--color-accent-ink)",
                  }}
                >
                  {opt.note}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Plan cards */}
      <div className="pr-grid">
        {PLANS.map((pl) => {
          const isAnnual = interval === "year";
          const priceMain =
            pl.id === "free"
              ? "$0"
              : isAnnual
                ? (founderActive ? pl.annualYear : (pl.annualYearList ?? pl.annualYear))
                : pl.monthly;
          const per = pl.id === "free" ? "" : isAnnual ? "/yr" : "/mo";
          return (
            <div
              key={pl.name}
              style={{
                position: "relative",
                padding: "var(--space-8) var(--space-6)",
                borderRadius: "var(--radius-lg)",
                border: pl.featured ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: "var(--color-surface)",
                boxShadow: pl.featured ? "0 12px 40px rgba(39,201,138,0.14)" : "var(--shadow-card)",
              }}
            >
              {pl.featured && (
                <span style={{ position: "absolute", top: "-11px", left: "var(--space-6)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 11px", borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg,#27c98a,#0c7d54)", color: "#06140e", fontWeight: 700 }}>
                  Most popular
                </span>
              )}
              <div style={{ fontSize: "1rem", fontWeight: 700, color: pl.accent === "emerald" ? "var(--color-accent-ink)" : "var(--color-muted)" }}>{pl.name}</div>
              <div style={{ marginTop: "var(--space-2)", fontSize: "2.5rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
                {priceMain}<span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-muted)" }}>{per}</span>
              </div>
              {/* Annual helper line — keeps the per-month framing + founder context */}
              <div style={{ marginTop: "var(--space-1)", minHeight: "18px", fontSize: "var(--font-size-caption)", color: "var(--color-accent-ink)", fontWeight: 600 }}>
                {pl.paid && isAnnual ? (founderActive ? pl.annualPerMonth : "billed annually") : " "}
              </div>
              <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", minHeight: "32px" }}>{pl.sub}</div>
              {pl.id === "free" ? (
                <Link
                  href="/test"
                  className="pr-cta pr-cta-ghost"
                  aria-label="Run my test — Free plan"
                >
                  {pl.cta}
                </Link>
              ) : (
                (() => {
                  const cardLoading = loadingPlan === pl.id;
                  return (
                    <button
                      type="button"
                      disabled={cardLoading}
                      aria-busy={cardLoading}
                      aria-label={`${pl.cta} — ${pl.name} plan, ${isAnnual ? "annual" : "monthly"} billing`}
                      onClick={() => startCheckout(pl.id as CheckoutPlan, interval)}
                      className="pr-cta pr-cta-emerald"
                      style={{ cursor: cardLoading ? "not-allowed" : "pointer", opacity: cardLoading ? 0.7 : 1 }}
                    >
                      {cardLoading ? "Opening checkout…" : pl.cta}
                    </button>
                  );
                })()
              )}
              <ul style={{ listStyle: "none", margin: "var(--space-5) 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {pl.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: "var(--space-2)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                    <span aria-hidden="true" style={{ color: "var(--color-accent-ink)", fontWeight: 700 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {/* Global checkout error — shown below all cards */}
      {error && (
        <p
          role="alert"
          style={{
            marginTop: "var(--space-4)",
            textAlign: "center",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-error)",
            fontFamily: "var(--font-family)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
