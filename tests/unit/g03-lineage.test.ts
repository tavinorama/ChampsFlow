/**
 * g03-lineage.test.ts — the material the G03 reconciliation needs, kept
 * alongside the containment (reconciliação 14/09, R1):
 *  - readHarvest returns every ledger row it touched WITH its origin, so an
 *    evaluation can one day be rebuilt from lineage instead of prefix sums;
 *  - assessRawObservations is the DORMANT proposed semantics (gauge, dedup by
 *    day, any derived row invalidates) — no runtime path calls it;
 *  - scripts/sql/reconcile-g03.sql is read-only and classifies history in the
 *    five classes agreed with the Codex review (never presuming chronology).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type postgres from "postgres";
import type Redis from "ioredis";
import { assessRawObservations } from "../../apps/api/src/lib/graph-runner";
import { buildPorts, HARVEST_COLLECTOR_GRAPH } from "../../apps/worker/src/jobs/graph-tick";

describe("readHarvest lineage (allowlisted metric only)", () => {
  it("returns eligible rows with sourceKind raw|derived by ORIGIN graph/node, and the legacy prefix sum for the summary only", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join("$");
      if (!text.includes("harvest:eligible-rows-read")) return [];
      return [
        { id: "r1", graph: HARVEST_COLLECTOR_GRAPH, node: "harvest:crm", measured_at: "2026-09-10T07:40:00Z", value_after: "0.4" },
        { id: "d1", graph: "followup-reply", node: "verdict", measured_at: "2026-09-10T10:00:00Z", value_after: "9" },
        { id: "x1", graph: null, node: null, measured_at: "2026-09-11T07:40:00Z", value_after: null },
      ];
    });
    const ports = buildPorts(sql as unknown as postgres.Sql, {} as Redis);
    const got = await ports.substrate.readHarvest("sales_reply_rate_c1", "2026-09-01T00:00:00Z");
    expect(got.n).toBe(3);
    expect(got.eligible?.map((r) => [r.id, r.sourceKind])).toEqual([
      ["r1", "raw"],
      ["d1", "derived"],
      ["x1", "derived"], // unknown origin is never raw
    ]);
    expect(got.total).toBe(9.4); // legacy sum: reported, never evaluated
  });

  it("a quarantined metric never reaches SQL", async () => {
    const sql = vi.fn(async () => { throw new Error("DB forbidden"); });
    const ports = buildPorts(sql as unknown as postgres.Sql, {} as Redis);
    await expect(ports.substrate.readHarvest("linkedinpage_impressions", "2026-09-01T00:00:00Z")).rejects.toThrow(/invalid_g03/);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("assessRawObservations — DORMANT proposed semantics (no runtime caller)", () => {
  it("gauge = last snapshot in the window, NOT the sum (rolling 7d windows overlap)", () => {
    const a = assessRawObservations([
      { id: "1", sourceKind: "raw", measuredAt: "2026-09-01T07:40:00Z", value: 25 },
      { id: "2", sourceKind: "raw", measuredAt: "2026-09-02T07:40:00Z", value: 27 },
      { id: "3", sourceKind: "raw", measuredAt: "2026-09-03T07:40:00Z", value: 20 },
    ]);
    expect(a).toMatchObject({ kind: "gauge", value: 20, n: 3, raw: 3, derived: 0 });
  });

  it("adding a DERIVED row never turns a valid reading into a bigger one — it invalidates it", () => {
    const rows = [
      { id: "1", sourceKind: "raw" as const, measuredAt: "2026-09-01T07:40:00Z", value: 25 },
      { id: "2", sourceKind: "raw" as const, measuredAt: "2026-09-02T07:40:00Z", value: 27 },
    ];
    expect(assessRawObservations(rows).kind).toBe("gauge");
    const after = assessRawObservations([...rows, { id: "v", sourceKind: "derived", measuredAt: "2026-09-02T10:00:00Z", value: 66_923_770 }]);
    expect(after.kind).toBe("invalid");
    expect(after.value).toBeNull();
  });

  it("a repeated snapshot on the same day does not duplicate (latest wins); empty, no-raw and non-finite → invalid, never 0", () => {
    expect(assessRawObservations([
      { id: "1", sourceKind: "raw", measuredAt: "2026-09-02T07:40:00Z", value: 27 },
      { id: "1b", sourceKind: "raw", measuredAt: "2026-09-02T09:40:00Z", value: 27 },
      { id: "2", sourceKind: "raw", measuredAt: "2026-09-03T07:40:00Z", value: 21 },
    ])).toMatchObject({ kind: "gauge", value: 21, n: 2 });
    expect(assessRawObservations([]).kind).toBe("invalid");
    expect(assessRawObservations([{ id: "v", sourceKind: "derived", measuredAt: "2026-09-02T10:00:00Z", value: 1 }]).kind).toBe("invalid");
    expect(assessRawObservations([{ id: "1", sourceKind: "raw", measuredAt: "2026-09-02T07:40:00Z", value: Number.NaN }]).kind).toBe("invalid");
    expect(assessRawObservations([{ id: "1", sourceKind: "raw", value: 3 }]).kind).toBe("invalid");
  });
});

describe("scripts/sql/reconcile-g03.sql — read-only classification of history", () => {
  const sqlText = readFileSync("scripts/sql/reconcile-g03.sql", "utf8");
  it("runs inside a READ ONLY transaction and never writes", () => {
    expect(sqlText).toMatch(/SET TRANSACTION READ ONLY/);
    expect(sqlText).toMatch(/ROLLBACK;\s*$/);
    expect(sqlText).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/);
  });
  it("classifies every derived row into the five agreed classes without presuming chronology", () => {
    for (const cls of ["not_affected", "rolling_only", "recursive", "both", "unknown"]) expect(sqlText).toContain(`'${cls}'`);
    expect(sqlText).toContain("window_kind");
  });
});
