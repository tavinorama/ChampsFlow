/**
 * Tenant cost in the ops snapshot (master list 5.C.2).
 *
 * api_spend.tenant_id records since 22/08 and NOTHING read it — the margin
 * alert did not exist. buildSnapshot('ops') now appends a "CUSTO POR TENANT"
 * block (top 10 tenants, measured-with-est-fallback cost, op count, top 3
 * ops, plan price when an active subscription exists, and a "sem tenant
 * (plataforma)" line for NULL tenant_id) that the daily-watchdog and its
 * lens-cost eat.
 *
 * Fake sql routed by the queries' own markers (same pattern as
 * graph-tick-starvation.test.ts): the test pins the TEXT CONTRACT the
 * lenses read, not the SQL engine. Two cases:
 *  - rows exist → the section and its numbers appear, dollars 2dp;
 *  - table/column absent (old deploy, 42P01/42703) → ONE honest line and the
 *    rest of the snapshot intact — the section never breaks the digest.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import { buildSnapshot } from "../../apps/worker/src/jobs/graph-tick";

interface FakeRows {
  tenantCost?: Array<{
    tenant_id: string;
    tenant_name: string | null;
    plan_tier: string | null;
    cost_cents: string;
    ops: string;
  }>;
  tenantOps?: Array<{ tenant_id: string; op: string; cost_cents: string }>;
  platform?: Array<{ cost_cents: string | null; ops: string }>;
  /** When set, every snap:* query throws with this Postgres error code. */
  spendErrorCode?: string;
}

const PER_GRAPH = [
  {
    graph: "daily-watchdog",
    runs: "14",
    succeeded: "13",
    failed: "1",
    running: "0",
    cost_cents: "420",
    avg_seconds: "95",
  },
];

/** Fake postgres client routed on the markers each snapshot query carries. */
function makeSnapshotSql(rows: FakeRows): postgres.Sql {
  const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("snap:tenant-cost") || text.includes("snap:tenant-ops") || text.includes("snap:platform-cost")) {
      if (rows.spendErrorCode) {
        const err = new Error(`relation "api_spend" unavailable`) as Error & { code: string };
        err.code = rows.spendErrorCode;
        throw err;
      }
      if (text.includes("snap:tenant-cost")) return rows.tenantCost ?? [];
      if (text.includes("snap:tenant-ops")) return rows.tenantOps ?? [];
      return rows.platform ?? [{ cost_cents: null, ops: "0" }];
    }
    if (text.includes("GROUP BY graph")) return PER_GRAPH; // per-graph health
    return []; // hotspots, dupes: empty is a valid, quiet day
  };
  return sql as unknown as postgres.Sql;
}

describe("buildSnapshot('ops') — CUSTO POR TENANT (5.C.2)", () => {
  it("renders per-tenant cost with plan price, op count, top ops and the platform line", async () => {
    const sql = makeSnapshotSql({
      tenantCost: [
        { tenant_id: "aaaa1111-0000-0000-0000-000000000001", tenant_name: "Acme Corp", plan_tier: "growth", cost_cents: "1234", ops: "27" },
        { tenant_id: "bbbb2222-0000-0000-0000-000000000002", tenant_name: null, plan_tier: null, cost_cents: "9801", ops: "3" },
      ],
      tenantOps: [
        { tenant_id: "aaaa1111-0000-0000-0000-000000000001", op: "audit", cost_cents: "800" },
        { tenant_id: "aaaa1111-0000-0000-0000-000000000001", op: "pages_generate", cost_cents: "434" },
        { tenant_id: "bbbb2222-0000-0000-0000-000000000002", op: "audit", cost_cents: "9801" },
      ],
      platform: [{ cost_cents: "250", ops: "10" }],
    });

    const text = await buildSnapshot(sql, "ops", 14);

    // The section exists and sits inside the same [ops] digest the lenses read.
    expect(text).toContain("REGISTRO OPERACIONAL (ops.*, 14d):");
    expect(text).toContain("CUSTO POR TENANT (api_spend, 14d):");

    // Subscribed tenant: plan price (growth = $99 from PLAN_PRICE_USD) next to
    // the window cost — the margin pair the pricing decision (5.C.4) expects.
    expect(text).toContain("- Acme Corp: plan=$99/mes · custo 14d=$12.34 · 27 ops · top: audit $8.00, pages_generate $4.34");

    // No subscription and no name: honest label + short id, cost only.
    expect(text).toContain("- tenant bbbb2222: sem assinatura · custo 14d=$98.01 · 3 ops · top: audit $98.01");

    // NULL tenant_id (free test / drift-checks / system) is one platform line.
    expect(text).toContain("- sem tenant (plataforma): $2.50 (10 ops)");
  });

  it("old deploy (table/column absent) degrades to one honest line, snapshot intact", async () => {
    const sql = makeSnapshotSql({ spendErrorCode: "42703" });

    const text = await buildSnapshot(sql, "ops", 14);

    // The rest of the digest survives untouched...
    expect(text).toContain("Por graph:");
    expect(text).toContain("- daily-watchdog: 14 runs (13 ok / 1 falha / 0 rodando)");
    // ...and the section is an honest absence, never an invented number.
    expect(text).toContain("CUSTO POR TENANT: indisponivel neste deploy");
    expect(text).toContain("42703");
    expect(text).not.toContain("CUSTO POR TENANT (api_spend");
  });

  it("no spend rows at all → no section, no noise", async () => {
    const sql = makeSnapshotSql({ tenantCost: [], tenantOps: [], platform: [{ cost_cents: null, ops: "0" }] });
    const text = await buildSnapshot(sql, "ops", 14);
    expect(text).toContain("Por graph:");
    expect(text).not.toContain("CUSTO POR TENANT");
  });
});
