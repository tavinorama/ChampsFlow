/**
 * 10.B.11 — monthly retention job: dry-run counts always; deletes ONLY behind
 * RETENTION_ENABLED=1; Telegram summary either way; a failing table degrades
 * alone (purge never crashes the worker).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  runRetentionMonthly,
  retentionEnabled,
  RETENTION_TARGETS,
} from "../../apps/worker/src/jobs/retention";

function fakeSql(opts: { failOn?: string } = {}) {
  const deletes: string[] = [];
  const sql = {
    unsafe: async (q: string) => {
      if (opts.failOn && q.includes(opts.failOn)) throw new Error(`relation "${opts.failOn}" does not exist`);
      if (q.startsWith("SELECT COUNT")) return [{ n: "7" }];
      if (q.startsWith("DELETE")) {
        deletes.push(q);
        const res: unknown[] = [];
        (res as { count?: number }).count = 7;
        return res;
      }
      return [];
    },
  } as unknown as import("postgres").Sql;
  return { sql, deletes };
}

const ORIGINAL = process.env["RETENTION_ENABLED"];
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["RETENTION_ENABLED"];
  else process.env["RETENTION_ENABLED"] = ORIGINAL;
});
beforeEach(() => {
  delete process.env["RETENTION_ENABLED"];
});

describe("retention job (10.B.11)", () => {
  it("covers exactly the four agreed windows", () => {
    expect(RETENTION_TARGETS.map((t) => `${t.table}:${t.keep}`)).toEqual([
      "smartlead_event:12 months",
      "ops.agent_step:6 months",
      "landing_events:13 months",
      "api_spend:24 months",
    ]);
  });

  it("gate OFF by default: counts candidates, deletes NOTHING, says dry-run on Telegram", async () => {
    expect(retentionEnabled()).toBe(false);
    const { sql, deletes } = fakeSql();
    const msgs: string[] = [];
    const res = await runRetentionMonthly(sql, { telegram: async (t) => void msgs.push(t) });
    expect(res.enabled).toBe(false);
    expect(deletes).toHaveLength(0);
    expect(res.rows.every((r) => r.candidates === 7 && r.deleted === null)).toBe(true);
    expect(msgs[0]).toContain("DRY-RUN");
    expect(msgs[0]).toContain("smartlead_event: 7 candidatas");
  });

  it("RETENTION_ENABLED=1: deletes each window and reports the counts", async () => {
    process.env["RETENTION_ENABLED"] = "1";
    const { sql, deletes } = fakeSql();
    const msgs: string[] = [];
    const res = await runRetentionMonthly(sql, { telegram: async (t) => void msgs.push(t) });
    expect(res.enabled).toBe(true);
    expect(deletes).toHaveLength(4);
    expect(deletes.find((d) => d.includes("ops.agent_step"))).toContain("started_at");
    // runs stay: no DELETE ever touches ops.agent_run
    expect(deletes.some((d) => d.includes("agent_run"))).toBe(false);
    expect(res.rows.every((r) => r.deleted === 7)).toBe(true);
    expect(msgs[0]).toContain("executada");
  });

  it("a missing table degrades alone — the other windows still run", async () => {
    process.env["RETENTION_ENABLED"] = "1";
    const { sql, deletes } = fakeSql({ failOn: "smartlead_event" });
    const msgs: string[] = [];
    const res = await runRetentionMonthly(sql, { telegram: async (t) => void msgs.push(t) });
    expect(res.rows[0]?.error).toContain("smartlead_event");
    expect(deletes).toHaveLength(3);
    expect(msgs[0]).toContain("ERRO");
  });
});
