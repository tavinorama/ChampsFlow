/**
 * webhook-ai-audit.test.ts — the AI Audit Stack ($49) branch of the Stripe
 * webhook, mirroring the Kit branch:
 *   - checkout.session.completed (paid, product=ai_audit_stack) → order paid +
 *     session bound, deliverable BUILT + STORED, delivery email sent WITH the
 *     result inline, free_to_kit suppressed, ai_audit_to_full enrolled;
 *   - a redelivery of the same event is a duplicate (marker) and does NOT
 *     re-send; a second event for an already-delivered order does not re-send
 *     either (only the paid → delivered transition notifies);
 *   - unpaid session → nothing granted (payment gate);
 *   - async_payment_failed → 'failed'; charge.refunded → 'refunded';
 *   - table missing (42P01) → 500 so Stripe retries, never a silent 200.
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
    charges = { retrieve: vi.fn() };
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

vi.mock("../../../packages/shared/src/emails/kit-delivery", () => ({ sendKitDeliveryEmail: vi.fn(async () => {}) }));
vi.mock("../../../packages/shared/src/emails/pages-purchase", () => ({ sendPagesPurchaseEmail: vi.fn(async () => {}) }));
vi.mock("../../../packages/shared/src/emails/bonus-delivery", () => ({ sendBonusDeliveryEmail: vi.fn(async () => {}) }));

const mockSendAiAuditEmail = vi.fn(async (_p: unknown) => ({ id: "msg" }));
vi.mock("../../../packages/shared/src/emails/ai-audit-delivery", () => ({
  sendAiAuditDeliveryEmail: (p: unknown) => mockSendAiAuditEmail(p),
}));
const mockEnroll = vi.fn(async (_db: unknown, _p: unknown) => ({ enrollmentId: "e", alreadyEnrolled: false }));
const mockSuppress = vi.fn(async (_db: unknown, _email: string) => {});
vi.mock("../../../apps/api/src/routes/nurture", () => ({
  enrollNurture: (db: unknown, p: unknown) => mockEnroll(db, p),
  suppressOnConversion: (db: unknown, e: string) => mockSuppress(db, e),
  registerNurtureRoutes: vi.fn(),
}));

import { registerBillingRoutes } from "../../../apps/api/src/routes/billing";

interface FakeOrder {
  id: string; order_token: string; email: string; business_type: string | null; primary_focus: string | null;
  answers: unknown; status: string; deliverable: unknown; stripe_session_id: string | null;
}

function makeDb(opts: { tableExists?: boolean; freeTestRan?: boolean } = {}) {
  const tableExists = opts.tableExists ?? true;
  const orders: FakeOrder[] = [{
    id: "aa-1", order_token: "tok-aa-1", email: "buyer@example.com", business_type: "agency", primary_focus: "marketing",
    answers: { businessType: "agency", primaryFocus: "marketing", pains: ["content-volume", "lead-research"], engines: [], toolsInUse: [] },
    status: "pending", deliverable: null, stripe_session_id: null,
  }];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM ai_tool")) return { rows: [] };
    if (sql.includes("FROM users u")) return { rows: [] };
    if (sql.includes("FROM lead_capture WHERE lower(email)")) return { rows: opts.freeTestRan ? [{ one: 1 }] : [] };
    if (sql.includes("ai_audit_order")) {
      if (!tableExists) throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      if (sql.includes("SET status='paid'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status === "pending") { o.status = "paid"; o.stripe_session_id = String(params[1]); }
        return { rows: [] };
      }
      if (sql.includes("FROM ai_audit_order WHERE id = $1")) return { rows: orders.filter((o) => o.id === params[0]) };
      if (sql.includes("SET status='delivered'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status === "paid") { o.status = "delivered"; o.deliverable = params[1]; return { rows: [{ id: o.id }] }; }
        return { rows: [] };
      }
      if (sql.includes("SELECT status, deliverable FROM ai_audit_order")) {
        return { rows: orders.filter((o) => o.id === params[0]).map((o) => ({ status: o.status, deliverable: o.deliverable })) };
      }
      if (sql.includes("SET status='failed'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status === "pending") o.status = "failed";
        return { rows: [] };
      }
      if (sql.includes("SET status = 'refunded'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status !== "refunded") { o.status = "refunded"; return { rows: [{ claimed_by_tenant_id: null }] }; }
        return { rows: [] };
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
  const transaction = async <T,>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> => fn({ query });
  return { db: { query, setTenantId: async () => {}, transaction }, query, orders };
}

function buildApp(db: unknown): Hono {
  const app = new Hono();
  registerBillingRoutes(app, db as never);
  return app;
}

let seq = 0;
function evt(type: string, object: Record<string, unknown>, id?: string) {
  return { id: id ?? `evt_ai_${++seq}`, type, data: { object } };
}
function session(payment_status = "paid") {
  return {
    id: "cs_ai_1", mode: "payment", payment_status,
    customer_details: { email: "buyer@example.com" },
    metadata: { product: "ai_audit_stack", ai_audit_order_id: "aa-1", order_token: "tok-aa-1" },
  };
}
function postWebhook(app: Hono) {
  return app.request("/api/billing/webhook", {
    method: "POST", headers: { "stripe-signature": "sig" }, body: JSON.stringify({ opaque: true }),
  });
}

const originalEnv = process.env;
beforeEach(() => {
  redisStore.clear();
  mockConstructEvent.mockReset();
  mockSendAiAuditEmail.mockClear();
  mockEnroll.mockClear();
  mockSuppress.mockClear();
  process.env = { ...originalEnv, NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_dummy", STRIPE_WEBHOOK_SECRET: "whsec_dummy" };
});

describe("Stripe webhook — AI Audit Stack ($49) branch", () => {
  it("paid checkout → order paid+bound, deliverable built + stored, email WITH the result, nurture", async () => {
    const { db, orders } = makeDb();
    mockConstructEvent.mockReturnValue(evt("checkout.session.completed", session("paid")));
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    const o = orders[0]!;
    expect(o.status).toBe("delivered");
    expect(o.stripe_session_id).toBe("cs_ai_1");
    expect(o.deliverable).toBeTruthy();
    const d = o.deliverable as { entry: { pick: { tool: { name: string } } | null; totalMatched: number } };
    expect(d.entry.pick).not.toBeNull();

    // The email carries the actual pick inline (founder rule).
    expect(mockSendAiAuditEmail).toHaveBeenCalledTimes(1);
    const p = mockSendAiAuditEmail.mock.calls[0]![0] as { to: string; orderToken: string; pick: { name: string } | null; totalMatched: number; hasFreeTest: boolean };
    expect(p.to).toBe("buyer@example.com");
    expect(p.orderToken).toBe("tok-aa-1");
    expect(p.pick?.name).toBe(d.entry.pick!.tool.name);
    expect(p.totalMatched).toBe(d.entry.totalMatched);
    expect(p.hasFreeTest).toBe(false); // never ran /test → cross-sell it

    // Same dynamic as the Kit: suppress free_to_kit + enroll the next rung.
    expect(mockSuppress).toHaveBeenCalledWith(expect.anything(), "buyer@example.com");
    expect(mockEnroll).toHaveBeenCalledTimes(1);
    const enroll = mockEnroll.mock.calls[0]![1] as { sequence: string; email: string; metadata: { hasFreeTest: boolean } };
    expect(enroll.sequence).toBe("ai_audit_to_full");
    expect(enroll.email).toBe("buyer@example.com");
    expect(enroll.metadata.hasFreeTest).toBe(false);
  });

  it("hasFreeTest=true when the email already ran the free GEO test (no cross-sell noise)", async () => {
    const { db } = makeDb({ freeTestRan: true });
    mockConstructEvent.mockReturnValue(evt("checkout.session.completed", session("paid")));
    await postWebhook(buildApp(db));
    const p = mockSendAiAuditEmail.mock.calls[0]![0] as { hasFreeTest: boolean };
    expect(p.hasFreeTest).toBe(true);
  });

  it("idempotent: same event redelivered → duplicate (no second email); a NEW event for a delivered order → no second email either", async () => {
    const { db } = makeDb();
    const app = buildApp(db);
    mockConstructEvent.mockReturnValue(evt("checkout.session.completed", session("paid"), "evt_same"));
    expect((await postWebhook(app)).status).toBe(200);
    const again = await postWebhook(app);
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    expect(mockSendAiAuditEmail).toHaveBeenCalledTimes(1);

    // async_payment_succeeded arriving after the sync path already delivered
    mockConstructEvent.mockReturnValue(evt("checkout.session.async_payment_succeeded", session("paid"), "evt_other"));
    expect((await postWebhook(app)).status).toBe(200);
    expect(mockSendAiAuditEmail).toHaveBeenCalledTimes(1);
    expect(mockEnroll).toHaveBeenCalledTimes(1);
  });

  it("payment gate: unpaid session grants nothing", async () => {
    const { db, orders } = makeDb();
    mockConstructEvent.mockReturnValue(evt("checkout.session.completed", session("unpaid")));
    expect((await postWebhook(buildApp(db))).status).toBe(200);
    expect(orders[0]!.status).toBe("pending");
    expect(mockSendAiAuditEmail).not.toHaveBeenCalled();
  });

  it("async_payment_failed → 'failed'; charge.refunded → 'refunded'", async () => {
    const { db, orders } = makeDb();
    const app = buildApp(db);
    mockConstructEvent.mockReturnValue(evt("checkout.session.async_payment_failed", session("unpaid")));
    expect((await postWebhook(app)).status).toBe(200);
    expect(orders[0]!.status).toBe("failed");

    const { db: db2, orders: orders2 } = makeDb();
    orders2[0]!.status = "delivered";
    mockConstructEvent.mockReturnValue(
      evt("charge.refunded", { id: "ch_1", refunded: true, amount: 4900, amount_refunded: 4900, metadata: { product: "ai_audit_stack", ai_audit_order_id: "aa-1", order_token: "tok-aa-1" } })
    );
    expect((await postWebhook(buildApp(db2))).status).toBe(200);
    expect(orders2[0]!.status).toBe("refunded");
  });

  it("table missing (migration pending) → 500 so Stripe retries; never a silent 200", async () => {
    const { db } = makeDb({ tableExists: false });
    mockConstructEvent.mockReturnValue(evt("checkout.session.completed", session("paid")));
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(500);
    expect(mockSendAiAuditEmail).not.toHaveBeenCalled();
  });
});
