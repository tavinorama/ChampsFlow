/**
 * webhook-refund-revocation.test.ts — launch-eve QA P1 #1.
 *
 * charge.refunded / charge.dispute.created now revoke what the charge paid
 * for: kit_order → 'refunded', pages_order → 'refunded' + un-credit the
 * tenant's extra_landing_sites, subscription → local cancel + downgrade to
 * free. Resolution: charge metadata names Kit/Pages orders (stamped via
 * payment_intent_data.metadata at checkout creation); subscription charges
 * carry no product metadata and resolve via charge.customer. Partial refunds
 * (charge.refunded === false) revoke nothing; disputes always revoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock declarations — top level so vi.mock hoisting works.
// ---------------------------------------------------------------------------

vi.mock("../../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Stripe SDK — constructEvent + charges.retrieve (dispute handler fetches
// the disputed charge to learn what to revoke).
const mockConstructEvent = vi.fn();
const mockChargeRetrieve = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    charges = { retrieve: mockChargeRetrieve };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

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

vi.mock("../../../packages/shared/src/emails/kit-delivery", () => ({
  sendKitDeliveryEmail: vi.fn(async () => {}),
}));
vi.mock("../../../packages/shared/src/emails/pages-purchase", () => ({
  sendPagesPurchaseEmail: vi.fn(async () => {}),
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
// Stateful DB mock — models the rows the revocation paths touch, so tests
// assert on RESULTING STATE (order revoked, credit removed, plan downgraded)
// rather than on SQL strings.
// ---------------------------------------------------------------------------

interface KitOrder { id: string; status: string; claimed_by_tenant_id: string | null }
interface PagesOrder { id: string; status: string; credited_tenant_id: string | null }
interface Tenant { plan_tier: string; extra_landing_sites: number }
interface Subscription { stripe_customer_id: string; tenant_id: string; status: string; plan_tier: string; stripe_event_id_last: string | null }

interface State {
  kitOrders: KitOrder[];
  pagesOrders: PagesOrder[];
  tenants: Record<string, Tenant>;
  subscriptions: Subscription[];
  auditEvents: string[];
}

function makeStatefulDb(initial: Partial<State>) {
  const state: State = {
    kitOrders: [],
    pagesOrders: [],
    tenants: {},
    subscriptions: [],
    auditEvents: [],
    ...structuredClone(initial),
  };

  async function run(sql: string, params: unknown[] = []) {
    if (/UPDATE kit_order/.test(sql) && /'refunded'/.test(sql)) {
      const order = state.kitOrders.find((o) => o.id === params[0] && o.status !== "refunded");
      if (!order) return { rows: [] };
      order.status = "refunded";
      return { rows: [{ claimed_by_tenant_id: order.claimed_by_tenant_id }] };
    }
    if (/UPDATE pages_order/.test(sql) && /'refunded'/.test(sql)) {
      const order = state.pagesOrders.find((o) => o.id === params[0] && o.status !== "refunded");
      if (!order) return { rows: [] };
      order.status = "refunded";
      return { rows: [{ credited_tenant_id: order.credited_tenant_id }] };
    }
    if (/GREATEST\(extra_landing_sites - 1, 0\)/.test(sql)) {
      const t = state.tenants[params[0] as string];
      if (t) t.extra_landing_sites = Math.max(0, t.extra_landing_sites - 1);
      return { rows: [] };
    }
    if (/UPDATE billing_subscriptions/.test(sql) && /'canceled'/.test(sql)) {
      const matched = state.subscriptions.filter(
        (s) => s.stripe_customer_id === params[0] && s.stripe_event_id_last !== params[1]
      );
      matched.forEach((s) => {
        s.status = "canceled";
        s.plan_tier = "free";
        s.stripe_event_id_last = params[1] as string;
      });
      return { rows: matched.map((s) => ({ tenant_id: s.tenant_id })) };
    }
    if (/UPDATE tenants SET plan_tier = 'free' WHERE id = \$1/.test(sql)) {
      const t = state.tenants[params[0] as string];
      if (t) t.plan_tier = "free";
      return { rows: [] };
    }
    if (/INSERT INTO audit_log/.test(sql)) {
      state.auditEvents.push(params[1] as string);
      return { rows: [] };
    }
    return { rows: [] };
  }

  return {
    setTenantId: async () => {},
    query: vi.fn(run),
    transaction: async <T,>(fn: (tx: { query: typeof run }) => Promise<T>): Promise<T> =>
      fn({ query: run }),
    state,
  };
}

type Db = ReturnType<typeof makeStatefulDb>;

function buildApp(db: Db): Hono {
  const app = new Hono();
  registerBillingRoutes(app, db as never);
  return app;
}

let eventSeq = 0;
function chargeEvent(charge: Record<string, unknown>, type = "charge.refunded") {
  return { id: `evt_revoke_${++eventSeq}`, type, data: { object: charge } };
}

function kitCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: "ch_kit",
    refunded: true,
    amount: 2900,
    amount_refunded: 2900,
    customer: null,
    metadata: { product: "get_cited_kit", kit_order_id: "kit-1", order_token: "tok-1" },
    ...overrides,
  };
}

function pagesCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: "ch_pages",
    refunded: true,
    amount: 9900,
    amount_refunded: 9900,
    customer: null,
    metadata: { product: "ozvor_pages_site", pages_order_id: "pages-1" },
    ...overrides,
  };
}

function subscriptionCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: "ch_sub",
    refunded: true,
    amount: 83100,
    amount_refunded: 83100,
    customer: "cus_9",
    metadata: {},
    ...overrides,
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
  mockChargeRetrieve.mockReset();
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  };
});

describe("charge.refunded — Kit revocation", () => {
  it("a FULL refund revokes a delivered Kit (status → refunded)", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "delivered", claimed_by_tenant_id: null }],
    });
    mockConstructEvent.mockReturnValue(chargeEvent(kitCharge()));

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(db.state.kitOrders[0].status).toBe("refunded");
  });

  it("writes an audit_log entry when the Kit was claimed by a tenant", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "paid", claimed_by_tenant_id: "tenant-7" }],
      tenants: { "tenant-7": { plan_tier: "free", extra_landing_sites: 0 } },
    });
    mockConstructEvent.mockReturnValue(chargeEvent(kitCharge()));

    await postWebhook(buildApp(db));

    expect(db.state.kitOrders[0].status).toBe("refunded");
    expect(db.state.auditEvents).toContain("kit_order_revoked_refund");
  });

  it("a PARTIAL refund (charge.refunded=false) revokes NOTHING", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "delivered", claimed_by_tenant_id: null }],
    });
    mockConstructEvent.mockReturnValue(
      chargeEvent(kitCharge({ refunded: false, amount_refunded: 500 }))
    );

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(db.state.kitOrders[0].status).toBe("delivered"); // untouched
  });
});

describe("charge.refunded — Pages credit revocation", () => {
  it("revokes a credited order AND removes the tenant's landing-site credit", async () => {
    const db = makeStatefulDb({
      pagesOrders: [{ id: "pages-1", status: "credited", credited_tenant_id: "tenant-1" }],
      tenants: { "tenant-1": { plan_tier: "free", extra_landing_sites: 1 } },
    });
    mockConstructEvent.mockReturnValue(chargeEvent(pagesCharge()));

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(db.state.pagesOrders[0].status).toBe("refunded");
    expect(db.state.tenants["tenant-1"].extra_landing_sites).toBe(0);
    expect(db.state.auditEvents).toContain("pages_order_revoked_refund");
  });

  it("a second refund event for the same order does NOT double-decrement", async () => {
    const db = makeStatefulDb({
      pagesOrders: [{ id: "pages-1", status: "credited", credited_tenant_id: "tenant-1" }],
      tenants: { "tenant-1": { plan_tier: "free", extra_landing_sites: 2 } },
    });
    const app = buildApp(db);

    mockConstructEvent.mockReturnValue(chargeEvent(pagesCharge()));
    await postWebhook(app);
    // Distinct event id (Stripe re-sends refund updates as new events) — the
    // Redis marker doesn't apply; the status<>'refunded' guard must hold.
    mockConstructEvent.mockReturnValue(chargeEvent(pagesCharge()));
    await postWebhook(app);

    expect(db.state.tenants["tenant-1"].extra_landing_sites).toBe(1); // -1 exactly once
  });

  it("the credit floor is 0 — an already-consumed credit never goes negative", async () => {
    const db = makeStatefulDb({
      pagesOrders: [{ id: "pages-1", status: "credited", credited_tenant_id: "tenant-1" }],
      tenants: { "tenant-1": { plan_tier: "free", extra_landing_sites: 0 } },
    });
    mockConstructEvent.mockReturnValue(chargeEvent(pagesCharge()));

    await postWebhook(buildApp(db));

    expect(db.state.pagesOrders[0].status).toBe("refunded");
    expect(db.state.tenants["tenant-1"].extra_landing_sites).toBe(0);
  });

  it("a paid-but-unclaimed order revokes with NO tenant decrement (nothing was granted)", async () => {
    const db = makeStatefulDb({
      pagesOrders: [{ id: "pages-1", status: "paid", credited_tenant_id: null }],
      tenants: { "tenant-1": { plan_tier: "free", extra_landing_sites: 3 } },
    });
    mockConstructEvent.mockReturnValue(chargeEvent(pagesCharge()));

    await postWebhook(buildApp(db));

    expect(db.state.pagesOrders[0].status).toBe("refunded"); // claim can never grant it now
    expect(db.state.tenants["tenant-1"].extra_landing_sites).toBe(3);
  });
});

describe("charge.refunded — subscription revocation (via charge.customer)", () => {
  it("cancels locally and downgrades the tenant to free", async () => {
    const db = makeStatefulDb({
      subscriptions: [
        { stripe_customer_id: "cus_9", tenant_id: "tenant-2", status: "active", plan_tier: "growth", stripe_event_id_last: null },
      ],
      tenants: { "tenant-2": { plan_tier: "growth", extra_landing_sites: 0 } },
    });
    mockConstructEvent.mockReturnValue(chargeEvent(subscriptionCharge()));

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(db.state.subscriptions[0].status).toBe("canceled");
    expect(db.state.subscriptions[0].plan_tier).toBe("free");
    expect(db.state.tenants["tenant-2"].plan_tier).toBe("free");
    expect(db.state.auditEvents).toContain("billing_subscription_revoked_refund");
  });

  it("an unmatched charge (no metadata, no customer) is acknowledged without writes", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "paid", claimed_by_tenant_id: null }],
      subscriptions: [
        { stripe_customer_id: "cus_9", tenant_id: "tenant-2", status: "active", plan_tier: "growth", stripe_event_id_last: null },
      ],
    });
    mockConstructEvent.mockReturnValue(
      chargeEvent({ id: "ch_x", refunded: true, amount: 100, amount_refunded: 100, customer: null, metadata: {} })
    );

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200); // 500 would make Stripe retry forever — unresolvable
    expect(db.state.kitOrders[0].status).toBe("paid");
    expect(db.state.subscriptions[0].status).toBe("active");
  });
});

describe("charge.dispute.created — revokes via the retrieved charge", () => {
  it("retrieves the disputed charge and revokes the Kit it paid for", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "delivered", claimed_by_tenant_id: null }],
    });
    mockConstructEvent.mockReturnValue(
      chargeEvent({ id: "dp_1", charge: "ch_kit" }, "charge.dispute.created")
    );
    // The dispute's charge is NOT fully refunded — dispute revokes regardless.
    mockChargeRetrieve.mockResolvedValue(kitCharge({ refunded: false, amount_refunded: 0 }));

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(200);
    expect(mockChargeRetrieve).toHaveBeenCalledWith("ch_kit");
    expect(db.state.kitOrders[0].status).toBe("refunded");
  });

  it("a dispute on a subscription charge cancels + downgrades the tenant", async () => {
    const db = makeStatefulDb({
      subscriptions: [
        { stripe_customer_id: "cus_9", tenant_id: "tenant-2", status: "active", plan_tier: "agency", stripe_event_id_last: null },
      ],
      tenants: { "tenant-2": { plan_tier: "agency", extra_landing_sites: 0 } },
    });
    mockConstructEvent.mockReturnValue(
      chargeEvent({ id: "dp_2", charge: "ch_sub" }, "charge.dispute.created")
    );
    mockChargeRetrieve.mockResolvedValue(subscriptionCharge({ refunded: false, amount_refunded: 0 }));

    await postWebhook(buildApp(db));

    expect(db.state.subscriptions[0].status).toBe("canceled");
    expect(db.state.tenants["tenant-2"].plan_tier).toBe("free");
    expect(db.state.auditEvents).toContain("billing_subscription_revoked_dispute");
  });

  it("a Stripe retrieve failure returns 500 (Stripe retries) and leaves no idempotency marker", async () => {
    const db = makeStatefulDb({
      kitOrders: [{ id: "kit-1", status: "delivered", claimed_by_tenant_id: null }],
    });
    const event = chargeEvent({ id: "dp_3", charge: "ch_kit" }, "charge.dispute.created");
    mockConstructEvent.mockReturnValue(event);
    mockChargeRetrieve.mockRejectedValue(new Error("stripe unavailable"));

    const res = await postWebhook(buildApp(db));

    expect(res.status).toBe(500);
    expect(db.state.kitOrders[0].status).toBe("delivered"); // not yet revoked...
    expect(redisStore.has(`billing:event:${event.id}`)).toBe(false); // ...but the retry WILL re-run
  });
});
