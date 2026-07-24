/**
 * Operator business scope — contract tests.
 *
 * The Hermes agent's expanded surface ('operator'+'business'): revenue
 * analytics, leads, kit orders, opportunities, pipeline PATCH, nurture enroll.
 * Verifies the scope gate (operator-only keys must NOT reach business data),
 * input validation on the two write verbs, and the suppression guard on
 * nurture enrollment.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerOperatorBusinessRoutes } from "../../apps/api/src/routes/operator";

interface MockRow {
  [key: string]: unknown;
}

const KEY_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ENGAGEMENT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

function makeDb(opts: {
  scopes: string[];
  tableRows?: (sql: string, params?: unknown[]) => MockRow[];
}) {
  const query = async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM api_key") && sql.includes("key_hash")) {
      return {
        rows: [{ id: KEY_ID, tenant_id: TENANT_ID, scopes: opts.scopes, revoked_at: null }],
      };
    }
    if (sql.includes("UPDATE api_key")) return { rows: [] }; // last_used touch
    return { rows: opts.tableRows ? opts.tableRows(sql, params) : [] };
  };
  return { query, setTenantId: async () => {}, transaction: async () => undefined } as never;
}

function buildApp(db: never): Hono {
  const app = new Hono();
  registerOperatorBusinessRoutes(app, db);
  return app;
}

beforeEach(() => {
  // No Upstash env in tests → per-key rate limiter fails open.
  process.env["UPSTASH_REDIS_REST_URL"] = "";
  process.env["UPSTASH_REDIS_REST_TOKEN"] = "";
});

const AUTH = { Authorization: "Bearer ozk_live_hermes" };

describe("business scope gate", () => {
  it("401 without a key", async () => {
    const res = await buildApp(makeDb({ scopes: [] })).request("/api/v1/operator/analytics");
    expect(res.status).toBe(401);
  });

  it("403 BUSINESS_SCOPE_REQUIRED for an operator-only key (pre-expansion keys)", async () => {
    const res = await buildApp(makeDb({ scopes: ["operator"] })).request(
      "/api/v1/operator/analytics",
      { headers: AUTH }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("BUSINESS_SCOPE_REQUIRED");
    expect(body.message).toMatch(/Regenerate/);
  });

  it("403 for a tenant read-only key", async () => {
    const res = await buildApp(makeDb({ scopes: ["read"] })).request("/api/v1/operator/leads", {
      headers: AUTH,
    });
    expect(res.status).toBe(403);
  });
});

describe("business reads", () => {
  const FULL = ["operator", "business"];

  it("GET /leads returns lead contact rows and clamps limit", async () => {
    let capturedLimit: unknown;
    const db = makeDb({
      scopes: FULL,
      tableRows: (sql, params) => {
        if (sql.includes("FROM lead_capture")) {
          capturedLimit = params?.[0];
          return [
            { id: "1", email: "lead@x.com", brand: "Acme", category: "crm", region: "US", source: "free_test", created_at: "2026-07-07" },
          ];
        }
        return [];
      },
    });
    const res = await buildApp(db).request("/api/v1/operator/leads?limit=9999", { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { leads: { email: string }[] };
    expect(body.leads[0]?.email).toBe("lead@x.com");
    expect(capturedLimit).toBe(200); // clamped
  });

  it("GET /analytics aggregates MRR from active subscriptions", async () => {
    const db = makeDb({
      scopes: FULL,
      tableRows: (sql) => {
        // The received-value MRR path (fetchReceivedMrr) reads one row per active
        // sub. With no STRIPE_SECRET_KEY in tests it falls back to list price, so
        // these rows must sum to the list-price total the assertion expects.
        if (sql.includes("stripe_subscription_id") && sql.includes("billing_subscriptions")) {
          return [
            { stripe_subscription_id: null, plan_tier: "growth" },
            { stripe_subscription_id: null, plan_tier: "growth" },
            { stripe_subscription_id: null, plan_tier: "growth" },
            { stripe_subscription_id: null, plan_tier: "agency" },
          ];
        }
        if (sql.includes("GROUP BY plan_tier")) {
          return [
            { plan_tier: "growth", count: "3" },
            { plan_tier: "agency", count: "1" },
          ];
        }
        if (sql.includes("COUNT(*)")) return [{ count: "10" }];
        return [];
      },
    });
    const res = await buildApp(db).request("/api/v1/operator/analytics", { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mrr_usd: number; arr_usd: number; mrr_source: string };
    // Stripe unconfigured in tests → list-price fallback (source 'list').
    expect(body.mrr_source).toBe("list");
    expect(body.mrr_usd).toBe(3 * 99 + 1 * 549);
    expect(body.arr_usd).toBe(body.mrr_usd * 12);
  });
});

describe("pipeline PATCH", () => {
  const FULL = ["operator", "business"];

  it("400 on invalid status", async () => {
    const res = await buildApp(makeDb({ scopes: FULL })).request(
      `/api/v1/operator/engagements/${ENGAGEMENT_ID}`,
      {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deleted" }),
      }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("200 on a valid transition", async () => {
    const db = makeDb({
      scopes: FULL,
      tableRows: (sql) =>
        sql.includes("UPDATE engagement") ? [{ id: ENGAGEMENT_ID, status: "contacted" }] : [],
    });
    const res = await buildApp(db).request(`/api/v1/operator/engagements/${ENGAGEMENT_ID}`, {
      method: "PATCH",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "contacted" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("contacted");
  });

  it("400 on malformed id", async () => {
    const res = await buildApp(makeDb({ scopes: FULL })).request(
      "/api/v1/operator/engagements/not-a-uuid",
      {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "won" }),
      }
    );
    expect(res.status).toBe(400);
  });
});

describe("nurture enrollment", () => {
  const FULL = ["operator", "business"];

  it("400 on unknown sequence (only founder-approved sequences allowed)", async () => {
    const res = await buildApp(makeDb({ scopes: FULL })).request(
      "/api/v1/operator/nurture/enroll",
      {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "lead@x.com", sequence: "custom_blast" }),
      }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_SEQUENCE");
  });

  it("409 when the lead is suppressed — nothing sent", async () => {
    const db = makeDb({
      scopes: FULL,
      tableRows: (sql) =>
        sql.includes("FROM nurture_enrollment") ? [{ suppressed: true }] : [],
    });
    const res = await buildApp(db).request("/api/v1/operator/nurture/enroll", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lead@x.com", sequence: "free_to_kit", brand: "Acme" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { enrolled: boolean; reason: string };
    expect(body.enrolled).toBe(false);
    expect(body.reason).toBe("suppressed");
  });

  it("201 enrolls an eligible lead", async () => {
    const db = makeDb({
      scopes: FULL,
      tableRows: () => [], // no existing enrollment; INSERT returns no rows
    });
    const res = await buildApp(db).request("/api/v1/operator/nurture/enroll", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lead@x.com", sequence: "kit_to_dfy", brand: "Acme" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { enrolled: boolean; sequence: string };
    expect(body.enrolled).toBe(true);
    expect(body.sequence).toBe("kit_to_dfy");
  });
});
