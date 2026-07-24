/**
 * Received-value MRR — the HONEST recurring number.
 *
 * The list-price MRR (packages/shared/src/pricing → computeMrr / mrrForTier)
 * sums every active subscription at its monthly STICKER price. That overstates
 * what the business actually receives, for two systematic reasons:
 *
 *   1. Annual amortization. Annual is the DEFAULT checkout interval. An annual
 *      Growth subscriber pays $831/yr = $69.25/mo, NOT the $99/mo sticker. List-
 *      price MRR counted them at $99 — a ~43% overstatement per annual seat.
 *   2. Founder / coupon discounts. The 30%-off annual founder coupon (and any
 *      promo code) reduces the amount actually charged. List price ignored it.
 *
 * This module computes MRR from the amount Stripe ACTUALLY bills each active
 * subscription — unit_amount × quantity, minus the attached coupon, amortized to
 * a monthly figure by the price's interval. That is the "sum of real received
 * payments" the founder asked for, sourced from the subscription's real
 * amount/discount (Stripe is the source of truth for money).
 *
 * HONEST + CONSERVATIVE + RESILIENT by construction:
 *   - Never throws. Any failure (Stripe unconfigured/unreachable, a bad row)
 *     falls back to the existing list-price number, so the dashboard/operator
 *     surface keeps working and never shows LESS certainty than before.
 *   - Per-subscription fallback: a sub we can't price from Stripe reverts to its
 *     list price rather than dropping out (never silently undercounts).
 *   - Read-only. It touches no money, no webhook, no entitlement, no stored row —
 *     it only changes a REPORTED number.
 *   - Cached in Redis for 5 min so the shared operator/admin surfaces (polled by
 *     Hermes automation) don't fan out to Stripe on every request.
 *
 * Data note: billing_subscriptions stores no amount/interval/discount locally
 * (stripe_price_id is never populated on the main checkout path), so the real
 * received value is only knowable from Stripe. When Stripe is unavailable the
 * number transparently degrades to list price and `source` says so.
 */

import type { PostgresClient } from "../routes/social-accounts";
import { tryGetStripe } from "../integrations/stripe";
import { tryGetSharedRedis } from "../shared-redis";
import { logger } from "../../../../packages/shared/src/logger";
import {
  mrrForTier,
  applyDiscountCents,
  receivedMonthlyUsd,
} from "../../../../packages/shared/src/pricing";

export interface ReceivedMrr {
  /** Total monthly received value (USD) across all active subscriptions. */
  monthlyUsd: number;
  /** Same set summed at list/sticker price — kept for transparency + the delta. */
  listMonthlyUsd: number;
  /** 'stripe' when computed from real Stripe amounts; 'list' on fallback. */
  source: "stripe" | "list";
  /**
   * Per-subscription monthly received value, keyed by stripe_subscription_id.
   * Callers (e.g. per-tenant MRR in cockpit.ts) look up their sub here and fall
   * back to list price when absent. Empty on the 'list' fallback path.
   */
  bySubscription: Record<string, number>;
}

const CACHE_KEY = "received_mrr:v1";
const CACHE_TTL_S = 300; // 5 minutes

interface ActiveSubRow {
  stripe_subscription_id: string | null;
  plan_tier: string | null;
}

/** Pull the coupon percent_off / amount_off off a Stripe subscription, tolerating
 *  both the legacy `discount` object and the newer `discounts[]` array shape. */
function extractDiscount(
  sub: unknown
): { percentOff?: number | null; amountOffCents?: number | null } | null {
  const s = sub as {
    discount?: { coupon?: { percent_off?: number | null; amount_off?: number | null } | null } | null;
    discounts?: Array<{ coupon?: { percent_off?: number | null; amount_off?: number | null } | string | null } | null> | null;
  };
  // Newer shape first.
  const fromArray = s.discounts?.find((d) => d && typeof d.coupon === "object" && d.coupon)?.coupon;
  const coupon =
    (fromArray && typeof fromArray === "object" ? fromArray : null) ?? s.discount?.coupon ?? null;
  if (!coupon || typeof coupon !== "object") return null;
  return { percentOff: coupon.percent_off ?? null, amountOffCents: coupon.amount_off ?? null };
}

/**
 * Compute received-value MRR. See file header. Never throws; on any failure
 * returns the list-price fallback with source='list'.
 */
export async function fetchReceivedMrr(db: PostgresClient): Promise<ReceivedMrr> {
  // Active subscriptions from our source of truth (billing_subscriptions). The
  // list total is computed from these regardless of the Stripe path, so the
  // fallback is always available.
  let subs: ActiveSubRow[] = [];
  try {
    const res = await db.query<ActiveSubRow>(
      `SELECT stripe_subscription_id, plan_tier
         FROM billing_subscriptions
        WHERE status = 'active'`
    );
    subs = res.rows;
  } catch (err) {
    logger.warn("received_mrr_active_subs_query_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    // No rows to work with — an honest zero, list-sourced.
    return { monthlyUsd: 0, listMonthlyUsd: 0, source: "list", bySubscription: {} };
  }

  const listMonthlyUsd = subs.reduce((sum, s) => sum + mrrForTier(s.plan_tier), 0);
  const listFallback: ReceivedMrr = {
    monthlyUsd: listMonthlyUsd,
    listMonthlyUsd,
    source: "list",
    bySubscription: {},
  };

  const stripe = tryGetStripe();
  if (!stripe) {
    // Stripe not configured → list price is the best (and only) number.
    return listFallback;
  }

  // --- Cache read (best-effort; Redis is optional) ---
  const redis = tryGetSharedRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as ReceivedMrr;
    } catch {
      // Cache miss/parse error → recompute live.
    }
  }

  // --- Live: read the amount Stripe actually bills each active subscription ---
  try {
    // One paginated list (100/page) instead of N retrieves. Expand the coupon so
    // percent_off/amount_off is present without a second round-trip.
    const stripeMonthlyBySubId = new Map<string, number>();
    let startingAfter: string | undefined;
    // Hard page cap (10 pages = 1,000 subs) so a pathological account can't spin
    // this forever; far beyond current scale.
    for (let page = 0; page < 10; page++) {
      const list = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
        expand: ["data.discounts.coupon"],
      });
      for (const sub of list.data) {
        const discount = extractDiscount(sub);
        let monthly = 0;
        for (const item of sub.items?.data ?? []) {
          const price = item.price;
          const unit = price?.unit_amount ?? 0;
          const qty = item.quantity ?? 1;
          const interval = price?.recurring?.interval === "year" ? "year" : "month";
          const grossCents = unit * qty;
          const netCents = applyDiscountCents(grossCents, discount);
          monthly += receivedMonthlyUsd(netCents, interval);
        }
        stripeMonthlyBySubId.set(sub.id, monthly);
      }
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    // Fold onto OUR active set: each local active sub takes its real Stripe
    // amount when known, else falls back to list price (never drops out).
    const bySubscription: Record<string, number> = {};
    let monthlyUsd = 0;
    for (const s of subs) {
      const subId = s.stripe_subscription_id;
      const stripeVal = subId ? stripeMonthlyBySubId.get(subId) : undefined;
      const value = typeof stripeVal === "number" ? stripeVal : mrrForTier(s.plan_tier);
      if (subId) bySubscription[subId] = value;
      monthlyUsd += value;
    }

    const result: ReceivedMrr = {
      // Round to whole USD — these are display figures.
      monthlyUsd: Math.round(monthlyUsd),
      listMonthlyUsd,
      source: "stripe",
      bySubscription,
    };

    if (redis) {
      try {
        await redis.set(CACHE_KEY, JSON.stringify(result), { ex: CACHE_TTL_S });
      } catch {
        // Best-effort cache write.
      }
    }
    return result;
  } catch (err) {
    // Any Stripe failure → transparent list-price fallback (never breaks callers).
    logger.warn("received_mrr_stripe_read_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    return listFallback;
  }
}
