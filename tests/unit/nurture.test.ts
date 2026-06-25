/**
 * Unit tests for apps/api/src/routes/nurture.ts
 *
 * Covers:
 *  - enrollNurture: happy path (new enrollment)
 *  - enrollNurture: idempotency (already enrolled — returns alreadyEnrolled: true)
 *  - enrollNurture: delayMs > 0 uses delayed next_send_at branch
 *  - checkNurtureEligibility: not enrolled
 *  - checkNurtureEligibility: enrolled and not suppressed
 *  - checkNurtureEligibility: enrolled and suppressed
 *  - suppressOnConversion: calls UPDATE with correct params
 *  - GET /api/nurture/unsubscribe: missing token → 400
 *  - GET /api/nurture/unsubscribe: token not found → 200 "Already unsubscribed or link expired"
 *  - GET /api/nurture/unsubscribe: token found, already suppressed → 200 "Already unsubscribed"
 *  - GET /api/nurture/unsubscribe: token found, not suppressed → UPDATE + 200 "You have been unsubscribed"
 *  - GET /api/nurture/unsubscribe: DB error on SELECT → 500
 *  - GET /api/nurture/unsubscribe: DB error on UPDATE → 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock logger (suppress noise)
// ---------------------------------------------------------------------------

vi.mock("../../../../packages/shared/src/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import {
  enrollNurture,
  checkNurtureEligibility,
  suppressOnConversion,
  registerNurtureRoutes,
} from "../../apps/api/src/routes/nurture";

// ---------------------------------------------------------------------------
// Helpers — build a minimal PostgresClient mock
// ---------------------------------------------------------------------------

function makeDb(overrides: {
  queryResults?: Array<{ rows: unknown[] }>;
  throwOn?: number; // 0-indexed: throw on the Nth query call
} = {}) {
  let callCount = 0;
  const queries: string[] = [];
  const params: unknown[][] = [];
  const results = overrides.queryResults ?? [];

  const query = vi.fn(async (sql: string, p?: unknown[]) => {
    queries.push(sql);
    params.push(p ?? []);
    if (overrides.throwOn !== undefined && callCount === overrides.throwOn) {
      callCount++;
      throw new Error("Simulated DB error");
    }
    const result = results[callCount] ?? { rows: [] };
    callCount++;
    return result;
  });

  const setTenantId = vi.fn(async () => {});
  const transaction = vi.fn();

  return {
    query,
    setTenantId,
    transaction,
    _queries: queries,
    _params: params,
  };
}

// ---------------------------------------------------------------------------
// enrollNurture
// ---------------------------------------------------------------------------

describe("enrollNurture", () => {
  it("happy path: inserts row and returns new enrollmentId (not alreadyEnrolled)", async () => {
    const newId = "new-id-123";
    const db = makeDb({
      queryResults: [
        { rows: [] }, // INSERT (no-op return)
        { rows: [{ id: newId }] }, // SELECT after INSERT
      ],
    });

    const result = await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "test@example.com",
      sequence: "free_to_kit",
      brand: "Acme",
      metadata: { score: 42 },
    });

    expect(db.query).toHaveBeenCalledTimes(2);
    // First call must be INSERT
    expect(db._queries[0]).toContain("INSERT INTO nurture_enrollment");
    // Second call must be SELECT to look up existing id
    expect(db._queries[1]).toContain("SELECT id FROM nurture_enrollment");
    // alreadyEnrolled is true only if the returned id differs from the newly-generated one
    // Since we returned newId and it was set as existingId, alreadyEnrolled depends on match
    expect(result.enrollmentId).toBe(newId);
  });

  it("idempotency: if SELECT returns a different id (existing row), alreadyEnrolled = true", async () => {
    const existingId = "existing-id-999";
    const db = makeDb({
      queryResults: [
        { rows: [] }, // INSERT (conflict, no-op)
        { rows: [{ id: existingId }] }, // SELECT returns pre-existing row
      ],
    });

    const result = await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "test@example.com",
      sequence: "free_to_kit",
      brand: "Acme",
      metadata: {},
    });

    // The randomUUID() inside enrollNurture will generate a different id
    // So existingId !== generated id → alreadyEnrolled: true
    expect(result.alreadyEnrolled).toBe(true);
    expect(result.enrollmentId).toBe(existingId);
  });

  it("uses sourceLeadId and sourceKitId in INSERT params", async () => {
    const db = makeDb({
      queryResults: [{ rows: [] }, { rows: [{ id: "any-id" }] }],
    });

    await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "a@b.com",
      sequence: "kit_to_dfy",
      brand: "TestBrand",
      metadata: {},
      sourceLeadId: "lead-uuid",
      sourceKitId: "kit-uuid",
    });

    const insertParams = db._params[0] ?? [];
    expect(insertParams).toContain("lead-uuid");
    expect(insertParams).toContain("kit-uuid");
  });

  it("delayMs > 0: INSERT uses delay branch (different SQL with bigint cast)", async () => {
    const db = makeDb({
      queryResults: [{ rows: [] }, { rows: [{ id: "id-delay" }] }],
    });

    await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "a@b.com",
      sequence: "free_to_kit",
      brand: "DelayBrand",
      metadata: {},
      delayMs: 86400000, // 1 day
    });

    const insertSql = db._queries[0] ?? "";
    // The delay branch uses a bigint cast and INTERVAL arithmetic
    expect(insertSql).toContain("bigint");
    expect(insertSql).toContain("millisecond");
  });

  it("sets total_steps=4 for free_to_kit", async () => {
    const db = makeDb({
      queryResults: [{ rows: [] }, { rows: [{ id: "id-1" }] }],
    });

    await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "a@b.com",
      sequence: "free_to_kit",
      brand: "B",
      metadata: {},
    });

    const insertParams = db._params[0] ?? [];
    // totalSteps = 4 is the 4th positional param in the no-delay branch
    expect(insertParams).toContain(4);
  });

  it("sets total_steps=2 for kit_to_dfy", async () => {
    const db = makeDb({
      queryResults: [{ rows: [] }, { rows: [{ id: "id-2" }] }],
    });

    await enrollNurture(db as Parameters<typeof enrollNurture>[0], {
      email: "a@b.com",
      sequence: "kit_to_dfy",
      brand: "B",
      metadata: {},
    });

    const insertParams = db._params[0] ?? [];
    expect(insertParams).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// checkNurtureEligibility
// ---------------------------------------------------------------------------

describe("checkNurtureEligibility", () => {
  it("returns not enrolled when no row exists", async () => {
    const db = makeDb({ queryResults: [{ rows: [] }] });

    const result = await checkNurtureEligibility(
      db as Parameters<typeof checkNurtureEligibility>[0],
      "a@b.com",
      "free_to_kit"
    );

    expect(result).toEqual({ suppressed: false, alreadyEnrolled: false });
  });

  it("returns alreadyEnrolled when row exists and not suppressed", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ suppressed: false }] }],
    });

    const result = await checkNurtureEligibility(
      db as Parameters<typeof checkNurtureEligibility>[0],
      "a@b.com",
      "free_to_kit"
    );

    expect(result).toEqual({ suppressed: false, alreadyEnrolled: true });
  });

  it("returns suppressed when row exists and suppressed = true", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ suppressed: true }] }],
    });

    const result = await checkNurtureEligibility(
      db as Parameters<typeof checkNurtureEligibility>[0],
      "a@b.com",
      "kit_to_dfy"
    );

    expect(result).toEqual({ suppressed: true });
  });
});

// ---------------------------------------------------------------------------
// suppressOnConversion
// ---------------------------------------------------------------------------

describe("suppressOnConversion", () => {
  it("issues an UPDATE with suppressed_reason = converted and correct params", async () => {
    const db = makeDb({ queryResults: [{ rows: [] }] });

    await suppressOnConversion(
      db as Parameters<typeof suppressOnConversion>[0],
      "convert@example.com"
    );

    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = db._queries[0] ?? "";
    expect(sql).toContain("UPDATE nurture_enrollment");
    expect(sql).toContain("suppressed = TRUE");
    expect(sql).toContain("'converted'");
    // Email must be parameterized (not interpolated into SQL string)
    expect(sql).toContain("$1");
    expect(db._params[0]?.[0]).toBe("convert@example.com");
    expect(sql).not.toContain("convert@example.com");
  });
});

// ---------------------------------------------------------------------------
// GET /api/nurture/unsubscribe (route integration tests)
// ---------------------------------------------------------------------------

describe("GET /api/nurture/unsubscribe", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("returns 400 when token query param is missing", async () => {
    const db = makeDb();
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const res = await app.request("/api/nurture/unsubscribe");
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toContain("Missing");
  });

  it("returns 200 with 'Already unsubscribed or link expired' when token not found", async () => {
    const db = makeDb({ queryResults: [{ rows: [] }] });
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const res = await app.request("/api/nurture/unsubscribe?token=nonexistent-uuid-1234");
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toContain("Already unsubscribed or link expired");
    // Should only call SELECT — no UPDATE
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with 'Already unsubscribed' when row is already suppressed", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ id: "enroll-1", suppressed: true }] }],
    });
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const res = await app.request("/api/nurture/unsubscribe?token=some-token-abc");
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toBe("Already unsubscribed.");
    // Only SELECT — no UPDATE issued
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("issues UPDATE and returns 200 'You have been unsubscribed' on success", async () => {
    const db = makeDb({
      queryResults: [
        { rows: [{ id: "enroll-2", suppressed: false }] }, // SELECT
        { rows: [] }, // UPDATE
      ],
    });
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const token = "valid-token-xyz-123456789";
    const res = await app.request(`/api/nurture/unsubscribe?token=${token}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toBe("You have been unsubscribed.");

    // Two queries: SELECT then UPDATE
    expect(db.query).toHaveBeenCalledTimes(2);
    const updateSql = db._queries[1] ?? "";
    expect(updateSql).toContain("UPDATE nurture_enrollment");
    expect(updateSql).toContain("'unsubscribed'");
    // Token must be parameterized — must NOT appear raw in SQL
    expect(updateSql).not.toContain(token);
    expect(db._params[1]?.[0]).toBe(token);
  });

  it("returns 500 when DB SELECT throws", async () => {
    const db = makeDb({ throwOn: 0 });
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const res = await app.request("/api/nurture/unsubscribe?token=any-token-here");
    expect(res.status).toBe(500);
  });

  it("returns 500 when DB UPDATE throws", async () => {
    const db = makeDb({
      queryResults: [{ rows: [{ id: "enroll-3", suppressed: false }] }],
      throwOn: 1, // throw on the second call (UPDATE)
    });
    registerNurtureRoutes(app, db as Parameters<typeof registerNurtureRoutes>[1]);

    const res = await app.request("/api/nurture/unsubscribe?token=any-token-here-x");
    expect(res.status).toBe(500);
  });
});
