/**
 * showcase-geo-route.test.ts — B1 (Codex D06, 23/09).
 *
 * GET /api/showcase/geo feeds the public /results page, whose copy promises
 * "It updates after every audit". The query was `ORDER BY created_at ASC
 * LIMIT 24`: the FIRST 24 audits ever. Past 24 audits the public page froze
 * on the past (public: 14/09 · 52) while the database moved on (21/09 · 49).
 *
 * The fake db below honours the query's own ORDER BY / LIMIT, so the test
 * fails on the old SQL and passes on the new one for the right reason.
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../apps/api/src/routes/billing", () => ({
  requireNotRestricted: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () => null,
  getSharedRedis: () => null,
}));

import { registerAuditRoutes } from "../../apps/api/src/routes/audits";
import type { PostgresClient } from "../../packages/shared/src/db-client";

const BRAND = "e74fcbc1-a988-4b5d-b054-87329dc881c0";

/** 30 complete audits, one per day from 01/08; ai score = day number. */
const AUDITS = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  return {
    id: `audit-${String(day).padStart(2, "0")}`,
    created_at: `2026-08-${String(day).padStart(2, "0")}T06:00:00.000Z`,
    score_ai: day,
    score_performance: 60,
    score_brand: 30,
  };
});

function fakeDb(): PostgresClient {
  return {
    setTenantId: async () => {},
    async query(sql: string) {
      if (sql.includes("FROM geo_audit") && sql.includes("status = 'complete'")) {
        const desc = /ORDER BY\s+created_at\s+DESC/i.test(sql);
        const limit = Number(/LIMIT\s+(\d+)/i.exec(sql)?.[1] ?? AUDITS.length);
        const sorted = [...AUDITS].sort((a, b) =>
          desc ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)
        );
        return { rows: sorted.slice(0, limit) };
      }
      if (sql.includes("FROM citation_check")) {
        return { rows: [{ provider: "openai", probes: "13", cited: "1" }] };
      }
      return { rows: [] };
    },
  } as unknown as PostgresClient;
}

async function showcase() {
  const app = new Hono();
  registerAuditRoutes(app, fakeDb());
  const res = await app.request("/api/showcase/geo");
  expect(res.status).toBe(200);
  return (await res.json()) as {
    history: Array<{ date: string; ai: number | null }>;
    latest_engines: unknown[];
    threeScores: { visibility: number } | null;
    measuredAt?: string;
  };
}

describe("GET /api/showcase/geo — the public window is the LAST 24 audits", () => {
  it("with 30 audits, the window holds the last 24 and the newest is the last point", async () => {
    const body = await showcase();
    expect(body.history).toHaveLength(24);
    expect(body.history[0]!.date).toBe(AUDITS[6]!.created_at); // 07/08 is the oldest shown
    expect(body.history[23]!.date).toBe(AUDITS[29]!.created_at); // 30/08 is the newest
  });

  it("the line is chronological, oldest → newest", async () => {
    const dates = (await showcase()).history.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("the scorecard reads the newest audit, never the 24th-oldest", async () => {
    const body = await showcase();
    expect(body.threeScores?.visibility).toBe(30);
    expect(body.history[23]!.ai).toBe(30);
  });

  it("with fewer than 24 audits everything is shown (no window is invented)", async () => {
    const app = new Hono();
    const few = AUDITS.slice(0, 5);
    registerAuditRoutes(app, {
      setTenantId: async () => {},
      async query(sql: string) {
        if (sql.includes("FROM geo_audit") && sql.includes("status = 'complete'")) {
          const desc = /ORDER BY\s+created_at\s+DESC/i.test(sql);
          return { rows: [...few].sort((a, b) => (desc ? -1 : 1) * a.created_at.localeCompare(b.created_at)) };
        }
        return { rows: [] };
      },
    } as unknown as PostgresClient);
    const res = await app.request("/api/showcase/geo");
    const body = (await res.json()) as { history: Array<{ date: string }> };
    expect(body.history.map((h) => h.date)).toEqual(few.map((a) => a.created_at));
  });
});
