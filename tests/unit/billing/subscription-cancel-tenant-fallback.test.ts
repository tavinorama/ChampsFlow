/**
 * Regression — checkout-first subscriptions must still downgrade on cancel.
 *
 * Bug: handleSubscriptionUpdated/Deleted resolved the tenant ONLY from
 * `subscription.metadata.tenant_id`. The checkout-FIRST flow (marketing-CTA
 * purchases) never stamps that, so `customer.subscription.deleted/updated`
 * were permanent no-ops for that cohort — a customer who cancelled in the
 * Stripe portal stayed `active`/paid forever = access without payment.
 *
 * Fix: resolveSubscriptionTenantId falls back to the durable
 * stripe_subscription_id → billing_subscriptions lookup (the same pattern
 * handleInvoicePaymentFailed already uses). This test fires a
 * customer.subscription.deleted event with NO tenant metadata and asserts the
 * downgrade UPDATE runs with the tenant resolved from the DB row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockConstructEvent = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

const redisStore = new Map<string, string>();
vi.mock("../../../apps/api/src/shared-redis", () => ({
  getSharedRedis: () => ({
    get: async (k: string) => redisStore.get(k) ?? null,
    set: async (k: string, v: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && redisStore.has(k)) return null;
      redisStore.set(k, v);
      return "OK";
    },
    incr: async () => 1,
    expire: async () => 1,
  }),
}));

import { registerBillingRoutes } from "../../../apps/api/src/routes/billing";

const TENANT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SUB_ID = "sub_checkout_first_no_meta";

interface UpdateCall {
  sql: string;
  params: unknown[];
}

/**
 * Mock DB. The tenant-lookup SELECT returns a row only when `hasRow` is true
 * (simulating a persisted checkout-first subscription). Every UPDATE/INSERT is
 * recorded so the test can assert the downgrade ran with the resolved tenant.
 */
function makeMockDb(hasRow: boolean) {
  const updates: UpdateCall[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT tenant_id") && sql.includes("stripe_subscription_id")) {
      return { rows: hasRow ? [{ tenant_id: TENANT_ID }] : [] };
    }
    if (sql.trim().startsWith("UPDATE") || sql.trim().startsWith("INSERT")) {
      updates.push({ sql, params });
    }
    return { rows: [] };
  });
  return { query, setTenantId: async () => {}, transaction: async () => {}, updates };
}

function subscriptionDeletedEventNoMeta() {
  return {
    id: "evt_cancel_no_meta_1",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: SUB_ID,
        metadata: {}, // checkout-first: NO tenant_id
        current_period_end: 1893456000,
      },
    },
  };
}

function post(app: Hono) {
  return app.request("/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: JSON.stringify({ raw: "opaque — constructEvent mocked" }),
  });
}

const originalEnv = process.env;
beforeEach(() => {
  redisStore.clear();
  mockConstructEvent.mockReset();
  mockConstructEvent.mockReturnValue(subscriptionDeletedEventNoMeta());
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  };
});

describe("checkout-first cancel — tenant resolved via stripe_subscription_id fallback", () => {
  it("downgrades the tenant to free even with NO tenant_id in subscription metadata", async () => {
    const db = makeMockDb(true);
    const app = new Hono();
    registerBillingRoutes(app, db as never);

    const res = await post(app);
    expect(res.status).toBe(200);

    // The billing_subscriptions downgrade must have run, scoped to the tenant
    // resolved from the DB (not from metadata, which was empty).
    const subDowngrade = db.updates.find(
      (u) => u.sql.includes("UPDATE billing_subscriptions") && u.sql.includes("'canceled'")
    );
    expect(subDowngrade, "billing_subscriptions downgrade UPDATE should run").toBeTruthy();
    expect(subDowngrade!.params).toContain(TENANT_ID);

    // And the denormalized tenants.plan_tier must be set to free for that tenant.
    const tenantDowngrade = db.updates.find((u) =>
      u.sql.includes("UPDATE tenants SET plan_tier = 'free'")
    );
    expect(tenantDowngrade, "tenants downgrade UPDATE should run").toBeTruthy();
    expect(tenantDowngrade!.params).toContain(TENANT_ID);
  });

  it("is a safe no-op when the subscription is genuinely unknown (no metadata AND no row)", async () => {
    const db = makeMockDb(false);
    const app = new Hono();
    registerBillingRoutes(app, db as never);

    const res = await post(app);
    expect(res.status).toBe(200); // acknowledged, not retried forever

    // No downgrade should be attempted for an unresolved subscription.
    const anyDowngrade = db.updates.find((u) => u.sql.includes("UPDATE billing_subscriptions"));
    expect(anyDowngrade).toBeUndefined();
  });
});
