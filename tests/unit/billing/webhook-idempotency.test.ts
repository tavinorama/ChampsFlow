/**
 * Regression — Stripe webhook idempotency marker must be set AFTER success
 *
 * Bug: the Redis `billing:event:<id>` marker used to be written on RECEIPT
 * (before the event handler ran). If the handler threw (500 → Stripe
 * retries), the marker was already there, so the retry was treated as a
 * duplicate and silently skipped with 200 — the paid event was never
 * actually processed.
 *
 * Fix: the marker is now written only after the handler completes without
 * throwing. This test drives POST /api/billing/webhook twice for the SAME
 * event id:
 *   1. First delivery — the handler throws (simulated DB failure) → 500,
 *      and no idempotency marker is persisted.
 *   2. Second delivery (simulating Stripe's redelivery) — since no marker
 *      exists, the handler runs AGAIN (not skipped as "duplicate") → this
 *      time it succeeds → 200, and the marker is now persisted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock declarations — must be at the top level so vi.mock hoisting works.
// ---------------------------------------------------------------------------

// Mock logger to suppress noise in tests.
vi.mock("../../../packages/shared/src/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Stripe SDK — constructEvent returns whatever the test tells it to,
// regardless of the raw body / signature passed in (signature verification
// itself is covered elsewhere; this test is about idempotency ordering).
const mockConstructEvent = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

// In-memory fake of the shared Redis client (get/set only — the webhook
// route doesn't touch incr/expire/pipeline).
const redisStore = new Map<string, string>();
vi.mock("../../../apps/api/src/shared-redis", () => ({
  getSharedRedis: () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (
      key: string,
      value: string,
      opts?: { ex?: number; nx?: boolean }
    ) => {
      if (opts?.nx && redisStore.has(key)) return null;
      redisStore.set(key, value);
      return "OK";
    },
    incr: async () => 1,
    expire: async () => 1,
  }),
}));

// ---------------------------------------------------------------------------
// Import route AFTER mocks are set up.
// ---------------------------------------------------------------------------
import { registerBillingRoutes } from "../../../apps/api/src/routes/billing";

// ---------------------------------------------------------------------------
// Mock DB — customer.subscription.deleted handler issues two UPDATEs + an
// audit-log INSERT. We make the FIRST `UPDATE billing_subscriptions` call
// throw (simulating a transient DB failure) so the whole handler rejects.
// ---------------------------------------------------------------------------

interface MockRow {
  [key: string]: unknown;
}

function makeMockDb(shouldThrowOnce: { armed: boolean }) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("UPDATE billing_subscriptions") && shouldThrowOnce.armed) {
      shouldThrowOnce.armed = false;
      throw new Error("simulated transient DB failure");
    }
    return { rows: [] as MockRow[] };
  });
  const transaction = async <T,>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> =>
    fn({ query });
  return { query, setTenantId: async () => {}, transaction };
}

function buildApp(db: ReturnType<typeof makeMockDb>): Hono {
  const app = new Hono();
  registerBillingRoutes(app, db as never);
  return app;
}

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EVENT_ID = "evt_test_idempotency_1";

function subscriptionDeletedEvent() {
  return {
    id: EVENT_ID,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_xyz",
        metadata: { tenant_id: TENANT_ID },
        current_period_end: Math.floor(Date.now() / 1000),
      },
    },
  };
}

function postWebhook(app: Hono) {
  return app.request("/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: JSON.stringify({ irrelevant: "raw body is opaque — constructEvent is mocked" }),
  });
}

const originalEnv = process.env;
beforeEach(() => {
  redisStore.clear();
  mockConstructEvent.mockReset();
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  };
});

describe("Stripe webhook idempotency — marker set only after success", () => {
  it("handler throws → 500, and no idempotency marker is persisted", async () => {
    mockConstructEvent.mockReturnValue(subscriptionDeletedEvent());
    const shouldThrowOnce = { armed: true };
    const db = makeMockDb(shouldThrowOnce);
    const app = buildApp(db);

    const res = await postWebhook(app);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("WEBHOOK_HANDLER_ERROR");
    // The bug: this used to be set on receipt, before the handler ran.
    expect(redisStore.has(`billing:event:${EVENT_ID}`)).toBe(false);
  });

  it("a redelivery of the SAME event id re-runs the handler (not skipped as duplicate) and succeeds", async () => {
    mockConstructEvent.mockReturnValue(subscriptionDeletedEvent());
    // Starts armed to fail; the first request consumes the failure and
    // leaves no marker — the second (redelivery) request must therefore
    // still reach the handler rather than being short-circuited as a dup.
    const shouldThrowOnce = { armed: true };
    const db = makeMockDb(shouldThrowOnce);
    const app = buildApp(db);

    const first = await postWebhook(app);
    expect(first.status).toBe(500);
    expect(redisStore.has(`billing:event:${EVENT_ID}`)).toBe(false);

    const second = await postWebhook(app);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { received: boolean; duplicate?: boolean };
    expect(secondBody.received).toBe(true);
    expect(secondBody.duplicate).toBeUndefined(); // NOT treated as a duplicate
    // The handler actually ran twice (once failed, once succeeded) — proof
    // the retry wasn't silently swallowed.
    const updateCalls = db.query.mock.calls.filter(([sql]) =>
      (sql as string).includes("UPDATE billing_subscriptions")
    );
    expect(updateCalls).toHaveLength(2);
    // Only now — after the SECOND (successful) run — is the marker set.
    expect(redisStore.get(`billing:event:${EVENT_ID}`)).toBe("1");
  });

  it("a genuine duplicate delivery AFTER success is skipped (200, duplicate:true) without re-running the handler", async () => {
    mockConstructEvent.mockReturnValue(subscriptionDeletedEvent());
    const shouldThrowOnce = { armed: false }; // succeeds immediately
    const db = makeMockDb(shouldThrowOnce);
    const app = buildApp(db);

    const first = await postWebhook(app);
    expect(first.status).toBe(200);
    expect(redisStore.get(`billing:event:${EVENT_ID}`)).toBe("1");

    const second = await postWebhook(app);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { received: boolean; duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);

    const updateCalls = db.query.mock.calls.filter(([sql]) =>
      (sql as string).includes("UPDATE billing_subscriptions")
    );
    expect(updateCalls).toHaveLength(1); // handler did NOT re-run
  });
});
