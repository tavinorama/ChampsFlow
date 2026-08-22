/**
 * OrganicPosts Prime (D3, 2026-08-17): the nudge rule (pure) and the
 * /api/prime/status + /api/prime/nudge routes through a fake db.
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { userId: "u1", tenantId: "t1", role: "owner", supabaseUid: "s1", isSuperAdmin: false });
    await next();
  },
}));

import { pickNudge, eligibleNudges } from "../../packages/shared/src/prime-nudges";
import { registerPrimeRoutes } from "../../apps/api/src/routes/prime";
import type { PostgresClient } from "../../packages/shared/src/db-client";

const base = { visibility: 70, weeklyChange: 0, creditsBalance: 500, hasOrganicPosts: false };

describe("pickNudge", () => {
  it("nothing when everything is fine", () => {
    expect(pickNudge(base, { dismissed: [], shownThisSession: false })).toBeNull();
  });
  it("low visibility after an audit under 40", () => {
    const n = pickNudge({ ...base, visibility: 32 }, { dismissed: [], shownThisSession: false });
    expect(n?.kind).toBe("low_visibility");
    expect(n?.title).toContain("32");
  });
  it("credits at 0", () => {
    expect(pickNudge({ ...base, creditsBalance: 0 }, { dismissed: [], shownThisSession: false })?.kind).toBe("credits_out");
  });
  it("weekly drop of 10 or more wins over the others", () => {
    const n = pickNudge({ ...base, visibility: 30, creditsBalance: 0, weeklyChange: -12 }, { dismissed: [], shownThisSession: false });
    expect(n?.kind).toBe("score_drop");
    expect(n?.title).toContain("12");
    expect(pickNudge({ ...base, weeklyChange: -9 }, { dismissed: [], shownThisSession: false })).toBeNull();
  });
  it("dismissed kinds are skipped; the next eligible one shows", () => {
    const n = pickNudge({ ...base, visibility: 30, creditsBalance: 0 }, { dismissed: ["credits_out"], shownThisSession: false });
    expect(n?.kind).toBe("low_visibility");
  });
  it("at most one per session", () => {
    expect(pickNudge({ ...base, visibility: 10 }, { dismissed: [], shownThisSession: true })).toBeNull();
  });
  it("never for a tenant who already has OrganicPosts", () => {
    expect(eligibleNudges({ visibility: 5, weeklyChange: -30, creditsBalance: 0, hasOrganicPosts: true })).toEqual([]);
  });
  it("copy: no em-dash, first-person CTA", () => {
    for (const n of eligibleNudges({ visibility: 5, weeklyChange: -30, creditsBalance: 0, hasOrganicPosts: false })) {
      expect(`${n.title} ${n.body} ${n.cta}`).not.toContain("—");
      expect(n.cta.startsWith("Book my")).toBe(true);
    }
  });
});

const DAY = 24 * 60 * 60 * 1000;
function fakeDb(o: { won?: boolean; scores?: Array<{ score_ai: number; recorded_at: string }>; competitors?: number; done?: number }, log: unknown[][] = []): PostgresClient {
  return {
    setTenantId: async () => {},
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("FROM engagement")) return { rows: o.won ? [{ sku: "geo_sprint", status: "won", created_at: "2026-08-01" }] : [] };
      if (sql.includes("FROM brands ")) return { rows: [{ id: "b1" }] }; // real table is `brands` (prod 500 on 22/08 when it read `brand`)
      if (sql.includes("FROM geo_score")) return { rows: o.scores ?? [] };
      if (sql.includes("FROM competitor")) return { rows: [{ n: String(o.competitors ?? 0) }] };
      if (sql.includes("FROM plan_task")) return { rows: [{ n: String(o.done ?? 0) }] };
      if (sql.includes("FROM billing_subscriptions")) return { rows: [{ plan_tier: "growth" }] };
      if (sql.includes("FROM credit_ledger")) return { rows: [{ balance: "0" }] };
      if (sql.includes("INSERT INTO audit_log")) { log.push(params ?? []); return { rows: [] }; }
      return { rows: [] };
    },
  } as unknown as PostgresClient;
}

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerPrimeRoutes(app, db);
  return app;
}

describe("GET /api/prime/status", () => {
  it("reads the real facts: engagement, first audit, competitors, cards done, visibility, weekly change, credits", async () => {
    const now = Date.now();
    const db = fakeDb({
      won: false,
      scores: [
        { score_ai: 28, recorded_at: new Date(now - 1 * DAY).toISOString() },
        { score_ai: 41, recorded_at: new Date(now - 8 * DAY).toISOString() },
      ],
      competitors: 2,
      done: 3,
    });
    const res = await appWith(db).request("/api/prime/status?brand=b1");
    expect(res.status).toBe(200);
    const b = (await res.json()) as Record<string, unknown> & { organicPosts: { status: string }; credits: { balance: number } };
    expect(b.organicPosts.status).toBe("none");
    expect(b.brandId).toBe("b1");
    expect(b.firstAuditDone).toBe(true);
    expect(b.competitorsAdded).toBe(2);
    expect(b.actionCardsDone).toBe(3);
    expect(b.visibility).toBe(28);
    expect(b.weeklyChange).toBe(-13);
    expect(b.credits.balance).toBe(0);
    expect(b.tier).toBe("growth");
  });
  it("won engagement + no audit yet", async () => {
    const res = await appWith(fakeDb({ won: true })).request("/api/prime/status");
    const b = (await res.json()) as { organicPosts: { status: string }; firstAuditDone: boolean; visibility: number | null; weeklyChange: number | null };
    expect(b.organicPosts.status).toBe("won");
    expect(b.firstAuditDone).toBe(false);
    expect(b.visibility).toBeNull();
    expect(b.weeklyChange).toBeNull();
  });
});

describe("POST /api/prime/nudge", () => {
  it("logs a known nudge to audit_log; rejects unknown kinds", async () => {
    const log: unknown[][] = [];
    const app = appWith(fakeDb({}, log));
    const ok = await app.request("/api/prime/nudge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "credits_out", action: "dismissed" }) });
    expect(ok.status).toBe(200);
    expect(log.length).toBe(1);
    const bad = await app.request("/api/prime/nudge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "nope" }) });
    expect(bad.status).toBe(400);
  });
});
