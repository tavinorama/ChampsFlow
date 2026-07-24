/**
 * Canonical Ozvor pricing + revenue math — single source of truth.
 *
 * The list prices and the MRR calculation were duplicated in
 * apps/api/src/routes/admin.ts and operator.ts, and had drifted: admin counted
 * only `status='active'` toward MRR while operator counted `active`+`trialing`,
 * so the founder dashboard and the Hermes operator surface reported different
 * MRR for the same data. This module is the one definition both import.
 *
 * MRR counts ONLY actively-billing subscriptions (`status='active'`). Trialing
 * subs are not paying yet, so they are reported separately as pipeline and never
 * folded into recurring revenue — the honest number.
 */

export const LIST_PRICE_USD = {
  kit: 29,
  pages: 99, // Ozvor Pages — one-time landing-site pack
  growth: 99,
  agency: 549,
  geoSprint: 1500,
  managedGeo: 1900,
} as const;

/**
 * Annual (yearly) list prices (USD) — one charge per year. These already bake in
 * the annual-vs-monthly discount ($831/yr < $99×12=$1,188/yr), so amortizing them
 * back to a monthly figure yields the TRUE monthly recurring value of an annual
 * subscriber — which is LOWER than the monthly sticker price. Source of truth for
 * received-value MRR (see receivedMonthlyUsd + apps/api/src/lib/received-mrr.ts).
 */
export const LIST_PRICE_ANNUAL_USD: Record<string, number> = {
  growth: 831,
  agency: 4611,
};

/** Months per Stripe billing interval — used to amortize a charge to monthly. */
function monthsPerInterval(interval: "month" | "year"): number {
  return interval === "year" ? 12 : 1;
}

/**
 * Apply a Stripe-style discount to a gross charge (in cents) and return the NET
 * cents actually paid. Handles either a percentage coupon (percent_off, e.g. the
 * 30% founder coupon) or a fixed-amount coupon (amount_off, in cents). Clamped at
 * 0 (a 100%-off coupon → $0 received, the honest number). Pure — unit-tested.
 */
export function applyDiscountCents(
  grossCents: number,
  discount?: { percentOff?: number | null; amountOffCents?: number | null } | null
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0;
  let net = grossCents;
  const pct = discount?.percentOff;
  if (typeof pct === "number" && pct > 0) net = net * (1 - Math.min(pct, 100) / 100);
  const amt = discount?.amountOffCents;
  if (typeof amt === "number" && amt > 0) net = net - amt;
  return Math.max(0, net);
}

/**
 * Amortize a per-invoice NET charge (cents) to a monthly USD figure. An annual
 * charge is divided across 12 months; a monthly charge passes through. This is
 * the "received value" a subscription contributes to MRR — NOT its sticker price.
 * Pure — unit-tested.
 */
export function receivedMonthlyUsd(
  netInvoiceCents: number,
  interval: "month" | "year"
): number {
  if (!Number.isFinite(netInvoiceCents) || netInvoiceCents <= 0) return 0;
  return netInvoiceCents / 100 / monthsPerInterval(interval);
}

/** Monthly recurring price by subscription plan_tier (USD). free/starter = $0. */
export const PLAN_MRR_USD: Record<string, number> = {
  free: 0,
  starter: 0,
  growth: LIST_PRICE_USD.growth,
  agency: LIST_PRICE_USD.agency,
  pro: LIST_PRICE_USD.growth, // legacy alias — priced at the growth tier
};

/** The only subscription status that counts toward live MRR. */
export const MRR_STATUS = "active" as const;

/** DFY (engagement) SKU list prices, used for pipeline value. */
export const DFY_PRICE_USD: Record<string, number> = {
  geo_sprint: LIST_PRICE_USD.geoSprint,
  managed_geo: LIST_PRICE_USD.managedGeo,
};

export function mrrForTier(planTier: string | null | undefined): number {
  if (!planTier) return 0;
  return PLAN_MRR_USD[planTier] ?? 0;
}

/** Sum MRR across subscriptions, counting only actively-billing ones. */
export function computeMrr(
  subs: Array<{ plan_tier?: string | null; status?: string | null }>
): number {
  return subs.reduce(
    (sum, s) => (s.status === MRR_STATUS ? sum + mrrForTier(s.plan_tier) : sum),
    0
  );
}

/** Annualized recurring revenue from a monthly MRR figure. */
export function arrFromMrr(mrr: number): number {
  return mrr * 12;
}

export function dfyPriceForSku(sku: string | null | undefined): number {
  if (!sku) return 0;
  return DFY_PRICE_USD[sku] ?? 0;
}
