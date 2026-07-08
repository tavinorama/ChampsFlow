/**
 * identity-claim unit tests (#166) — funnel continuity.
 *
 * On first login, claimFreeTests / claimKitOrders link a returning visitor's
 * pre-account free tests (lead_capture) and Kit purchases (kit_order) to their
 * new tenant by the Supabase-verified email. These tests pin the contract:
 *   - matches on email, only unclaimed rows, stamps claimed_by_tenant_id
 *   - normalizes the verified email (lower + trim)
 *   - returns the claimed count
 *   - is best-effort: a DB error returns 0 and never throws (signup must not fail)
 *   - a blank email is a no-op (no query)
 */

import { describe, it, expect, vi } from "vitest";
import { claimFreeTests, claimKitOrders } from "../../apps/api/src/routes/onboarding";

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
  return {
    query,
    setTenantId: vi.fn(async () => {}),
    transaction: vi.fn(),
    _queries: queries,
    _params: params,
  };
}

type Db = Parameters<typeof claimFreeTests>[0];
const TENANT = "tenant-123";

describe.each([
  ["claimFreeTests", claimFreeTests, "lead_capture"],
  ["claimKitOrders", claimKitOrders, "kit_order"],
] as const)("%s", (_name, claim, table) => {
  it("claims unclaimed rows by normalized email and stamps the tenant", async () => {
    const db = makeDb({ queryResults: [{ rows: [{ id: "a" }, { id: "b" }] }] });
    const count = await claim(db as unknown as Db, TENANT, "  Buyer@Example.COM ");

    expect(count).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = db._queries[0];
    expect(sql).toContain(`UPDATE ${table}`);
    expect(sql).toContain("claimed_by_tenant_id = $1");
    expect(sql).toContain("claimed_at IS NULL"); // only unclaimed → idempotent
    expect(sql).toContain("RETURNING id");
    // params: [tenantId, normalizedEmail]
    expect(db._params[0][0]).toBe(TENANT);
    expect(db._params[0][1]).toBe("buyer@example.com"); // lower + trim
  });

  it("returns 0 for a blank email without querying", async () => {
    const db = makeDb();
    const count = await claim(db as unknown as Db, TENANT, "");
    expect(count).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("is best-effort: a DB error returns 0 and does not throw", async () => {
    const db = makeDb({ throwOn: 0 });
    await expect(
      claim(db as unknown as Db, TENANT, "buyer@example.com")
    ).resolves.toBe(0);
  });

  it("returns 0 when nothing matches (no prior test/kit)", async () => {
    const db = makeDb({ queryResults: [{ rows: [] }] });
    const count = await claim(db as unknown as Db, TENANT, "new@example.com");
    expect(count).toBe(0);
  });
});
