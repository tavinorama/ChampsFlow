/**
 * Unit — ownerEmailForTenant (deliverables email ultimate fallback).
 *
 * When a 100%-off subscription checkout carries no email on the Stripe session
 * or customer, the webhook falls back to the tenant's owner email so the bonus
 * deliverables are never silently skipped. Locks: resolves the owner email,
 * tolerates no rows / no tenant, and never throws.
 */
import { describe, it, expect, vi } from "vitest";
import { ownerEmailForTenant } from "../../../apps/api/src/lib/tenant-email";

function mockDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { db: { query } as never, query };
}

describe("ownerEmailForTenant", () => {
  it("resolves the owner email for a tenant", async () => {
    const { db, query } = mockDb([{ email: "owner@acme.co" }]);
    expect(await ownerEmailForTenant(db, "tenant-1")).toBe("owner@acme.co");
    // scoped by tenant + owner role
    expect(query.mock.calls[0][1]).toEqual(["tenant-1"]);
  });

  it("returns null when the tenant has no owner row", async () => {
    const { db } = mockDb([]);
    expect(await ownerEmailForTenant(db, "tenant-1")).toBeNull();
  });

  it("returns null for a missing tenant id without hitting the db", async () => {
    const { db, query } = mockDb([{ email: "x@y.co" }]);
    expect(await ownerEmailForTenant(db, null)).toBeNull();
    expect(await ownerEmailForTenant(db, undefined)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("never throws — a db error resolves to null", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const db = { query } as never;
    await expect(ownerEmailForTenant(db, "tenant-1")).resolves.toBeNull();
  });
});
