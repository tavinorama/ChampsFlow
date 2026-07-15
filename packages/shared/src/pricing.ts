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
