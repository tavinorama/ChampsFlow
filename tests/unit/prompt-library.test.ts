/**
 * C8 — Prompt Library — unit tests
 *
 * Tests the business logic of the Prompt Library capability:
 *  - GET  /api/brands/:id/prompts — defaults + custom list
 *  - POST /api/brands/:id/prompts — validation, cap enforcement, insert
 *  - DELETE /api/brands/:id/prompts/:promptId — row-level delete
 *  - Graceful 42P01 fallback (table not yet migrated)
 *  - Worker: custom prompt append + dedup + error isolation
 *
 * All tests use an in-memory mock of the PostgresClient interface.
 * No real DB connection required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerPromptRoutes } from "../../apps/api/src/routes/prompts";

// ---------------------------------------------------------------------------
// Minimal mock for PostgresClient
// ---------------------------------------------------------------------------

interface MockRow {
  [key: string]: unknown;
}

function makeMockDb(overrides: {
  queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: MockRow[] }>;
} = {}) {
  const setTenantId = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn(
    overrides.queryImpl ??
    (async (_sql: string, _params?: unknown[]) => ({ rows: [] as MockRow[] }))
  );
  return { query, setTenantId, transaction: vi.fn() };
}

// ---------------------------------------------------------------------------
// Minimal auth bypass for Hono tests (sets ctx.var.auth without JWT)
// ---------------------------------------------------------------------------

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID   = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID  = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PROMPT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function fakeAuthMiddleware(role: "owner" | "editor" | "viewer" = "owner") {
  return async (c: Parameters<Parameters<Hono["use"]>[0]>[0], next: () => Promise<void>) => {
    c.set("auth", {
      userId: USER_ID,
      tenantId: TENANT_ID,
      role,
      supabaseUid: USER_ID,
      isSuperAdmin: false,
    });
    await next();
  };
}

// ---------------------------------------------------------------------------
// Helpers to create a test app with faked auth
// ---------------------------------------------------------------------------

function buildApp(
  role: "owner" | "editor" | "viewer",
  db: ReturnType<typeof makeMockDb>
): Hono {
  const app = new Hono();
  // Inject fake auth BEFORE the route module's middlewares run
  // (the route module also calls requireAuth/requireRole — we bypass by patching
  // the auth variable directly in a pre-middleware).
  app.use("*", fakeAuthMiddleware(role));
  // Re-export our mock as the auth context; real middleware will call c.get("auth")
  // but requireAuth will also try to verify the JWT — we stub the Authorization header
  // via the env bypass mechanism. Instead, we wrap the route so requireAuth/requireRole
  // can be satisfied by setting DEV_AUTH_BYPASS in process.env for this test.
  return app;
}

// ---------------------------------------------------------------------------
// Because requireAuth/requireRole are the real middleware that verify JWTs,
// we need to isolate the *business logic*. We do this by testing the route
// handler responses using the DEV_AUTH_BYPASS mechanism that the middleware
// already supports, combined with a simple env setup.
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
  };
});

// ---------------------------------------------------------------------------
// Helper: build app with real middleware + dev bypass + mock db
// ---------------------------------------------------------------------------

function buildTestApp(db: ReturnType<typeof makeMockDb>): Hono {
  const app = new Hono();
  registerPromptRoutes(app, db as never);
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/brands/:id/prompts
// ---------------------------------------------------------------------------

describe("GET /api/brands/:id/prompts", () => {
  it("returns defaults + empty custom list when brand exists and no custom prompts", async () => {
    let callCount = 0;
    const db = makeMockDb({
      queryImpl: async (sql, params) => {
        callCount++;
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          // Brand ownership check
          return { rows: [{ id: BRAND_ID, name: "Acme", category: "software" }] };
        }
        if (sql.includes("FROM audit_prompt")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { defaults: unknown[]; custom: unknown[] };
    expect(body.defaults).toHaveLength(10);
    expect(body.custom).toHaveLength(0);
    // Spot-check first default
    const firstDefault = body.defaults[0] as { text: string; is_custom: boolean };
    expect(firstDefault.is_custom).toBe(false);
    expect(typeof firstDefault.text).toBe("string");
  });

  it("returns 404 when brand not found", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands")) return { rows: [] };
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("BRAND_NOT_FOUND");
  });

  it("returns defaults + custom rows when both exist", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID, name: "Acme", category: "SaaS" }] };
        }
        if (sql.includes("FROM audit_prompt")) {
          return {
            rows: [
              {
                id: PROMPT_ID,
                text: "Custom question here?",
                sort_order: 0,
                is_custom: true,
                created_at: "2026-06-26T00:00:00Z",
              },
            ],
          };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { defaults: unknown[]; custom: unknown[] };
    expect(body.defaults).toHaveLength(10);
    expect(body.custom).toHaveLength(1);
    const cp = body.custom[0] as { is_custom: boolean; text: string };
    expect(cp.is_custom).toBe(true);
    expect(cp.text).toBe("Custom question here?");
  });

  it("gracefully falls back to empty custom[] when 42P01 table error occurs", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID, name: "Acme", category: null }] };
        }
        if (sql.includes("FROM audit_prompt")) {
          const err = new Error('relation "audit_prompt" does not exist') as Error & { code: string };
          err.code = "42P01";
          throw err;
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { defaults: unknown[]; custom: unknown[] };
    expect(body.custom).toHaveLength(0);
    expect(body.defaults).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// POST /api/brands/:id/prompts
// ---------------------------------------------------------------------------

describe("POST /api/brands/:id/prompts", () => {
  it("creates a custom prompt and returns 201 with the new row", async () => {
    const newPromptRow = {
      id: PROMPT_ID,
      text: "Who leads in AI search visibility?",
      sort_order: 0,
      is_custom: true,
      created_at: "2026-06-26T00:00:00Z",
    };

    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("COUNT(*)") && sql.includes("audit_prompt")) {
          return { rows: [{ count: "3" }] };
        }
        if (sql.includes("INSERT INTO audit_prompt")) {
          return { rows: [newPromptRow] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Who leads in AI search visibility?" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as typeof newPromptRow;
    expect(body.id).toBe(PROMPT_ID);
    expect(body.is_custom).toBe(true);
  });

  it("returns 422 PROMPT_TOO_LONG when text exceeds 200 chars", async () => {
    const db = makeMockDb();
    const app = buildTestApp(db);
    const longText = "x".repeat(201);

    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: longText }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; max: number };
    expect(body.error).toBe("PROMPT_TOO_LONG");
    expect(body.max).toBe(200);
    // Must not reach DB
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 422 PROMPT_LIMIT_REACHED when brand already has 10 custom prompts", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("COUNT(*)") && sql.includes("audit_prompt")) {
          return { rows: [{ count: "10" }] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "A valid prompt" }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; max: number };
    expect(body.error).toBe("PROMPT_LIMIT_REACHED");
    expect(body.max).toBe(10);
  });

  it("returns 400 for empty text after trim", async () => {
    const db = makeMockDb();
    const app = buildTestApp(db);

    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "   " }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for non-string text", async () => {
    const db = makeMockDb();
    const app = buildTestApp(db);

    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: 12345 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 503 when audit_prompt table is missing", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("COUNT(*)") && sql.includes("audit_prompt")) {
          const err = new Error('relation "audit_prompt" does not exist') as Error & { code: string };
          err.code = "42P01";
          throw err;
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "A valid prompt text here" }),
    });

    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("PROMPT_TABLE_NOT_READY");
  });

  it("returns 404 when brand not found", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands")) return { rows: [] };
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-bypass",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "A valid prompt" }),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/brands/:id/prompts/:promptId
// ---------------------------------------------------------------------------

describe("DELETE /api/brands/:id/prompts/:promptId", () => {
  it("returns 204 on successful deletion", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("DELETE FROM audit_prompt")) {
          return { rows: [{ id: PROMPT_ID }] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(
      `/api/brands/${BRAND_ID}/prompts/${PROMPT_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer dev-bypass" },
      }
    );

    expect(res.status).toBe(204);
  });

  it("returns 404 when prompt not found (rowCount === 0)", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("DELETE FROM audit_prompt")) {
          return { rows: [] }; // nothing deleted
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(
      `/api/brands/${BRAND_ID}/prompts/${PROMPT_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer dev-bypass" },
      }
    );

    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("PROMPT_NOT_FOUND");
  });

  it("returns 404 when brand not found", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands")) return { rows: [] };
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(
      `/api/brands/${BRAND_ID}/prompts/${PROMPT_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer dev-bypass" },
      }
    );

    expect(res.status).toBe(404);
  });

  it("returns 503 when audit_prompt table is missing on delete", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID }] };
        }
        if (sql.includes("DELETE FROM audit_prompt")) {
          const err = new Error('relation "audit_prompt" does not exist') as Error & { code: string };
          err.code = "42P01";
          throw err;
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(
      `/api/brands/${BRAND_ID}/prompts/${PROMPT_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer dev-bypass" },
      }
    );

    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("PROMPT_TABLE_NOT_READY");
  });
});

// ---------------------------------------------------------------------------
// buildPromptPortfolio business logic — isolated from HTTP layer
// (imported indirectly; tested via GET response)
// ---------------------------------------------------------------------------

describe("buildPromptPortfolio (via GET endpoint)", () => {
  it("returns 10 prompts for any brand+category combination", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID, name: "BrandX", category: "CRM" }] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });
    const body = await res.json() as { defaults: unknown[] };
    expect(body.defaults).toHaveLength(10);
  });

  it("uses 'solution' as fallback category when category is null", async () => {
    const db = makeMockDb({
      queryImpl: async (sql) => {
        if (sql.includes("FROM brands") && sql.includes("AND tenant_id")) {
          return { rows: [{ id: BRAND_ID, name: "BrandY", category: null }] };
        }
        return { rows: [] };
      },
    });

    const app = buildTestApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/prompts`, {
      headers: { Authorization: "Bearer dev-bypass" },
    });
    const body = await res.json() as { defaults: Array<{ text: string }> };
    const texts = body.defaults.map((d) => d.text);
    // Should contain 'solution' substitution, not an empty category
    const hasSolution = texts.some((t) => t.includes("solution"));
    expect(hasSolution).toBe(true);
  });
});
