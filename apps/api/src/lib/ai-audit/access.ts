/**
 * access.ts — the ONE rule for what a logged-in tenant gets from the AI Audit
 * Stack inside the dashboard (founder decision D2, 2026-08-17).
 *
 *   prime  — the tenant has OrganicPosts (a WON engagement, sku geo_sprint or
 *            managed_geo): the FULL 9-section report, unlocked, free. The full
 *            AI Audit is part of what the $1.5k+ bundle buys.
 *   paid   — Growth / Agency subscriber: the teaser + a $49 checkout with 15%
 *            off (Stripe coupon STRIPE_COUPON_AIAUDIT15; when the env is unset
 *            the price is full and the payload says so — never a fake discount).
 *   free   — free tier: the teaser + the full-price $49 checkout + the upsell.
 *
 * Pure so the three branches are unit-tested without a database. The route
 * (routes/ai-audit.ts, /api/ai-audit/tenant/*) only feeds it facts.
 */

import type { PlanTier } from "../../../../../packages/shared/src/plan-limits";
import { AI_AUDIT_PRICE_USD } from "./deliverable";

export const AI_AUDIT_PAID_DISCOUNT_PCT = 15;

export type AiAuditAccessKind = "prime" | "paid" | "free";

export interface AiAuditAccess {
  kind: AiAuditAccessKind;
  /** True only for prime: the full report is returned. */
  unlocked: boolean;
  /** Discount the checkout SHOULD carry (0 for free/prime). Applied only when the coupon env exists. */
  discountPct: number;
  /** List price, USD. The route echoes the discounted figure only when the coupon is configured. */
  priceUsd: number;
  /** Short reason the UI can print next to the lock. Plain English, no em-dash. */
  reason: string;
}

export function aiAuditAccessFor(input: {
  tier: PlanTier | string | null | undefined;
  hasOrganicPosts: boolean;
}): AiAuditAccess {
  if (input.hasOrganicPosts) {
    return {
      kind: "prime",
      unlocked: true,
      discountPct: 0,
      priceUsd: 0,
      reason: "Included in your OrganicPosts plan.",
    };
  }
  const tier = input.tier === "growth" || input.tier === "agency" ? input.tier : "free";
  if (tier !== "free") {
    return {
      kind: "paid",
      unlocked: false,
      discountPct: AI_AUDIT_PAID_DISCOUNT_PCT,
      priceUsd: AI_AUDIT_PRICE_USD,
      reason: `Subscribers get ${AI_AUDIT_PAID_DISCOUNT_PCT}% off the $${AI_AUDIT_PRICE_USD} AI Audit Stack.`,
    };
  }
  return {
    kind: "free",
    unlocked: false,
    discountPct: 0,
    priceUsd: AI_AUDIT_PRICE_USD,
    reason: `The AI Audit Stack is $${AI_AUDIT_PRICE_USD}, one time. OrganicPosts includes it for free.`,
  };
}

/** Price after the discount, rounded to cents. Pure; used for display only. */
export function discountedPriceUsd(priceUsd: number, discountPct: number): number {
  return Math.round(priceUsd * (100 - discountPct)) / 100;
}
