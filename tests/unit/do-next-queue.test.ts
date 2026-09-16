/**
 * do-next-queue.test.ts — R08: old cards do not starve the plan (2026-09-16).
 *
 * Measured on the own brand, 14/09 06:04Z: the plan was fresh and linked to
 * that morning's audit, and it contained 7 proposed cards plus 5 legacy
 * self-reports — 12, the cap. A replay of the persisted probes produced 178
 * candidates and created 0: every one was dropped by the cap, plan after
 * plan, while the dashboard looked up to date. The Codex fixture (7+5 block a
 * priority-99 candidate; with 11 old cards it enters) is reproduced here.
 *
 * What these tests hold:
 *   1. self-reports (legacy / manual_done_pending_verification /
 *      client_acknowledged) are carried untouched and take NO slot;
 *   2. a fresh eligible candidate enters even when 12 open cards are carried,
 *      as long as the SLOT cards are fewer than the cap;
 *   3. when the slots really are full and fresh candidates are dropped, the
 *      stats say `queueBlocked` with the numbers — never a quiet "refreshed";
 *   4. the state lists partition cleanly: every OPEN state is either a SLOT
 *      state or a VERIFICATION_QUEUE state, never both, never neither;
 *   5. the API derives the loop receipt from the plan's audit link, and the
 *      dashboard shows evidence next to the gap instead of hiding it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  reconcileLoopTasks,
  LOOP_OPEN_CAP,
  type PrevTask,
  type LoopBuildResult,
  type LoopCandidate,
} from "../../packages/llm/src/visibility-loop";
import {
  OPEN_STATES,
  SLOT_STATES,
  VERIFICATION_QUEUE_STATES,
  SELF_REPORTED_STATES,
} from "../../packages/llm/src/plan-task-state";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const dateISO = "2026-09-16";

const prev = (i: number, status: string): PrevTask => ({
  vector: "ai",
  gap: `old gap ${i}`,
  action: `old action ${i}`,
  effort: "medium",
  impact: "high",
  priority: 50,
  status,
  evidence: `old evidence ${i}`,
  metric: "citations",
  owner: "you",
});

const candidate = (i: number, priority: number): LoopCandidate => ({
  key: `fresh gap ${i}`,
  vector: "ai",
  gap: `fresh gap ${i}`,
  action: `fresh action ${i}`,
  effort: "low",
  impact: "high",
  priority,
  metric: "citations",
  evidence: `fresh evidence ${i}: the audit of ${dateISO} found the question uncited`,
});

const build = (candidates: LoopCandidate[]): LoopBuildResult => ({
  candidates,
  resolved: new Map(),
});

describe("the state lists partition the open states (R08)", () => {
  it("every OPEN state is a slot state or a verification-queue state, never both", () => {
    for (const s of OPEN_STATES) {
      const slot = SLOT_STATES.includes(s);
      const queue = VERIFICATION_QUEUE_STATES.includes(s);
      expect(slot !== queue).toBe(true);
    }
    expect([...SLOT_STATES, ...VERIFICATION_QUEUE_STATES].sort()).toEqual([...OPEN_STATES].sort());
  });

  it("the verification queue is exactly the self-reported states", () => {
    expect([...VERIFICATION_QUEUE_STATES].sort()).toEqual([...SELF_REPORTED_STATES].sort());
  });
});

describe("the 14/09 own-brand plan: 7 proposed + 5 legacy self-reports", () => {
  const seven = Array.from({ length: 7 }, (_, i) => prev(i, "proposed"));
  const fiveLegacy = Array.from({ length: 5 }, (_, i) => prev(100 + i, "legacy_self_reported"));

  it("a fresh priority-99 candidate ENTERS — the legacy cards are carried but take no slot", () => {
    const { rows, stats } = reconcileLoopTasks([...seven, ...fiveLegacy], build([candidate(1, 99)]), dateISO);
    expect(stats.created).toBe(1);
    expect(stats.droppedByCap).toBe(0);
    expect(stats.verificationQueue).toBe(5);
    expect(stats.queueBlocked).toBe(false);
    // Nothing was dropped or rewritten: the 5 self-reports are still there, unchanged.
    const legacy = rows.filter((r) => r.status === "legacy_self_reported");
    expect(legacy).toHaveLength(5);
    expect(legacy.every((r) => r.evidence?.startsWith("old evidence"))).toBe(true);
    expect(rows.find((r) => r.gap === "fresh gap 1")?.status).toBe("proposed");
  });

  it("the cap still binds the SLOT cards: 12 proposed carried + fresh candidates → dropped, and the stats say why", () => {
    const twelve = Array.from({ length: LOOP_OPEN_CAP }, (_, i) => prev(i, "proposed"));
    const fresh = Array.from({ length: 3 }, (_, i) => candidate(i, 90 - i));
    const { rows, stats } = reconcileLoopTasks(twelve, build(fresh), dateISO);
    expect(rows.filter((r) => r.status === "proposed")).toHaveLength(LOOP_OPEN_CAP);
    expect(stats.created).toBe(0);
    expect(stats.droppedByCap).toBe(3);
    expect(stats.queueBlocked).toBe(true);
    expect(stats.queueBlockedReason).toContain("12 open slots are all carried cards");
    expect(stats.queueBlockedReason).toContain("3 fresh candidate(s)");
  });

  it("is not blocked when the cap is full but nothing fresh was waiting", () => {
    const twelve = Array.from({ length: LOOP_OPEN_CAP }, (_, i) => prev(i, "proposed"));
    const { stats } = reconcileLoopTasks(twelve, build([]), dateISO);
    expect(stats.droppedByCap).toBe(0);
    expect(stats.queueBlocked).toBe(false);
    expect(stats.queueBlockedReason).toBeNull();
  });

  it("is not blocked when at least one fresh candidate entered", () => {
    const eleven = Array.from({ length: LOOP_OPEN_CAP - 1 }, (_, i) => prev(i, "proposed"));
    const { stats } = reconcileLoopTasks(eleven, build([candidate(1, 99), candidate(2, 98)]), dateISO);
    expect(stats.created).toBe(1);
    expect(stats.droppedByCap).toBe(1);
    expect(stats.queueBlocked).toBe(false);
  });

  it("a self-report that matches a fresh candidate is refreshed but keeps waiting on verification, slot-free", () => {
    const legacy = prev(1, "manual_done_pending_verification");
    const twelve = Array.from({ length: LOOP_OPEN_CAP }, (_, i) => prev(200 + i, "accepted"));
    const matching = { ...candidate(1, 80), key: legacy.gap, gap: legacy.gap };
    const { rows, stats } = reconcileLoopTasks([...twelve, legacy], build([matching]), dateISO);
    const card = rows.find((r) => r.gap === legacy.gap);
    expect(card?.status).toBe("manual_done_pending_verification");
    expect(card?.action).toBe(matching.action); // refreshed
    expect(stats.refreshed).toBe(1);
    expect(stats.verificationQueue).toBe(1);
    expect(stats.droppedByCap).toBe(0);
  });
});

describe("the worker, the API and the dashboard use it", () => {
  it("the worker logs a blocked queue loudly, with the numbers", () => {
    const src = read("apps/worker/src/jobs/audit-run.ts");
    expect(src).toMatch(/if \(stats\.queueBlocked\) \{[\s\S]{0,700}logger\.warn\("visibility_loop_queue_blocked"/);
  });

  it("the API's loop receipt is the plan's link to the latest audit, not the audit's existence", () => {
    const src = read("apps/api/src/routes/audits.ts");
    expect(src).toContain("SELECT id, audit_id, calendar, created_at FROM strategy_plan");
    expect(src).toContain('status: latest && plan.audit_id === latest.id ? "ok" : "never_ran"');
  });

  it("the dashboard shows the evidence next to the gap instead of hiding it behind gap || evidence", () => {
    const src = read("apps/web/src/app/dashboard-v3/page.tsx");
    expect(src).not.toContain("{t.gap || t.evidence}");
    expect(src).toContain("{t.evidence && t.evidence !== t.gap && <div style={S.actWhy}>{t.evidence}</div>}");
  });
});
