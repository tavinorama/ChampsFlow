/**
 * fail-closed.test.ts — the billing restriction gate must FAIL CLOSED on a DB
 * error (Hermes full QA audit #261, P2; founder decision: money/cost checks
 * fail closed, not open).
 *
 * requireNotRestricted() protects PAID actions (post generation, scheduling).
 * It used to `next()` (allow the billable action) when the subscription lookup
 * threw — so a canceled/past-due tenant could slip a paid action through during
 * a DB blip. It must now return 503 and NOT call next.
 */
import { describe, it, expect } from "vitest";
import { requireNotRestricted } from "../../../apps/api/src/routes/billing";

interface JsonCall {
  body: { code?: string; error?: string };
  status: number;
}

function fakeCtx() {
  const calls: { json: JsonCall | null } = { json: null };
  const ctx = {
    get: (k: string) => (k === "auth" ? { tenantId: "t1" } : undefined),
    req: { path: "/api/drafts/generate" },
    json: (body: JsonCall["body"], status: number) => {
      calls.json = { body, status };
      return { body, status };
    },
  };
  return { ctx, calls };
}

describe("requireNotRestricted — fail-CLOSED on DB error (#261 P2)", () => {
  it("returns 503 and does NOT call next when the subscription check throws", async () => {
    const db = {
      setTenantId: async () => {},
      query: async () => {
        throw new Error("db connection lost");
      },
    } as unknown as Parameters<typeof requireNotRestricted>[0];

    const { ctx, calls } = fakeCtx();
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireNotRestricted(db)(ctx as any, next as any);

    expect(nextCalled).toBe(false); // paid action NOT granted on ambiguous error
    expect(calls.json?.status).toBe(503);
    expect(calls.json?.body.code).toBe("BILLING_CHECK_UNAVAILABLE");
  });

  it("still allows a free-tier tenant (no billing row) through — no regression", async () => {
    const db = {
      setTenantId: async () => {},
      query: async () => ({ rows: [] }),
    } as unknown as Parameters<typeof requireNotRestricted>[0];

    const { ctx } = fakeCtx();
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireNotRestricted(db)(ctx as any, next as any);
    expect(nextCalled).toBe(true);
  });
});
