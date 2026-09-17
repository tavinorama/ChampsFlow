/**
 * revenue-truth.test.ts — R11 (2026-09-16): a granted tier is not a paying
 * customer, and count × list price is not revenue.
 *
 * Measured 14/09–15/09: `tenants` = 1 agency (set by hand) + 3 free;
 * `billing_subscriptions` = 2 canceled, 0 active; the admin overview tile
 * said "Paid (Agency): 1". Stripe: three Kits charged US$29 and fully
 * refunded; two still `delivered` locally; the cockpit said "Kit revenue
 * US$58". No external paying customer exists in these systems.
 *
 * What these tests hold:
 *   1. the split of a tier headcount into BILLED (active Stripe-backed
 *      subscription) and GRANTED (set by hand) is pure and never negative;
 *   2. the admin overview reads billed tenants from billing_subscriptions
 *      status='active' and returns both numbers;
 *   3. the admin page labels: "Billed", "Granted, not billed", "list value —
 *      not Stripe receipts"; no tile says "Paid" for a tier or "revenue" for
 *      an order count;
 *   4. the cockpit's one-time lines carry the basis note.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitBilledFromGranted, ONE_TIME_BASIS_NOTE } from "../../apps/api/src/lib/cockpit";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("billed vs granted", () => {
  it("the 15/09 state: one agency tier, zero active subscriptions → granted 1, billed 0", () => {
    const out = splitBilledFromGranted({ agency: 1 }, {});
    expect(out).toEqual({ billed: { agency: 0 }, granted: { agency: 1 } });
  });

  it("a billed tenant is subtracted from granted, never below zero", () => {
    expect(splitBilledFromGranted({ growth: 3, agency: 1 }, { growth: 2 })).toEqual({
      billed: { growth: 2, agency: 0 },
      granted: { growth: 1, agency: 1 },
    });
    // A subscription row without a matching tier count cannot make granted negative.
    expect(splitBilledFromGranted({}, { growth: 2 })).toEqual({ billed: { growth: 0 }, granted: { growth: 0 } });
  });
});

describe("the admin overview and page say what they count", () => {
  it("the API counts billed tenants from ACTIVE subscriptions and returns billed + granted", () => {
    const src = read("apps/api/src/routes/admin.ts");
    expect(src).toMatch(/FROM billing_subscriptions\s+WHERE status = 'active' AND plan_tier IS NOT NULL/);
    expect(src).toContain("splitBilledFromGranted(byTier, billedByTier)");
    expect(src).toContain("billed: { growth: billed[\"growth\"] ?? 0, agency: billed[\"agency\"] ?? 0 }");
    expect(src).toContain("granted: { growth: granted[\"growth\"] ?? 0, agency: granted[\"agency\"] ?? 0 }");
  });

  it("the page never calls a tier 'Paid' nor an order count 'revenue'", () => {
    const src = read("apps/web/src/app/admin/page.tsx");
    expect(src).not.toContain('label="Paid (Growth)"');
    expect(src).not.toContain('label="Paid (Agency)"');
    expect(src).not.toContain('label="Kit revenue"');
    expect(src).not.toContain('label="Kit Revenue"');
    expect(src).not.toContain('label="Pages revenue"');
    expect(src).toContain('label="Billed (Growth)"');
    expect(src).toContain('label="Billed (Agency)"');
    expect(src).toContain('label="Granted, not billed"');
    expect(src).toContain("not Stripe receipts");
  });

  it("the cockpit's one-time lines carry the basis", () => {
    const src = read("apps/api/src/lib/cockpit.ts");
    expect(src).toContain('basis: "list_value_of_local_status"');
    expect(ONE_TIME_BASIS_NOTE).toContain("not Stripe receipts");
  });

  it("the reconciliation listing selects no customer e-mail", () => {
    const sql = read("scripts/sql/orders-vs-stripe-reconcile.sql");
    expect(sql).not.toMatch(/\bemail\b/);
    expect(sql).toContain("stripe_session_id");
    expect(sql).toContain("READ ONLY");
  });
});
