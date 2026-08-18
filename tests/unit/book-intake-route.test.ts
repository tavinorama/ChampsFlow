/**
 * POST /api/book/intake (D3, 2026-08-17): the pre-Calendly intake on /book.
 * Email required, rate-limited like /api/test, lead_capture source='book_call',
 * identity claim when the email has an account, nurture only with consent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// In-memory sliding window standing in for the shared Redis pipeline.
const zsets = new Map<string, number[]>();
vi.mock("../../apps/api/src/shared-redis", () => ({
  getSharedRedis: () => ({
    pipeline: () => {
      const ops: Array<() => unknown> = [];
      const p = {
        zremrangebyscore: (key: string, _min: number, max: number) => { ops.push(() => { zsets.set(key, (zsets.get(key) ?? []).filter((s) => s > max)); return 0; }); return p; },
        zadd: (key: string, m: { score: number }) => { ops.push(() => { zsets.set(key, [...(zsets.get(key) ?? []), m.score]); return 1; }); return p; },
        zcard: (key: string) => { ops.push(() => (zsets.get(key) ?? []).length); return p; },
        expire: () => { ops.push(() => 1); return p; },
        exec: async () => ops.map((f) => f()),
      };
      return p;
    },
  }),
}));

import { registerBookRoutes, parseBookIntake, BOOK_INTAKE_LIMIT } from "../../apps/api/src/routes/book";
import type { PostgresClient } from "../../packages/shared/src/db-client";

interface Calls { leads: unknown[][]; claims: unknown[][]; nurture: unknown[][] }

function fakeDb(opts: { accountTenant?: string | null } = {}, calls: Calls = { leads: [], claims: [], nurture: [] }): PostgresClient {
  return {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("INSERT INTO lead_capture")) { calls.leads.push(params ?? []); return { rows: [] }; }
      if (sql.includes("FROM users")) return { rows: opts.accountTenant ? [{ tenant_id: opts.accountTenant }] : [] };
      if (sql.includes("UPDATE lead_capture")) { calls.claims.push(params ?? []); return { rows: [] }; }
      if (sql.includes("INSERT INTO nurture_enrollment")) { calls.nurture.push(params ?? []); return { rows: [] }; }
      if (sql.includes("FROM nurture_enrollment")) return { rows: [{ id: (calls.nurture[0]?.[0] as string) ?? "x" }] };
      return { rows: [] };
    },
  } as unknown as PostgresClient;
}

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerBookRoutes(app, db);
  return app;
}

function post(app: Hono, body: unknown, ip = "203.0.113.7") {
  return app.request("/api/book/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => zsets.clear());

describe("parseBookIntake", () => {
  it("requires a valid email; brand optional; consent must be literally true", () => {
    expect(parseBookIntake({})).toMatchObject({ ok: false, code: "EMAIL_REQUIRED" });
    expect(parseBookIntake({ email: "nope" })).toMatchObject({ ok: false, code: "EMAIL_INVALID" });
    const ok = parseBookIntake({ email: " Ana@Example.com ", brand: "  Ana Co ", marketing_consent: "true" });
    expect(ok).toMatchObject({ ok: true, value: { email: "ana@example.com", brand: "Ana Co", marketingConsent: false } });
  });
});

describe("POST /api/book/intake", () => {
  it("400 EMAIL_REQUIRED without an email; nothing is stored", async () => {
    const calls: Calls = { leads: [], claims: [], nurture: [] };
    const res = await post(appWith(fakeDb({}, calls)), { brand: "Acme" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_REQUIRED");
    expect(calls.leads.length).toBe(0);
  });

  it("stores the lead as source=book_call; no nurture without consent", async () => {
    const calls: Calls = { leads: [], claims: [], nurture: [] };
    const res = await post(appWith(fakeDb({}, calls)), { email: "lead@example.com", brand: "Acme", from: "prime_tab" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; leadId: string | null; claimed: boolean; nurtureEnrolled: boolean };
    expect(body.ok).toBe(true);
    expect(body.leadId).toBeTruthy();
    expect(body.claimed).toBe(false);
    expect(body.nurtureEnrolled).toBe(false);
    expect(calls.leads.length).toBe(1);
    expect(calls.nurture.length).toBe(0);
  });

  it("claims the row for an existing account and enrolls book_to_dfy with consent", async () => {
    const calls: Calls = { leads: [], claims: [], nurture: [] };
    const res = await post(appWith(fakeDb({ accountTenant: "t-1" }, calls)), { email: "owner@example.com", marketing_consent: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: boolean; nurtureEnrolled: boolean };
    expect(body.claimed).toBe(true);
    expect(calls.claims.length).toBe(1);
    expect(calls.claims[0][1]).toBe("t-1");
    expect(body.nurtureEnrolled).toBe(true);
    expect(calls.nurture.length).toBe(1);
    expect(calls.nurture[0]).toContain("book_to_dfy");
  });

  it("rate limits like /api/test: the request after the limit is 429", async () => {
    const app = appWith(fakeDb({}));
    for (let i = 0; i < BOOK_INTAKE_LIMIT; i++) {
      expect((await post(app, { email: `p${i}@example.com` })).status).toBe(200);
    }
    expect((await post(app, { email: "over@example.com" })).status).toBe(429);
    // A different IP is a different bucket.
    expect((await post(app, { email: "other@example.com" }, "198.51.100.9")).status).toBe(200);
  });
});
