/**
 * step-business-state.test.ts — D7 (Codex N16, 28/09). `succeeded` is a
 * technical state. The rows below are the shapes read in production.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { businessStateOf, summarizeBusinessStates, describeBusinessStates } from "../../packages/shared/src/step-business-state";
import { resolveStepCost, stepCostToken, UNKNOWN_COST, NOT_APPLICABLE_COST } from "../../packages/shared/src/step-cost";

const ok = (node: string, summary: string) => ({ node, status: "succeeded", summary });

describe("businessStateOf — what a succeeded step actually meant", () => {
  it("a publish is delivered only when the scheduler confirmed it", () => {
    expect(businessStateOf(ok("publish", "published via postiz channel=linkedin postiz_id=a postiz_state=published url=https://x"))).toBe("delivered");
    expect(businessStateOf(ok("publish", "accepted via postiz channel=linkedin postiz_id=a postiz_state=queued · cost=n/a"))).toBe("accepted_unconfirmed");
    expect(businessStateOf(ok("publish", "published via postiz channel=x postiz_id=a postiz_state=queued"))).toBe("accepted_unconfirmed");
    expect(businessStateOf(ok("publish-a", "accepted via postiz channel=x postiz_id=a postiz_state=error postiz_error=token"))).toBe("delivery_error");
    expect(businessStateOf(ok("publish", "accepted via postiz channel=x postiz_id=a postiz_state=unknown_expired"))).toBe("delivery_unknown");
    expect(businessStateOf(ok("publish", "published via postiz channel=x"))).toBe("delivery_unknown"); // rows from before the receipt
  });
  it("reasoning without signals AND without own gaps is context_missing; one of them on is enough", () => {
    expect(businessStateOf(ok("briefing", "task ok via kimi · ctx signals=empty gaps=empty · cost=unknown"))).toBe("context_missing");
    expect(businessStateOf(ok("signal", "task ok via kimi · ctx signals=not_wired gaps=not_wired · cost=unknown"))).toBe("context_missing");
    expect(businessStateOf(ok("briefing", "task ok via claude · ctx signals=on gaps=empty · cost=unknown"))).toBe("done");
  });
  it("a verdict contained by G03 is learning_suspended, not done", () => {
    expect(businessStateOf(ok("verdict", "business_state=invalid_g03; evaluation suspended"))).toBe("learning_suspended");
  });
  it("waits and approvals are told apart; failed and running are themselves", () => {
    expect(businessStateOf({ node: "approval", status: "waiting", summary: null })).toBe("waiting_human");
    expect(businessStateOf({ node: "founder-approval", status: "waiting", summary: null })).toBe("waiting_human");
    expect(businessStateOf({ node: "wait-72h", status: "waiting", summary: null })).toBe("waiting_window");
    expect(businessStateOf({ node: "critic", status: "failed", summary: "stale running step" })).toBe("failed");
    expect(businessStateOf({ node: "briefing", status: "running", summary: null })).toBe("running");
  });
  it("the boletim counts attempts and confirmations apart, and leaves zeros out", () => {
    const steps = [
      ...Array.from({ length: 8 }, () => ok("publish", "accepted via postiz channel=linkedin postiz_id=a postiz_state=queued")),
      ...Array.from({ length: 130 }, () => ok("briefing", "task ok via kimi · ctx signals=empty gaps=empty")),
      ...Array.from({ length: 11 }, () => ok("verdict", "invalid_g03")),
      { node: "approval", status: "waiting", summary: null },
    ];
    const c = summarizeBusinessStates(steps);
    expect(c).toMatchObject({ accepted_unconfirmed: 8, delivered: 0, context_missing: 130, learning_suspended: 11, waiting_human: 1 });
    const lines = describeBusinessStates(c);
    expect(lines[0]).toBe("- publicacoes tentadas: 8 (confirmadas: 0)");
    expect(lines).toContain("- raciocinio sem contexto externo: 130");
    // The headline may say "confirmadas: 0" (that IS the news); no state line is a zero.
    expect(lines.slice(1).filter((l) => /: 0$/.test(l))).toEqual([]);
  });
});

describe("cost: a step that called no model has no cost to be unknown about", () => {
  it("explicit cost wins; an engine without cost is unknown; no engine is not_applicable", () => {
    const measured = { basis: "measured" as const, cents: 0.8, note: "" };
    expect(resolveStepCost(measured, "kimi")).toBe(measured);
    expect(resolveStepCost(null, "kimi")).toBe(UNKNOWN_COST);
    expect(resolveStepCost(undefined, null)).toBe(NOT_APPLICABLE_COST);
    expect(stepCostToken(NOT_APPLICABLE_COST)).toBe("cost=n/a");
  });
  it("the worker resolves the cost per step and the CHECK accepts the fourth state", () => {
    const root = join(__dirname, "../..");
    const tick = readFileSync(join(root, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    expect(tick).toContain("const cost = resolveStepCost(input.cost, input.engine);");
    expect(tick).toContain("/* snap:business-states */");
    const mig = readFileSync(join(root, "packages/db/migrations/20260929000003_agent_step_cost_basis_na.up.sql"), "utf8");
    expect(mig).toContain("'measured', 'estimated', 'unknown', 'not_applicable'");
  });
});
