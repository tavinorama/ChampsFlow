/**
 * AI Audit inside the dashboard (D2, 2026-08-17): the access rule, the
 * allowGeneric engine option, and the tenant assess route through a real Hono
 * app with a fake db + a stand-in requireAuth. Three branches each:
 *   prime (OrganicPosts won) → full report, giants allowed
 *   paid  (growth/agency)    → teaser + 15% off when the coupon env exists
 *   free                     → teaser + full price
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// requireAuth stand-in: a fixed tenant, no JWT.
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { userId: "u1", tenantId: "11111111-1111-1111-1111-111111111111", role: "owner", supabaseUid: "s1", isSuperAdmin: false });
    await next();
  },
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { aiAuditAccessFor, discountedPriceUsd, AI_AUDIT_PAID_DISCOUNT_PCT } from "../../apps/api/src/lib/ai-audit/access";
import { buildAuditReport } from "../../apps/api/src/lib/ai-audit/engine";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import { registerAiAuditRoutes } from "../../apps/api/src/routes/ai-audit";
import type { PostgresClient } from "../../packages/shared/src/db-client";

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

describe("aiAuditAccessFor — the one rule", () => {
  it("prime: an OrganicPosts engagement unlocks the full report for free, whatever the tier", () => {
    for (const tier of ["free", "growth", "agency", null]) {
      const a = aiAuditAccessFor({ tier, hasOrganicPosts: true });
      expect(a.kind).toBe("prime");
      expect(a.unlocked).toBe(true);
      expect(a.priceUsd).toBe(0);
      expect(a.discountPct).toBe(0);
    }
  });

  it("paid: growth/agency without OrganicPosts → locked, $49 with the 15% discount flag", () => {
    for (const tier of ["growth", "agency"]) {
      const a = aiAuditAccessFor({ tier, hasOrganicPosts: false });
      expect(a.kind).toBe("paid");
      expect(a.unlocked).toBe(false);
      expect(a.priceUsd).toBe(49);
      expect(a.discountPct).toBe(AI_AUDIT_PAID_DISCOUNT_PCT);
    }
  });

  it("free (or unknown tier): locked, $49, no discount", () => {
    for (const tier of ["free", "starter", null, undefined]) {
      const a = aiAuditAccessFor({ tier, hasOrganicPosts: false });
      expect(a.kind).toBe("free");
      expect(a.unlocked).toBe(false);
      expect(a.priceUsd).toBe(49);
      expect(a.discountPct).toBe(0);
    }
  });

  it("discountedPriceUsd rounds to cents", () => {
    expect(discountedPriceUsd(49, 15)).toBe(41.65);
    expect(discountedPriceUsd(49, 0)).toBe(49);
  });

  it("copy has no em-dash", () => {
    for (const input of [{ tier: "free", hasOrganicPosts: false }, { tier: "growth", hasOrganicPosts: false }, { tier: "free", hasOrganicPosts: true }]) {
      expect(aiAuditAccessFor(input).reason).not.toContain("—");
    }
  });
});

// ---------------------------------------------------------------------------
// allowGeneric
// ---------------------------------------------------------------------------

const ANSWERS = { businessType: "agency", primaryFocus: "marketing", pains: ["content-volume", "repetitive-tasks"] };

describe("buildAuditReport allowGeneric", () => {
  const generics = SEED_CATALOG.filter((t) => t.isGeneric === true).map((t) => t.id);
  it("default (entry / $49 path) never ranks a household-name giant", () => {
    const report = buildAuditReport(ANSWERS, SEED_CATALOG);
    const ids = Object.values(report.matrix).flat().map((s) => s.tool.id);
    expect(generics.length).toBeGreaterThan(0);
    for (const g of generics) expect(ids).not.toContain(g);
  });
  it("allowGeneric: true (prime full report) lets a giant in when it honestly matches", () => {
    const report = buildAuditReport(ANSWERS, SEED_CATALOG, { allowGeneric: true });
    const ids = Object.values(report.matrix).flat().map((s) => s.tool.id);
    expect(generics.some((g) => ids.includes(g))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The tenant route
// ---------------------------------------------------------------------------

/**
 * Fake db keyed on the SQL text. Everything else returns no rows, which makes
 * the catalog fall back to the seed and ai_audit_order lookups come back empty.
 */
function fakeDb(facts: { tier?: string; hasOrganicPosts?: boolean }, log: unknown[][] = []): PostgresClient {
  return {
    setTenantId: async () => {},
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("FROM billing_subscriptions")) return { rows: facts.tier ? [{ plan_tier: facts.tier }] : [] };
      if (sql.includes("FROM engagement")) return { rows: facts.hasOrganicPosts ? [{ one: 1 }] : [] };
      if (sql.includes("INSERT INTO audit_log")) { log.push(params ?? []); return { rows: [] }; }
      if (sql.includes("FROM audit_log") && sql.includes("ai_audit_tenant_assess")) {
        const last = log[log.length - 1];
        return { rows: last ? [{ metadata: last[2], created_at: "2026-08-17T00:00:00Z" }] : [] };
      }
      return { rows: [] };
    },
  } as unknown as PostgresClient;
}

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerAiAuditRoutes(app, db);
  return app;
}

function post(app: Hono, path: string, body: unknown) {
  return app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  delete process.env["STRIPE_COUPON_AIAUDIT15"];
  process.env["NODE_ENV"] = "test";
});

describe("POST /api/ai-audit/tenant/assess", () => {
  it("prime: returns the FULL report, unlocked, and logs the run", async () => {
    const log: unknown[][] = [];
    const res = await post(appWith(fakeDb({ tier: "free", hasOrganicPosts: true }, log)), "/api/ai-audit/tenant/assess", ANSWERS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unlocked: boolean; access: { kind: string }; report?: { recommendedSolutions: unknown[]; matrix: unknown }; entry?: { pick: unknown }; offer: { finalPriceUsd: number } };
    expect(body.unlocked).toBe(true);
    expect(body.access.kind).toBe("prime");
    expect(body.report).toBeTruthy();
    expect(Array.isArray(body.report!.recommendedSolutions)).toBe(true);
    expect(body.entry).toBeTruthy();
    expect(body.offer.finalPriceUsd).toBe(0);
    expect(log.length).toBe(1);
  });

  it("paid (growth): teaser only, 15% off when the coupon env is set, honest when it is not", async () => {
    const app = appWith(fakeDb({ tier: "growth" }));
    // No coupon configured → full price, couponMissing says so.
    let res = await post(app, "/api/ai-audit/tenant/assess", ANSWERS);
    expect(res.status).toBe(200);
    let body = (await res.json()) as Record<string, unknown> & { offer: Record<string, unknown>; teaser?: Record<string, unknown>; access: { kind: string } };
    expect(body.unlocked).toBe(false);
    expect(body.access.kind).toBe("paid");
    expect(body.report).toBeUndefined();
    expect(body.teaser).toBeTruthy();
    expect(body.offer.couponApplied).toBe(false);
    expect(body.offer.couponMissing).toBe(true);
    expect(body.offer.finalPriceUsd).toBe(49);
    // Coupon configured → 15% off shown.
    process.env["STRIPE_COUPON_AIAUDIT15"] = "AIAUDIT15";
    res = await post(app, "/api/ai-audit/tenant/assess", ANSWERS);
    body = (await res.json()) as typeof body;
    expect(body.offer.couponApplied).toBe(true);
    expect(body.offer.discountPct).toBe(15);
    expect(body.offer.finalPriceUsd).toBe(41.65);
  });

  it("free: teaser + full-price checkout; the pick and the report never leak", async () => {
    process.env["STRIPE_COUPON_AIAUDIT15"] = "AIAUDIT15"; // must NOT apply to free
    const res = await post(appWith(fakeDb({})), "/api/ai-audit/tenant/assess", ANSWERS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown> & { offer: Record<string, unknown>; teaser: Record<string, unknown>; access: { kind: string } };
    expect(body.access.kind).toBe("free");
    expect(body.unlocked).toBe(false);
    expect(body.report).toBeUndefined();
    expect(body.entry).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('"pick"');
    expect(body.offer.couponApplied).toBe(false);
    expect(body.offer.finalPriceUsd).toBe(49);
    expect(typeof body.teaser.totalMatched).toBe("number");
    expect(body.upsell).toBeTruthy();
  });

  it("400 without pains or business type", async () => {
    const app = appWith(fakeDb({}));
    expect((await post(app, "/api/ai-audit/tenant/assess", { businessType: "agency", pains: [] })).status).toBe(400);
    expect((await post(app, "/api/ai-audit/tenant/assess", { businessType: "", pains: ["content-volume"] })).status).toBe(400);
  });

  it("checkout is refused for prime (409 ALREADY_UNLOCKED)", async () => {
    const res = await post(appWith(fakeDb({ hasOrganicPosts: true })), "/api/ai-audit/tenant/checkout", ANSWERS);
    expect(res.status).toBe(409);
  });
});

describe("GET /api/ai-audit/tenant/access", () => {
  it("returns the rule + offer for the tenant before any answers", async () => {
    const res = await appWith(fakeDb({ tier: "agency" })).request("/api/ai-audit/tenant/access");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access: { kind: string }; offer: { checkoutPath: string | null }; tier: string };
    expect(body.access.kind).toBe("paid");
    expect(body.tier).toBe("agency");
    expect(body.offer.checkoutPath).toBe("/api/ai-audit/tenant/checkout");
  });

  it("carries the last questionnaire back (audit_log is the persistence, no migration)", async () => {
    const log: unknown[][] = [];
    const app = appWith(fakeDb({ tier: "free" }, log));
    expect((await app.request("/api/ai-audit/tenant/access").then((r) => r.json()) as { last: unknown }).last).toBeNull();
    await post(app, "/api/ai-audit/tenant/assess", ANSWERS);
    const body = (await app.request("/api/ai-audit/tenant/access").then((r) => r.json())) as { last: { answers: { pains: string[]; businessType: string }; access: string } | null };
    expect(body.last).not.toBeNull();
    expect(body.last!.answers.pains).toEqual(ANSWERS.pains);
    expect(body.last!.answers.businessType).toBe("agency");
    expect(body.last!.access).toBe("free");
  });
});
