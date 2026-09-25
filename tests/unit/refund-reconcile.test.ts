/**
 * refund-reconcile.test.ts — B11 (Codex D19, 23/09).
 * Three Kit charges refunded in Stripe; two rows still `delivered` locally.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planRefundReconciliation,
  applyRefundReconciliation,
  type LocalOrder,
  type StripeSessionFacts,
} from "../../apps/api/src/lib/refund-reconcile";

const order = (o: Partial<LocalOrder>): LocalOrder => ({
  table: "kit_order", id: "k1", status: "delivered", stripe_session_id: "cs_1", refunded_at: null, delivered_at: "2026-07-10T00:00:00Z", ...o,
});
const facts = (f: Partial<StripeSessionFacts>): StripeSessionFacts => ({ amountTotalCents: 2900, paymentStatus: "paid", chargeRefunded: false, chargeId: "ch_1", ...f });

describe("planRefundReconciliation", () => {
  it("the production case: two delivered Kits whose charges Stripe shows fully refunded → revoke; the third already refunded → skip", async () => {
    const orders = [
      order({ id: "k1", stripe_session_id: "cs_1" }),
      order({ id: "k2", stripe_session_id: "cs_2" }),
      order({ id: "k3", status: "refunded", refunded_at: "2026-07-13T00:00:00Z", stripe_session_id: "cs_3" }),
    ];
    const plan = await planRefundReconciliation(orders, async () => facts({ chargeRefunded: true }));
    expect(plan.rows.map((r) => [r.id, r.action])).toEqual([["k1", "revoke"], ["k2", "revoke"], ["k3", "skip"]]);
    expect(plan.counts.revoke).toBe(2);
  });
  it("a $0 checkout that was delivered is a delivery, not revenue — flagged, never revoked", async () => {
    const plan = await planRefundReconciliation([order({ table: "ai_audit_order", id: "a1" })], async () => facts({ amountTotalCents: 0, chargeRefunded: null, chargeId: null }));
    expect(plan.rows[0]!.action).toBe("zero_dollar");
  });
  it("paid and not refunded → ok; partial refund (charge.refunded=false) → ok", async () => {
    const plan = await planRefundReconciliation([order({})], async () => facts({ chargeRefunded: false }));
    expect(plan.rows[0]!.action).toBe("ok");
  });
  it("no session id, or a Stripe lookup that fails, is unknown — never a guess either way", async () => {
    const plan = await planRefundReconciliation(
      [order({ id: "k1", stripe_session_id: null }), order({ id: "k2" })],
      async () => { throw new Error("stripe down"); }
    );
    expect(plan.rows.map((r) => r.action)).toEqual(["unknown", "unknown"]);
  });
});

describe("applyRefundReconciliation — idempotent, never deletes, keeps delivered_at", () => {
  it("revokes only the revoke rows, and a second run matches nothing", async () => {
    const executed: string[] = [];
    const state = new Map([["k1", "delivered"], ["k2", "delivered"]]);
    const db = {
      async query<T>(sql: string, params?: unknown[]) {
        executed.push(sql);
        const id = String(params?.[0]);
        if (state.get(id) === "refunded") return { rows: [] as T[] };
        state.set(id, "refunded");
        return { rows: [{ id }] as T[] };
      },
    };
    const plan = await planRefundReconciliation(
      [order({ id: "k1", stripe_session_id: "cs_1" }), order({ id: "k2", stripe_session_id: "cs_2" }), order({ table: "ai_audit_order", id: "a1", stripe_session_id: "cs_3" })],
      async (sid) => (sid === "cs_1" ? facts({ chargeRefunded: true }) : facts({ amountTotalCents: 0, chargeRefunded: null }))
    );
    const first = await applyRefundReconciliation(db, plan);
    expect(first).toEqual([{ table: "kit_order", id: "k1" }]);
    expect(executed.every((s) => !/DELETE/i.test(s) && !/delivered_at\s*=/.test(s))).toBe(true);
    expect(executed[0]).toContain("refunded_at = COALESCE(refunded_at, NOW())");
    expect(executed[0]).toContain("status <> 'refunded'");
    const second = await applyRefundReconciliation(db, plan);
    expect(second).toEqual([]);
  });
});

describe("the operator endpoint", () => {
  const src = readFileSync(join(__dirname, "../../apps/api/src/routes/api-keys.ts"), "utf8");
  it("is dry-run by default, applies only with ?apply=1, and returns ids, never e-mails", () => {
    expect(src).toContain('app.post("/api/v1/operator/billing/reconcile-refunds", operatorKey');
    expect(src).toContain('const apply = c.req.query("apply") === "1"');
    expect(src).toContain("const changed = apply ? await applyRefundReconciliation(db, plan) : []");
    expect(src).toContain("ids only — no email");
    expect(src).toContain("a paying customer is an order whose charge was for more than zero and was not refunded");
  });
});
