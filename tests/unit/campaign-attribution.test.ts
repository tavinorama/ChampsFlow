/**
 * Campaign attribution on the free test (cold outreach, 2026-08-22).
 *
 * Cold-email links look like ozvor.com/test?from=cold-atlanta-01 or carry
 * utm_* params. The /test client forwards them as a compact `attribution`
 * object; POST /api/test sanitizes it (six known keys, strings only, 100-char
 * cap) and stores it INSIDE the lead's result jsonb — no migration, mirroring
 * how /api/book/intake already keeps `from` in result. Absent attribution must
 * leave the route's behavior byte-identical to before.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// In-memory sliding window standing in for the shared Redis pipeline
// (same fake as tests/unit/book-intake-route.test.ts).
const zsets = new Map<string, number[]>();
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () => null,
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

// The LLM package: the invisibility test itself is out of scope here — return
// a stable fake result so the test focuses on what the route WRITES.
const FAKE_RESULT = {
  prompt: "best plumbers in Atlanta",
  live: false,
  engines: [] as unknown[],
  brandEngineCount: 0,
  competitorEngineCount: 0,
  totalEngines: 5,
  enginesLive: 0,
  domain: "acme.com",
  verdict: "Invisible",
  status: "invisible",
  score: { ai: 10, performance: 20, brand: 30, overall: 20 },
  breakdown: {},
  recommendations: [] as unknown[],
};
vi.mock("../../packages/llm/src/index", () => ({
  runInvisibilityTest: vi.fn(async () => ({ ...FAKE_RESULT })),
  buildKitDeliverable: vi.fn(),
  buildFallbackKitDeliverable: vi.fn(),
  recordSpend: vi.fn(async () => undefined),
  execForPg: vi.fn(() => vi.fn()),
}));

vi.mock("../../apps/api/src/integrations/stripe", () => ({
  createKitCheckoutSession: vi.fn(),
  createPagesCheckoutSession: vi.fn(),
  verifyKitCheckoutSession: vi.fn(),
}));

vi.mock("../../packages/shared/src/emails/free-test-result", () => ({
  sendFreeTestResultEmail: vi.fn(async () => undefined),
}));

import { registerProductRoutes } from "../../apps/api/src/routes/products";
import {
  parseAttribution,
  ATTRIBUTION_KEYS,
  ATTRIBUTION_MAX_LEN,
} from "../../apps/api/src/lib/campaign-attribution";
import type { PostgresClient } from "../../packages/shared/src/db-client";

// ---------------------------------------------------------------------------
// parseAttribution — the only gate between the untrusted body and jsonb
// ---------------------------------------------------------------------------

describe("parseAttribution", () => {
  it("keeps only the six known keys and drops everything else", () => {
    const parsed = parseAttribution({
      from: "cold-atlanta-01",
      utm_source: "email",
      utm_medium: "cold",
      utm_campaign: "atl-wave-1",
      utm_content: "v2",
      utm_term: "plumber",
      evil: "payload",
      gclid: "abc123",
    });
    expect(parsed).toEqual({
      from: "cold-atlanta-01",
      utm_source: "email",
      utm_medium: "cold",
      utm_campaign: "atl-wave-1",
      utm_content: "v2",
      utm_term: "plumber",
    });
    expect(Object.keys(parsed!)).toEqual([...ATTRIBUTION_KEYS]);
  });

  it("accepts only string values, trims them, and truncates to 100 chars", () => {
    const long = "x".repeat(500);
    const parsed = parseAttribution({
      from: `  cold-01  `,
      utm_campaign: long,
      utm_source: 42,
      utm_medium: { nested: true },
      utm_content: ["a"],
      utm_term: null,
    });
    expect(parsed).toEqual({ from: "cold-01", utm_campaign: "x".repeat(ATTRIBUTION_MAX_LEN) });
    expect(parsed!.utm_campaign!.length).toBe(100);
  });

  it("returns null for absent/empty/non-object input (caller writes nothing)", () => {
    expect(parseAttribution(undefined)).toBeNull();
    expect(parseAttribution(null)).toBeNull();
    expect(parseAttribution("from=x")).toBeNull();
    expect(parseAttribution(["from", "x"])).toBeNull();
    expect(parseAttribution({})).toBeNull();
    expect(parseAttribution({ from: "   " })).toBeNull();
    expect(parseAttribution({ unknown_key: "x" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/test — attribution lands inside the lead's result jsonb
// ---------------------------------------------------------------------------

interface LeadInsert { params: unknown[] }

function fakeDb(leads: LeadInsert[]): PostgresClient {
  return {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("FROM lead_capture WHERE lower(email)")) return { rows: [] }; // no prior test
      if (sql.includes("FROM api_spend")) return { rows: [{ c: 0 }] };               // budget clear
      if (sql.includes("INSERT INTO lead_capture")) { leads.push({ params: params ?? [] }); return { rows: [] }; }
      if (sql.includes("FROM users")) return { rows: [] };                            // no account to claim
      return { rows: [] };
    },
  } as unknown as PostgresClient;
}

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerProductRoutes(app, db);
  return app;
}

const TEST_BODY = {
  brand: "Acme Plumbing",
  domain: "acme.com",
  category: "plumber",
  email: "lead@example.com",
  region: "US",
};

function postTest(app: Hono, body: unknown, ip = "203.0.113.9") {
  return app.request("/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

/** The result jsonb param of the lead INSERT ($9 → index 8). */
function storedResult(lead: LeadInsert): Record<string, unknown> {
  return lead.params[8] as Record<string, unknown>;
}

beforeEach(() => zsets.clear());

describe("POST /api/test attribution capture", () => {
  it("sanitizes attribution and stores it inside the result jsonb (unknown keys dropped, values truncated)", async () => {
    const leads: LeadInsert[] = [];
    const res = await postTest(appWith(fakeDb(leads)), {
      ...TEST_BODY,
      attribution: {
        from: "cold-atlanta-01",
        utm_campaign: "c".repeat(300),
        utm_source: "email",
        gclid: "dropped",
        fbclid: "dropped-too",
        utm_medium: 7,
      },
    });
    expect(res.status).toBe(200);
    expect(leads).toHaveLength(1);
    const result = storedResult(leads[0]!);
    // The test result itself is intact...
    expect(result.verdict).toBe("Invisible");
    expect(result.score).toEqual(FAKE_RESULT.score);
    // ...and the sanitized origin rides alongside it.
    expect(result.attribution).toEqual({
      from: "cold-atlanta-01",
      utm_source: "email",
      utm_campaign: "c".repeat(100),
    });
  });

  it("without attribution the stored result jsonb is exactly the test result (no attribution key)", async () => {
    const leads: LeadInsert[] = [];
    const res = await postTest(appWith(fakeDb(leads)), TEST_BODY);
    expect(res.status).toBe(200);
    expect(leads).toHaveLength(1);
    const result = storedResult(leads[0]!);
    expect(result).not.toHaveProperty("attribution");
    expect(result.verdict).toBe("Invisible");
  });

  it("a malformed attribution (string / array / all-unknown keys) behaves exactly like absence", async () => {
    for (const attribution of ["from=x", ["from", "x"], { gclid: "zzz" }]) {
      const leads: LeadInsert[] = [];
      const res = await postTest(appWith(fakeDb(leads)), { ...TEST_BODY, attribution });
      expect(res.status).toBe(200);
      expect(storedResult(leads[0]!)).not.toHaveProperty("attribution");
    }
  });

  it("the response payload never echoes attribution (it is storage-only)", async () => {
    const leads: LeadInsert[] = [];
    const res = await postTest(appWith(fakeDb(leads)), {
      ...TEST_BODY,
      attribution: { from: "cold-atlanta-01" },
    });
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result).not.toHaveProperty("attribution");
  });
});
