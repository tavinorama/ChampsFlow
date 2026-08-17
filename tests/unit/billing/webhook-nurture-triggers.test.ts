/**
 * webhook-nurture-triggers.test.ts — founder decision 17/08/2026:
 * every nurture sequence is started by a WEBHOOK, never by hand only, and every
 * purchase suppresses the lower rungs.
 *
 * Runs the REAL billing webhook handler + the REAL nurture module against a
 * recording DB, and asserts per product:
 *   credit_pack       → suppress(credit_pack) + enroll credit_pack_bought
 *   get_cited_kit     → suppress(kit) + enroll kit_to_growth with NO delay (0d)
 *   ozvor_pages_site  → suppress(pages) + enroll pages_bought
 *   subscription      → suppress(subscription) + enroll subscriber_onboarding
 *   direct checkout   → same, for both known-user and pending-subscription cases
 * plus: a CHECK-constraint refusal on the sequence name is logged as
 * nurture_sequence_not_allowed and the webhook still 200s.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../../../packages/shared/src/logger", () => ({ logger: logged }));

const mockConstructEvent = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    charges = { retrieve: vi.fn() };
    customers = { retrieve: vi.fn(async () => ({ email: null })) };
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

// REAL nurture module (not mocked) — we assert on the SQL it issues.
import { registerBillingRoutes } from "../../../apps/api/src/routes/billing";

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeRecordingDb(opts: { rejectSequenceCheck?: boolean; knownUser?: boolean } = {}) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("SELECT email, brand FROM kit_order")) {
      return { rows: [{ email: "buyer@example.com", brand: "Acme" }] };
    }
    if (sql.includes("UPDATE pages_order") && sql.includes("RETURNING email")) {
      return { rows: [{ email: "buyer@example.com" }] };
    }
    if (sql.includes("SELECT name FROM tenants")) {
      return { rows: [{ name: "Acme Tenant" }] };
    }
    if (sql.includes("FROM users u WHERE lower(u.email)")) {
      return { rows: opts.knownUser ? [{ tenant_id: TENANT }] : [] };
    }
    if (sql.includes("FROM users") && sql.includes("role = 'owner'")) {
      return { rows: [{ email: "owner@example.com" }] };
    }
    if (sql.includes("INSERT INTO nurture_enrollment") && opts.rejectSequenceCheck) {
      const err = new Error(
        'new row for relation "nurture_enrollment" violates check constraint "nurture_enrollment_sequence_check"'
      ) as Error & { code: string };
      err.code = "23514";
      throw err;
    }
    if (sql.includes("SELECT id FROM nurture_enrollment")) {
      // Return the id the INSERT used so alreadyEnrolled = false.
      return { rows: [{ id: params?.[0] ?? "x" }] };
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
function calls(db: Db, fragment: string) {
  return db.query.mock.calls.filter(([sql]) => (sql as string).includes(fragment));
}
function enrollCalls(db: Db) {
  return calls(db, "INSERT INTO nurture_enrollment");
}
function suppressCalls(db: Db) {
  return calls(db, "suppressed_reason = 'converted'");
}
/** The sequence name is always the 3rd param ($3) of the enroll INSERT. */
function enrolledSequences(db: Db): string[] {
  return enrollCalls(db).map(([, p]) => (p as unknown[])[2] as string);
}
function suppressedSequences(db: Db): string[][] {
  return suppressCalls(db).map(([, p]) => (p as unknown[])[1] as string[]);
}

let seq = 0;
function makeEvent(type: string, session: Record<string, unknown>) {
  return { id: `evt_nurture_${++seq}`, type, data: { object: session } };
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
  logged.info.mockClear();
  logged.warn.mockClear();
  logged.error.mockClear();
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  };
});

describe("credit_pack webhook → credit_pack_bought", () => {
  it("enrolls credit_pack_bought at 0d and suppresses the pre-subscription rungs", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_cp_1",
        mode: "payment",
        payment_status: "paid",
        customer_details: { email: "Buyer@Example.com" },
        metadata: { product: "credit_pack", tenant_id: TENANT, credits: "1000" },
      })
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(calls(db, "INSERT INTO credit_ledger")).toHaveLength(1);
    expect(enrolledSequences(db)).toEqual(["credit_pack_bought"]);
    // 0d: the immediate branch (no INTERVAL '1 millisecond' delay expression)
    expect(enrollCalls(db)[0]![0]).not.toContain("INTERVAL '1 millisecond'");
    // email normalized, brand from tenant, credits in metadata
    const p = enrollCalls(db)[0]![1] as unknown[];
    expect(p[1]).toBe("buyer@example.com");
    expect(p).toContain("Acme Tenant");
    expect(suppressedSequences(db)).toEqual([["free_to_kit", "kit_to_growth", "kit_to_dfy"]]);
  });
});

describe("get_cited_kit webhook → kit_to_growth (0d, no 2-day wait)", () => {
  it("suppresses free_to_kit and enrolls kit_to_growth immediately; kit_to_dfy is chained by the worker, not here", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_kit_1",
        mode: "payment",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: { product: "get_cited_kit", kit_order_id: "kit-1", order_token: "tok-1" },
      })
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(enrolledSequences(db)).toEqual(["kit_to_growth"]);
    expect(enrollCalls(db)[0]![0]).not.toContain("INTERVAL '1 millisecond'");
    expect(suppressedSequences(db)).toEqual([["free_to_kit"]]);
    const p = enrollCalls(db)[0]![1] as unknown[];
    expect(p).toContain("kit-1"); // source_kit_id
    expect(p).toContain("Acme"); // brand from kit_order
  });
});

describe("ozvor_pages_site webhook → pages_bought", () => {
  it("enrolls pages_bought and suppresses free_to_kit", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_pages_1",
        mode: "payment",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: { product: "ozvor_pages_site", pages_order_id: "pages-1" },
      })
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(enrolledSequences(db)).toEqual(["pages_bought"]);
    expect(suppressedSequences(db)).toEqual([["free_to_kit"]]);
  });
});

describe("subscription checkout → subscriber_onboarding", () => {
  const SUB_KILLS = ["free_to_kit", "kit_to_growth", "kit_to_dfy", "pages_bought"];

  it("authed growth checkout enrolls subscriber_onboarding and kills pre-subscription rungs", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_sub_1",
        mode: "subscription",
        payment_status: "paid",
        customer: "cus_1",
        subscription: "sub_1",
        customer_details: { email: "buyer@example.com" },
        metadata: { tenant_id: TENANT, plan_tier: "growth" },
      })
    );
    const db = makeRecordingDb();
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(enrolledSequences(db)).toEqual(["subscriber_onboarding"]);
    expect(suppressedSequences(db)).toEqual([SUB_KILLS]);
  });

  it("direct checkout (known user) enrolls subscriber_onboarding", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_sub_2",
        mode: "subscription",
        payment_status: "paid",
        customer: "cus_2",
        subscription: "sub_2",
        customer_details: { email: "buyer@example.com" },
        metadata: { flow: "direct", plan_tier: "agency", billing_interval: "month" },
      })
    );
    const db = makeRecordingDb({ knownUser: true });
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(enrolledSequences(db)).toEqual(["subscriber_onboarding"]);
    expect(suppressedSequences(db)).toEqual([SUB_KILLS]);
  });

  it("direct checkout (new buyer → pending_subscription) still enrolls subscriber_onboarding", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_sub_3",
        mode: "subscription",
        payment_status: "paid",
        customer: "cus_3",
        subscription: "sub_3",
        customer_details: { email: "new@example.com" },
        metadata: { flow: "direct", plan_tier: "growth", billing_interval: "year" },
      })
    );
    const db = makeRecordingDb({ knownUser: false });
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(calls(db, "INSERT INTO pending_subscription")).toHaveLength(1);
    expect(enrolledSequences(db)).toEqual(["subscriber_onboarding"]);
    const p = enrollCalls(db)[0]![1] as unknown[];
    expect(p[1]).toBe("new@example.com");
    expect(p).toContain("your brand"); // no tenant yet → neutral brand
  });
});

describe("DB CHECK constraint not widened yet (migration pending)", () => {
  it("logs nurture_sequence_not_allowed, does not crash, webhook still 200s", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("checkout.session.completed", {
        id: "cs_cp_2",
        mode: "payment",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: { product: "credit_pack", tenant_id: TENANT, credits: "1000" },
      })
    );
    const db = makeRecordingDb({ rejectSequenceCheck: true });
    const res = await postWebhook(buildApp(db));
    expect(res.status).toBe(200);
    expect(calls(db, "INSERT INTO credit_ledger")).toHaveLength(1); // money path untouched
    const notAllowed = logged.error.mock.calls.filter(([ev]) => ev === "nurture_sequence_not_allowed");
    expect(notAllowed).toHaveLength(1);
    expect((notAllowed[0]![1] as { sequence: string }).sequence).toBe("credit_pack_bought");
    // Not swallowed as a generic warning: the loud error is the signal.
    expect(logged.warn.mock.calls.filter(([ev]) => ev === "nurture_after_purchase_failed")).toHaveLength(0);
  });
});
