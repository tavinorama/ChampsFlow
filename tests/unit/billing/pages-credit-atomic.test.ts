/**
 * pages-credit-atomic.test.ts — proves the Pages credit is ATOMIC and credits
 * EXACTLY ONCE across failure + retry (Hermes #263 related-HIGH).
 *
 * claimPagesOrders runs the status transition (paid→credited) and the tenant
 * increment inside ONE db.transaction. This test drives a faithful stateful
 * mock that models commit/rollback: a failure mid-transaction must leave the
 * order 'paid' and the tenant balance untouched (rollback); a retry then credits
 * once; a further retry credits nothing (the status guard blocks double-credit).
 */
import { describe, it, expect } from "vitest";
import { claimPagesOrders } from "../../../apps/api/src/routes/onboarding";

interface Order { id: string; email: string; status: string; credited_tenant_id?: string }
interface State { orders: Order[]; tenants: Record<string, number> }

function makeStatefulDb(initial: State, opts: { failTenantUpdate?: boolean } = {}) {
  const state: State = structuredClone(initial);
  let failTenantUpdate = opts.failTenantUpdate ?? false;

  function run(s: State, sql: string, params: unknown[] = []) {
    if (/UPDATE pages_order/.test(sql) && /status = 'credited'/.test(sql)) {
      const tenantId = params[0] as string;
      const email = params[1] as string;
      const matched = s.orders.filter((o) => o.email === email && o.status === "paid");
      matched.forEach((o) => {
        o.status = "credited";
        o.credited_tenant_id = tenantId;
      });
      return { rows: matched.map((o) => ({ id: o.id })) };
    }
    if (/UPDATE tenants/.test(sql)) {
      if (failTenantUpdate) throw new Error("Simulated tenant-update failure");
      const tenantId = params[0] as string;
      const count = params[1] as number;
      s.tenants[tenantId] = (s.tenants[tenantId] ?? 0) + count;
      return { rows: [] };
    }
    return { rows: [] };
  }

  const db = {
    setTenantId: async () => {},
    query: async (sql: string, params?: unknown[]) => run(state, sql, params),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(state);
      const tx = { setTenantId: async () => {}, query: async (sql: string, params?: unknown[]) => run(state, sql, params) };
      try {
        return await fn(tx);
      } catch (e) {
        // rollback: restore pre-transaction state (both statements or neither)
        state.orders = snapshot.orders;
        state.tenants = snapshot.tenants;
        throw e;
      }
    },
    setFail: (v: boolean) => {
      failTenantUpdate = v;
    },
    state,
  };
  return db;
}

type Db = Parameters<typeof claimPagesOrders>[0];
const TENANT = "tenant-1";
const EMAIL = "buyer@example.com";

describe("claimPagesOrders — atomic credit, exactly once", () => {
  it("credits once on success and moves the order to credited", async () => {
    const db = makeStatefulDb({ orders: [{ id: "o1", email: EMAIL, status: "paid" }], tenants: {} });
    const n = await claimPagesOrders(db as unknown as Db, TENANT, EMAIL);
    expect(n).toBe(1);
    expect(db.state.orders[0].status).toBe("credited");
    expect(db.state.tenants[TENANT]).toBe(1);
  });

  it("rolls back BOTH writes when the tenant update fails mid-transaction", async () => {
    const db = makeStatefulDb({ orders: [{ id: "o1", email: EMAIL, status: "paid" }], tenants: {} }, { failTenantUpdate: true });
    const n = await claimPagesOrders(db as unknown as Db, TENANT, EMAIL);
    expect(n).toBe(0); // best-effort returns 0
    // Rollback: the order must NOT be left 'credited', and no balance granted.
    expect(db.state.orders[0].status).toBe("paid");
    expect(db.state.tenants[TENANT]).toBeUndefined();
  });

  it("a retry after a failed attempt credits EXACTLY ONCE (no loss, no double)", async () => {
    const db = makeStatefulDb({ orders: [{ id: "o1", email: EMAIL, status: "paid" }], tenants: {} }, { failTenantUpdate: true });
    // 1st attempt fails + rolls back
    expect(await claimPagesOrders(db as unknown as Db, TENANT, EMAIL)).toBe(0);
    expect(db.state.orders[0].status).toBe("paid");

    // Infra recovers → retry credits once
    db.setFail(false);
    expect(await claimPagesOrders(db as unknown as Db, TENANT, EMAIL)).toBe(1);
    expect(db.state.orders[0].status).toBe("credited");
    expect(db.state.tenants[TENANT]).toBe(1);

    // A duplicate retry (webhook replay) credits nothing — status guard blocks it.
    expect(await claimPagesOrders(db as unknown as Db, TENANT, EMAIL)).toBe(0);
    expect(db.state.tenants[TENANT]).toBe(1); // still exactly one
  });
});
