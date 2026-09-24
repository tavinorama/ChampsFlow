/**
 * refund-reconcile.ts — B11 (Codex D19, 23/09). Stripe is the ledger; the
 * order tables are a cache of it. When they disagree, the ledger wins.
 *
 * What happened. Stripe live: three Kit charges of US$29, all three refunded
 * in full. The database: one Kit `refunded`, two still `delivered` with no
 * `refunded_at`. The charge.refunded webhook revokes correctly today (see
 * billing.ts), but two of those refunds predate it or missed it, and nothing
 * ever looked back. Revenue screens counted two refunded orders as paid.
 *
 * This module looks back. It is PURE in its planning half (orders in,
 * Stripe facts in, actions out) and idempotent in its apply half (an order
 * already `refunded` is never touched again). It never deletes and never
 * clears delivered_at: the fact that a deliverable was produced stays on
 * record next to the fact that the money went back.
 *
 * Rule it enforces, in words: a paying customer is an order whose charge
 * was for more than zero and was not refunded. Everything else is a
 * delivery, a test or a gift — real, but not revenue.
 */

export type OrderTable = "kit_order" | "ai_audit_order" | "pages_order";

export interface LocalOrder {
  table: OrderTable;
  id: string;
  status: string;
  stripe_session_id: string | null;
  refunded_at: string | null;
  delivered_at?: string | null;
}

/** What Stripe says about the session behind an order. */
export interface StripeSessionFacts {
  /** Session amount_total in cents; null when unknown. */
  amountTotalCents: number | null;
  paymentStatus: string | null;
  /** True when the charge is FULLY refunded; false when not; null when no charge / unknown. */
  chargeRefunded: boolean | null;
  chargeId: string | null;
}

export type ReconcileAction = "revoke" | "zero_dollar" | "ok" | "unknown" | "skip";

export interface ReconcileRow {
  table: OrderTable;
  id: string;
  localStatus: string;
  stripe: StripeSessionFacts | null;
  action: ReconcileAction;
  reason: string;
}

export interface ReconcilePlan {
  rows: ReconcileRow[];
  counts: Record<ReconcileAction, number>;
}

/** Statuses that count as "the customer has something": these are the ones to check. */
export const ENTITLED_STATUSES: readonly string[] = ["paid", "delivered", "credited"];

export async function planRefundReconciliation(
  orders: readonly LocalOrder[],
  lookup: (sessionId: string) => Promise<StripeSessionFacts | null>
): Promise<ReconcilePlan> {
  const rows: ReconcileRow[] = [];
  for (const o of orders) {
    if (!ENTITLED_STATUSES.includes(o.status)) {
      rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: null, action: "skip", reason: `status ${o.status} grants nothing` });
      continue;
    }
    if (!o.stripe_session_id) {
      rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: null, action: "unknown", reason: "no stripe_session_id on the order" });
      continue;
    }
    let facts: StripeSessionFacts | null = null;
    try {
      facts = await lookup(o.stripe_session_id);
    } catch {
      facts = null;
    }
    if (!facts) {
      rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: null, action: "unknown", reason: "Stripe lookup failed or session not found" });
      continue;
    }
    if (facts.chargeRefunded === true) {
      rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: facts, action: "revoke", reason: "charge fully refunded in Stripe; local row still grants access" });
      continue;
    }
    if (facts.amountTotalCents !== null && facts.amountTotalCents <= 0) {
      rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: facts, action: "zero_dollar", reason: "session amount_total is 0: a delivery, not revenue" });
      continue;
    }
    rows.push({ table: o.table, id: o.id, localStatus: o.status, stripe: facts, action: "ok", reason: "paid and not refunded" });
  }
  const counts: Record<ReconcileAction, number> = { revoke: 0, zero_dollar: 0, ok: 0, unknown: 0, skip: 0 };
  for (const r of rows) counts[r.action] += 1;
  return { rows, counts };
}

export interface ReconcileDb {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Apply ONLY the `revoke` rows: status → 'refunded', refunded_at → NOW(),
 * delivered_at untouched. Idempotent by the WHERE clause; a second run
 * matches zero rows. Returns the ids actually changed.
 */
export async function applyRefundReconciliation(db: ReconcileDb, plan: ReconcilePlan): Promise<Array<{ table: OrderTable; id: string }>> {
  const changed: Array<{ table: OrderTable; id: string }> = [];
  for (const r of plan.rows) {
    if (r.action !== "revoke") continue;
    const { rows } = await db.query<{ id: string }>(
      `UPDATE ${r.table}
          SET status = 'refunded', refunded_at = COALESCE(refunded_at, NOW())
        WHERE id = $1 AND status <> 'refunded'
        RETURNING id`,
      [r.id]
    );
    if (rows.length > 0) changed.push({ table: r.table, id: r.id });
  }
  return changed;
}

/** The orders worth checking, from the three tables. */
export async function loadEntitledOrders(db: ReconcileDb): Promise<LocalOrder[]> {
  const out: LocalOrder[] = [];
  for (const table of ["kit_order", "ai_audit_order", "pages_order"] as const) {
    const hasDelivered = table !== "pages_order";
    const { rows } = await db.query<LocalOrder>(
      `SELECT '${table}'::text AS table, id::text AS id, status, stripe_session_id, refunded_at::text AS refunded_at${hasDelivered ? ", delivered_at::text AS delivered_at" : ""}
         FROM ${table}
        WHERE status IN ('paid', 'delivered', 'credited')`
    );
    for (const r of rows) out.push({ ...r, table });
  }
  return out;
}
