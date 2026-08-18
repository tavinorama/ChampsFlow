/**
 * The audit TRIGGER (POST /api/brands/:id/audit) is the money-spending endpoint:
 * it enqueues a job that fans out across the engines and costs real provider
 * money. The DB quota guards inside it bound weekly/monthly SPEND; this test
 * pins the per-tenant burst RATE limit added on top (20/min), driven through a
 * real Hono app with an injected memory limiter and a stand-in requireAuth so
 * the 429 contract holds without Redis or a JWT.
 *
 * A request that PASSES the limiter is deterministically short-circuited to 409
 * AUDIT_ALREADY_RUNNING by the fake db (it reports an in-flight audit), which
 * happens right after the limiter and before any queue work — so "not 429"
 * cleanly means "the limiter let it through".
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// requireAuth stand-in: tenant comes from a header so a test can drive several
// tenants; role/super-admin fixed. requireRole / requireNotRestricted pass-through.
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (
    c: { req: { header: (n: string) => string | undefined }; set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set("auth", {
      userId: "u1",
      tenantId: c.req.header("x-test-tenant") ?? "11111111-1111-1111-1111-111111111111",
      role: "owner",
      supabaseUid: "s1",
      isSuperAdmin: false,
    });
    await next();
  },
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../../apps/api/src/routes/billing", () => ({
  requireNotRestricted: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { registerAuditRoutes, AUDIT_TRIGGER_LIMIT } from "../../apps/api/src/routes/audits";
import { memoryRateLimitAllow } from "../../apps/api/src/lib/memory-rate-limit";
import type { IpRateLimiter } from "../../apps/api/src/lib/ip-rate-limit";
import type { PostgresClient } from "../../packages/shared/src/db-client";

/**
 * Fake db: brand exists, and there is always an in-flight audit, so any request
 * that clears the limiter returns 409 (never reaching the queue). Anything else
 * returns no rows.
 */
const fakeDb = {
  setTenantId: async () => {},
  async query(sql: string) {
    if (sql.includes("FROM brands WHERE id")) return { rows: [{ id: "b1", region: "US" }] };
    if (sql.includes("FROM geo_audit") && sql.includes("status IN ('pending', 'running')")) {
      return { rows: [{ id: "a1" }] };
    }
    return { rows: [] };
  },
} as unknown as PostgresClient;

function appWith(prefix: string): Hono {
  const app = new Hono();
  // Namespace keys per test so buckets never collide across cases.
  const limiter: IpRateLimiter = async (key, limit, windowMs) =>
    memoryRateLimitAllow(`${prefix}:${key}`, limit, windowMs);
  registerAuditRoutes(app, fakeDb, { limiter });
  return app;
}

function trigger(app: Hono, tenant: string) {
  return app.request("/api/brands/b1/audit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-tenant": tenant },
    body: "{}",
  });
}

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("POST /api/brands/:id/audit — per-tenant burst rate limit", () => {
  it("allows up to AUDIT_TRIGGER_LIMIT per minute per tenant, then 429 RATE_LIMITED", async () => {
    const app = appWith("under");
    for (let i = 0; i < AUDIT_TRIGGER_LIMIT; i++) {
      const res = await trigger(app, TENANT_A);
      // Passed the limiter → blocked only by the in-flight guard (409), never 429.
      expect(res.status).not.toBe(429);
      expect(res.status).toBe(409);
    }
    const over = await trigger(app, TENANT_A);
    expect(over.status).toBe(429);
    const body = (await over.json()) as { code: string; message: string };
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("keeps a separate bucket per tenant", async () => {
    const app = appWith("perTenant");
    // Exhaust tenant A.
    for (let i = 0; i < AUDIT_TRIGGER_LIMIT; i++) await trigger(app, TENANT_A);
    expect((await trigger(app, TENANT_A)).status).toBe(429);
    // Tenant B is untouched → still allowed (409 from the in-flight guard).
    expect((await trigger(app, TENANT_B)).status).toBe(409);
  });
});
