/**
 * credit-pack-checkout.test.ts — the 1,000-credit overage pack, money path.
 *
 * Two halves, both money-critical:
 *
 * A. createCreditPackCheckoutSession (apps/api/src/integrations/stripe.ts)
 *    - mode = 'payment' (a pack is a one-off, never a subscription);
 *    - unit_amount is DERIVED from the amountUsd passed in, which the route
 *      computes from overagePackUsd(1000) — the $13 formula, never a literal.
 *      Proven two ways: (1) unit_amount == round(overagePackUsd(1000)*100),
 *      (2) a different amountUsd yields a different unit_amount (so the number
 *      tracks its input rather than a baked-in constant);
 *    - metadata carries product='credit_pack', tenant_id, credits — the exact
 *      keys the webhook branch reads back;
 *    - buyerEmail is passed through when present, omitted when null.
 *
 * B. Webhook credit branch (apps/api/src/routes/billing.ts)
 *    - a settled credit_pack session credits the ledger once;
 *    - a Stripe REDELIVERY of the same session (different event id, so the
 *      Redis event marker does not dedupe it) does NOT double-credit — the
 *      DB ON CONFLICT on (tenant, ref_type, md5(session.id)) makes the second
 *      insert a no-op. Modeled with a fake ledger that honours ON CONFLICT.
 *
 * Follows the shape of tests/unit/billing/*.test.ts and tests/unit/checkout/*.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ===========================================================================
// PART A — checkout session build
// ===========================================================================

const mockCreate = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    checkout = { sessions: { create: mockCreate } };
    charges = { retrieve: vi.fn() };
    customers = { retrieve: vi.fn(async () => ({ email: null })) };
    webhooks = { constructEvent: (): unknown => mockConstructEvent() };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

// logger — silence
vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createCreditPackCheckoutSession } from "../../apps/api/src/integrations/stripe";
import { overagePackUsd } from "../../packages/shared/src/credits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastCreateArgs = (): any => mockCreate.mock.calls.at(-1)?.[0];

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("createCreditPackCheckoutSession — payment mode, derived price, right metadata", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "cs_credit_pack_test",
      url: "https://checkout.stripe.com/c/pay/cs_credit_pack_test",
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  });

  it("prices the pack from overagePackUsd(1000), not a hardcoded number", async () => {
    const credits = 1000;
    const amountUsd = overagePackUsd(credits); // the $13 formula
    const { url } = await createCreditPackCheckoutSession({
      tenantId: TENANT,
      credits,
      amountUsd,
      buyerEmail: "buyer@example.com",
      successUrl: "https://ozvor.com/dashboard-v3?credits=purchased",
      cancelUrl: "https://ozvor.com/dashboard-v3?credits=cancelled",
    });
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_credit_pack_test");

    const args = lastCreateArgs();
    expect(args.mode).toBe("payment");
    const line = args.line_items[0];
    expect(line.quantity).toBe(1);
    expect(line.price_data.currency).toBe("usd");
    // unit_amount is cents, derived straight from the formula's dollars.
    expect(line.price_data.unit_amount).toBe(Math.round(amountUsd * 100));
    // Documents the current formula output ($13 → 1300 cents) without the
    // production code carrying that literal anywhere.
    expect(amountUsd).toBe(13);
    expect(line.price_data.unit_amount).toBe(1300);
    expect(line.price_data.product_data.name).toContain("1,000");
  });

  it("unit_amount tracks its input (proves it is not a baked-in constant)", async () => {
    await createCreditPackCheckoutSession({
      tenantId: TENANT,
      credits: 1000,
      amountUsd: 13.37,
      buyerEmail: null,
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(lastCreateArgs().line_items[0].price_data.unit_amount).toBe(1337);
  });

  it("metadata carries product / tenant_id / credits on both session and payment_intent", async () => {
    await createCreditPackCheckoutSession({
      tenantId: TENANT,
      credits: 1000,
      amountUsd: overagePackUsd(1000),
      buyerEmail: "buyer@example.com",
      successUrl: "s",
      cancelUrl: "c",
    });
    const args = lastCreateArgs();
    expect(args.metadata).toMatchObject({
      product: "credit_pack",
      tenant_id: TENANT,
      credits: "1000",
    });
    expect(args.payment_intent_data.metadata).toMatchObject({
      product: "credit_pack",
      tenant_id: TENANT,
    });
  });

  it("passes buyer email when present, omits customer_email when null", async () => {
    await createCreditPackCheckoutSession({
      tenantId: TENANT,
      credits: 1000,
      amountUsd: 13,
      buyerEmail: "buyer@example.com",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(lastCreateArgs().customer_email).toBe("buyer@example.com");

    await createCreditPackCheckoutSession({
      tenantId: TENANT,
      credits: 1000,
      amountUsd: 13,
      buyerEmail: null,
      successUrl: "s",
      cancelUrl: "c",
    });
    expect("customer_email" in lastCreateArgs()).toBe(false);
  });

  it("throws when Stripe returns a session without a URL", async () => {
    mockCreate.mockResolvedValueOnce({ id: "cs_no_url", url: null });
    await expect(
      createCreditPackCheckoutSession({
        tenantId: TENANT,
        credits: 1000,
        amountUsd: 13,
        buyerEmail: null,
        successUrl: "s",
        cancelUrl: "c",
      })
    ).rejects.toThrow(/URL is null/);
  });
});

// ===========================================================================
// PART B — webhook credits the ledger idempotently
// ===========================================================================

const mockConstructEvent = vi.fn();

const redisStore = new Map<string, string>();
vi.mock("../../apps/api/src/shared-redis", () => ({
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

// Email modules billing.ts loads at import time (unused by the credit branch,
// stubbed so the module graph resolves without sending anything).
vi.mock("../../packages/shared/src/emails/kit-delivery", () => ({
  sendKitDeliveryEmail: vi.fn(async () => {}),
}));
vi.mock("../../packages/shared/src/emails/pages-purchase", () => ({
  sendPagesPurchaseEmail: vi.fn(async () => {}),
}));
vi.mock("../../packages/shared/src/emails/bonus-delivery", () => ({
  sendBonusDeliveryEmail: vi.fn(async () => {}),
}));

import { registerBillingRoutes } from "../../apps/api/src/routes/billing";

/**
 * Fake DB that models the ONE guarantee under test: the credit_ledger INSERT
 * uses ON CONFLICT (tenant, ref_type, ref_id) DO NOTHING, ref_id = md5(session).
 * The fake keys applied grants by (tenant | ref_type | session-id) and refuses
 * to apply a second grant for the same key when the SQL says ON CONFLICT.
 */
function makeLedgerDb() {
  const applied = new Set<string>();
  let balance = 0;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO credit_ledger")) {
      const tenant = params?.[0] as string;
      const delta = Number(params?.[1] ?? 0);
      const sessionId = params?.[2] as string; // $3 → md5($3)::uuid ref_id
      const key = `${tenant}|stripe_session|${sessionId}`;
      const hasConflictGuard = sql.includes("ON CONFLICT") && sql.includes("DO NOTHING");
      if (hasConflictGuard && applied.has(key)) {
        // Redelivery: DB makes it a no-op. No balance change.
        return { rows: [] };
      }
      applied.add(key);
      balance += delta;
      return { rows: [] };
    }
    if (sql.includes("SELECT name FROM tenants")) return { rows: [{ name: "Acme Tenant" }] };
    if (sql.includes("role = 'owner'")) return { rows: [{ email: "owner@example.com" }] };
    if (sql.includes("SELECT id FROM nurture_enrollment")) return { rows: [{ id: params?.[0] ?? "x" }] };
    return { rows: [] as unknown[] };
  });
  const transaction = async <T,>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> =>
    fn({ query });
  return {
    query,
    setTenantId: async () => {},
    transaction,
    creditsApplied: () => applied.size,
    balance: () => balance,
  };
}
type LedgerDb = ReturnType<typeof makeLedgerDb>;

function buildApp(db: LedgerDb): Hono {
  const app = new Hono();
  registerBillingRoutes(app, db as never);
  return app;
}

function creditPackEvent(eventId: string, sessionId: string) {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        mode: "payment",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: { product: "credit_pack", tenant_id: TENANT, credits: "1000" },
      },
    },
  };
}

function postWebhook(app: Hono) {
  return app.request("/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: JSON.stringify({ opaque: "constructEvent is mocked" }),
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
afterEach(() => {
  process.env = originalEnv;
});

describe("credit_pack webhook — credits once, idempotent on redelivery", () => {
  it("a settled credit_pack session credits 1,000 to the ledger", async () => {
    mockConstructEvent.mockReturnValue(creditPackEvent("evt_cp_1", "cs_cp_once"));
    const db = makeLedgerDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);

    const inserts = db.query.mock.calls.filter(([s]) => (s as string).includes("INSERT INTO credit_ledger"));
    expect(inserts).toHaveLength(1);
    // Params: [tenant, delta, sessionId]
    expect(inserts[0]![1]).toEqual([TENANT, 1000, "cs_cp_once"]);
    // The idempotency guard is present in the SQL, not just assumed.
    expect(inserts[0]![0]).toContain("ON CONFLICT");
    expect(inserts[0]![0]).toContain("md5($3)::uuid");
    expect(db.creditsApplied()).toBe(1);
    expect(db.balance()).toBe(1000);
  });

  it("a redelivery of the SAME session (new event id) does NOT double-credit", async () => {
    const db = makeLedgerDb();
    const app = buildApp(db);

    // First delivery.
    mockConstructEvent.mockReturnValue(creditPackEvent("evt_cp_A", "cs_cp_dup"));
    expect((await postWebhook(app)).status).toBe(200);

    // Stripe redelivers the same session under a DIFFERENT event id. The Redis
    // event marker keys on event id, so it does NOT dedupe this — the handler
    // runs again and hits the credit branch a second time.
    mockConstructEvent.mockReturnValue(creditPackEvent("evt_cp_B", "cs_cp_dup"));
    expect((await postWebhook(app)).status).toBe(200);

    // Both deliveries issued an INSERT...
    const inserts = db.query.mock.calls.filter(([s]) => (s as string).includes("INSERT INTO credit_ledger"));
    expect(inserts).toHaveLength(2);
    // ...but the DB ON CONFLICT applied the grant only ONCE.
    expect(db.creditsApplied()).toBe(1);
    expect(db.balance()).toBe(1000);
  });

  it("missing tenant_id / credits metadata: no ledger insert, webhook still 200s", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_cp_bad",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_cp_bad",
          mode: "payment",
          payment_status: "paid",
          customer_details: { email: "buyer@example.com" },
          metadata: { product: "credit_pack" }, // no tenant_id, no credits
        },
      },
    });
    const db = makeLedgerDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    const inserts = db.query.mock.calls.filter(([s]) => (s as string).includes("INSERT INTO credit_ledger"));
    expect(inserts).toHaveLength(0);
    expect(db.balance()).toBe(0);
  });

  it("an unsettled session (payment_status != paid) does not credit", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_cp_unpaid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_cp_unpaid",
          mode: "payment",
          payment_status: "unpaid",
          customer_details: { email: "buyer@example.com" },
          metadata: { product: "credit_pack", tenant_id: TENANT, credits: "1000" },
        },
      },
    });
    const db = makeLedgerDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(db.balance()).toBe(0);
  });
});
