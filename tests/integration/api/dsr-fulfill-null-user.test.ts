/**
 * Integration tests — POST /api/dsr/:id/fulfill, null-user_id paths
 * (GDPR Art. 17 — regression for the 2026-06-18 review finding).
 *
 * Before this fix, the fulfil handler keyed erasure/restriction off dsr.user_id,
 * which is set ONLY when the requester was authenticated at intake. A super-admin
 * could "fulfil" an erasure for a row whose user_id was NULL (the common public-
 * intake / logged-out case): the cascade was silently skipped, yet the row was
 * marked status='fulfilled' and 200 {ok:true} returned — zero data deleted, no
 * signal. These tests drive the REAL handler (via Hono app.request) with a mock
 * db, asserting the corrected behaviour:
 *
 *   - email resolves to exactly one account → cascade runs, status='fulfilled'
 *   - email resolves to no account          → status='closed_no_data', no cascade
 *   - email resolves to multiple accounts   → 409, NOT fulfilled, no cascade
 *   - restriction / correction follow the same null-user_id logic
 *   - explicit user_id+tenant_id still runs the cascade without an email lookup
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Replace the JWT-validating guards with pass-through middlewares that inject a
// super-admin auth context. Keep every other real export (other modules import
// from this file at load).
vi.mock("../../../apps/api/src/auth/middleware", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requireAuth: async (ctx: any, next: any) => {
      ctx.set("auth", {
        userId: "admin-1",
        tenantId: "tenant-admin",
        role: "owner",
        isSuperAdmin: true,
      });
      await next();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requireSuperAdmin: async (_ctx: any, next: any) => {
      await next();
    },
  };
});

import { registerDsrRoutes } from "../../../apps/api/src/routes/dsr";

// ---------------------------------------------------------------------------
// Mock PostgresClient — routes queries by SQL shape and records what ran.
// ---------------------------------------------------------------------------

interface DsrRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  requester_email: string;
  request_type: string;
  status: string;
  verified_at: string | null;
  processed_at: string | null;
}

function makeMockDb(opts: { dsr: DsrRow; userMatches?: Array<{ id: string; tenant_id: string }> }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const txCalls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[][] = [];
  let updateParams: unknown[] | null = null;
  let restrictionUpdate: unknown[] | null = null;
  let cascadeRan = false;

  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/UPDATE dsr_requests/i.test(sql)) {
      updateParams = params;
      return { rows: [] };
    }
    if (/UPDATE users\s+SET restricted/i.test(sql)) {
      restrictionUpdate = params;
      return { rows: [] };
    }
    if (/INSERT INTO audit_log/i.test(sql)) {
      audits.push(params);
      return { rows: [] };
    }
    if (/FROM dsr_requests/i.test(sql)) {
      return { rows: [opts.dsr] };
    }
    if (/FROM users/i.test(sql)) {
      return { rows: opts.userMatches ?? [] };
    }
    return { rows: [] };
  };

  const db = {
    query,
    setTenantId: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: async (fn: (tx: any) => any) => {
      cascadeRan = true;
      const tx = {
        query: async (sql: string, params: unknown[] = []) => {
          txCalls.push({ sql, params });
          return { rows: [] };
        },
      };
      return fn(tx);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return {
    db,
    inspect: () => ({
      calls,
      txCalls,
      audits,
      updateParams,
      restrictionUpdate,
      cascadeRan,
      // True iff the resolver issued an email lookup against `users`.
      didEmailLookup: calls.some((c) => /FROM users/i.test(c.sql)),
    }),
  };
}

const VERIFIED_AT = "2026-06-18T10:00:00.000Z";

function buildApp(mock: ReturnType<typeof makeMockDb>) {
  const app = new Hono();
  registerDsrRoutes(app, mock.db);
  return app;
}

function fulfill(app: Hono, id: string) {
  return app.request(`/api/dsr/${id}/fulfill`, { method: "POST" });
}

// ---------------------------------------------------------------------------

describe("POST /api/dsr/:id/fulfill — erasure with null user_id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("REGRESSION: logged-out real user (user_id NULL) — resolves by email and runs the cascade", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-erase-1",
        tenant_id: null,
        user_id: null,
        requester_email: "Lost@Example.com",
        request_type: "erasure",
        status: "processing",
        verified_at: VERIFIED_AT,
        processed_at: null,
      },
      userMatches: [{ id: "user-1", tenant_id: "tenant-1" }],
    });
    const res = await fulfill(buildApp(mock), "req-erase-1");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("fulfilled");
    expect(s.cascadeRan).toBe(true);
    // The four cascade steps ran inside the transaction against the resolved subject.
    expect(s.txCalls).toHaveLength(4);
    expect(s.txCalls[0]?.sql).toContain("DELETE FROM drafts");
    expect(s.txCalls[3]?.sql).toContain("UPDATE users");
    expect(s.txCalls[0]?.params).toEqual(["user-1", "tenant-1"]);
    // Row closed as fulfilled, no closure_reason.
    expect(s.updateParams?.[0]).toBe("fulfilled");
    expect(s.updateParams?.[1]).toBeNull();
  });

  it("no account for email — closes as 'closed_no_data', cascade NEVER runs", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-erase-2",
        tenant_id: null,
        user_id: null,
        requester_email: "nobody@example.com",
        request_type: "erasure",
        status: "processing",
        verified_at: VERIFIED_AT,
        processed_at: null,
      },
      userMatches: [],
    });
    const res = await fulfill(buildApp(mock), "req-erase-2");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("closed_no_data");
    expect(body.closure_reason).toBe("no_personal_data_held");
    expect(s.cascadeRan).toBe(false);
    // Status written distinctly — NOT an indistinguishable 'fulfilled'.
    expect(s.updateParams?.[0]).toBe("closed_no_data");
    expect(s.updateParams?.[1]).toBe("no_personal_data_held");
    // A no-data audit event was recorded.
    expect(s.audits.some((a) => a[0] === "dsr_erasure_no_data")).toBe(true);
  });

  it("email matches multiple tenants — 409, NOT fulfilled, cascade NEVER runs", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-erase-3",
        tenant_id: null,
        user_id: null,
        requester_email: "shared@example.com",
        request_type: "erasure",
        status: "processing",
        verified_at: VERIFIED_AT,
        processed_at: null,
      },
      userMatches: [
        { id: "user-a", tenant_id: "tenant-a" },
        { id: "user-b", tenant_id: "tenant-b" },
      ],
    });
    const res = await fulfill(buildApp(mock), "req-erase-3");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(409);
    expect(body.code).toBe("AMBIGUOUS_SUBJECT");
    expect(s.cascadeRan).toBe(false);
    // The DSR row was never closed.
    expect(s.updateParams).toBeNull();
    expect(s.audits.some((a) => a[0] === "dsr_erasure_ambiguous")).toBe(true);
  });

  it("authenticated request (explicit user_id + tenant_id) runs the cascade without an email lookup", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-erase-4",
        tenant_id: "tenant-9",
        user_id: "user-9",
        requester_email: "auth@example.com",
        request_type: "erasure",
        status: "processing",
        verified_at: VERIFIED_AT,
        processed_at: null,
      },
    });
    const res = await fulfill(buildApp(mock), "req-erase-4");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("fulfilled");
    expect(s.cascadeRan).toBe(true);
    expect(s.txCalls[0]?.params).toEqual(["user-9", "tenant-9"]);
    // Short-circuits — no email resolution query issued.
    expect(s.didEmailLookup).toBe(false);
  });
});

describe("POST /api/dsr/:id/fulfill — restriction with null user_id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("one match — applies users.restricted and marks fulfilled", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-rest-1",
        tenant_id: null,
        user_id: null,
        requester_email: "restrict@example.com",
        request_type: "restriction",
        status: "processing",
        verified_at: null, // restriction allowed without OTP (lost-email path)
        processed_at: null,
      },
      userMatches: [{ id: "user-r", tenant_id: "tenant-r" }],
    });
    const res = await fulfill(buildApp(mock), "req-rest-1");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("fulfilled");
    expect(s.restrictionUpdate).toEqual(["user-r", "tenant-r"]);
  });

  it("no match — closes as 'closed_no_data', restriction never applied", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-rest-2",
        tenant_id: null,
        user_id: null,
        requester_email: "nobody@example.com",
        request_type: "restriction",
        status: "processing",
        verified_at: null,
        processed_at: null,
      },
      userMatches: [],
    });
    const res = await fulfill(buildApp(mock), "req-rest-2");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("closed_no_data");
    expect(s.restrictionUpdate).toBeNull();
    expect(s.updateParams?.[0]).toBe("closed_no_data");
  });

  it("multiple matches — 409, NOT fulfilled", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-rest-3",
        tenant_id: null,
        user_id: null,
        requester_email: "shared@example.com",
        request_type: "restriction",
        status: "processing",
        verified_at: null,
        processed_at: null,
      },
      userMatches: [
        { id: "user-a", tenant_id: "tenant-a" },
        { id: "user-b", tenant_id: "tenant-b" },
      ],
    });
    const res = await fulfill(buildApp(mock), "req-rest-3");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(409);
    expect(body.code).toBe("AMBIGUOUS_SUBJECT");
    expect(s.updateParams).toBeNull();
    expect(s.restrictionUpdate).toBeNull();
  });
});

describe("POST /api/dsr/:id/fulfill — correction with null user_id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no match — closes as 'closed_no_data'", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-corr-1",
        tenant_id: null,
        user_id: null,
        requester_email: "nobody@example.com",
        request_type: "correction",
        status: "processing",
        verified_at: null,
        processed_at: null,
      },
      userMatches: [],
    });
    const res = await fulfill(buildApp(mock), "req-corr-1");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("closed_no_data");
    expect(s.updateParams?.[1]).toBe("no_personal_data_held");
  });

  it("match present — keeps the manual-queue behaviour (fulfilled, no closure_reason)", async () => {
    const mock = makeMockDb({
      dsr: {
        id: "req-corr-2",
        tenant_id: "tenant-c",
        user_id: "user-c",
        requester_email: "corr@example.com",
        request_type: "correction",
        status: "processing",
        verified_at: null,
        processed_at: null,
      },
    });
    const res = await fulfill(buildApp(mock), "req-corr-2");
    const body = await res.json();
    const s = mock.inspect();

    expect(res.status).toBe(200);
    expect(body.status).toBe("fulfilled");
    expect(s.updateParams?.[1]).toBeNull();
  });
});
