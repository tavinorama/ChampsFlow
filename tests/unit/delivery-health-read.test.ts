/**
 * delivery-health-read.test.ts — audit P0-09 at the database and HTTP boundary.
 *
 * The pure rules are tested in delivery-health.test.ts / delivery-canary.test.ts.
 * What is pinned here is the thing that actually went wrong in production: the
 * panel reported health it had not measured.
 *
 *   - a probe whose table is missing yields not_connected, NOT 0 and NOT green;
 *   - a probe that throws yields not_measured and is never a number;
 *   - before the lifecycle migration, verification is unmeasurable, not 0%;
 *   - an unconfigured canary cannot leave System Health green;
 *   - GET /api/admin/system-health carries the delivery summary, so a broken
 *     loop changes the colour of the panel the founder actually looks at.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

// The admin routes are super-admin only and the dev bypass is deliberately NOT
// a super admin, so the guards are stubbed to exercise the handlers.
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireSuperAdmin: async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { readDeliveryHealth } from "../../apps/api/src/lib/delivery-health-read";
import { resetLifecycleCapabilityCache } from "../../apps/api/src/lib/plan-task-lifecycle";
import { registerAdminRoutes } from "../../apps/api/src/routes/admin";

const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: "test" };
  delete process.env["OZVOR_OWN_BRAND_ID"];
  resetLifecycleCapabilityCache();
});

interface DbOpts {
  /** false → the lifecycle migration is not applied. */
  lifecycle?: boolean;
  planTasks?: { status: string; action: string | null; evidence: string | null; metric: string | null; owner: string | null }[];
  /** SQL fragments that should throw with this Postgres error code. */
  throwOn?: { fragment: string; code?: string; message?: string }[];
  drifts?: number;
}

function makeDb(opts: DbOpts = {}) {
  const lifecycle = opts.lifecycle !== false;
  const planTasks =
    opts.planTasks ??
    [
      { status: "proposed", action: "Publish a page answering X", evidence: "not cited for X", metric: "cited for X", owner: "organicposts" },
      { status: "proposed", action: "Publish a page answering Y", evidence: "not cited for Y", metric: "cited for Y", owner: "organicposts" },
    ];

  const handle = (sql: string): unknown[] => {
    for (const t of opts.throwOn ?? []) {
      if (sql.includes(t.fragment)) {
        const err = new Error(t.message ?? "boom") as Error & { code?: string };
        if (t.code) err.code = t.code;
        throw err;
      }
    }
    if (sql.includes("information_schema")) {
      return [{ history: lifecycle, proof_columns: lifecycle, ok: lifecycle }];
    }
    if (sql.includes("FROM plan_task") && sql.includes("INTERVAL '30 days'")) return planTasks;
    if (sql.includes("FROM last_move")) return [{ hours: null, n: 0 }];
    if (sql.includes("FROM audit_prompt")) return [{ total: 40, classified: 40 }];
    if (sql.includes("FROM engine_drift_check")) {
      return [{ rate: 0, n: opts.drifts ?? 5 }];
    }
    if (sql.includes("FROM drafts")) return [{ total: 10, failed: 0, timed: 10, p95: 60 }];
    if (sql.includes("FROM geo_audit") && sql.includes("queue_minutes")) {
      return [{ complete: 50, failed: 0, queue_minutes: null, waiting: 0 }];
    }
    if (sql.includes("error_message")) return [];
    if (sql.includes("FROM geo_score")) return [];
    return [];
  };

  return {
    query: async (sql: string) => ({ rows: handle(sql) }),
    setTenantId: async () => {},
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: async (sql: string) => ({ rows: handle(sql) }) }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (db: unknown) => readDeliveryHealth(db as any);

const find = (list: { id: string }[], id: string) => list.find((i) => i.id === id);

describe("readDeliveryHealth — a read that fails is never a zero", () => {
  it("a missing table makes its indicator not_connected, not 0%", async () => {
    const dh = await read(makeDb({ throwOn: [{ fragment: "FROM drafts", code: "42P01", message: 'relation "drafts" does not exist' }] }));
    const ind = find(dh.rollup.indicators, "draft_generation_success")!;
    expect(ind.status).toBe("not_connected");
    expect(ind.value).toBeNull();
    expect(dh.rollup.status).not.toBe("healthy");
  });

  it("an unexpected error makes its indicator not_measured, not 0%", async () => {
    const dh = await read(makeDb({ throwOn: [{ fragment: "FROM audit_prompt", message: "connection lost" }] }));
    const ind = find(dh.rollup.indicators, "prompt_relevance_pass")!;
    expect(ind.status).toBe("not_measured");
    expect(ind.value).toBeNull();
    expect(ind.reason).toContain("never as zero");
  });

  it("every indicator appears even when a probe drops one", async () => {
    const dh = await read(makeDb({ throwOn: [{ fragment: "FROM geo_audit", message: "nope" }] }));
    expect(dh.rollup.indicators).toHaveLength(12);
    expect(find(dh.rollup.indicators, "queue_age")!.value).toBeNull();
  });
});

describe("readDeliveryHealth — the loop's own numbers", () => {
  it("an open gap with no action lowers recommendation coverage", async () => {
    const db = makeDb({
      planTasks: [
        ...Array.from({ length: 8 }, () => ({ status: "proposed", action: "do the thing", evidence: "e", metric: "m", owner: "organicposts" })),
        { status: "proposed", action: null, evidence: "e", metric: "m", owner: "organicposts" },
        { status: "proposed", action: "   ", evidence: "e", metric: "m", owner: "organicposts" },
      ],
    });
    const dh = await read(db);
    const ind = find(dh.rollup.indicators, "recommendation_coverage")!;
    expect(ind.value).toBe(0.8);
    // 0.8 is the failing threshold itself → degraded; 0.79 would be failing.
    expect(ind.status).toBe("degraded");
    expect(dh.rollup.reasons.join(" ")).toContain("Recommendation coverage");
  });

  it("a card with no evidence or metric is not a useful action", async () => {
    const db = makeDb({
      planTasks: Array.from({ length: 10 }, (_, i) => ({
        status: "proposed",
        action: "do the thing",
        evidence: i < 5 ? "e" : null,
        metric: i < 5 ? "m" : null,
        owner: "organicposts",
      })),
    });
    const dh = await read(db);
    expect(find(dh.rollup.indicators, "useful_action_rate")!.value).toBe(0.5);
  });

  it("before the lifecycle migration, verification is unmeasurable — not 0%", async () => {
    const dh = await read(makeDb({ lifecycle: false }));
    const ind = find(dh.rollup.indicators, "action_verification_rate")!;
    expect(ind.status).toBe("not_connected");
    expect(ind.value).toBeNull();
    expect(ind.reason).toContain("20260903000001");
  });

  it("with no drift battery in the window, hallucination is unmeasured, not clean", async () => {
    const dh = await read(makeDb({ drifts: 0 }));
    const ind = find(dh.rollup.indicators, "entity_false_positive_rate")!;
    expect(ind.status).toBe("not_measured");
    expect(ind.value).toBeNull();
  });
});

describe("the canary decides the colour", () => {
  it("an unconfigured canary brand can never leave delivery green", async () => {
    const dh = await read(makeDb());
    expect(dh.canary.status).toBe("not_connected");
    expect(dh.canary.reasons.join(" ")).toContain("OZVOR_OWN_BRAND_ID");
    expect(dh.rollup.status).not.toBe("healthy");
  });

  it("a configured canary with no audit and no gaps still does not pass silently", async () => {
    process.env["OZVOR_OWN_BRAND_ID"] = BRAND_ID;
    const dh = await read(makeDb());
    expect(dh.canary.status).not.toBe("healthy");
    // The version is stamped so a verdict is never compared across golden sets.
    expect(dh.canary.version).toBe(dh.canaryVersion);
  });
});

describe("HTTP surface", () => {
  const app = (db: unknown) => {
    const a = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAdminRoutes(a, db as any);
    return a;
  };

  it("GET /api/admin/delivery-health returns every indicator WITH its contract", async () => {
    const res = await app(makeDb()).request("/api/admin/delivery-health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      indicators: { id: string; status: string; value: number | null; contract: Record<string, unknown> }[];
      canary: { version: string; checks: unknown[] };
    };
    expect(body.indicators).toHaveLength(12);
    for (const i of body.indicators) {
      expect(i.contract.owner).toBeTruthy();
      expect(i.contract.sourceOfTruth).toBeTruthy();
      expect(i.contract.grain).toBeTruthy();
      expect(i.contract.timezone).toBe("UTC");
      expect(i.contract.lateData).toBeTruthy();
      expect(i.contract.qualityTest).toBeTruthy();
      // The law, at the boundary: no unknown indicator ever ships a number.
      if (["not_measured", "not_connected", "insufficient_evidence"].includes(i.status)) {
        expect(i.value).toBeNull();
      }
    }
    expect(body.canary.checks).toHaveLength(8);
    expect(body.canary.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("GET /api/admin/system-health carries delivery BESIDE infra, and flags it", async () => {
    const res = await app(makeDb()).request("/api/admin/system-health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      infrastructure: { postgres: string };
      delivery: { status: string; color: string; reasons: string[]; canary: { status: string } } | null;
      attentionFlags: string[];
    };
    // infra is still there — Delivery Health is added, not substituted
    expect(body.infrastructure.postgres).toBeDefined();
    expect(body.delivery).not.toBeNull();
    expect(["amber", "red"]).toContain(body.delivery!.color);
    expect(body.attentionFlags.join(" ")).toContain("Delivery Health is");
    expect(body.attentionFlags.join(" ")).toContain("canary");
  });
});
