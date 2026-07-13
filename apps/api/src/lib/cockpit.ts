/**
 * Business-cockpit queries — shared by the founder /admin dashboard AND the
 * Hermes operator API so both surfaces read the SAME numbers (single source of
 * truth for "who are my clients" and "what is my revenue").
 *
 * All queries here are cross-tenant reads. They are only ever called from
 * super-admin admin routes or operator-key routes, both of which run WITHOUT a
 * tenant scope (the login role bypasses RLS) — never call db.setTenantId().
 * No PII is logged by callers; owner email is returned in the payload (a
 * business-scope surface) but never written to logs.
 */

import type { PostgresClient } from "../routes/social-accounts";
import { LIST_PRICE_USD, computeMrr, mrrForTier, arrFromMrr } from "../../../../packages/shared/src/pricing";

// ---------------------------------------------------------------------------
// Enriched clients
// ---------------------------------------------------------------------------

export interface EnrichedClient {
  id: string;
  name: string;
  plan_tier: string | null;
  created_at: string;
  brand_count: number;
  owner_email: string | null;
  sub_status: string | null;
  sub_plan_tier: string | null;
  renews_at: string | null;
  cancel_at_period_end: boolean;
  mrr_usd: number;
  audits_run: number;
  last_audit_at: string | null;
}

interface EnrichedClientRow {
  id: string;
  name: string;
  plan_tier: string | null;
  created_at: string;
  brand_count: string;
  owner_email: string | null;
  sub_status: string | null;
  sub_plan_tier: string | null;
  renews_at: string | null;
  cancel_at_period_end: boolean | null;
  audits_run: string;
  last_audit_at: string | null;
}

/**
 * Tenants enriched with owner email, current subscription state, per-tenant MRR,
 * and product usage (audits run + last audit). One row per tenant.
 */
export async function fetchEnrichedClients(
  db: PostgresClient,
  limit = 200
): Promise<EnrichedClient[]> {
  const result = await db.query<EnrichedClientRow>(
    `SELECT t.id, t.name, t.plan_tier, t.created_at,
            COUNT(DISTINCT b.id)                      AS brand_count,
            owner.email                               AS owner_email,
            sub.status                                AS sub_status,
            sub.plan_tier                             AS sub_plan_tier,
            sub.current_period_end                    AS renews_at,
            COALESCE(sub.cancel_at_period_end, FALSE) AS cancel_at_period_end,
            (SELECT COUNT(*)        FROM geo_audit ga WHERE ga.tenant_id = t.id) AS audits_run,
            (SELECT MAX(ga.created_at) FROM geo_audit ga WHERE ga.tenant_id = t.id) AS last_audit_at
       FROM tenants t
       LEFT JOIN brands b ON b.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT email FROM users u
          WHERE u.tenant_id = t.id AND u.role = 'owner' AND u.deleted_at IS NULL
          ORDER BY u.created_at ASC
          LIMIT 1
       ) owner ON TRUE
       LEFT JOIN LATERAL (
         SELECT status, plan_tier, current_period_end, cancel_at_period_end
           FROM billing_subscriptions bs
          WHERE bs.tenant_id = t.id
          ORDER BY (bs.status = 'active') DESC, bs.updated_at DESC
          LIMIT 1
       ) sub ON TRUE
      GROUP BY t.id, owner.email, sub.status, sub.plan_tier,
               sub.current_period_end, sub.cancel_at_period_end
      ORDER BY t.created_at DESC
      LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    plan_tier: row.plan_tier,
    created_at: row.created_at,
    brand_count: parseInt(row.brand_count, 10),
    owner_email: row.owner_email,
    sub_status: row.sub_status,
    sub_plan_tier: row.sub_plan_tier,
    renews_at: row.renews_at,
    cancel_at_period_end: row.cancel_at_period_end === true,
    // Per-tenant MRR only counts an actively-billing subscription.
    mrr_usd: row.sub_status === "active" ? mrrForTier(row.sub_plan_tier) : 0,
    audits_run: parseInt(row.audits_run, 10),
    last_audit_at: row.last_audit_at,
  }));
}

// ---------------------------------------------------------------------------
// Revenue summary
// ---------------------------------------------------------------------------

export interface RevenueSummary {
  mrr_usd: number;
  arr_usd: number;
  subscriptions: {
    active: { growth: number; agency: number; starter: number; total: number };
    trialing: number;
    pastDue: number;
    canceled: number;
  };
  oneTime: {
    kit: { paid: number; refunded: number; revenueUsd: number };
    pages: { paid: number; refunded: number; revenueUsd: number };
  };
  refundsTotalCount: number;
}

async function countByStatus(
  db: PostgresClient,
  table: "kit_order" | "pages_order"
): Promise<Record<string, number>> {
  try {
    const res = await db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM ${table} GROUP BY status`
    );
    const map: Record<string, number> = {};
    for (const row of res.rows) map[row.status] = parseInt(row.count, 10);
    return map;
  } catch (err) {
    // pages_order may be absent in older environments — degrade to empty.
    if ((err as { code?: string }).code === "42P01") return {};
    throw err;
  }
}

/**
 * Full money picture: recurring MRR/ARR (active subs only), one-time Kit + Pages
 * revenue, and refund counts. Derived from the order/subscription tables — there
 * is no dedicated payments table.
 */
export async function fetchRevenueSummary(db: PostgresClient): Promise<RevenueSummary> {
  // Subscriptions by tier + status.
  const subRes = await db.query<{ plan_tier: string | null; status: string | null; count: string }>(
    `SELECT plan_tier, status, COUNT(*) AS count
       FROM billing_subscriptions
      GROUP BY plan_tier, status`
  );

  const activeByTier: Record<string, number> = {};
  let trialing = 0;
  let pastDue = 0;
  let canceled = 0;
  const mrrRows: Array<{ plan_tier: string | null; status: string | null }> = [];

  for (const row of subRes.rows) {
    const count = parseInt(row.count, 10);
    if (row.status === "active") {
      activeByTier[row.plan_tier ?? "unknown"] = (activeByTier[row.plan_tier ?? "unknown"] ?? 0) + count;
      // Expand into per-sub rows so computeMrr applies the canonical rule.
      for (let i = 0; i < count; i++) mrrRows.push({ plan_tier: row.plan_tier, status: "active" });
    } else if (row.status === "trialing") {
      trialing += count;
    } else if (row.status === "past_due") {
      pastDue += count;
    } else if (row.status === "canceled") {
      canceled += count;
    }
  }

  const growth = activeByTier["growth"] ?? 0;
  const agency = activeByTier["agency"] ?? 0;
  const starter = activeByTier["starter"] ?? 0;
  const mrr = computeMrr(mrrRows);

  // One-time orders.
  const kit = await countByStatus(db, "kit_order");
  const pages = await countByStatus(db, "pages_order");

  const kitPaid = (kit["paid"] ?? 0) + (kit["delivered"] ?? 0);
  const kitRefunded = kit["refunded"] ?? 0;
  const pagesPaid = (pages["paid"] ?? 0) + (pages["credited"] ?? 0);
  const pagesRefunded = pages["refunded"] ?? 0;

  return {
    mrr_usd: mrr,
    arr_usd: arrFromMrr(mrr),
    subscriptions: {
      active: { growth, agency, starter, total: growth + agency + starter },
      trialing,
      pastDue,
      canceled,
    },
    oneTime: {
      kit: { paid: kitPaid, refunded: kitRefunded, revenueUsd: kitPaid * LIST_PRICE_USD.kit },
      pages: { paid: pagesPaid, refunded: pagesRefunded, revenueUsd: pagesPaid * LIST_PRICE_USD.pages },
    },
    refundsTotalCount: kitRefunded + pagesRefunded,
  };
}
