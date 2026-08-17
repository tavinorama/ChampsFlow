/**
 * ai-audit routes — the HTTP edge of the AI Audit Stack ($49, PAID, email
 * mandatory — founder 2026-08-15).
 *
 * Thin wrappers over the tested engine; these pin the wire contract:
 *  - /meta derives the questionnaire vocabulary from the catalog + the offer;
 *  - /entry and /assess are TEASERS now (counts only, never a pick/report);
 *  - /checkout requires an email, rate-limits like /api/test, inserts the
 *    lead + the order, and returns the dev-unlock URL when Stripe is absent
 *    (non-production) — and 503 AI_AUDIT_ORDERS_NOT_READY when the table
 *    does not exist yet (migration is founder-gated);
 *  - /order/:token never leaks the deliverable while pending;
 *  - /order/:token/deliver applies the Kit trust rule (402 unpaid, dev-unlock
 *    builds + stores the deliverable, idempotent afterwards).
 * Driven through a real Hono app with a fake db, so routing + validation are
 * exercised end to end without a network or a database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// In-memory sliding-window fake of the shared Redis pipeline used by the
// checkout rate limit (zremrangebyscore/zadd/zcard/expire → exec).
const zsets = new Map<string, number[]>();
vi.mock("../../apps/api/src/shared-redis", () => ({
  getSharedRedis: () => ({
    pipeline: () => {
      const ops: Array<() => unknown> = [];
      const p = {
        zremrangebyscore: (key: string, _min: number, max: number) => {
          ops.push(() => {
            zsets.set(key, (zsets.get(key) ?? []).filter((s) => s > max));
            return 0;
          });
          return p;
        },
        zadd: (key: string, m: { score: number }) => {
          ops.push(() => {
            zsets.set(key, [...(zsets.get(key) ?? []), m.score]);
            return 1;
          });
          return p;
        },
        zcard: (key: string) => {
          ops.push(() => (zsets.get(key) ?? []).length);
          return p;
        },
        expire: () => {
          ops.push(() => 1);
          return p;
        },
        exec: async () => ops.map((f) => f()),
      };
      return p;
    },
  }),
}));

import { registerAiAuditRoutes } from "../../apps/api/src/routes/ai-audit";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import type { PostgresClient } from "../../packages/shared/src/db-client";

/** Fake db: empty ai_tool → the route falls back to the seed catalog. */
const seedDb = {
  async query() {
    return { rows: [] };
  },
} as unknown as PostgresClient;

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerAiAuditRoutes(app, db);
  return app;
}

function post(app: Hono, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ANSWERS = { businessType: "agency", primaryFocus: "marketing", pains: ["content-volume", "lead-research"] };

beforeEach(() => {
  zsets.clear();
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["STRIPE_PRICE_ID_AI_AUDIT"];
  delete process.env["RESEND_API_KEY"];
  process.env["NODE_ENV"] = "test";
});

describe("GET /api/ai-audit/meta", () => {
  it("returns the questionnaire vocabulary derived from the catalog + the $49 offer", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/meta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pains: string[]; categories: string[]; toolCount: number;
      offer: { priceUsd: number; emailRequired: boolean };
      catalog: { source: string; estimatesUnverified: boolean };
    };
    expect(body.toolCount).toBe(SEED_CATALOG.length);
    expect(body.pains).toContain("content-volume");
    expect(body.categories).toContain("ops");
    expect(body.offer.priceUsd).toBe(49);
    expect(body.offer.emailRequired).toBe(true);
    expect(body.catalog.source).toBe("seed");
    expect(body.catalog.estimatesUnverified).toBe(true);
  });

  it("exposes the grounding directories without leaking legal notes", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/meta");
    const body = (await res.json()) as { research: { groundingSources: Array<Record<string, unknown>> } };
    const names = body.research.groundingSources.map((s) => s.name);
    expect(names).toContain("There's An AI For That");
    expect(names).toContain("Futurepedia");
    for (const s of body.research.groundingSources) {
      expect(s).not.toHaveProperty("legalNote");
      expect(s).not.toHaveProperty("automatedIngestAllowed");
    }
  });
});

describe("POST /api/ai-audit/assess (teaser)", () => {
  it("refuses a request with no pains (a rec must anchor in a real need)", async () => {
    const res = await post(appWith(seedDb), "/api/ai-audit/assess", { ...ANSWERS, pains: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NO_PAINS");
  });

  it("returns counts only — never the report or a tool name", async () => {
    const res = await post(appWith(seedDb), "/api/ai-audit/assess", { ...ANSWERS, hourlyRateUsd: 60 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown> & {
      teaser: { totalMatched: number; matrixCounts: Record<string, number>; empty: boolean };
    };
    expect(body).not.toHaveProperty("report");
    expect(body.teaser.empty).toBe(false);
    expect(body.teaser.totalMatched).toBeGreaterThan(0);
    expect(Object.keys(body.teaser.matrixCounts).sort()).toEqual(["fill-in", "ignore", "major-project", "quick-win"]);
    const text = JSON.stringify(body);
    for (const t of SEED_CATALOG) expect(text).not.toContain(`"${t.name}"`);
  });

  it("rejects a non-JSON body with 400", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/assess", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai-audit/entry (teaser)", () => {
  it("returns the honest counts + the ladder, but NO pick (that is what $49 buys)", async () => {
    const res = await post(appWith(seedDb), "/api/ai-audit/entry", ANSWERS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      teaser: { totalMatched: number; withheldCount: number };
      offer: { priceUsd: number };
      upsell: { fullAudit: { bundledWith: string; href: string }; alsoOffer: { href: string } };
    } & Record<string, unknown>;
    expect(body).not.toHaveProperty("entry");
    expect(body.teaser.withheldCount).toBe(body.teaser.totalMatched - 1);
    expect(body.offer.priceUsd).toBe(49);
    expect(body.upsell.fullAudit.bundledWith).toContain("GEO");
    expect(body.upsell.fullAudit.href).toBe("/organicposts");
    expect(body.upsell.alsoOffer.href).toBe("/test");
    const text = JSON.stringify(body);
    for (const t of SEED_CATALOG) expect(text).not.toContain(`"${t.name}"`);
  });
});

// ---------------------------------------------------------------------------
// Checkout + order + deliver — a fake DB with an in-memory ai_audit_order.
// ---------------------------------------------------------------------------

interface FakeOrder {
  id: string; order_token: string; email: string; business_type: string | null; primary_focus: string | null;
  answers: unknown; status: string; deliverable: unknown; stripe_session_id: string | null; lead_capture_id: string | null;
  claimed_at?: string | null;
}

function makeDb(opts: { tableExists?: boolean; users?: string[] } = {}) {
  const tableExists = opts.tableExists ?? true;
  const orders: FakeOrder[] = [];
  const leads: Array<Record<string, unknown>> = [];
  const nurture: Array<Record<string, unknown>> = [];
  const undefinedTable = () => Object.assign(new Error('relation "ai_audit_order" does not exist'), { code: "42P01" });

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM ai_tool")) return { rows: [] };
    if (sql.includes("INSERT INTO lead_capture")) {
      leads.push({ id: params[0], email: params[1], source: "ai_audit", consent: params[6] });
      return { rows: [] };
    }
    if (sql.includes("FROM users u")) {
      const email = String(params[0]);
      return { rows: (opts.users ?? []).includes(email) ? [{ tenant_id: "tenant-1" }] : [] };
    }
    if (sql.includes("UPDATE lead_capture SET claimed_at")) return { rows: [] };
    if (sql.includes("FROM lead_capture WHERE lower(email)")) return { rows: [] };
    if (sql.includes("INSERT INTO nurture_enrollment")) {
      nurture.push({ email: params[1], sequence: params[2] });
      return { rows: [] };
    }
    if (sql.includes("nurture_enrollment")) return { rows: [] };
    if (sql.includes("ai_audit_order")) {
      if (!tableExists) throw undefinedTable();
      if (sql.startsWith("INSERT INTO ai_audit_order")) {
        orders.push({
          id: String(params[0]), order_token: String(params[1]), email: String(params[2]),
          business_type: params[3] as string, primary_focus: params[4] as string | null,
          answers: params[5], status: "pending", deliverable: null, stripe_session_id: null,
          lead_capture_id: (params[6] as string | null) ?? null,
        });
        return { rows: [] };
      }
      if (sql.includes("WHERE order_token = $1")) {
        return { rows: orders.filter((o) => o.order_token === params[0]) };
      }
      if (sql.includes("SET status='paid'") && sql.includes("status='pending'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status === "pending") { o.status = "paid"; if (params[1]) o.stripe_session_id = String(params[1]); }
        return { rows: [] };
      }
      if (sql.includes("SET status='delivered'")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o && o.status === "paid") { o.status = "delivered"; o.deliverable = params[1]; return { rows: [{ id: o.id }] }; }
        return { rows: [] };
      }
      if (sql.includes("SET claimed_at")) {
        const o = orders.find((x) => x.id === params[0]);
        if (o) o.claimed_at = "now";
        return { rows: [] };
      }
      if (sql.includes("SELECT status, deliverable FROM ai_audit_order")) {
        return { rows: orders.filter((o) => o.id === params[0]).map((o) => ({ status: o.status, deliverable: o.deliverable })) };
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { db: { query } as unknown as PostgresClient, query, orders, leads, nurture };
}

describe("POST /api/ai-audit/checkout", () => {
  it("requires an email (mandatory, like the free test)", async () => {
    const { db } = makeDb();
    const res = await post(appWith(db), "/api/ai-audit/checkout", ANSWERS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMAIL_REQUIRED");
    const bad = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "nope" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("EMAIL_INVALID");
  });

  it("requires at least one pain and a business type", async () => {
    const { db } = makeDb();
    const noPains = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "a@b.co", pains: [] });
    expect(noPains.status).toBe(400);
    expect((await noPains.json()).code).toBe("NO_PAINS");
    const noBiz = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "a@b.co", businessType: "" });
    expect(noBiz.status).toBe(400);
    expect((await noBiz.json()).code).toBe("NO_BUSINESS");
  });

  it("captures the lead (source ai_audit, consent explicit), inserts a pending order and returns the dev-unlock URL when Stripe is absent (non-prod)", async () => {
    const { db, orders, leads } = makeDb();
    const res = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "buyer@example.com", marketing_consent: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; url: string; dev?: boolean };
    expect(body.dev).toBe(true);
    expect(body.url).toBe(`/ai-audit/${body.token}?dev_unlock=1`);
    expect(orders).toHaveLength(1);
    expect(orders[0]!.status).toBe("pending");
    expect(orders[0]!.email).toBe("buyer@example.com");
    expect(orders[0]!.deliverable).toBeNull();
    expect((orders[0]!.answers as { pains: string[] }).pains).toEqual(ANSWERS.pains);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.consent).toBe(true);
    expect(orders[0]!.lead_capture_id).toBe(leads[0]!.id);
  });

  it("never infers consent: absent flag → false on the lead row", async () => {
    const { db, leads } = makeDb();
    await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "buyer@example.com" });
    expect(leads[0]!.consent).toBe(false);
  });

  it("returns 503 CHECKOUT_UNCONFIGURED in production without Stripe (never a dev unlock)", async () => {
    process.env["NODE_ENV"] = "production";
    const { db } = makeDb();
    const res = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "buyer@example.com" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("CHECKOUT_UNCONFIGURED");
  });

  it("returns 503 AI_AUDIT_ORDERS_NOT_READY when the table does not exist yet (migration pending)", async () => {
    const { db } = makeDb({ tableExists: false });
    const res = await post(appWith(db), "/api/ai-audit/checkout", { ...ANSWERS, email: "buyer@example.com" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("AI_AUDIT_ORDERS_NOT_READY");
  });

  it("rate limits at 8 per hour per IP (same as /api/test)", async () => {
    const { db } = makeDb();
    const app = appWith(db);
    const hdr = { "x-real-ip": "203.0.113.7" };
    for (let i = 0; i < 8; i++) {
      const ok = await post(app, "/api/ai-audit/checkout", { ...ANSWERS, email: `b${i}@example.com` }, hdr);
      expect(ok.status).toBe(200);
    }
    const ninth = await post(app, "/api/ai-audit/checkout", { ...ANSWERS, email: "b9@example.com" }, hdr);
    expect(ninth.status).toBe(429);
    expect((await ninth.json()).code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/ai-audit/order/:token + POST .../deliver (Kit trust rule)", () => {
  async function createOrder(app: Hono) {
    const res = await post(app, "/api/ai-audit/checkout", { ...ANSWERS, email: "buyer@example.com" });
    return ((await res.json()) as { token: string }).token;
  }

  it("404 for an unknown token; 503 when the table is missing", async () => {
    expect((await appWith(makeDb().db).request("/api/ai-audit/order/nope")).status).toBe(404);
    const res = await appWith(makeDb({ tableExists: false }).db).request("/api/ai-audit/order/nope");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("AI_AUDIT_ORDERS_NOT_READY");
  });

  it("never returns the deliverable while pending, and /deliver answers 402 without payment", async () => {
    const { db } = makeDb();
    const app = appWith(db);
    const token = await createOrder(app);
    const get = await app.request(`/api/ai-audit/order/${token}`);
    const body = (await get.json()) as { status: string; deliverable: unknown };
    expect(body.status).toBe("pending");
    expect(body.deliverable).toBeNull();

    const deliver = await app.request(`/api/ai-audit/order/${token}/deliver`, { method: "POST" });
    expect(deliver.status).toBe(402);
    expect((await deliver.json()).code).toBe("PAYMENT_NOT_VERIFIED");
  });

  it("dev-unlock (non-prod) marks paid, builds the ENTRY pick + report teaser, stores it, and is idempotent", async () => {
    const { db, orders, nurture } = makeDb();
    const app = appWith(db);
    const token = await createOrder(app);
    const res = await app.request(`/api/ai-audit/order/${token}/deliver?dev_unlock=1`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      deliverable: {
        entry: { pick: { tool: { name: string; isGeneric?: boolean } } | null; totalMatched: number; withheldCount: number };
        report: { matrixCounts: Record<string, number>; financialImpact: { hourlyRateUsd: number } };
        upsell: { fullAudit: { href: string } };
        catalog: { estimatesUnverified: boolean };
      };
    };
    expect(body.status).toBe("delivered");
    expect(body.deliverable.entry.pick).not.toBeNull();
    expect(body.deliverable.entry.pick!.tool.isGeneric).not.toBe(true);
    expect(body.deliverable.entry.withheldCount).toBe(body.deliverable.entry.totalMatched - 1);
    // The FULL report is NOT in the $49 deliverable — only counts + numbers.
    expect(body.deliverable).not.toHaveProperty("recommendedSolutions");
    expect((body.deliverable.report as Record<string, unknown>)["recommendedSolutions"]).toBeUndefined();
    expect(body.deliverable.report.matrixCounts["quick-win"]).toBeGreaterThanOrEqual(0);
    expect(body.deliverable.catalog.estimatesUnverified).toBe(true);
    expect(orders[0]!.status).toBe("delivered");
    expect(orders[0]!.deliverable).toBeTruthy();
    // Post-purchase nurture: ai_audit_to_full enrolled once.
    expect(nurture.filter((n) => n.sequence === "ai_audit_to_full")).toHaveLength(1);

    // Idempotent: a second call returns the stored deliverable, no rebuild.
    const again = await app.request(`/api/ai-audit/order/${token}/deliver?dev_unlock=1`, { method: "POST" });
    expect(again.status).toBe(200);
    expect((await again.json()).deliverable).toEqual(body.deliverable);
    expect(nurture.filter((n) => n.sequence === "ai_audit_to_full")).toHaveLength(1);

    // GET now returns it too.
    const get = await app.request(`/api/ai-audit/order/${token}`);
    const gb = (await get.json()) as { status: string; deliverable: unknown };
    expect(gb.status).toBe("delivered");
    expect(gb.deliverable).toEqual(body.deliverable);
  });

  it("dev-unlock is refused in production (402)", async () => {
    const { db } = makeDb();
    const app = appWith(db);
    const token = await createOrder(app);
    process.env["NODE_ENV"] = "production";
    const res = await app.request(`/api/ai-audit/order/${token}/deliver?dev_unlock=1`, { method: "POST" });
    expect(res.status).toBe(402);
  });
});
