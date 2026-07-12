/**
 * pages_order unit tests (#208 PR-2) — Ozvor Pages $99 one-time purchase.
 *
 * claimPagesOrders runs at first-login bootstrap (onboarding.ts, same contract
 * as claimFreeTests/claimKitOrders — #166): grant the landing-site credits from
 * paid-but-unclaimed pages_order rows matching the Supabase-verified email.
 * These tests pin the contract:
 *   - claims only status='paid' rows (pending never credits; credited never
 *     double-credits) and stamps credited_tenant_id
 *   - increments tenants.extra_landing_sites by the number of claimed orders
 *   - normalizes the verified email (lower + trim)
 *   - best-effort: a DB error returns 0 and never throws (signup must not fail)
 *   - a blank email is a no-op (no query)
 */

import { describe, it, expect, vi } from "vitest";
import { claimPagesOrders } from "../../apps/api/src/routes/onboarding";

function makeDb(
  overrides: { queryResults?: Array<{ rows: unknown[] }>; throwOn?: number } = {}
) {
  let callCount = 0;
  const queries: string[] = [];
  const params: unknown[][] = [];
  const results = overrides.queryResults ?? [];
  const query = vi.fn(async (sql: string, p?: unknown[]) => {
    queries.push(sql);
    params.push(p ?? []);
    if (overrides.throwOn !== undefined && callCount === overrides.throwOn) {
      callCount++;
      throw new Error("Simulated DB error");
    }
    const result = results[callCount] ?? { rows: [] };
    callCount++;
    return result;
  });
  const setTenantId = vi.fn(async () => {});
  // claimPagesOrders now runs the status transition + tenant increment inside a
  // single db.transaction (#262 atomicity fix). The mock runs the callback with
  // a tx that proxies to the SAME query fn, so the call-count results + throwOn
  // behave identically and a throw inside rejects the transaction (as in prod).
  const transaction = vi.fn(async (fn: (tx: { query: typeof query; setTenantId: typeof setTenantId }) => unknown) =>
    fn({ query, setTenantId })
  );
  return {
    query,
    setTenantId,
    transaction,
    _queries: queries,
    _params: params,
  };
}

type Db = Parameters<typeof claimPagesOrders>[0];
const TENANT = "tenant-123";

describe("claimPagesOrders", () => {
  it("credits paid orders by normalized email and increments extra_landing_sites", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ id: "a" }, { id: "b" }] }, { rows: [] }],
    });
    const count = await claimPagesOrders(db as unknown as Db, TENANT, "  Buyer@Example.COM ");

    expect(count).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(2);

    // 1st query: the guarded status transition on pages_order.
    const claimSql = db._queries[0];
    expect(claimSql).toContain("UPDATE pages_order");
    expect(claimSql).toContain("status = 'credited'");
    expect(claimSql).toContain("credited_tenant_id = $1");
    expect(claimSql).toContain("status = 'paid'"); // only paid rows → no double-credit
    expect(claimSql).toContain("RETURNING id");
    expect(db._params[0][0]).toBe(TENANT);
    expect(db._params[0][1]).toBe("buyer@example.com"); // lower + trim

    // 2nd query: the credit — +N on tenants.extra_landing_sites.
    const creditSql = db._queries[1];
    expect(creditSql).toContain("UPDATE tenants");
    expect(creditSql).toContain("extra_landing_sites = extra_landing_sites + $2");
    expect(db._params[1][0]).toBe(TENANT);
    expect(db._params[1][1]).toBe(2); // one credit per claimed order
  });

  it("returns 0 for a blank email without querying", async () => {
    const db = makeDb();
    const count = await claimPagesOrders(db as unknown as Db, TENANT, "");
    expect(count).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("does NOT touch tenants when nothing matches (no paid order)", async () => {
    const db = makeDb({ queryResults: [{ rows: [] }] });
    const count = await claimPagesOrders(db as unknown as Db, TENANT, "new@example.com");
    expect(count).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1); // claim attempt only, no credit
  });

  it("is best-effort: a DB error returns 0 and does not throw", async () => {
    const db = makeDb({ throwOn: 0 });
    await expect(
      claimPagesOrders(db as unknown as Db, TENANT, "buyer@example.com")
    ).resolves.toBe(0);
  });

  it("is best-effort even when the credit update fails after the claim", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ id: "a" }] }],
      throwOn: 1,
    });
    await expect(
      claimPagesOrders(db as unknown as Db, TENANT, "buyer@example.com")
    ).resolves.toBe(0);
  });
});
