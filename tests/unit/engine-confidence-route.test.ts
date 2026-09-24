/**
 * engine-confidence-route.test.ts — B4 (Codex D23, 23/09).
 * The audit stores `google`/`dataforseo`; the drift battery stores
 * `gemini`/`serp`. The route joined them literally and two engines vanished.
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { userId: "u1", tenantId: "11111111-1111-1111-1111-111111111111", role: "owner", supabaseUid: "s1", isSuperAdmin: false });
    await next();
  },
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../apps/api/src/routes/billing", () => ({
  requireNotRestricted: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../apps/api/src/shared-redis", () => ({ tryGetSharedRedis: () => null, getSharedRedis: () => null }));

import { registerAuditRoutes } from "../../apps/api/src/routes/audits";
import type { PostgresClient } from "../../packages/shared/src/db-client";

// The drift table only knows these ids. `anthropic` has no battery that day.
const DRIFT: Record<string, string> = { openai: "healthy", perplexity: "healthy", gemini: "healthy", serp: "degraded" };

function harness() {
  const captured: { engines: string[] | null } = { engines: null };
  const db = {
    setTenantId: async () => {},
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("FROM geo_audit WHERE id")) {
        return { rows: [{ created_at: "2026-09-21T18:46:50Z", providers_used: ["openai", "anthropic", "perplexity", "google", "dataforseo"] }] };
      }
      if (sql.includes("unnest($2::text[])")) {
        const engines = params?.[1] as string[];
        captured.engines = engines;
        return { rows: engines.map((e) => ({ engine: e, status: DRIFT[e] ?? null, checked_at: DRIFT[e] ? "2026-09-21T03:30:00Z" : null })) };
      }
      return { rows: [] };
    },
  } as unknown as PostgresClient;
  const app = new Hono();
  registerAuditRoutes(app, db);
  return { app, captured };
}

describe("GET /api/audits/:id/engine-confidence", () => {
  it("joins on canonical ids, so all five engines come back and none is dropped", async () => {
    const { app, captured } = harness();
    const res = await app.request("/api/audits/a1/engine-confidence");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { engines: Array<{ engine: string; label: string; status: string | null }> };
    expect(captured.engines).toEqual(["openai", "anthropic", "perplexity", "gemini", "serp"]);
    expect(body.engines).toHaveLength(5);
    const byEngine = Object.fromEntries(body.engines.map((e) => [e.engine, e]));
    expect(byEngine["gemini"]!.status).toBe("healthy");
    expect(byEngine["serp"]!.status).toBe("degraded");
    expect(byEngine["serp"]!.label).toBe("Google AI Overviews");
    // No battery that day → null, present in the list, never "healthy".
    expect(byEngine["anthropic"]!.status).toBeNull();
  });
});
