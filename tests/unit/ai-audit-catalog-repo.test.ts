/**
 * catalog-repo — DB-first with an honest seed fallback.
 *
 * The audit must run before the ai_tool migration is applied (a founder-gated
 * production change) and must survive the table being empty, malformed, or
 * unreachable. These tests pin that: DB rows win when present and valid; every
 * other case degrades to the seed and SAYS so via `source`; `allVerified`
 * gates whether the numbers may be shown as fact.
 */

import { describe, it, expect } from "vitest";
import { loadCatalog } from "../../apps/api/src/lib/ai-audit/catalog-repo";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import type { PostgresClient } from "../../packages/shared/src/db-client";

/** Minimal fake db: query() returns the given rows, or throws if `fail`. */
function fakeDb(rows: unknown[], fail = false): PostgresClient {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query(): Promise<any> {
      if (fail) throw new Error('relation "ai_tool" does not exist');
      return { rows };
    },
  } as unknown as PostgresClient;
}

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: "acme-ai",
  name: "Acme AI",
  url: "https://acme.ai",
  category: "ops",
  niches: ["saas"],
  pains: ["repetitive-tasks"],
  monthly_cost_usd: "25.00",
  setup_effort: "low",
  impact: "high",
  hours_saved_weekly: "6",
  one_liner: "Automates the boring parts.",
  verified: true,
  ...over,
});

describe("loadCatalog", () => {
  it("serves DB rows when the table has valid rows", async () => {
    const { tools, source, allVerified } = await loadCatalog(fakeDb([dbRow()]));
    expect(source).toBe("db");
    expect(allVerified).toBe(true);
    expect(tools[0]).toMatchObject({ id: "acme-ai", monthlyCostUsd: 25, hoursSavedWeekly: 6 });
  });

  it("allVerified is false when any served row is unverified", async () => {
    const { allVerified, source } = await loadCatalog(fakeDb([dbRow(), dbRow({ id: "b", verified: false })]));
    expect(source).toBe("db");
    expect(allVerified).toBe(false);
  });

  it("falls back to the seed (unverified) when the table is empty", async () => {
    const { tools, source, allVerified } = await loadCatalog(fakeDb([]));
    expect(source).toBe("seed");
    expect(allVerified).toBe(false);
    expect(tools).toBe(SEED_CATALOG);
  });

  it("falls back to the seed when the query throws (table absent pre-migration)", async () => {
    const { tools, source } = await loadCatalog(fakeDb([], true));
    expect(source).toBe("seed");
    expect(tools).toBe(SEED_CATALOG);
  });

  it("drops rows with an invalid enum but keeps the valid ones", async () => {
    const { tools, source } = await loadCatalog(fakeDb([dbRow(), dbRow({ id: "bad", setup_effort: "instant" })]));
    expect(source).toBe("db");
    expect(tools.map((t) => t.id)).toEqual(["acme-ai"]);
  });

  it("falls back to the seed when every DB row is malformed", async () => {
    const { source } = await loadCatalog(fakeDb([dbRow({ impact: "nuclear" })]));
    expect(source).toBe("seed");
  });
});
