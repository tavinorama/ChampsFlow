"use client";

/**
 * PricingPlans — the interactive plan cards on the public /pricing page.
 *
 * CRO pass (2026-07):
 *  - MONTHLY is the default. The full annual total was scaring people before
 *    they understood the value. Annual is one tap away and says what it saves.
 *  - The $29 Get-Cited Kit is a real tier in the grid now, sitting between Free
 *    and Growth. It is the tripwire of the funnel, so hiding it from the plan
 *    table was costing the step it exists for. Its price ($29, one time) and
 *    its destination (/kit, which owns the Stripe call) are unchanged.
 *  - Every paid card repeats its guarantee directly under its button, where
 *    the doubt actually happens, instead of once in the page subtitle.
 *
 * Honesty note on the guarantees: subscriptions carry the 30 day money back.
 * The Kit is a one-time deliverable and carries the deliverable guarantee, the
 * exact wording of /refund. We do not promise the Kit a policy it does not have.
 *
 * The chosen interval is carried into the checkout funnel so what they pick is
 * what they're charged. Annual prices are the founder price (30% off the 12×
 * list) while the founder cohort is open, then they flip to list automatically.
 *
 * Growth/Agency CTAs POST to /api/checkout/direct via useDirectCheckout —
 * skipping the /login?plan=... funnel and going straight to Stripe Checkout.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDirectCheckout, type CheckoutPlan } from "../../../lib/use-direct-checkout";

type Interval = "year" | "month";

type Plan = {
  id: "free" | "kit" | "ai-audit" | CheckoutPlan;
  /** free = no card, onetime = one payment, sub = recurring plan. */
  kind: "free" | "onetime" | "sub";
  name: string;
  monthly: string; // headline price when Monthly is selected (or the one-time price)
  annualYear: string; // founder annual /yr total (while the offer is active)
  annualYearList?: string; // LIST annual /yr total (shown once the founder offer ends)
  annualPerMonth: string; // "≈ $69/mo" helper shown under the founder annual price
  sub: string;
  features: string[];
  cta: string;
  /** Real destination for the non-subscription cards. */
  href?: string;
  /** Repeated under the button. Empty for the free card. */
  guarantee?: string;
  accent: "muted" | "emerald";
  featured?: boolean;
};

// Credit/depth figures are DERIVED from @organic-posts/shared — the same
// PLAN_LIMITS production enforces — so this page cannot advertise a number
// the product no longer delivers.
import { PLAN_LIMITS, monthlyCreditsFor, overagePackUsd } from "@organic-posts/shared";
const fmt = (n: number) => n.toLocaleString("en-US");

const PLANS: Plan[] = [
  {
    id: "free",
    kind: "free",
    name: "Free",
    monthly: "$0",
    annualYear: "$0",
    annualPerMonth: "",
    sub: "See where you stand — no card.",
    features: ["1 brand", `${PLAN_LIMITS.free.prompts_per_audit}-prompt snapshot audit`, `${fmt(monthlyCreditsFor("free"))} credits/mo included`, "1 competitor", "All 5 AI engines", "Instant Ozvor AI Visibility Score"],
    cta: "Run my test — free",
    href: "/test",
    accent: "muted",
  },
  {
    id: "kit",
    kind: "onetime",
    name: "Get-Cited Kit",
    monthly: "$29",
    annualYear: "$29",
    annualPerMonth: "",
    sub: "One payment. We write your fixes.",
    features: [
      "Full audit on all 5 AI engines",
      "Your Ozvor AI Visibility Score",
      "Your top 3 citation fixes",
      "3 ready-to-publish drafts: blog, LinkedIn, FAQ",
      "Plain-English GEO guide",
      "30-day re-test plan",
      "No subscription",
    ],
    cta: "Get the Kit — $29",
    href: "/kit",
    guarantee: "Deliverable guarantee. Drafts not publish-ready, we refund.",
    accent: "emerald",
  },
  {
    id: "ai-audit",
    kind: "onetime",
    name: "AI Audit Stack",
    monthly: "$49",
    annualYear: "$49",
    annualPerMonth: "",
    sub: "One payment. We pick your AI tool.",
    features: [
      "One niche AI tool picked for your pains",
      "Why it fits, and which pains it answers",
      "The size of the full picture: tools matched, quick wins",
      "Result on the site and in your inbox",
      "Full audit lives in OrganicPosts",
      "No subscription",
    ],
    cta: "Get my AI stack — $49",
    href: "/ai-audit",
    guarantee: "One tool and the counts. Numbers are estimates when our catalog says so.",
    accent: "muted",
  },
  {
    id: "growth",
    kind: "sub",
    name: "Growth",
    monthly: "$99",
    annualYear: "$831",
    annualYearList: "$1,188",
    annualPerMonth: "≈ $69/mo · 30% founder discount",
    sub: "For one brand you want cited.",
    features: [`${fmt(monthlyCreditsFor("growth"))} credits/mo — ${PLAN_LIMITS.growth.prompts_per_audit}-prompt deep audits`, "One manual re-audit per brand each week.", "Weekly monitoring", "Up to 10 competitors.", "GEO content plan + Content Studio", "CSV export", "Email support"],
    cta: "Start Growth",
    guarantee: "30 day money back.",
    accent: "emerald",
    featured: true,
  },
  {
    id: "agency",
    kind: "sub",
    name: "Agency",
    monthly: "$549",
    annualYear: "$4,611",
    annualYearList: "$6,588",
    annualPerMonth: "≈ $384/mo · 30% founder discount",
    sub: "For agencies & multi-brand teams.",
    features: ["$54.90 per brand — $38.40 on founder annual", `${fmt(monthlyCreditsFor("agency"))} credits/mo across your portfolio`, "Multi-client dashboard (up to 10 brands)", "10 competitors per brand", "Weekly monitoring on every client", "White-label reports", "Client approval workflow", "Priority support · 4h SLA", "Annual bonus: one free website GEO audit."],
    cta: "Start Agency",
    guarantee: "30 day money back.",
    accent: "emerald",
  },
];

export function PricingPlans() {
  // Monthly is the default: the smaller number is the honest entry price, and
  // the annual total no longer lands before the visitor sees the value.
  const [interval, setInterval] = useState<Interval>("month");
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
      .then((d: { active?: boolean; remaining?: number | null }) => {
        if (!live) return;
        if (typeof d?.active === "boolean") setFounderActive(d.active);
        // `remaining` is null when the count is unverified — leave state null so
        // the UI shows the honest generic copy instead of a fabricated number.
        if (typeof d?.remaining === "number") setFounderRemaining(d.remaining);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div style={{ marginTop: "var(--space-10)" }}>
      {/* Interval toggle — Monthly default, Annual one tap away and labelled
          with what it saves. Centred so it reads as a control, not a stray tab. */}
      <div style={{ textAlign: "center" }}>
      <div
        role="group"
        aria-label="Billing interval"
        style={{
          display: "inline-flex",
          margin: "0 auto var(--space-3)",
          padding: "4px",
          gap: "4px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
        }}
      >
        {([
          { v: "month" as const, label: "Monthly", note: null },
          { v: "year" as const, label: "Annual", note: founderActive ? "Save 30%" : null },
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
      {/* One clear line about the other interval, so the choice is informed */}
      <p style={{ margin: "0 0 var(--space-6)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
        {interval === "month"
          ? founderActive
            ? "Pay yearly and save 30% while the founder offer is open."
            : "Pay yearly to save on the same plan."
          : "Billed once a year. Switch to monthly any time."}
      </p>
      </div>

      {/* Plan cards */}
      <div className="pr-grid">
        {PLANS.map((pl) => {
          const isAnnual = interval === "year";
          const isSub = pl.kind === "sub";
          const priceMain = isSub
            ? isAnnual
              ? (founderActive ? pl.annualYear : (pl.annualYearList ?? pl.annualYear))
              : pl.monthly
            : pl.monthly;
          const per =
            pl.kind === "free" ? "" : pl.kind === "onetime" ? " one time" : isAnnual ? "/yr" : "/mo";
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
                {priceMain}<span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-muted)", marginLeft: pl.kind === "onetime" ? "0.35rem" : 0 }}>{per}</span>
              </div>
              {/* Helper line — annual per-month framing, or what a one-time buy means */}
              <div style={{ marginTop: "var(--space-1)", minHeight: "18px", fontSize: "var(--font-size-caption)", color: "var(--color-accent-ink)", fontWeight: 600 }}>
                {pl.kind === "onetime"
                  ? "No subscription."
                  : isSub && isAnnual
                    ? (founderActive ? pl.annualPerMonth : "billed annually")
                    : " "}
              </div>
              <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", minHeight: "32px" }}>{pl.sub}</div>
              {pl.kind !== "sub" ? (
                <Link
                  href={pl.href ?? "/test"}
                  className={`pr-cta ${pl.kind === "free" ? "pr-cta-ghost" : "pr-cta-emerald"}`}
                  aria-label={`${pl.cta} — ${pl.name}`}
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
              {/* The guarantee, right under the button that needs it */}
              {pl.guarantee ? (
                <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center", lineHeight: 1.5 }}>
                  <Link href="/refund" style={{ color: "var(--color-muted)", textDecoration: "underline" }}>
                    {pl.guarantee}
                  </Link>
                </p>
              ) : (
                <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}>
                  No card needed.
                </p>
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
      {/* Credit pack band — the founder's call (2026-08-10): the one-time pack
          lives NEXT TO the plans, not buried in a section below, because a
          visitor comparing plans should see the escape hatch in the same
          glance ("if I run out, it's $13, not a bigger plan"). All figures
          derived from @organic-posts/shared. */}
      <div
        data-testid="pricing-pack-band"
        style={{
          marginTop: "var(--space-5)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
          padding: "var(--space-4) var(--space-5)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2) var(--space-4)",
          textAlign: "center",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: "var(--font-size-body)", color: "var(--color-text)" }}>
          Need more? Credit pack: ${overagePackUsd(1000)} for 1,000 credits.
        </span>
        <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
          One-time top-up on any plan — no upgrade, no subscription. Buy it inside the app when you need it.
        </span>
      </div>
    </div>
  );
}
