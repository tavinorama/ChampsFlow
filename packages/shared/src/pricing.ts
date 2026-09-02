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
  aiAudit: 49, // AI Audit Stack — one-time (Stripe price STRIPE_PRICE_ID_AI_AUDIT)
  pages: 99, // Ozvor Pages — one-time landing-site pack
  growth: 99,
  agency: 549,
  geoSprint: 1500,
  managedGeo: 1900,
} as const;

/**
 * Founder discount, percent off the 12x monthly list price — applied ONLY on
 * annual checkouts (apps/api/src/integrations/stripe.ts re-exports this and
 * applies the matching Stripe coupon). Every "30% off" on the site and in the
 * chatbot derives from here.
 */
export const FOUNDER_DISCOUNT_PERCENT = 30 as const;

/** Paid subscription tiers that have an annual price. */
export type AnnualTier = "growth" | "agency";

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

/** 12x the monthly list price — the annual figure BEFORE the founder discount. */
export function listAnnualUsd(tier: AnnualTier): number {
  return LIST_PRICE_USD[tier] * 12;
}

/**
 * Founder annual price (USD/yr) — LIST_PRICE_ANNUAL_USD, which tests pin to
 * floor(12 x monthly x (1 - FOUNDER_DISCOUNT_PERCENT/100)). The Stripe yearly
 * price objects were created from the same arithmetic.
 */
export function founderAnnualUsd(tier: AnnualTier): number {
  return LIST_PRICE_ANNUAL_USD[tier];
}

/**
 * The per-month figure the pricing page shows next to the founder annual
 * total ("≈ $69/mo"). Whole dollars, rounded DOWN so the page never advertises
 * a cent the customer does not save.
 */
export function founderAnnualPerMonthUsd(tier: AnnualTier): number {
  return Math.floor(founderAnnualUsd(tier) / 12);
}

/**
 * Per-brand monthly cost on a multi-brand tier, at a given monthly price
 * (list monthly, or the founder per-month figure). Formatted with two decimals
 * ("54.90") because it is only ever shown as copy. Derived from PLAN_LIMITS
 * max_brands so a plan change can never leave a stale "$36.60 per brand" on
 * the site again (2026-09-02 sweep, PENDING 10.A.1/2).
 */
export function perBrandUsd(monthlyUsd: number, maxBrands: number): string {
  if (!Number.isFinite(monthlyUsd) || !Number.isFinite(maxBrands) || maxBrands <= 0) return "0.00";
  return (monthlyUsd / maxBrands).toFixed(2);
}

/** "1,188" — en-US thousands formatting for dollar copy. */
export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US");
}

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

/** Monthly recurring price by subscription plan_tier (USD). free = $0. The
 * phantom `starter` tier was removed 2026-09-02 (PENDING 10.A.7) — it never
 * existed in PLAN_LIMITS; the DB CHECK still tolerates the string until the
 * founder runs the migration that drops it. */
export const PLAN_MRR_USD: Record<string, number> = {
  free: 0,
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
