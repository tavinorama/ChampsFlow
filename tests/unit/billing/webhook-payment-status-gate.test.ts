/**
 * webhook-payment-status-gate.test.ts — launch-eve QA P1 #2.
 *
 * checkout.session.completed fires when the CHECKOUT finishes, not when the
 * money settles. Delayed methods (boleto, some bank debits) complete with
 * payment_status='unpaid' — the old handlers granted the Kit / Pages credit /
 * subscription anyway. The gate: grant ONLY when payment_status is 'paid' or
 * 'no_payment_required' (trials, 100%-off promo codes); otherwise defer to
 * checkout.session.async_payment_succeeded (routed to the same handler) or
 * async_payment_failed (marks the one-time order 'failed').
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock declarations — top level so vi.mock hoisting works.
// ---------------------------------------------------------------------------

vi.mock("../../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Stripe SDK — constructEvent returns whatever the test tells it to.
const mockConstructEvent = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    charges = { retrieve: vi.fn() };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

// In-memory fake of the shared Redis client.
const redisStore = new Map<string, string>();
vi.mock("../../../apps/api/src/shared-redis", () => ({
  getSharedRedis: () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => {
      if (opts?.nx && redisStore.has(key)) return null;
      redisStore.set(key, value);
      return "OK";
    },
    incr: async () => 1,
    expire: async () => 1,
  }),
}));

// Best-effort side channels — must not run for real in unit tests.
const mockSendKitEmail = vi.fn(async () => {});
vi.mock("../../../packages/shared/src/emails/kit-delivery", () => ({
  sendKitDeliveryEmail: (...args: unknown[]) => mockSendKitEmail(...args),
}));
const mockSendPagesEmail = vi.fn(async () => {});
vi.mock("../../../packages/shared/src/emails/pages-purchase", () => ({
  sendPagesPurchaseEmail: (...args: unknown[]) => mockSendPagesEmail(...args),
}));
vi.mock("../../../packages/shared/src/emails/bonus-delivery", () => ({
  sendBonusDeliveryEmail: vi.fn(async () => {}),
}));
vi.mock("../../../apps/api/src/routes/nurture", () => ({
  enrollNurture: vi.fn(async () => {}),
  suppressOnConversion: vi.fn(async () => {}),
  registerNurtureRoutes: vi.fn(),
}));

// Import route AFTER mocks are set up.
import { registerBillingRoutes } from "../../../apps/api/src/routes/billing";

// ---------------------------------------------------------------------------
// Recording DB mock — returns canned rows for the lookups the grant paths
// make; every call is recorded so tests assert which writes were (not) issued.
// ---------------------------------------------------------------------------

function makeRecordingDb() {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("SELECT email, brand FROM kit_order")) {
      return { rows: [{ email: "buyer@example.com", brand: "Acme" }] };
    }
    if (sql.includes("UPDATE pages_order") && sql.includes("RETURNING email")) {
      return { rows: [{ email: "buyer@example.com" }] };
    }
    return { rows: [] as unknown[] };
  });
  const transaction = async <T,>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> =>
    fn({ query });
  return { query, setTenantId: async () => {}, transaction };
}

type Db = ReturnType<typeof makeRecordingDb>;

function buildApp(db: Db): Hono {
  const app = new Hono();
  registerBillingRoutes(app, db as never);
  return app;
}

function callsMatching(db: Db, fragment: string) {
  return db.query.mock.calls.filter(([sql]) => (sql as string).includes(fragment));
}

let eventSeq = 0;
function makeEvent(type: string, session: Record<string, unknown>) {
  return { id: `evt_gate_${++eventSeq}`, type, data: { object: session } };
}

function kitSession(payment_status: string) {
  return {
    id: "cs_kit_1",
    mode: "payment",
    payment_status,
    customer_details: { email: "buyer@example.com" },
    metadata: { product: "get_cited_kit", kit_order_id: "kit-1", order_token: "tok-1" },
  };
}

function pagesSession(payment_status: string) {
  return {
    id: "cs_pages_1",
    mode: "payment",
    payment_status,
    customer_details: { email: "buyer@example.com" },
    metadata: { product: "ozvor_pages_site", pages_order_id: "pages-1" },
  };
}

function subscriptionSession(payment_status: string) {
  return {
    id: "cs_sub_1",
    mode: "subscription",
    payment_status,
    customer: "cus_sub_1",
    subscription: "sub_sub_1",
    customer_details: { email: "buyer@example.com" },
    metadata: { tenant_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", plan_tier: "growth" },
  };
}

function postWebhook(app: Hono) {
  return app.request("/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: JSON.stringify({ opaque: true }),
  });
}

const originalEnv = process.env;
beforeEach(() => {
  redisStore.clear();
  mockConstructEvent.mockReset();
  mockSendKitEmail.mockClear();
  mockSendPagesEmail.mockClear();
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  };
});

describe("checkout.session.completed — payment_status gate", () => {
  it("Kit with payment_status='unpaid' grants NOTHING (no kit_order write, no email)", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", kitSession("unpaid")));
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200); // acknowledged — Stripe must not retry a deferral
    expect(callsMatching(db, "UPDATE kit_order")).toHaveLength(0);
    expect(mockSendKitEmail).not.toHaveBeenCalled();
  });

  it("Kit with payment_status='paid' still grants (regression guard)", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", kitSession("paid")));
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    const updates = callsMatching(db, "UPDATE kit_order");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0][0]).toContain("status='paid'");
    expect(mockSendKitEmail).toHaveBeenCalledTimes(1);
  });

  it("Kit with 'no_payment_required' (100%-off promo) grants — free is not unpaid", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", kitSession("no_payment_required"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(callsMatching(db, "UPDATE kit_order").length).toBeGreaterThan(0);
  });

  it("Pages with payment_status='unpaid' grants nothing", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", pagesSession("unpaid")));
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(callsMatching(db, "UPDATE pages_order")).toHaveLength(0);
    expect(callsMatching(db, "extra_landing_sites")).toHaveLength(0);
    expect(mockSendPagesEmail).not.toHaveBeenCalled();
  });

  it("subscription with payment_status='unpaid' writes no billing_subscriptions row", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", subscriptionSession("unpaid"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(callsMatching(db, "billing_subscriptions")).toHaveLength(0);
    expect(callsMatching(db, "UPDATE tenants")).toHaveLength(0);
  });

  it("subscription with payment_status='paid' still activates (regression guard)", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", subscriptionSession("paid"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(callsMatching(db, "INSERT INTO billing_subscriptions").length).toBeGreaterThan(0);
  });
});

describe("checkout.session.async_payment_succeeded / async_payment_failed", () => {
  it("async_payment_succeeded (now payment_status='paid') grants the Kit", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.async_payment_succeeded", kitSession("paid"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(callsMatching(db, "UPDATE kit_order").length).toBeGreaterThan(0);
    expect(mockSendKitEmail).toHaveBeenCalledTimes(1);
  });

  it("the full boleto flow: completed(unpaid) defers, async_payment_succeeded grants ONCE", async () => {
    const db = makeRecordingDb();
    const app = buildApp(db);

    mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", kitSession("unpaid")));
    expect((await postWebhook(app)).status).toBe(200);
    expect(callsMatching(db, "UPDATE kit_order")).toHaveLength(0);

    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.async_payment_succeeded", kitSession("paid"))
    );
    expect((await postWebhook(app)).status).toBe(200);
    expect(callsMatching(db, "UPDATE kit_order")).toHaveLength(1);
  });

  it("async_payment_failed marks the Kit order 'failed' (pending only)", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.async_payment_failed", kitSession("unpaid"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    const updates = callsMatching(db, "UPDATE kit_order");
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain("status='failed'");
    expect(updates[0][0]).toContain("status='pending'"); // only closes in-flight orders
    expect(updates[0][1]).toEqual(["kit-1"]);
  });

  it("async_payment_failed marks the Pages order 'failed'", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.async_payment_failed", pagesSession("unpaid"))
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    const updates = callsMatching(db, "UPDATE pages_order");
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain("status='failed'");
    expect(updates[0][1]).toEqual(["pages-1"]);
  });
});
