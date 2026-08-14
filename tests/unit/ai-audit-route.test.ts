/**
 * ai-audit routes — the HTTP edge of the AI Audit Stack.
 *
 * Thin wrappers over the tested engine; these pin the wire contract:
 *  - /meta derives the questionnaire vocabulary from the catalog;
 *  - /assess validates input, refuses a pain-less request, and returns the
 *    9-section report with the honesty flags (source + estimatesUnverified).
 * Driven through a real Hono app with a fake db, so routing + validation are
 * exercised end to end without a network or a database.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { registerAiAuditRoutes } from "../../apps/api/src/routes/ai-audit";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import type { PostgresClient } from "../../packages/shared/src/db-client";

/** Fake db: empty ai_tool → the route falls back to the seed catalog. */
const seedDb = {
  async query() {
    return { rows: [] };
  },
} as unknown as PostgresClient;

function appWith(db: PostgresClient): Hono {
  const app = new Hono();
  registerAiAuditRoutes(app, db);
  return app;
}

describe("GET /api/ai-audit/meta", () => {
  it("returns the questionnaire vocabulary derived from the catalog", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/meta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pains: string[]; categories: string[]; toolCount: number;
      catalog: { source: string; estimatesUnverified: boolean };
    };
    expect(body.toolCount).toBe(SEED_CATALOG.length);
    expect(body.pains).toContain("content-volume");
    expect(body.categories).toContain("ops");
    // seed fallback ⇒ numbers are estimates, said plainly
    expect(body.catalog.source).toBe("seed");
    expect(body.catalog.estimatesUnverified).toBe(true);
  });
});

describe("POST /api/ai-audit/assess", () => {
  it("refuses a request with no pains (a rec must anchor in a real need)", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessType: "agency", primaryFocus: "marketing", pains: [] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NO_PAINS");
  });

  it("returns the 9-section report + honesty flags for a real intake", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessType: "agency",
        primaryFocus: "marketing",
        pains: ["content-volume", "repetitive-tasks"],
        hourlyRateUsd: 60,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { recommendedSolutions: unknown[]; financialImpact: { hourlyRateUsd: number }; topPick: unknown; empty: boolean };
      catalog: { source: string; estimatesUnverified: boolean };
    };
    expect(body.report.empty).toBe(false);
    expect(body.report.recommendedSolutions.length).toBeGreaterThan(0);
    expect(body.report.financialImpact.hourlyRateUsd).toBe(60);
    expect(body.report.topPick).not.toBeNull();
    expect(body.catalog.estimatesUnverified).toBe(true);
  });

  it("rejects a non-JSON body with 400", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai-audit/entry (low-ticket)", () => {
  it("returns one niche tool + the visible upsell ladder", async () => {
    const res = await appWith(seedDb).request("/api/ai-audit/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessType: "agency", primaryFocus: "marketing", pains: ["content-volume", "lead-research"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entry: { pick: { tool: { id: string; isGeneric?: boolean } }; totalMatched: number; withheldCount: number };
      upsell: { fullAudit: { bundledWith: string }; alsoOffer: string };
    };
    expect(body.entry.pick.tool.isGeneric).not.toBe(true);
    expect(body.entry.withheldCount).toBe(body.entry.totalMatched - 1);
    // The ladder is in the payload: full audit bundled with GEO, GEO offered too.
    expect(body.upsell.fullAudit.bundledWith).toContain("GEO");
    expect(body.upsell.alsoOffer).toContain("GEO Search");
  });
});
