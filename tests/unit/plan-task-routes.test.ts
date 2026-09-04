/**
 * plan-task-routes.test.ts — audit P0-02 at the HTTP boundary.
 *
 * The pure state machine is tested in plan-task-state.test.ts. These tests
 * cover the thing that actually broke in production: the route. Before this
 * change, `PATCH /api/plan-tasks/:id` wrote whatever status the request body
 * asked for, straight to SQL, with no verification of any kind
 * (apps/api/src/routes/audits.ts:1946), and the Execution % counted the result.
 *
 * What is pinned here:
 *   - a client sending status:"verified" is REFUSED (403). This is the test the
 *     founder asked for by name.
 *   - a checkbox produces `manual_done_pending_verification`, never `verified`.
 *   - the actor comes from the session; an actor in the body is ignored.
 *   - POST /api/brands/:id/tasks no longer writes vector='custom', which
 *     violated plan_task_vector_check and made the button fail 100% of the time.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerAuditRoutes } from "../../apps/api/src/routes/audits";
import { resetLifecycleCapabilityCache } from "../../apps/api/src/lib/plan-task-lifecycle";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const TASK_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const PLAN_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
  };
  resetLifecycleCapabilityCache();
});

interface Recorded {
  sql: string;
  params: unknown[];
}

/**
 * A database that behaves like a MIGRATED one, so the full state machine is
 * exercised. `lifecycle: false` simulates the pre-migration schema.
 */
function makeDb(
  opts: {
    currentStatus?: string;
    lifecycle?: boolean;
    /** P0-01 — rows for GET /api/brands/:id/plan and its delivery verdict. */
    planTasks?: { id: string; gap: string; status: string }[];
    latestAudit?: { id: string; score_ai: number | null } | null;
    lostPrompts?: number;
  } = {}
) {
  const lifecycle = opts.lifecycle !== false;
  const recorded: Recorded[] = [];
  const status = opts.currentStatus ?? "proposed";

  const handle = (sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (sql.includes("information_schema")) {
      return [{ history: lifecycle, proof_columns: lifecycle, ok: lifecycle }];
    }
    // P0-01 — GET /api/brands/:id/plan
    if (sql.includes("calendar, created_at FROM strategy_plan")) {
      return [{ id: PLAN_ID, calendar: [], created_at: "2026-09-04T10:00:00.000Z" }];
    }
    if (sql.includes("FROM plan_task WHERE plan_id")) {
      return (opts.planTasks ?? []).map((t) => ({
        id: t.id,
        vector: "ai",
        gap: t.gap,
        action: "do the thing",
        effort: "medium",
        impact: "high",
        priority: 60,
        status: t.status,
        evidence: null,
        metric: null,
        owner: "you",
        due_date: null,
        landing_site_id: null,
      }));
    }
    if (sql.includes("FROM geo_audit")) {
      return opts.latestAudit === undefined
        ? [{ id: "audit-1", score_ai: 90 }]
        : opts.latestAudit
          ? [opts.latestAudit]
          : [];
    }
    if (sql.includes("FROM citation_check")) return [{ n: opts.lostPrompts ?? 0 }];
    if (sql.includes("SELECT status FROM plan_task WHERE id")) return [{ status }];
    if (sql.includes("SELECT id, status, due_date FROM plan_task")) {
      return [{ id: TASK_ID, status, due_date: null }];
    }
    if (sql.includes("FROM brands WHERE id")) return [{ id: BRAND_ID }];
    if (sql.includes("FROM strategy_plan WHERE brand_id")) return [{ id: PLAN_ID }];
    if (sql.includes("INSERT INTO plan_task")) return [{ id: TASK_ID }];
    if (sql.includes("FROM plan_task WHERE id")) return [{ id: TASK_ID }];
    return [];
  };

  return {
    query: async (sql: string, p?: unknown[]) => ({ rows: handle(sql, p ?? []) }),
    setTenantId: async () => {},
    transaction: async (fn: (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      fn({ query: async (sql: string, p?: unknown[]) => ({ rows: handle(sql, p ?? []) }) }),
    _recorded: recorded,
  };
}

function auditApp(db: ReturnType<typeof makeDb>): Hono {
  const app = new Hono();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAuditRoutes(app, db as any, { limiter: { hit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }) } as any });
  return app;
}

const patch = (db: ReturnType<typeof makeDb>, body: unknown) =>
  auditApp(db).request(`/api/plan-tasks/${TASK_ID}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/plan-tasks/:id — a client cannot manufacture proof", () => {
  it("REFUSES status:'verified' from a client session", async () => {
    // The headline guarantee. Revert the actor check in audits.ts and this fails.
    const db = makeDb({ currentStatus: "cited" });
    const res = await patch(db, { status: "verified", evidence: "trust me" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/cannot be set by hand|not yours/i);

    // and nothing was written
    const writes = db._recorded.filter((r) => /^\s*UPDATE plan_task/i.test(r.sql));
    expect(writes).toHaveLength(0);
  });

  it("REFUSES verified from every state a client's task could be in", async () => {
    for (const from of ["proposed", "accepted", "manual_done_pending_verification", "legacy_self_reported"]) {
      const db = makeDb({ currentStatus: from });
      const res = await patch(db, { status: "verified", evidence: "e" });
      expect([403, 409]).toContain(res.status);
      expect(db._recorded.filter((r) => /^\s*UPDATE plan_task/i.test(r.sql))).toHaveLength(0);
    }
  });

  it("ignores an actor supplied in the request body — the session decides", async () => {
    const db = makeDb({ currentStatus: "cited" });
    const res = await patch(db, { status: "verified", evidence: "e", actor: "system" });
    expect(res.status).toBe(403);
  });

  it("a checkbox tick lands on manual_done_pending_verification", async () => {
    const db = makeDb({ currentStatus: "accepted" });
    const res = await patch(db, { status: "manual_done_pending_verification" });
    expect(res.status).toBe(200);
    const write = db._recorded.find((r) => /^\s*UPDATE plan_task/i.test(r.sql));
    expect(write).toBeDefined();
    expect(write!.params).toContain("manual_done_pending_verification");
    expect(write!.params).not.toContain("verified");
  });

  it("an old client still sending 'done' is mapped, not trusted", async () => {
    const db = makeDb({ currentStatus: "accepted" });
    const res = await patch(db, { status: "done" });
    expect(res.status).toBe(200);
    const write = db._recorded.find((r) => /^\s*UPDATE plan_task/i.test(r.sql));
    expect(write!.params).toContain("manual_done_pending_verification");
  });

  it("records the transition with its actor — history, not just state", async () => {
    const db = makeDb({ currentStatus: "accepted" });
    await patch(db, { status: "manual_done_pending_verification" });
    const hist = db._recorded.find((r) => r.sql.includes("INSERT INTO plan_task_transition"));
    expect(hist).toBeDefined();
    expect(hist!.params).toContain("client");
    expect(hist!.params).toContain("accepted"); // from_state preserved
  });

  it("rejects an unknown status rather than writing it through", async () => {
    const db = makeDb();
    const res = await patch(db, { status: "totally_finished" });
    expect(res.status).toBe(400);
  });

  it("refuses an illegal jump with 409 and changes nothing", async () => {
    const db = makeDb({ currentStatus: "proposed" });
    const res = await patch(db, { status: "cited", evidence: "e" });
    expect(res.status).toBe(409);
    expect(db._recorded.filter((r) => /^\s*UPDATE plan_task/i.test(r.sql))).toHaveLength(0);
  });

  it("requires a reason to reject — no silent dead ends", async () => {
    const db = makeDb({ currentStatus: "proposed" });
    expect((await patch(db, { status: "rejected" })).status).toBe(409);
    expect((await patch(makeDb({ currentStatus: "proposed" }), { status: "rejected", reason: "not for us" })).status).toBe(200);
  });
});

describe("PATCH before the migration lands — degraded, never dishonest", () => {
  it("refuses a new-vocabulary transition with a message naming the migration", async () => {
    const db = makeDb({ currentStatus: "proposed", lifecycle: false });
    const res = await patch(db, { status: "manual_done_pending_verification" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { message: string; code: string };
    expect(body.code).toBe("migration_pending");
    expect(body.message).toContain("20260903000001_plan_task_lifecycle");
    expect(body.message).toMatch(/Nothing was changed/i);
  });

  it("still allows the legacy vocabulary, so the product is not bricked", async () => {
    const db = makeDb({ currentStatus: "proposed", lifecycle: false });
    expect((await patch(db, { status: "accepted" })).status).toBe(200);
  });
});

describe("POST /api/brands/:id/tasks — the button that never worked", () => {
  it("writes a vector the CHECK constraint accepts, not 'custom'", async () => {
    // discovery §1 D1.3: vector='custom' violates
    // plan_task_vector_check (brand|performance|ai), so every "Add your own
    // to-do" failed. Revert CLIENT_TODO_VECTOR to 'custom' and this fails.
    const db = makeDb();
    const res = await auditApp(db).request(`/api/brands/${BRAND_ID}/tasks`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Fix the pricing page" }),
    });
    expect(res.status).toBe(201);

    const insert = db._recorded.find((r) => r.sql.includes("INSERT INTO plan_task"));
    expect(insert).toBeDefined();
    expect(insert!.sql).not.toContain("'custom'");
    const vector = insert!.params[3];
    expect(["brand", "performance", "ai"]).toContain(vector);
  });

  it("the new to-do starts as open work, not as anything completed", async () => {
    const db = makeDb();
    await auditApp(db).request(`/api/brands/${BRAND_ID}/tasks`, {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Fix the pricing page" }),
    });
    const insert = db._recorded.find((r) => r.sql.includes("INSERT INTO plan_task"));
    expect(insert!.sql).toContain("'accepted'");
    expect(insert!.sql).not.toContain("'verified'");
  });
});

// ---------------------------------------------------------------------------
// P0-01 — GET /api/brands/:id/plan carries the delivery verdict, so the client
// can never be told "All caught up" while a gap is open (RELATORIO §3.1).
// ---------------------------------------------------------------------------

const getPlan = (db: ReturnType<typeof makeDb>) =>
  auditApp(db).request(`/api/brands/${BRAND_ID}/plan`, {
    headers: { Authorization: "Bearer dev" },
  });

interface PlanBody {
  tasks: { id: string }[];
  delivery: {
    code: string;
    mayShowAllCaughtUp: boolean;
    clientMessage: string;
    materialGap: boolean;
    materialGapUnknown: boolean;
    reasons: string[];
  } | null;
}

describe("GET /api/brands/:id/plan — the delivery verdict travels with the plan", () => {
  it("refuses 'All caught up' when the score is below target and nothing is open", async () => {
    const res = await getPlan(makeDb({ latestAudit: { id: "audit-1", score_ai: 21 }, lostPrompts: 7, planTasks: [] }));
    const body = (await res.json()) as PlanBody;
    expect(body.delivery).not.toBeNull();
    expect(body.delivery!.code).toBe("DELIVERY_LOOP_BROKEN");
    expect(body.delivery!.mayShowAllCaughtUp).toBe(false);
    expect(body.delivery!.clientMessage).toContain("generating and reviewing the actions");
    expect(body.delivery!.clientMessage).not.toContain("All caught up");
  });

  it("allows it only when there is no gap, nothing unknown and nothing open", async () => {
    const res = await getPlan(makeDb({ latestAudit: { id: "audit-1", score_ai: 88 }, lostPrompts: 0, planTasks: [] }));
    const body = (await res.json()) as PlanBody;
    expect(body.delivery!.code).toBe("OK");
    expect(body.delivery!.mayShowAllCaughtUp).toBe(true);
  });

  it("an unmeasured score is never read as caught up", async () => {
    const res = await getPlan(makeDb({ latestAudit: { id: "audit-1", score_ai: null }, planTasks: [] }));
    const body = (await res.json()) as PlanBody;
    expect(body.delivery!.materialGapUnknown).toBe(true);
    expect(body.delivery!.mayShowAllCaughtUp).toBe(false);
  });

  it("an open investigation card satisfies the invariant without celebrating", async () => {
    const res = await getPlan(
      makeDb({
        latestAudit: { id: "audit-1", score_ai: 21 },
        lostPrompts: 7,
        planTasks: [
          {
            id: TASK_ID,
            gap: "Investigation: DELIVERY_LOOP_BROKEN — a gap is open and no action was generated",
            status: "proposed",
          },
        ],
      })
    );
    const body = (await res.json()) as PlanBody;
    expect(body.delivery!.code).toBe("OK"); // there IS a way out on screen
    expect(body.delivery!.mayShowAllCaughtUp).toBe(false);
  });

  it("a brand with no completed audit cannot be caught up either", async () => {
    const res = await getPlan(makeDb({ latestAudit: null, planTasks: [] }));
    const body = (await res.json()) as PlanBody;
    expect(body.delivery!.mayShowAllCaughtUp).toBe(false);
    expect(body.delivery!.reasons.join(" ")).toContain("never run");
  });
});
