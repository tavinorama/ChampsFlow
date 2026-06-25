/**
 * PlanCard — Billing (GEO plans)
 *
 * Displays a subscription plan (Free / Growth / Agency) with:
 *   - Plan name + price (monthly or annual, switched by the `interval` prop)
 *   - Founder note on annual paid plans (30% off, annual-only)
 *   - GEO feature list
 *   - "Choose plan" CTA (or "Current plan" badge for active plan)
 *
 * WCAG AA requirements (docs/04-ux.md §8):
 *   - role="group" + aria-labelledby on each plan card
 *   - Keyboard navigable (button is the only interactive element)
 *   - 4.5:1 minimum contrast on all text
 *   - 44px minimum tap targets on CTA button
 *   - Focus: 3px outline, 2px offset
 *   - Screen reader announces current plan state via aria-current="true"
 *   - No dark patterns: equal visual weight for all plan cards
 *
 * UX ref: docs/04-ux.md §3 C6 Billing flow
 */

"use client";

import React from "react";

export type PlanTier = "free" | "growth" | "agency";
export type BillingInterval = "month" | "year";

export interface PlanCardProps {
  tier: PlanTier;
  /** Monthly or annual pricing view (driven by the page-level toggle) */
  interval: BillingInterval;
  /** Whether this is the user's currently active plan */
  isCurrent: boolean;
  /** Whether a checkout/portal action is loading */
  isLoading?: boolean;
  /** Called when user clicks "Choose plan" CTA */
  onChoosePlan: (tier: PlanTier) => void;
}

// Plan metadata — static content per tier.
// Annual prices are the founder price (30% off the 12× list price), which is
// the only annual price we ever offer pre-launch. Growth: 12×$99=$1,188 → $831.
// Agency: 12×$249=$2,988 → $2,091 (founder, 30% off). Founder discount is
// annual-only (see createCheckoutSession in apps/api/src/integrations/stripe.ts).
//
// DISPLAY/CHARGE SYNC — Agency:
//   Charge = STRIPE_PRICE_ID_AGENCY (monthly) / STRIPE_PRICE_ID_AGENCY_ANNUAL
//   env vars — must point to the $249/mo and $2,988/yr Stripe prices created by
//   scripts/stripe-bootstrap.ts. Run that script and update the env vars or
//   checkout will charge the old $149 amount regardless of what is displayed here.
const PLAN_META: Record<
  PlanTier,
  {
    name: string;
    priceMonthly: string;
    priceAnnual: string;
    features: string[];
    ctaLabel: string;
  }
> = {
  free: {
    name: "Free",
    priceMonthly: "$0",
    priceAnnual: "$0",
    features: [
      "1 brand monitored",
      "3 competitors benchmarked",
      "50 buyer-intent prompts per audit",
      "Monthly AI-visibility audit",
      "TrustIndex Score across 5 AI engines",
    ],
    ctaLabel: "Current plan",
  },
  growth: {
    name: "Growth",
    priceMonthly: "$99",
    priceAnnual: "$831",
    features: [
      "1 brand monitored",
      "10 competitors benchmarked",
      "250 buyer-intent prompts per audit",
      "Weekly monitoring + alerts",
      "GEO content plan + ready-to-publish drafts",
    ],
    ctaLabel: "Choose Growth",
  },
  agency: {
    name: "Agency",
    priceMonthly: "$249",
    priceAnnual: "$2,091",
    features: [
      "25 brands monitored",
      "10 competitors per brand",
      "250 buyer-intent prompts per audit",
      "Weekly monitoring + alerts",
      "Client workspaces + priority support",
    ],
    ctaLabel: "Choose Agency",
  },
};

export function PlanCard({
  tier,
  interval,
  isCurrent,
  isLoading = false,
  onChoosePlan,
}: PlanCardProps): React.ReactElement {
  const meta = PLAN_META[tier];
  const headingId = `plan-card-heading-${tier}`;
  const descId = `plan-card-desc-${tier}`;

  // Free plan CTA is never clickable — user cannot "choose" free via checkout
  const isFreePlan = tier === "free";

  // Annual view only changes price/copy for paid plans
  const showAnnual = interval === "year" && !isFreePlan;
  const price = showAnnual ? meta.priceAnnual : meta.priceMonthly;
  const billingNote = isFreePlan
    ? "forever"
    : showAnnual
    ? "per year"
    : "per month";

  const handleClick = (): void => {
    if (!isFreePlan && !isCurrent && !isLoading) {
      onChoosePlan(tier);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      aria-describedby={descId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: "var(--space-6)",
        backgroundColor: "var(--color-surface)",
        border: isCurrent
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        position: "relative",
        boxShadow: isCurrent
          ? "0 0 0 4px rgba(37, 99, 235, 0.12)"
          : "none",
      }}
    >
      {/* Current plan badge */}
      {isCurrent && (
        <span
          aria-current="true"
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            backgroundColor: "var(--color-primary)",
            color: "#ffffff",
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-semibold)",
            padding: "2px var(--space-2)",
            borderRadius: "999px",
            whiteSpace: "nowrap",
          }}
        >
          Current plan
        </span>
      )}

      {/* Plan heading + price */}
      <div>
        <h3
          id={headingId}
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          {meta.name}
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-1)",
            marginTop: "var(--space-1)",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-h1)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
            }}
          >
            {price}
          </span>
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            {billingNote}
          </span>
        </div>
        {/* Founder note — annual paid plans only */}
        {showAnnual && (
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-success)",
              fontWeight: "var(--font-weight-semibold)",
              margin: "var(--space-1) 0 0 0",
            }}
          >
            Founder price — 30% off, billed annually
          </p>
        )}
      </div>

      {/* Feature list */}
      <ul
        id={descId}
        aria-label={`${meta.name} plan features`}
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          flex: 1,
        }}
      >
        {meta.features.map((feature) => (
          <li
            key={feature}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
            }}
          >
            {/* Checkmark icon — inline SVG for WCAG (no icon font dependency) */}
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ flexShrink: 0, marginTop: "2px" }}
            >
              <circle cx="8" cy="8" r="7" fill="var(--color-success)" />
              <path
                d="M5 8l2 2 4-4"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA button */}
      <button
        type="button"
        disabled={isFreePlan || isCurrent || isLoading}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={
          isCurrent
            ? `${meta.name} — your current plan`
            : `Choose ${meta.name} plan for ${price} ${billingNote}`
        }
        aria-disabled={isFreePlan || isCurrent || isLoading}
        style={{
          width: "100%",
          minHeight: "44px",
          padding: "var(--space-3) var(--space-4)",
          backgroundColor:
            isFreePlan || isCurrent
              ? "var(--color-surface-muted)"
              : isLoading
              ? "var(--color-primary-hover)"
              : "var(--color-primary)",
          color:
            isFreePlan || isCurrent ? "var(--color-muted)" : "#ffffff",
          border:
            isFreePlan || isCurrent
              ? "1px solid var(--color-border)"
              : "none",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: "var(--font-weight-semibold)",
          cursor: isFreePlan || isCurrent || isLoading ? "default" : "pointer",
          transition: "background-color 0.15s ease",
          outline: "none",
        }}
        // WCAG focus style via onFocus/onBlur (inline-styles limitation)
        onFocus={(e) => {
          if (!isFreePlan && !isCurrent) {
            (e.target as HTMLButtonElement).style.outline =
              `var(--focus-outline-width) solid var(--color-focus-outline)`;
            (e.target as HTMLButtonElement).style.outlineOffset =
              `var(--focus-outline-offset)`;
          }
        }}
        onBlur={(e) => {
          (e.target as HTMLButtonElement).style.outline = "none";
        }}
      >
        {isLoading && tier !== "free" && !isCurrent ? (
          <span aria-live="polite" aria-label="Loading, please wait">
            Loading…
          </span>
        ) : isCurrent ? (
          "Current plan"
        ) : isFreePlan ? (
          "Free plan"
        ) : (
          meta.ctaLabel
        )}
      </button>
    </div>
  );
}
