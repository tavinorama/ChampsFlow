/**
 * 10.B.9 — public checkout/deliver endpoints are rate-limited per IP:
 *   POST /api/kit/checkout                     10/h
 *   POST /api/pages/checkout                   10/h
 *   POST /api/kit/:token/deliver               12/h
 *   POST /api/ai-audit/order/:token/deliver    12/h
 *   GET  /api/v1/agent-org/liveness            120/10min (light cap)
 *
 * REDIS_URL is unset here, so publicRateLimit exercises exactly the degraded
 * path this item hardened: the bounded in-process memory limiter — proving
 * the caps hold even with Redis down (never fail-open).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { __resetMemoryRateLimit } from "../../apps/api/src/lib/memory-rate-limit";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerProductRoutes } from "../../apps/api/src/routes/products";
import { registerAiAuditRoutes } from "../../apps/api/src/routes/ai-audit";
import { registerLivenessRoutes } from "../../apps/api/src/routes/liveness";
import type { PostgresClient } from "../../packages/shared/src/db-client";

// Minimal db: kit_order lookups return a pending order; INSERTs succeed.
const fakeDb = {
  async query(sql: string) {
    if (sql.includes("FROM kit_order")) {
      return { rows: [] }; // deliver → 404 Order not found (fine — cap fires first)
    }
    if (sql.includes("FROM ai_audit_order")) {
      return { rows: [] };
    }
    if (sql.includes("FROM ops.agent_run")) {
      return { rows: [{ running_runs: "0", advanceable_runs: "0", newest_step_at: null }] };
    }
    return { rows: [] };
  },
} as unknown as PostgresClient;

function productsApp(): Hono {
  const app = new Hono();
  registerProductRoutes(app, fakeDb);
  return app;
}

const IP_A = { "x-real-ip": "203.0.113.7", "content-type": "application/json" };
const IP_B = { "x-real-ip": "198.51.100.9", "content-type": "application/json" };

beforeEach(() => {
  __resetMemoryRateLimit();
});

describe("10.B.9 public rate limits (memory fallback — Redis down)", () => {
  it("POST /api/kit/checkout caps at 10/h/IP, other IPs unaffected", async () => {
    const app = productsApp();
    const body = JSON.stringify({ brand: "B", category: "cafe", email: "a@b.co" });
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/kit/checkout", { method: "POST", headers: IP_A, body });
      expect(res.status).not.toBe(429);
    }
    const over = await app.request("/api/kit/checkout", { method: "POST", headers: IP_A, body });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { code: string }).code).toBe("RATE_LIMITED");
    expect(over.headers.get("Retry-After")).toBeTruthy();
    const other = await app.request("/api/kit/checkout", { method: "POST", headers: IP_B, body });
    expect(other.status).not.toBe(429);
  });

  it("POST /api/pages/checkout caps at 10/h/IP", async () => {
    const app = productsApp();
    const body = JSON.stringify({ email: "a@b.co" });
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/pages/checkout", { method: "POST", headers: IP_A, body });
      expect(res.status).not.toBe(429);
    }
    const over = await app.request("/api/pages/checkout", { method: "POST", headers: IP_A, body });
    expect(over.status).toBe(429);
  });

  it("POST /api/kit/:token/deliver caps at 12/h/IP (token brute-force + LLM cost)", async () => {
    const app = productsApp();
    for (let i = 0; i < 12; i++) {
      const res = await app.request("/api/kit/tok-x/deliver", { method: "POST", headers: IP_A });
      expect(res.status).toBe(404); // order not found — but the cap counted it
    }
    const over = await app.request("/api/kit/tok-x/deliver", { method: "POST", headers: IP_A });
    expect(over.status).toBe(429);
  });

  it("POST /api/ai-audit/order/:token/deliver caps at 12/h/IP", async () => {
    const app = new Hono();
    registerAiAuditRoutes(app, fakeDb);
    for (let i = 0; i < 12; i++) {
      const res = await app.request("/api/ai-audit/order/tok-y/deliver", { method: "POST", headers: IP_A });
      expect(res.status).toBe(404);
    }
    const over = await app.request("/api/ai-audit/order/tok-y/deliver", { method: "POST", headers: IP_A });
    expect(over.status).toBe(429);
  });

  it("GET /api/v1/agent-org/liveness has the light 120/10min cap", async () => {
    const app = new Hono();
    registerLivenessRoutes(app, fakeDb);
    for (let i = 0; i < 120; i++) {
      const res = await app.request("/api/v1/agent-org/liveness", { headers: IP_A });
      expect(res.status).toBe(200);
    }
    const over = await app.request("/api/v1/agent-org/liveness", { headers: IP_A });
    expect(over.status).toBe(429);
  });
});
