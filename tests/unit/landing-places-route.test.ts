/**
 * Route contract test — POST /api/landing/places/resolve (#208 PR-9)
 *
 * Kept in its own file (rather than tests/unit/landing-routes.test.ts) to
 * avoid merge conflicts with concurrent PR-8 work on that file, mirroring
 * the clearly-separated block convention in apps/api/src/routes/landing.ts
 * itself. Same DEV_AUTH_BYPASS + mock-PostgresClient pattern as
 * tests/unit/landing-routes.test.ts / tests/unit/cost-control.test.ts.
 *
 * The fail-safe contract this pins: without GOOGLE_PLACES_API_KEY the route
 * returns 503 PLACES_NOT_CONFIGURED and never queries the database (it's a
 * pure external lookup — nothing is persisted by this endpoint at all).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { registerLandingRoutes } from "../../apps/api/src/routes/landing";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
  };
  delete process.env["GOOGLE_PLACES_API_KEY"];
});

afterEach(() => {
  process.env = originalEnv;
});

function makeRouteDb() {
  let queryCount = 0;
  const query = async () => {
    queryCount += 1;
    return { rows: [] };
  };
  return {
    query,
    setTenantId: async () => {},
    transaction: async () => undefined,
    get queryCount() {
      return queryCount;
    },
  };
}

function landingApp(db: ReturnType<typeof makeRouteDb>): Hono {
  const app = new Hono();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerLandingRoutes(app, db as any);
  return app;
}

describe("POST /api/landing/places/resolve — fail-safe contract (#208 PR-9)", () => {
  it("returns 503 PLACES_NOT_CONFIGURED without GOOGLE_PLACES_API_KEY, and never queries the DB", async () => {
    const db = makeRouteDb();
    const res = await landingApp(db).request("/api/landing/places/resolve", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ maps_url: "https://maps.app.goo.gl/abc123" }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("PLACES_NOT_CONFIGURED");
    expect(db.queryCount).toBe(0);
  });

  it("returns 503 even with a malformed/empty body — the configured-gate runs before body parsing", async () => {
    const db = makeRouteDb();
    const res = await landingApp(db).request("/api/landing/places/resolve", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(503);
    expect(db.queryCount).toBe(0);
  });

  it("400s on a missing maps_url once GOOGLE_PLACES_API_KEY IS configured", async () => {
    process.env["GOOGLE_PLACES_API_KEY"] = "test-key";
    const db = makeRouteDb();
    const res = await landingApp(db).request("/api/landing/places/resolve", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("400s on an oversized maps_url once configured (input-boundary validation)", async () => {
    process.env["GOOGLE_PLACES_API_KEY"] = "test-key";
    const db = makeRouteDb();
    const res = await landingApp(db).request("/api/landing/places/resolve", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ maps_url: "https://maps.app.goo.gl/" + "a".repeat(2100) }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/landing/sites — optional place_id (#208 PR-9)", () => {
  it("rejects a malformed place_id shape before hitting the DB", async () => {
    const db = makeRouteDb();
    const res = await landingApp(db).request("/api/landing/sites", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Plumbing", place_id: "not a valid place id!!" }),
    });
    expect(res.status).toBe(400);
  });
});
