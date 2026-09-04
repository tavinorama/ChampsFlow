/**
 * plan-task-state.test.ts — audit P0-02: separate declared activity from
 * verified execution.
 *
 * The promise under test: a client can never produce a VERIFIED task, proof is
 * required to move along the spine, regression re-opens the work, the Verified
 * Execution formula counts only proven states, and absent data stays absent
 * (null, never 0).
 *
 * Report references:
 *   RELATORIO-AUDITORIA-COMPLETA-OZVOR.md §5.2 (state list), §16 P0-02,
 *   §17 "Completion manual não pode produzir Verified", "Regression reabre
 *   ação", "Published exige URL; Indexed exige prova; Cited exige response
 *   evidence".
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_TASK_STATES,
  CLIENT_REACHABLE_STATES,
  TRANSITIONS,
  DONE_COMPAT_STATE,
  VERIFIED_STATES,
  NOT_OWED_STATES,
  isPlanTaskState,
  validateTransition,
  computeExecution,
  type PlanTaskState,
} from "../../packages/llm/src/plan-task-state";

describe("state list", () => {
  it("contains the full spine the report specifies", () => {
    for (const s of [
      "proposed",
      "drafting",
      "review",
      "published",
      "indexed",
      "cited",
      "verified",
    ]) {
      expect(PLAN_TASK_STATES).toContain(s);
    }
  });

  it("contains every exit the report specifies", () => {
    for (const s of ["rejected", "blocked", "expired", "regressed"]) {
      expect(PLAN_TASK_STATES).toContain(s);
    }
  });

  it("no longer has a bare `done` — it was the whole bug", () => {
    expect(PLAN_TASK_STATES).not.toContain("done");
    expect(isPlanTaskState("done")).toBe(false);
    // Old clients that still send it get the honest equivalent.
    expect(DONE_COMPAT_STATE).toBe("manual_done_pending_verification");
  });
});

describe("the client can never reach VERIFIED", () => {
  // This is the test the encomenda asks for by name. It fails the moment
  // anyone adds `client` to a transition that lands on `verified`.
  it("no transition into `verified` admits the client actor", () => {
    const offenders: string[] = [];
    for (const from of Object.keys(TRANSITIONS) as PlanTaskState[]) {
      const rule = TRANSITIONS[from]?.verified;
      if (rule && rule.actors.includes("client")) offenders.push(`${from} → verified`);
    }
    expect(offenders).toEqual([]);
  });

  it("no proof-bearing state is client-reachable", () => {
    const offenders: string[] = [];
    for (const from of Object.keys(TRANSITIONS) as PlanTaskState[]) {
      for (const to of Object.keys(TRANSITIONS[from] ?? {}) as PlanTaskState[]) {
        const rule = TRANSITIONS[from]![to]!;
        if (!rule.actors.includes("client")) continue;
        if (!CLIENT_REACHABLE_STATES.includes(to)) {
          offenders.push(`${from} → ${to}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("`verified` is not in the client-reachable set", () => {
    expect(CLIENT_REACHABLE_STATES).not.toContain("verified");
  });

  it.each([
    ["proposed"],
    ["accepted"],
    ["manual_done_pending_verification"],
    ["legacy_self_reported"],
    ["cited"],
  ] as const)("a client moving %s → verified is refused", (from) => {
    const res = validateTransition({
      from,
      to: "verified",
      actor: "client",
      evidence: "I promise I did it",
    });
    expect(res.ok).toBe(false);
    expect(["actor_not_permitted", "illegal_transition"]).toContain(res.code);
  });

  it("a checkbox tick only ever produces manual_done_pending_verification", () => {
    const res = validateTransition({
      from: "proposed",
      to: DONE_COMPAT_STATE,
      actor: "client",
    });
    expect(res.ok).toBe(true);
    expect(VERIFIED_STATES).not.toContain(DONE_COMPAT_STATE);
  });

  it("client_acknowledged is allowed and carries no execution weight", () => {
    expect(validateTransition({ from: "proposed", to: "client_acknowledged", actor: "client" }).ok).toBe(true);
    expect(computeExecution(["client_acknowledged"]).verifiedPct).toBe(0);
  });

  it("only the machine sets verified, and only from cited, and only with evidence", () => {
    expect(validateTransition({ from: "cited", to: "verified", actor: "ozvor", evidence: "x" }).ok).toBe(false);
    expect(validateTransition({ from: "cited", to: "verified", actor: "system" }).code).toBe("evidence_required");
    expect(
      validateTransition({
        from: "cited",
        to: "verified",
        actor: "system",
        evidence: "openai cited example.com/guide for 'best crm for smbs' on 2026-09-10",
      }).ok
    ).toBe(true);
  });
});

describe("proof requirements along the spine", () => {
  it("published requires the artifact URL", () => {
    expect(validateTransition({ from: "review", to: "published", actor: "ozvor" }).code).toBe(
      "artifact_url_required"
    );
    expect(
      validateTransition({
        from: "review",
        to: "published",
        actor: "ozvor",
        artifactUrl: "https://example.com/guide",
      }).ok
    ).toBe(true);
  });

  it("indexed requires evidence", () => {
    expect(validateTransition({ from: "published", to: "indexed", actor: "system" }).code).toBe(
      "evidence_required"
    );
  });

  it("cited requires evidence", () => {
    expect(validateTransition({ from: "indexed", to: "cited", actor: "system" }).code).toBe(
      "evidence_required"
    );
  });

  it("blocked / rejected / expired require a reason — no silent dead ends", () => {
    expect(validateTransition({ from: "proposed", to: "rejected", actor: "client" }).code).toBe("reason_required");
    expect(validateTransition({ from: "proposed", to: "blocked", actor: "client" }).code).toBe("reason_required");
    expect(validateTransition({ from: "drafting", to: "expired", actor: "ozvor" }).code).toBe("reason_required");
  });

  it("the spine cannot be skipped", () => {
    expect(validateTransition({ from: "proposed", to: "published", actor: "system", artifactUrl: "u" }).code).toBe(
      "illegal_transition"
    );
    expect(validateTransition({ from: "published", to: "verified", actor: "system", evidence: "e" }).code).toBe(
      "illegal_transition"
    );
  });

  it("a no-op is reported as a no-op, not silently accepted", () => {
    expect(validateTransition({ from: "verified", to: "verified", actor: "system" }).code).toBe("no_op");
  });

  it("an unknown state is refused rather than written through", () => {
    expect(
      validateTransition({ from: "done" as PlanTaskState, to: "verified", actor: "system", evidence: "e" }).code
    ).toBe("unknown_state");
  });
});

describe("regression re-opens the action", () => {
  it("verified → regressed is legal for the machine, with a reason", () => {
    expect(validateTransition({ from: "verified", to: "regressed", actor: "system" }).code).toBe("reason_required");
    expect(
      validateTransition({
        from: "verified",
        to: "regressed",
        actor: "system",
        reason: "no longer cited in the audit of 2026-10-01",
      }).ok
    ).toBe(true);
  });

  it("regressed counts as open work again, and stops counting as verified", () => {
    const before = computeExecution(["verified", "verified"]);
    const after = computeExecution(["verified", "regressed"]);
    expect(before.verifiedPct).toBe(100);
    expect(after.verifiedPct).toBe(50);
    expect(after.counts.open).toBe(1);
  });

  it("a regressed action can be worked again", () => {
    expect(validateTransition({ from: "regressed", to: "drafting", actor: "ozvor" }).ok).toBe(true);
  });

  it("nothing else can leave verified — no quiet re-labelling", () => {
    const exits = Object.keys(TRANSITIONS.verified ?? {});
    expect(exits).toEqual(["regressed"]);
  });
});

describe("Verified Execution formula", () => {
  it("counts only verified in the numerator", () => {
    const b = computeExecution(["verified", "cited", "published", "manual_done_pending_verification"]);
    expect(b.counts.verified).toBe(1);
    expect(b.verifiedPct).toBe(25);
  });

  it("the audit's exact scenario: 5 self-reported done rows are 0% verified", () => {
    // RELATORIO §3.1 — the dashboard showed Execution 100 on these five.
    const legacy: PlanTaskState[] = Array(5).fill("legacy_self_reported");
    const b = computeExecution(legacy);
    expect(b.verifiedPct).toBe(0);
    expect(b.selfReportedPct).toBe(100); // and this is what the old number was
    expect(b.counts.open).toBe(5); // so "All caught up" cannot be shown
  });

  it("rejected and expired leave the denominator", () => {
    const b = computeExecution(["verified", "rejected", "expired"]);
    expect(b.counts.denominator).toBe(1);
    expect(b.verifiedPct).toBe(100);
    for (const s of NOT_OWED_STATES) expect(computeExecution([s]).verifiedPct).toBeNull();
  });

  it("absent data is null, never 0", () => {
    expect(computeExecution([]).verifiedPct).toBeNull();
    expect(computeExecution([]).selfReportedPct).toBeNull();
    expect(computeExecution(["rejected"]).verifiedPct).toBeNull();
    // whereas real zero is a real zero
    expect(computeExecution(["proposed"]).verifiedPct).toBe(0);
  });

  it("in-flight proof shows as progress without claiming the outcome", () => {
    const b = computeExecution(["published", "indexed", "cited", "proposed"]);
    expect(b.verifiedPct).toBe(0);
    expect(b.counts.inFlight).toBe(3);
    expect(b.selfReportedPct).toBe(75);
  });

  it("rounds, and never exceeds 100", () => {
    expect(computeExecution(["verified", "proposed", "proposed"]).verifiedPct).toBe(33);
    const all: PlanTaskState[] = Array(7).fill("verified");
    expect(computeExecution(all).verifiedPct).toBe(100);
  });
});
