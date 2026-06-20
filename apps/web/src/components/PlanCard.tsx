/**
 * PlanCard — C6 Billing
 *
 * Displays a subscription plan (Free / Starter / Pro) with:
 *   - Plan name + price
 *   - Feature list
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

export type PlanTier = "free" | "starter" | "pro";

export interface PlanCardProps {
  tier: PlanTier;
  /** Whether this is the user's currently active plan */
  isCurrent: boolean;
  /** Whether a checkout/portal action is loading */
  isLoading?: boolean;
  /** Called when user clicks "Choose plan" CTA */
  onChoosePlan: (tier: PlanTier) => void;
}

// Plan metadata — static content per tier
const PLAN_META: Record<
  PlanTier,
  {
    name: string;
    price: string;
    billingNote: string;
    features: string[];
    ctaLabel: string;
  }
> = {
  free: {
    name: "Free",
    price: "$0",
    billingNote: "forever",
    features: [
      "1 connected social account",
      "5 AI-generated posts per month",
      "Draft-and-confirm publishing",
      "Basic scheduling",
    ],
    ctaLabel: "Current plan",
  },
  starter: {
    name: "Starter",
    price: "$19",
    billingNote: "per month",
    features: [
      "3 connected social accounts",
      "100 AI-generated posts per month",
      "Draft-and-confirm publishing",
      "Advanced scheduling",
      "Priority support",
    ],
    ctaLabel: "Choose Starter",
  },
  pro: {
    name: "Pro",
    price: "$49",
    billingNote: "per month",
    features: [
      "10 connected social accounts",
      "Unlimited AI-generated posts",
      "Draft-and-confirm publishing",
      "Advanced scheduling",
      "Priority support",
      "Early access to new features",
    ],
    ctaLabel: "Choose Pro",
  },
};

export function PlanCard({
  tier,
  isCurrent,
  isLoading = false,
  onChoosePlan,
}: PlanCardProps): React.ReactElement {
  const meta = PLAN_META[tier];
  const headingId = `plan-card-heading-${tier}`;
  const descId = `plan-card-desc-${tier}`;

  // Free plan CTA is never clickable — user cannot "choose" free via checkout
  const isFreePlan = tier === "free";

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
            {meta.price}
          </span>
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            {meta.billingNote}
          </span>
        </div>
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
            : `Choose ${meta.name} plan for ${meta.price} ${meta.billingNote}`
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
