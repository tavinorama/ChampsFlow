/**
 * D2 — Public API + API keys — unit tests
 *
 * Covers both surfaces of routes/api-keys.ts using an in-memory mock of the
 * PostgresClient (no real DB):
 *
 *   Management (JWT, dev-auth-bypass → role "owner"):
 *     GET/POST/DELETE /api/account/api-keys — list, mint (plaintext once),
 *     key-limit 409, revoke, 404/400 edges.
 *
 *   Public read-only (API-key-authed):
 *     GET /api/v1/{me,brands,brands/:id,audits/:id} — missing key 401,
 *     revoked key 401, valid key 200, invalid-uuid 400.
 *
 * The per-key rate limiter fails open when no Upstash env is set (the test
 * env has none), so it never interferes here.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerApiKeyRoutes } from "../../apps/api/src/routes/api-keys";

interface MockRow {
  [key: string]: unknown;
}

function makeMockDb(
  queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: MockRow[] }>
) {
  const query = (async (sql: string, params?: unknown[]) =>
    queryImpl ? queryImpl(sql, params) : { rows: [] as MockRow[] }) as (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: MockRow[] }>;
  return { query, setTenantId: async () => {}, transaction: async () => undefined };
}

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const KEY_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const AUDIT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
    // Ensure no Upstash → rate limiter fails open.
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
  };
});

function buildApp(db: ReturnType<typeof makeMockDb>): Hono {
  const app = new Hono();
  registerApiKeyRoutes(app, db as never);
  return app;
}

// ---------------------------------------------------------------------------
// Management — JWT (dev bypass)
// ---------------------------------------------------------------------------

describe("GET /api/account/api-keys", () => {
  it("lists the tenant's keys", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM api_key")) {
        return {
          rows: [
            {
              id: KEY_ID,
              name: "Zapier",
              prefix: "ozk_live_abcd12",
              scopes: ["read"],
              last_used_at: null,
              revoked_at: null,
              created_at: "2026-06-26T00:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const res = await buildApp(db).request("/api/account/api-keys", {
      headers: { Authorization: "Bearer dev-bypass" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/account/api-keys", () => {
  it("mints a key and returns the plaintext exactly once", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ n: 0 }] };
      if (sql.includes("INSERT INTO api_key")) {
        return { rows: [{ id: KEY_ID, name: "Prod", prefix: "ozk_live_xxxx", scopes: ["read"], created_at: "x" }] };
      }
      return { rows: [] };
    });
    const res = await buildApp(db).request("/api/account/api-keys", {
      method: "POST",
      headers: { Authorization: "Bearer dev-bypass", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Prod" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; prefix: string; warning: string };
    expect(body.key.startsWith("ozk_live_")).toBe(true);
    expect(body.warning).toMatch(/not be shown again/i);
  });

  it("returns 409 at the active-key limit", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ n: 10 }] };
      return { rows: [] };
    });
    const res = await buildApp(db).request("/api/account/api-keys", {
      method: "POST",
      headers: { Authorization: "Bearer dev-bypass", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Eleventh" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("KEY_LIMIT");
  });
});

describe("DELETE /api/account/api-keys/:id", () => {
  it("revokes a key (200)", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("UPDATE api_key")) return { rows: [{ id: KEY_ID }] };
      return { rows: [] };
    });
    const res = await buildApp(db).request(`/api/account/api-keys/${KEY_ID}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev-bypass" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revoked: boolean };
    expect(body.revoked).toBe(true);
  });

  it("returns 404 when the key does not exist / already revoked", async () => {
    const db = makeMockDb(async () => ({ rows: [] }));
    const res = await buildApp(db).request(`/api/account/api-keys/${KEY_ID}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev-bypass" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const db = makeMockDb();
    const res = await buildApp(db).request("/api/account/api-keys/not-a-uuid", {
      method: "DELETE",
      headers: { Authorization: "Bearer dev-bypass" },
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Public API — API-key auth
// ---------------------------------------------------------------------------

/** A mock db that resolves a valid (non-revoked) key, plus row data per table. */
function publicDb(opts: { revoked?: boolean; tableRows?: (sql: string) => MockRow[] } = {}) {
  return makeMockDb(async (sql) => {
    if (sql.includes("FROM api_key") && sql.includes("key_hash")) {
      return {
        rows: [{ id: KEY_ID, tenant_id: TENANT_ID, scopes: ["read"], revoked_at: opts.revoked ? "2026-01-01" : null }],
      };
    }
    if (sql.includes("UPDATE api_key")) return { rows: [] }; // last_used_at touch
    if (opts.tableRows) return { rows: opts.tableRows(sql) };
    return { rows: [] };
  });
}

describe("public API auth (requireApiKey)", () => {
  it("401 without a key", async () => {
    const res = await buildApp(makeMockDb()).request("/api/v1/me");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_API_KEY");
  });

  it("401 with a revoked key", async () => {
    const res = await buildApp(publicDb({ revoked: true })).request("/api/v1/me", {
      headers: { Authorization: "Bearer ozk_live_whatever" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_API_KEY");
  });

  it("200 GET /api/v1/me with a valid key (Bearer)", async () => {
    const db = publicDb({ tableRows: (sql) => (sql.includes("FROM tenants") ? [{ plan_tier: "growth" }] : []) });
    const res = await buildApp(db).request("/api/v1/me", {
      headers: { Authorization: "Bearer ozk_live_valid" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenant_id: string; plan: string; scopes: string[] };
    expect(body.tenant_id).toBe(TENANT_ID);
    expect(body.plan).toBe("growth");
    expect(body.scopes).toContain("read");
  });

  it("200 GET /api/v1/me via X-API-Key header", async () => {
    const db = publicDb({ tableRows: (sql) => (sql.includes("FROM tenants") ? [{ plan_tier: "agency" }] : []) });
    const res = await buildApp(db).request("/api/v1/me", { headers: { "X-API-Key": "ozk_live_valid" } });
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/brands returns the brand list", async () => {
    const db = publicDb({
      tableRows: (sql) =>
        sql.includes("FROM brands")
          ? [{ id: BRAND_ID, name: "Acme", domain: "acme.com", category: "SaaS", region: "US", monitoring_enabled: true, latest_score: 72 }]
          : [],
    });
    const res = await buildApp(db).request("/api/v1/brands", {
      headers: { Authorization: "Bearer ozk_live_valid" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ latest_score: number }> };
    expect(body.data[0]?.latest_score).toBe(72);
  });

  it("GET /api/v1/brands/:id 400 on a malformed id", async () => {
    const res = await buildApp(publicDb()).request("/api/v1/brands/not-a-uuid", {
      headers: { Authorization: "Bearer ozk_live_valid" },
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/v1/audits/:id derives trustindex_score from the three vectors", async () => {
    const db = publicDb({
      tableRows: (sql) =>
        sql.includes("FROM geo_audit")
          ? [{ id: AUDIT_ID, brand_id: BRAND_ID, status: "complete", score_brand: 80, score_performance: 60, score_ai: 100, created_at: "x" }]
          : [],
    });
    const res = await buildApp(db).request(`/api/v1/audits/${AUDIT_ID}`, {
      headers: { Authorization: "Bearer ozk_live_valid" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { trustindex_score: number };
    // 80*0.30 + 60*0.35 + 100*0.35 = 24 + 21 + 35 = 80
    expect(body.trustindex_score).toBe(80);
  });

  it("GET /api/v1/audits/:id 404 when the audit is not found", async () => {
    const res = await buildApp(publicDb({ tableRows: () => [] })).request(`/api/v1/audits/${AUDIT_ID}`, {
      headers: { Authorization: "Bearer ozk_live_valid" },
    });
    expect(res.status).toBe(404);
  });
});
