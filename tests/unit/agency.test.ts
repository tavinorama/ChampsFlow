/**
 * Agency OS v1 — unit tests
 *
 * Tests routes/agency.ts using an in-memory mock of PostgresClient.
 * No real DB or Supabase JWT — uses DEV_AUTH_BYPASS to inject auth context.
 *
 * Surfaces covered:
 *   GET/PUT  /api/agency/white-label     — branding management (owner + agency plan)
 *   POST     /api/brands/:id/share       — create share token
 *   GET      /api/brands/:id/shares      — list shares
 *   DELETE   /api/brands/:id/shares/:id  — revoke share
 *   GET      /api/r/:token               — public branded report
 *
 * Plan gate: non-agency tenants get 403 on all management routes.
 * Public route: tested with valid/revoked/unknown tokens; verifies that
 *   tenant_id is resolved from the token row, never from the URL.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerAgencyRoutes } from "../../apps/api/src/routes/agency";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SHARE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SHARE_TOKEN = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const AUDIT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

interface MockRow {
  [key: string]: unknown;
}

function makeMockDb(
  queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: MockRow[] }>
) {
  const query = async (sql: string, params?: unknown[]) =>
    queryImpl ? queryImpl(sql, params) : { rows: [] as MockRow[] };
  return {
    query,
    setTenantId: async () => {},
    transaction: async () => undefined,
  };
}

// ---------------------------------------------------------------------------
// Env setup (DEV_AUTH_BYPASS injects tenantId + role = owner)
// ---------------------------------------------------------------------------

const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
  };
});

function buildApp(db: ReturnType<typeof makeMockDb>): Hono {
  const app = new Hono();
  registerAgencyRoutes(app, db as never);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agencyDb(overrides?: (sql: string, params?: unknown[]) => MockRow[] | null) {
  return makeMockDb(async (sql, params) => {
    // Allow test to override specific queries
    if (overrides) {
      const result = overrides(sql, params);
      if (result !== null) return { rows: result };
    }
    // Default: plan_tier = 'agency'
    if (sql.includes("FROM tenants")) {
      return { rows: [{ plan_tier: "agency" }] };
    }
    return { rows: [] };
  });
}

// ---------------------------------------------------------------------------
// GET /api/agency/white-label
// ---------------------------------------------------------------------------

describe("GET /api/agency/white-label", () => {
  it("returns the white_label row when it exists", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("FROM white_label")) {
        return [{ agency_name: "Acme Agency", accent_hex: "#0A7E5A", logo_url: "https://cdn.example.com/logo.png" }];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agency_name).toBe("Acme Agency");
    expect(body.accent_hex).toBe("#0A7E5A");
    expect(body.logo_url).toBe("https://cdn.example.com/logo.png");
  });

  it("returns nulls when no white_label row exists", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ agency_name: null, accent_hex: null, logo_url: null });
  });

  it("returns 403 when plan_tier is not agency", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "growth" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PLAN_LIMIT_AGENCY");
  });

  it("returns 403 for free plan", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "free" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 when no auth header (production mode — no bypass)", async () => {
    // In dev/test the DEV_AUTH_BYPASS injects auth even without a header.
    // This test verifies that the requireAuth guard exists and is applied —
    // we check it by disabling the bypass and confirming we get 401.
    const savedBypass = process.env.DEV_AUTH_BYPASS;
    process.env.DEV_AUTH_BYPASS = "";
    try {
      const db = agencyDb();
      const app = buildApp(db);
      const res = await app.request("/api/agency/white-label");
      // With no bypass and no valid JWT the middleware returns 401
      expect(res.status).toBe(401);
    } finally {
      process.env.DEV_AUTH_BYPASS = savedBypass;
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agency/white-label
// ---------------------------------------------------------------------------

describe("PUT /api/agency/white-label", () => {
  it("upserts and returns updated branding", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("INSERT INTO white_label")) {
        return [{ agency_name: "New Agency", accent_hex: "#AABBCC", logo_url: "https://example.com/logo.svg", updated_at: new Date().toISOString() }];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ agency_name: "New Agency", accent_hex: "#AABBCC", logo_url: "https://example.com/logo.svg" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agency_name).toBe("New Agency");
  });

  it("rejects invalid accent_hex", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ accent_hex: "not-a-hex" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FIELD");
  });

  it("rejects logo_url that does not start with https://", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ logo_url: "http://insecure.example.com/logo.png" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FIELD");
  });

  it("rejects agency_name longer than 100 characters", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const longName = "A".repeat(101);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ agency_name: longName }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FIELD");
  });

  it("accepts valid 3-char hex shorthand", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("INSERT INTO white_label")) {
        return [{ agency_name: null, accent_hex: "#ABC", logo_url: null, updated_at: new Date().toISOString() }];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ accent_hex: "#ABC" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-agency plan", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "growth" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ agency_name: "X" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for malformed JSON", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const res = await app.request("/api/agency/white-label", {
      method: "PUT",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/brands/:id/share
// ---------------------------------------------------------------------------

describe("POST /api/brands/:id/share", () => {
  it("creates a share token and returns id + token + share_url", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("FROM brands")) {
        return [{ id: BRAND_ID }];
      }
      if (sql.includes("INSERT INTO report_share")) {
        return [{ id: SHARE_ID, token: SHARE_TOKEN, created_at: new Date().toISOString() }];
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return [];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/share`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(SHARE_ID);
    expect(body.token).toBe(SHARE_TOKEN);
    expect(body.share_url).toBe(`/r/${SHARE_TOKEN}`);
    expect(body.created_at).toBeDefined();
  });

  it("returns 404 when brand does not exist (or does not belong to tenant)", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("FROM brands")) return [];
      return null;
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/share`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 403 for non-agency plan", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "growth" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/share`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PLAN_LIMIT_AGENCY");
  });
});

// ---------------------------------------------------------------------------
// GET /api/brands/:id/shares
// ---------------------------------------------------------------------------

describe("GET /api/brands/:id/shares", () => {
  it("returns array of shares for the brand", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("FROM report_share")) {
        return [
          { id: SHARE_ID, token: SHARE_TOKEN, created_at: "2026-06-27T00:00:00Z", revoked_at: null, expires_at: null },
        ];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shares).toHaveLength(1);
    expect(body.shares[0].id).toBe(SHARE_ID);
    expect(body.shares[0].revoked_at).toBeNull();
  });

  it("returns empty array when no shares exist", async () => {
    const db = agencyDb();
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shares).toEqual([]);
  });

  it("returns 403 for growth plan", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "growth" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/brands/:id/shares/:shareId
// ---------------------------------------------------------------------------

describe("DELETE /api/brands/:id/shares/:shareId", () => {
  it("revokes a share and returns { id, revoked: true }", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("UPDATE report_share")) {
        return [{ id: SHARE_ID }];
      }
      return null;
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares/${SHARE_ID}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(SHARE_ID);
    expect(body.revoked).toBe(true);
  });

  it("returns 404 when share not found or belongs to different tenant/brand", async () => {
    const db = agencyDb((sql) => {
      if (sql.includes("UPDATE report_share")) return [];
      return null;
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares/${SHARE_ID}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 403 for non-agency plan", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM tenants")) return { rows: [{ plan_tier: "free" }] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/shares/${SHARE_ID}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/r/:token — PUBLIC branded report
// ---------------------------------------------------------------------------

describe("GET /api/r/:token", () => {
  function publicDb(tokenActive: boolean, hasAudit: boolean) {
    return makeMockDb(async (sql) => {
      // Step 1: resolve share
      if (sql.includes("FROM report_share rs")) {
        if (!tokenActive) return { rows: [] };
        return {
          rows: [{ tenant_id: TENANT_ID, brand_id: BRAND_ID }],
        };
      }
      // Step 2: white_label branding
      if (sql.includes("FROM white_label")) {
        return {
          rows: [{ agency_name: "Test Agency", accent_hex: "#112233", logo_url: "https://cdn.test/logo.png" }],
        };
      }
      // Step 3: brand info
      if (sql.includes("FROM brands")) {
        return {
          rows: [{ name: "Acme Corp", domain: "acme.com", category: "SaaS" }],
        };
      }
      // Step 4: audit + score
      if (sql.includes("FROM geo_audit ga")) {
        if (!hasAudit) return { rows: [] };
        return {
          rows: [
            {
              audit_id: AUDIT_ID,
              score_brand: 70,
              score_performance: 80,
              score_ai: 75,
              provider_breakdown: { overall: 76 },
              audit_date: "2026-06-27T00:00:00Z",
            },
          ],
        };
      }
      // Step 7: citation_check
      if (sql.includes("FROM citation_check")) {
        return {
          rows: [
            { sources: ["https://reddit.com/r/saas/post1", "https://g2.com/products/acme"] },
            { sources: ["https://reddit.com/r/saas/post2"] },
          ],
        };
      }
      return { rows: [] };
    });
  }

  it("returns full branded report for a valid active token", async () => {
    const db = publicDb(true, true);
    const app = buildApp(db);
    const res = await app.request(`/api/r/${SHARE_TOKEN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand.name).toBe("Acme Corp");
    expect(body.brand.domain).toBe("acme.com");
    expect(body.scores.overall).toBe(76); // pre-computed from provider_breakdown
    expect(body.scores.visibility).toBe(75); // score_ai
    expect(body.scores.execution).toBeNull();
    expect(body.branding.agency_name).toBe("Test Agency");
    expect(body.no_audit).toBe(false);
    // Top sources — reddit.com cited twice so it should rank first
    expect(body.top_sources[0].domain).toBe("reddit.com");
  });

  it("returns no_audit:true + 200 when brand has no completed audit", async () => {
    const db = publicDb(true, false);
    const app = buildApp(db);
    const res = await app.request(`/api/r/${SHARE_TOKEN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.no_audit).toBe(true);
    expect(body.scores).toBeNull();
    expect(body.top_sources).toEqual([]);
  });

  it("returns 404 for an unknown token", async () => {
    const db = publicDb(false, false);
    const app = buildApp(db);
    const res = await app.request(`/api/r/unknown-token-xyz`);
    expect(res.status).toBe(404);
    const body = await res.json();
    // Same message regardless of reason (no oracle)
    expect(body.message).toBe("Report not found or link is no longer valid.");
  });

  it("does not require an Authorization header (truly public)", async () => {
    const db = publicDb(true, true);
    const app = buildApp(db);
    // No Authorization header
    const res = await app.request(`/api/r/${SHARE_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("computes overall from 3 vectors when provider_breakdown has no overall", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM report_share rs")) {
        return { rows: [{ tenant_id: TENANT_ID, brand_id: BRAND_ID }] };
      }
      if (sql.includes("FROM white_label")) return { rows: [] };
      if (sql.includes("FROM brands")) {
        return { rows: [{ name: "Test Brand", domain: "test.com", category: null }] };
      }
      if (sql.includes("FROM geo_audit ga")) {
        return {
          rows: [
            {
              audit_id: AUDIT_ID,
              score_brand: 60,
              score_performance: 70,
              score_ai: 80,
              // No overall field — forces vector computation
              provider_breakdown: {},
              audit_date: "2026-06-27T00:00:00Z",
            },
          ],
        };
      }
      if (sql.includes("FROM citation_check")) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/r/${SHARE_TOKEN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 60*0.3 + 70*0.35 + 80*0.35 = 18 + 24.5 + 28 = 70.5 → Math.round = 71
    expect(body.scores.overall).toBe(71);
  });

  it("response does not include competitor data or raw probe text", async () => {
    const db = publicDb(true, true);
    const app = buildApp(db);
    const res = await app.request(`/api/r/${SHARE_TOKEN}`);
    const body = await res.json() as Record<string, unknown>;
    // None of these fields should appear in the response
    expect(body).not.toHaveProperty("competitors");
    expect(body).not.toHaveProperty("raw_text");
    expect(body).not.toHaveProperty("probe_text");
    expect(body).not.toHaveProperty("query_text");
    expect(body).not.toHaveProperty("tenant_id");
  });
});
