/**
 * Cost-control quotas — unit tests (issue #217).
 *
 * Covers the two new plan-gated guards + the platform-key switch:
 *   1. PLAN_LIMITS shape (manual_audit_interval / audit_backstop_24h /
 *      pages_regens_per_site_month) — single source of truth assertions.
 *   2. Manual-audit guard (apps/api/src/routes/audits.ts): per-brand weekly/
 *      daily window + tenant-wide 24h backstop, cron EXCLUDED from both
 *      counts, super_admin bypass, honest 429 shape with next_allowed_at.
 *   3. Pages regeneration quota (apps/api/src/routes/landing.ts): pure quota
 *      math (free=lifetime/2, growth+agency=monthly/5), the
 *      shouldEnforcePagesRegenQuota gate (initial generation is always free,
 *      super_admin bypass), the atomic usage_counters increment/decrement
 *      primitives, and the "denied attempt does not burn quota" contract —
 *      at both the primitive level and through the live route.
 *   4. Platform-key switch (apps/worker/src/jobs/landing-generate.ts):
 *      resolvePlatformAnthropicKey reads ONLY the platform env key — never
 *      customer BYOK (provider_keys) — verified by both a resolution unit
 *      test and a grep-style source assertion.
 *
 * Route-level tests use the same DEV_AUTH_BYPASS + mock-PostgresClient
 * pattern as tests/unit/agency.test.ts / tests/unit/pages-order.test.ts.
 * They deliberately stop BEFORE the BullMQ enqueue step (both routes'
 * getAuditQueue()/getLandingGenerateQueue() default to a real
 * redis://localhost:6379 connection when REDIS_URL is unset — touching that
 * path here would make tests depend on a live Redis). Every guard tested
 * below returns its response strictly before that point.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// BullMQ/ioredis mocks (Hermes review, #221): the generate route now checks
// the queue for an in-flight job BEFORE charging quota, so route tests must
// cross the queue layer. Mocking it also lets us test the full happy path and
// the enqueue-failure refund without a live Redis.
// ---------------------------------------------------------------------------
const { queueMock } = vi.hoisted(() => ({
  queueMock: {
    getJob: vi.fn<() => Promise<unknown>>(async () => null),
    add: vi.fn(async () => ({})),
  },
}));
vi.mock("bullmq", () => ({
  // Constructible (a `new`-ed function returning an object yields that object).
  Queue: function Queue() {
    return queueMock;
  },
  Worker: class MockWorker {},
}));
vi.mock("ioredis", () => ({
  // A real class — `new IORedis(...)` must work (arrow fns aren't constructible).
  default: class MockIORedis {
    on(): void {
      /* no-op */
    }
  },
}));
import { PLAN_LIMITS, type PlanTier } from "../../apps/api/src/integrations/stripe";
import { registerAuditRoutes, auditWindowDays } from "../../apps/api/src/routes/audits";
import {
  registerLandingRoutes,
  pagesRegenQuotaFor,
  pagesRegenPeriodStart,
  shouldEnforcePagesRegenQuota,
  incrementUsageCounter,
  decrementUsageCounter,
  PAGES_REGEN_FEATURE,
  LIFETIME_PERIOD_START,
} from "../../apps/api/src/routes/landing";
import {
  resolvePlatformAnthropicKey,
  resolvePlatformPagesKey,
} from "../../apps/worker/src/jobs/landing-generate";

// ---------------------------------------------------------------------------
// 1. PLAN_LIMITS shape — single source of truth (#217 design matrix)
// ---------------------------------------------------------------------------

describe("PLAN_LIMITS — cost-control fields (#217)", () => {
  it("free: 1/week manual audit, 3/24h backstop, lifetime-credit page regens (0 monthly)", () => {
    expect(PLAN_LIMITS.free.manual_audit_interval).toBe("week");
    expect(PLAN_LIMITS.free.audit_backstop_24h).toBe(3);
    expect(PLAN_LIMITS.free.pages_regens_per_site_month).toBe(0);
  });

  it("growth: 1/week manual audit, 5/24h backstop, 5 page regens/month", () => {
    expect(PLAN_LIMITS.growth.manual_audit_interval).toBe("week");
    expect(PLAN_LIMITS.growth.audit_backstop_24h).toBe(5);
    expect(PLAN_LIMITS.growth.pages_regens_per_site_month).toBe(5);
  });

  it("agency: 1/day manual audit, 30/24h backstop, 5 page regens/month", () => {
    expect(PLAN_LIMITS.agency.manual_audit_interval).toBe("day");
    expect(PLAN_LIMITS.agency.audit_backstop_24h).toBe(30);
    expect(PLAN_LIMITS.agency.pages_regens_per_site_month).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 1b. monthly_audit_cap — margin guard: scheduled audits can't run a plan
//     negative. Enforced in apps/worker/src/jobs/audit-run.ts (cron branch).
// ---------------------------------------------------------------------------

describe("PLAN_LIMITS.monthly_audit_cap — margin guard", () => {
  const APPROX_AUDIT_COST_USD = 5; // ~$5 per full 250-prompt audit (api_spend)
  const PLAN_PRICE_USD: Record<PlanTier, number> = { free: 0, growth: 99, agency: 249 };

  it("every tier defines a positive integer cap", () => {
    (["free", "growth", "agency"] as PlanTier[]).forEach((t) => {
      const cap = PLAN_LIMITS[t].monthly_audit_cap;
      expect(Number.isInteger(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
    });
  });

  it("caps keep paid tiers' scheduled-audit API cost BELOW revenue (non-negative)", () => {
    (["growth", "agency"] as PlanTier[]).forEach((t) => {
      const maxApiCost = PLAN_LIMITS[t].monthly_audit_cap * APPROX_AUDIT_COST_USD;
      expect(maxApiCost).toBeLessThan(PLAN_PRICE_USD[t]);
    });
  });

  it("agency cap (40) bounds cost at ~$200 < $249 — the founder's trava", () => {
    expect(PLAN_LIMITS.agency.monthly_audit_cap).toBe(40);
    expect(PLAN_LIMITS.agency.monthly_audit_cap * APPROX_AUDIT_COST_USD).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. auditWindowDays — pure mapping (audits.ts)
// ---------------------------------------------------------------------------

describe("auditWindowDays", () => {
  it("'week' -> 7 days", () => {
    expect(auditWindowDays("week")).toBe(7);
  });
  it("'day' -> 1 day", () => {
    expect(auditWindowDays("day")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Pages regeneration quota — pure math (landing.ts)
// ---------------------------------------------------------------------------

describe("pagesRegenQuotaFor", () => {
  it("free: lifetime quota of 2 (the $99-credit site)", () => {
    expect(pagesRegenQuotaFor("free")).toEqual({ scope: "lifetime", quota: 2 });
  });
  it("growth: monthly quota of 5", () => {
    expect(pagesRegenQuotaFor("growth")).toEqual({ scope: "monthly", quota: 5 });
  });
  it("agency: monthly quota of 5", () => {
    expect(pagesRegenQuotaFor("agency")).toEqual({ scope: "monthly", quota: 5 });
  });
});

describe("pagesRegenPeriodStart", () => {
  it("lifetime scope always returns the 1970-01-01 sentinel", () => {
    expect(pagesRegenPeriodStart("lifetime")).toBe(LIFETIME_PERIOD_START);
    expect(pagesRegenPeriodStart("lifetime", new Date("2026-07-15T12:00:00Z"))).toBe(
      LIFETIME_PERIOD_START
    );
  });
  it("monthly scope buckets to the first of the UTC calendar month", () => {
    expect(pagesRegenPeriodStart("monthly", new Date("2026-07-15T23:59:59Z"))).toBe("2026-07-01");
  });
  it("monthly scope zero-pads single-digit months", () => {
    expect(pagesRegenPeriodStart("monthly", new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("shouldEnforcePagesRegenQuota", () => {
  it("INITIAL generation (0 content pages AND never generated) is free — never quota-checked", () => {
    expect(shouldEnforcePagesRegenQuota(0, false, false)).toBe(false);
    expect(shouldEnforcePagesRegenQuota(0, true, false)).toBe(false);
  });
  it("a REGENERATION (content pages exist) is quota-checked for normal tenants", () => {
    expect(shouldEnforcePagesRegenQuota(5, false, true)).toBe(true);
    // Legacy site generated before the generated_at stamp existed: content
    // pages alone still force the quota even with the stamp missing.
    expect(shouldEnforcePagesRegenQuota(5, false, false)).toBe(true);
  });
  it("BYPASS CLOSED (#121): emptying every page's sections no longer resets the free generation", () => {
    // Attacker PATCHes sections to [] (contentPageCount drops to 0), but the
    // worker-stamped generated_at survives → still a quota-checked regen.
    expect(shouldEnforcePagesRegenQuota(0, false, true)).toBe(true);
  });
  it("super_admin bypasses the quota even on a regeneration", () => {
    expect(shouldEnforcePagesRegenQuota(5, true, true)).toBe(false);
    expect(shouldEnforcePagesRegenQuota(0, true, true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. usage_counters atomic increment/decrement primitives
// ---------------------------------------------------------------------------

function makeCounterDb(overrides: { incrementReturns?: number } = {}) {
  const queries: string[] = [];
  const params: unknown[][] = [];
  const query = async (sql: string, p?: unknown[]) => {
    queries.push(sql);
    params.push(p ?? []);
    if (sql.includes("INSERT INTO usage_counters")) {
      return { rows: [{ count: overrides.incrementReturns ?? 1 }] };
    }
    return { rows: [] };
  };
  return {
    query,
    setTenantId: async () => {},
    transaction: async () => undefined,
    _queries: queries,
    _params: params,
  };
}

type LandingDb = Parameters<typeof incrementUsageCounter>[0];

describe("incrementUsageCounter / decrementUsageCounter", () => {
  it("increment is an atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING count", async () => {
    const db = makeCounterDb({ incrementReturns: 1 });
    const count = await incrementUsageCounter(
      db as unknown as LandingDb,
      "tenant-1",
      PAGES_REGEN_FEATURE,
      "site-1",
      LIFETIME_PERIOD_START
    );
    expect(count).toBe(1);
    const sql = db._queries[0];
    expect(sql).toContain("INSERT INTO usage_counters");
    expect(sql).toContain(
      "ON CONFLICT (tenant_id, feature, subject_id, period_start)"
    );
    expect(sql).toContain("count = usage_counters.count + 1");
    expect(sql).toContain("RETURNING count");
    expect(db._params[0]).toEqual(["tenant-1", PAGES_REGEN_FEATURE, "site-1", LIFETIME_PERIOD_START]);
  });

  it("decrement issues a plain UPDATE ... count - 1 scoped to the same key", async () => {
    const db = makeCounterDb();
    await decrementUsageCounter(
      db as unknown as LandingDb,
      "tenant-1",
      PAGES_REGEN_FEATURE,
      "site-1",
      LIFETIME_PERIOD_START
    );
    const sql = db._queries[0];
    expect(sql).toContain("UPDATE usage_counters");
    expect(sql).toContain("SET count = count - 1");
    expect(db._params[0]).toEqual(["tenant-1", PAGES_REGEN_FEATURE, "site-1", LIFETIME_PERIOD_START]);
  });

  it("denied attempt does not burn quota: RETURNING count > quota triggers a refund decrement", async () => {
    // Simulate the route's control flow inline: quota is 2, but the atomic
    // increment RETURNS 3 (this would be the 3rd regeneration this period) —
    // the caller must immediately refund with a decrement so the tenant's
    // real usable count stays at 2, not 3.
    const quota = 2;
    const db = makeCounterDb({ incrementReturns: 3 });
    const count = await incrementUsageCounter(
      db as unknown as LandingDb,
      "tenant-1",
      PAGES_REGEN_FEATURE,
      "site-1",
      LIFETIME_PERIOD_START
    );
    expect(count).toBeGreaterThan(quota);
    if (count > quota) {
      await decrementUsageCounter(
        db as unknown as LandingDb,
        "tenant-1",
        PAGES_REGEN_FEATURE,
        "site-1",
        LIFETIME_PERIOD_START
      );
    }
    expect(db._queries).toHaveLength(2);
    expect(db._queries[0]).toContain("INSERT INTO usage_counters");
    expect(db._queries[1]).toContain("UPDATE usage_counters");
    expect(db._queries[1]).toContain("SET count = count - 1");
  });

  it("an ALLOWED attempt (RETURNING count <= quota) never triggers a refund decrement", async () => {
    const quota = 2;
    const db = makeCounterDb({ incrementReturns: 1 }); // 1st regeneration, within quota
    const count = await incrementUsageCounter(
      db as unknown as LandingDb,
      "tenant-1",
      PAGES_REGEN_FEATURE,
      "site-1",
      LIFETIME_PERIOD_START
    );
    expect(count).toBeLessThanOrEqual(quota);
    if (count > quota) {
      await decrementUsageCounter(
        db as unknown as LandingDb,
        "tenant-1",
        PAGES_REGEN_FEATURE,
        "site-1",
        LIFETIME_PERIOD_START
      );
    }
    expect(db._queries).toHaveLength(1); // increment only — no refund issued
  });
});

// ---------------------------------------------------------------------------
// 5. Platform-key switch (apps/worker/src/jobs/landing-generate.ts)
// ---------------------------------------------------------------------------

describe("resolvePlatformAnthropicKey", () => {
  const originalKey = process.env["ANTHROPIC_API_KEY"];

  beforeEach(() => {
    if (originalKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = originalKey;
  });

  it("resolves the platform key from ANTHROPIC_API_KEY when set", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform-test-key";
    const resolved = resolvePlatformAnthropicKey();
    expect(resolved).toEqual({ provider: "anthropic", apiKey: "sk-ant-platform-test-key" });
  });

  it("returns null (mock mode) when unset", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    expect(resolvePlatformAnthropicKey()).toBeNull();
  });

  it("returns null (mock mode) when blank", () => {
    process.env["ANTHROPIC_API_KEY"] = "   ";
    expect(resolvePlatformAnthropicKey()).toBeNull();
  });

  it("grep-style: landing-generate.ts never QUERIES customer BYOK (provider_keys table)", () => {
    const src = readFileSync(
      join(__dirname, "../../apps/worker/src/jobs/landing-generate.ts"),
      "utf8"
    );
    // The table name may still appear in explanatory comments (documenting
    // WHY it's not used) — what must be absent is any actual SQL reference.
    expect(src).not.toContain("FROM provider_keys");
    expect(src).not.toContain("resolveClientProviderKey");
    expect(src).toContain("ANTHROPIC_API_KEY");
    expect(src).toContain("resolvePlatformAnthropicKey");
  });
});

// ---------------------------------------------------------------------------
// resolvePlatformPagesKey — Ozvor Pages is OpenAI-first (cost + quality) with
// an Anthropic fallback; OZVOR_PAGES_PROVIDER forces one provider.
// ---------------------------------------------------------------------------

describe("resolvePlatformPagesKey", () => {
  const origOpenai = process.env["OPENAI_API_KEY"];
  const origAnthropic = process.env["ANTHROPIC_API_KEY"];
  const origForce = process.env["OZVOR_PAGES_PROVIDER"];

  function restore(name: string, val: string | undefined) {
    if (val === undefined) delete process.env[name];
    else process.env[name] = val;
  }

  afterEach(() => {
    restore("OPENAI_API_KEY", origOpenai);
    restore("ANTHROPIC_API_KEY", origAnthropic);
    restore("OZVOR_PAGES_PROVIDER", origForce);
  });

  it("prefers OpenAI when both platform keys are set", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-platform";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform";
    delete process.env["OZVOR_PAGES_PROVIDER"];
    expect(resolvePlatformPagesKey()).toEqual({ provider: "openai", apiKey: "sk-openai-platform" });
  });

  it("falls back to Anthropic when OpenAI has no platform key", () => {
    delete process.env["OPENAI_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform";
    delete process.env["OZVOR_PAGES_PROVIDER"];
    expect(resolvePlatformPagesKey()).toEqual({ provider: "anthropic", apiKey: "sk-ant-platform" });
  });

  it("returns null (mock mode) when neither key is set", () => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OZVOR_PAGES_PROVIDER"];
    expect(resolvePlatformPagesKey()).toBeNull();
  });

  it("OZVOR_PAGES_PROVIDER=anthropic forces Anthropic even when OpenAI is set", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-platform";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform";
    process.env["OZVOR_PAGES_PROVIDER"] = "anthropic";
    expect(resolvePlatformPagesKey()).toEqual({ provider: "anthropic", apiKey: "sk-ant-platform" });
  });

  it("ignores a blank OpenAI key and falls back to Anthropic", () => {
    process.env["OPENAI_API_KEY"] = "   ";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform";
    delete process.env["OZVOR_PAGES_PROVIDER"];
    expect(resolvePlatformPagesKey()).toEqual({ provider: "anthropic", apiKey: "sk-ant-platform" });
  });
});

// ---------------------------------------------------------------------------
// Route-level guard tests — shared DEV_AUTH_BYPASS env + mock DB scaffolding
// ---------------------------------------------------------------------------

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SITE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

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
  delete process.env["REDIS_URL"]; // shared-redis fail-open path (rate limiter)
});

interface MockRow {
  [key: string]: unknown;
}
type RouteQueryHandler = (sql: string, params?: unknown[]) => MockRow[] | null;

function makeRouteDb(handler: RouteQueryHandler) {
  const queries: string[] = [];
  const params: unknown[][] = [];
  const query = async (sql: string, p?: unknown[]) => {
    queries.push(sql);
    params.push(p ?? []);
    const result = handler(sql, p);
    return { rows: result ?? [] };
  };
  return {
    query,
    setTenantId: async () => {},
    transaction: async () => undefined,
    _queries: queries,
    _params: params,
  };
}

// ---------------------------------------------------------------------------
// 6. Manual-audit guard — POST /api/brands/:id/audit (audits.ts)
// ---------------------------------------------------------------------------

describe("POST /api/brands/:id/audit — cost-control guard (#217)", () => {
  function auditApp(db: ReturnType<typeof makeRouteDb>): Hono {
    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAuditRoutes(app, db as any);
    return app;
  }

  /** Default handler set: brand exists, no in-flight audit, given plan_tier,
   * and configurable brand-window / backstop query results. */
  function defaultHandler(opts: {
    planTier: PlanTier;
    brandWindowRows?: MockRow[];
    backstopCount?: number;
  }): RouteQueryHandler {
    return (sql) => {
      if (sql.includes("FROM billing_subscriptions")) return [];
      if (sql.includes("FROM brands")) return [{ id: BRAND_ID, region: "US" }];
      if (sql.includes("status IN")) return []; // no audit in flight
      // Brand-window query has ORDER BY; backstop is a plain COUNT(*).
      if (sql.includes("FROM geo_audit") && sql.includes("ORDER BY created_at DESC")) {
        return opts.brandWindowRows ?? [];
      }
      if (sql.includes("FROM geo_audit") && sql.includes("COUNT(*)")) {
        return [{ count: String(opts.backstopCount ?? 0) }];
      }
      if (sql.includes("FROM tenants")) return [{ plan_tier: opts.planTier }];
      return [];
    };
  }

  it("free tenant: a manual audit for this brand in the last 7 days blocks with AUDIT_WEEKLY_LIMIT", async () => {
    const recentCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const db = makeRouteDb(
      defaultHandler({ planTier: "free", brandWindowRows: [{ created_at: recentCreatedAt }] })
    );
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("AUDIT_WEEKLY_LIMIT");
    expect(body.next_allowed_at).toBeTruthy();
    expect(new Date(body.next_allowed_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("agency tenant: 1-day window — a manual audit 2h ago blocks", async () => {
    const recentCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const db = makeRouteDb(
      defaultHandler({ planTier: "agency", brandWindowRows: [{ created_at: recentCreatedAt }] })
    );
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("AUDIT_WEEKLY_LIMIT");
  });

  // NOTE: both tests below deliberately trip the BACKSTOP guard (backstopCount
  // set to the plan's own cap) so the request still returns a 429 — never
  // reaching the BullMQ enqueue step — while the per-brand WINDOW query (which
  // runs first, and always) is still captured with its real parameters.
  it("passes the per-brand window with windowDays=7 (free) as a query parameter", async () => {
    const db = makeRouteDb(defaultHandler({ planTier: "free", backstopCount: 3 }));
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const windowCallIdx = db._queries.findIndex(
      (q) => q.includes("FROM geo_audit") && q.includes("ORDER BY created_at DESC")
    );
    expect(windowCallIdx).toBeGreaterThanOrEqual(0);
    expect(db._params[windowCallIdx]).toEqual([BRAND_ID, TENANT_ID, 7]);
  });

  it("passes the per-brand window with windowDays=1 (agency)", async () => {
    const db = makeRouteDb(defaultHandler({ planTier: "agency", backstopCount: 30 }));
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const windowCallIdx = db._queries.findIndex(
      (q) => q.includes("FROM geo_audit") && q.includes("ORDER BY created_at DESC")
    );
    expect(db._params[windowCallIdx]).toEqual([BRAND_ID, TENANT_ID, 1]);
  });

  it("tenant-wide 24h backstop: agency at 30/30 blocks with AUDIT_DAILY_LIMIT", async () => {
    const db = makeRouteDb(defaultHandler({ planTier: "agency", backstopCount: 30 }));
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("AUDIT_DAILY_LIMIT");
  });

  it("free tenant backstop trips at 3, not the old flat 20", async () => {
    const db = makeRouteDb(defaultHandler({ planTier: "free", backstopCount: 3 }));
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("AUDIT_DAILY_LIMIT");
  });

  it("REGRESSION: both guard queries exclude cron-triggered audits (triggered_by <> 'cron')", async () => {
    // Window check passes (no rows) so the route proceeds to the backstop
    // check; backstop is set to trip (growth's cap is 5) so the request
    // still returns a 429 — never reaching the BullMQ enqueue step — while
    // BOTH guard queries have executed by then.
    const db = makeRouteDb(defaultHandler({ planTier: "growth", backstopCount: 5 }));
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(429);
    const guardQueries = db._queries.filter((q) => q.includes("FROM geo_audit") && q.includes("triggered_by"));
    // Both the per-brand window query and the tenant backstop query must be present.
    expect(guardQueries.length).toBe(2);
    for (const q of guardQueries) {
      expect(q).toContain("triggered_by <> 'cron'");
    }
  });

  it("in-flight audit still returns 409 BEFORE any cost-control guard query runs", async () => {
    const db = makeRouteDb((sql) => {
      if (sql.includes("FROM billing_subscriptions")) return [];
      if (sql.includes("FROM brands")) return [{ id: BRAND_ID, region: "US" }];
      if (sql.includes("status IN")) return [{ id: "existing-audit-id" }];
      return [];
    });
    const app = auditApp(db);
    const res = await app.request(`/api/brands/${BRAND_ID}/audit`, {
      method: "POST",
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("AUDIT_ALREADY_RUNNING");
    // planLimitsFor's tenant lookup must never have run — the in-flight check
    // short-circuits before the cost-control guard.
    expect(db._queries.some((q) => q.includes("FROM tenants"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Pages regeneration quota guard — POST /api/landing/sites/:id/generate
// ---------------------------------------------------------------------------

describe("POST /api/landing/sites/:id/generate — pages regen quota guard (#217)", () => {
  beforeEach(() => {
    queueMock.getJob.mockReset();
    queueMock.getJob.mockResolvedValue(null);
    queueMock.add.mockReset();
    queueMock.add.mockResolvedValue({});
  });

  function landingApp(db: ReturnType<typeof makeRouteDb>): Hono {
    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerLandingRoutes(app, db as any);
    return app;
  }

  function defaultHandler(opts: {
    planTier: PlanTier;
    contentPageCount: number;
    incrementReturns: number;
    /** landing_sites.generated_at IS NOT NULL (#121). Defaults to "has content
     * ⇒ has generated" so pre-#121 scenarios keep their meaning. */
    hasGeneratedBefore?: boolean;
  }): RouteQueryHandler {
    return (sql) => {
      // The quota probe (#121) combines the content-page count AND the
      // generated_at stamp in ONE statement that mentions both landing_pages
      // and landing_sites — match it BEFORE the generic site-load branch.
      if (sql.includes("sections <> '[]'::jsonb")) {
        return [
          {
            count: String(opts.contentPageCount),
            generated: opts.hasGeneratedBefore ?? opts.contentPageCount > 0,
          },
        ];
      }
      if (sql.includes("FROM landing_sites")) {
        return [{ id: SITE_ID, status: "draft", page_count: "5" }];
      }
      if (sql.includes("FROM tenants")) return [{ plan_tier: opts.planTier }];
      if (sql.includes("INSERT INTO usage_counters")) {
        return [{ count: opts.incrementReturns }];
      }
      return [];
    };
  }

  it("free tenant: 3rd regeneration attempt (quota 2) is denied AND the increment is refunded", async () => {
    const db = makeRouteDb(
      defaultHandler({ planTier: "free", contentPageCount: 5, incrementReturns: 3 })
    );
    const app = landingApp(db);
    const res = await app.request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("PAGES_REGEN_LIMIT");

    // Denied-attempt-does-not-burn-quota: the increment call must be
    // immediately followed by a decrement (refund).
    const incrementIdx = db._queries.findIndex((q) => q.includes("INSERT INTO usage_counters"));
    const decrementIdx = db._queries.findIndex((q) => q.includes("UPDATE usage_counters"));
    expect(incrementIdx).toBeGreaterThanOrEqual(0);
    expect(decrementIdx).toBe(incrementIdx + 1);
    expect(db._params[incrementIdx]).toEqual([
      TENANT_ID,
      PAGES_REGEN_FEATURE,
      SITE_ID,
      LIFETIME_PERIOD_START,
    ]);
  });

  it("growth tenant: 6th regeneration this month (quota 5) is denied with the monthly period bucket", async () => {
    const db = makeRouteDb(
      defaultHandler({ planTier: "growth", contentPageCount: 5, incrementReturns: 6 })
    );
    const app = landingApp(db);
    const res = await app.request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("PAGES_REGEN_LIMIT");

    const incrementIdx = db._queries.findIndex((q) => q.includes("INSERT INTO usage_counters"));
    const periodStartUsed = db._params[incrementIdx]?.[3] as string;
    // Monthly bucket, not the lifetime sentinel.
    expect(periodStartUsed).not.toBe(LIFETIME_PERIOD_START);
    expect(periodStartUsed).toMatch(/^\d{4}-\d{2}-01$/);
  });

  // -------------------------------------------------------------------------
  // Hermes review requirements (#221): duplicates never charge quota;
  // enqueue failure after a charge refunds; the happy path enqueues once.
  // -------------------------------------------------------------------------

  it("duplicate in-flight job: 409 GENERATE_ALREADY_RUNNING WITHOUT touching usage_counters", async () => {
    queueMock.getJob.mockResolvedValue({ getState: async () => "active" });
    const db = makeRouteDb(
      defaultHandler({ planTier: "growth", contentPageCount: 5, incrementReturns: 1 })
    );
    const app = landingApp(db);
    const res = await app.request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("GENERATE_ALREADY_RUNNING");
    // The quota ledger was never touched — no increment, no refund.
    expect(db._queries.some((q) => q.includes("usage_counters"))).toBe(false);
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it.each(["waiting", "delayed"] as const)(
    "duplicate %s job also 409s without charging quota",
    async (state) => {
      queueMock.getJob.mockResolvedValue({ getState: async () => state });
      const db = makeRouteDb(
        defaultHandler({ planTier: "growth", contentPageCount: 5, incrementReturns: 1 })
      );
      const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}/generate`, {
        method: "POST",
        headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(409);
      expect(db._queries.some((q) => q.includes("usage_counters"))).toBe(false);
    }
  );

  it("queue.add failure AFTER the quota charge refunds the increment (503, decrement issued)", async () => {
    queueMock.add.mockRejectedValue(new Error("redis exploded"));
    const db = makeRouteDb(
      defaultHandler({ planTier: "growth", contentPageCount: 5, incrementReturns: 1 })
    );
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
    const incrementIdx = db._queries.findIndex((q) => q.includes("INSERT INTO usage_counters"));
    const decrementIdx = db._queries.findIndex((q) => q.includes("UPDATE usage_counters"));
    expect(incrementIdx).toBeGreaterThanOrEqual(0); // charge happened (within quota)
    expect(decrementIdx).toBeGreaterThan(incrementIdx); // ...and was refunded
  });

  it("happy path: within-quota regeneration charges once, enqueues once, no refund (202)", async () => {
    const db = makeRouteDb(
      defaultHandler({ planTier: "growth", contentPageCount: 5, incrementReturns: 1 })
    );
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(202);
    expect((await res.json()).queued).toBe(true);
    expect(queueMock.add).toHaveBeenCalledTimes(1);
    expect(db._queries.some((q) => q.includes("INSERT INTO usage_counters"))).toBe(true);
    expect(db._queries.some((q) => q.includes("UPDATE usage_counters"))).toBe(false); // no refund
  });

  it("initial generation (no content yet): enqueues WITHOUT ever touching the quota ledger", async () => {
    const db = makeRouteDb(
      defaultHandler({ planTier: "free", contentPageCount: 0, incrementReturns: 1 })
    );
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(202);
    expect(db._queries.some((q) => q.includes("usage_counters"))).toBe(false);
  });

  it("BYPASS CLOSED (#121): sections emptied to [] but generated_at stamped → still quota-checked (429 at limit)", async () => {
    // The attack: PATCH every page's sections to [] so contentPageCount reads
    // 0 again. The worker-stamped generated_at survives any PATCH, so the run
    // is a REGENERATION — and at quota it is denied + refunded, not free.
    const db = makeRouteDb(
      defaultHandler({
        planTier: "free",
        contentPageCount: 0,
        hasGeneratedBefore: true,
        incrementReturns: 3, // free lifetime quota is 2 → 3rd attempt denied
      })
    );
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("PAGES_REGEN_LIMIT");
  });
});
