/**
 * D8c — public /api/ai-audit/* endpoints are rate-limited per IP:
 * /meta 30/h, /entry + /assess 8/h (shared bucket). Driven through a real Hono
 * app with an injected memory limiter, so the 429 contract is pinned without
 * Redis.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { registerAiAuditRoutes, AI_AUDIT_META_LIMIT, AI_AUDIT_ASSESS_LIMIT } from "../../apps/api/src/routes/ai-audit";
import { memoryRateLimitAllow } from "../../apps/api/src/lib/memory-rate-limit";
import type { IpRateLimiter } from "../../apps/api/src/lib/ip-rate-limit";
import type { PostgresClient } from "../../packages/shared/src/db-client";

const seedDb = {
  async query() {
    return { rows: [] };
  },
} as unknown as PostgresClient;

function appWith(prefix: string): Hono {
  const app = new Hono();
  // Namespace keys per test so buckets never collide across cases.
  const limiter: IpRateLimiter = async (key, limit, windowMs) => memoryRateLimitAllow(`${prefix}:${key}`, limit, windowMs);
  registerAiAuditRoutes(app, seedDb, { limiter });
  return app;
}

const headers = { "x-real-ip": "203.0.113.7", "content-type": "application/json" };
const body = JSON.stringify({ businessType: "agency", pains: ["content-volume"] });

describe("/api/ai-audit rate limits", () => {
  it("/meta allows 30 per hour per IP, then 429 with RATE_LIMITED", async () => {
    const app = appWith("meta");
    for (let i = 0; i < AI_AUDIT_META_LIMIT; i++) {
      expect((await app.request("/api/ai-audit/meta", { headers })).status).toBe(200);
    }
    const res = await app.request("/api/ai-audit/meta", { headers });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { code: string }).code).toBe("RATE_LIMITED");
  });

  it("/entry and /assess share an 8/h bucket per IP", async () => {
    const app = appWith("assess");
    for (let i = 0; i < AI_AUDIT_ASSESS_LIMIT; i++) {
      const path = i % 2 === 0 ? "/api/ai-audit/entry" : "/api/ai-audit/assess";
      expect((await app.request(path, { method: "POST", headers, body })).status).toBe(200);
    }
    expect((await app.request("/api/ai-audit/entry", { method: "POST", headers, body })).status).toBe(429);
    expect((await app.request("/api/ai-audit/assess", { method: "POST", headers, body })).status).toBe(429);
  });

  it("a different IP (different /24) has its own bucket", async () => {
    const app = appWith("ip");
    for (let i = 0; i < AI_AUDIT_ASSESS_LIMIT; i++) {
      await app.request("/api/ai-audit/entry", { method: "POST", headers, body });
    }
    expect((await app.request("/api/ai-audit/entry", { method: "POST", headers, body })).status).toBe(429);
    const other = { ...headers, "x-real-ip": "198.51.100.9" };
    expect((await app.request("/api/ai-audit/entry", { method: "POST", headers: other, body })).status).toBe(200);
  });
});
