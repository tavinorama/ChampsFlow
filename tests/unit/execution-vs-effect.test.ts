/**
 * execution-vs-effect.test.ts — D12 (Codex cap. 6, 28/09).
 *
 * "Execução comprovada" and "efeito observado" are two facts. A schema that
 * is live is work done even if no engine changed. The note used to say a fix
 * counts only when the AI answers change.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeExecution, EXECUTED_STATES, EFFECT_STATES, TRANSITIONS, type PlanTaskState } from "../../packages/llm/src/plan-task-state";

describe("computeExecution — execution and effect are counted apart", () => {
  it("work that is live counts as executed even when no engine changed", () => {
    const states: PlanTaskState[] = ["published", "published", "indexed", "proposed", "proposed", "manual_done_pending_verification"];
    const b = computeExecution(states);
    expect(b.counts).toMatchObject({ executed: 3, effect: 0, verified: 0, selfReported: 1, denominator: 6 });
    expect(b.executedPct).toBe(50);
    expect(b.effectPct).toBe(0);
    expect(b.verifiedPct).toBe(0); // the score's input is untouched
  });
  it("effect is a subset of executed: cited and verified only", () => {
    const b = computeExecution(["published", "cited", "verified", "proposed"]);
    expect(b.counts).toMatchObject({ executed: 3, effect: 2, verified: 1 });
    expect(b.effectPct).toBe(50);
    for (const s of EFFECT_STATES) expect(EXECUTED_STATES).toContain(s);
  });
  it("a ticked box is neither", () => {
    const b = computeExecution(["manual_done_pending_verification", "client_acknowledged", "legacy_self_reported"]);
    expect(b.counts).toMatchObject({ executed: 0, effect: 0, selfReported: 3 });
  });
  it("nothing owed: both percentages are null, never zero", () => {
    expect(computeExecution(["rejected", "expired"])).toMatchObject({ executedPct: null, effectPct: null, verifiedPct: null });
    expect(computeExecution([])).toMatchObject({ executedPct: null, effectPct: null });
  });
  it("'executed' rests on a recorded artifact: every door into `published` requires a URL", () => {
    for (const [from, doors] of Object.entries(TRANSITIONS)) {
      const door = (doors as Record<string, { requiresArtifactUrl?: boolean; actors: readonly string[] }>)["published"];
      if (!door) continue;
      expect(door.requiresArtifactUrl, `${from} → published`).toBe(true);
      expect(door.actors, `${from} → published`).not.toContain("client");
    }
  });
});

describe("the dashboard note says two things, not one", () => {
  const note = readFileSync(join(__dirname, "../../apps/web/src/components/VerifiedExecutionNote.tsx"), "utf8");
  it("no longer says a fix counts only when the AI answers change", () => {
    expect(note).not.toContain("A fix counts here once we run the questions again");
  });
  it("names work done and effect seen apart, and claims no causation", () => {
    expect(note).toContain("done and live");
    expect(note).toContain("seen in AI answers");
    expect(note).toContain("a change is not proof we caused it");
    expect(note).toContain("counts.executed ?? counts.verified + counts.inFlight");
  });
});
