/**
 * step-cost.test.ts — C17 / P15 (25/09). "Custo dos graphs nunca gravado":
 * every step had cost_cents NULL and the boletim printed 0.00 USD, which
 * reads as free. Three states now; NULL is never zero.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stepCostFromHermes, stepCostToken, describeCostCents, estimateEnvKey, UNKNOWN_COST } from "../../packages/shared/src/step-cost";

describe("stepCostFromHermes — measured → estimated → unknown", () => {
  it("measured when the body carries cents or usage.cost_usd", () => {
    expect(stepCostFromHermes({ cost_cents: 0.8 }, "kimi", {})).toMatchObject({ basis: "measured", cents: 0.8 });
    expect(stepCostFromHermes({ usage: { cost_usd: 0.0123 } }, "kimi", {})).toMatchObject({ basis: "measured", cents: 1.23 });
  });
  it("estimated for a flat-fee engine with an allocation in env; the note names the key", () => {
    const env = { [estimateEnvKey("claude")]: "3" };
    const c = stepCostFromHermes({}, "claude", env);
    expect(c).toMatchObject({ basis: "estimated", cents: 3 });
    expect(c.note).toContain("HERMES_EST_COST_CENTS_CLAUDE");
  });
  it("unknown otherwise: cents NULL, never 0; a bad env value is not a number", () => {
    expect(stepCostFromHermes({}, "codex", {})).toMatchObject({ basis: "unknown", cents: null });
    expect(stepCostFromHermes({}, "codex", { HERMES_EST_COST_CENTS_CODEX: "cheap" })).toMatchObject({ basis: "unknown", cents: null });
    expect(stepCostFromHermes(null, null, {})).toEqual(UNKNOWN_COST);
    expect(stepCostFromHermes({ cost_cents: -1 }, "kimi", {}).basis).toBe("unknown");
  });
  it("summary token and boletim line say the state out loud", () => {
    expect(stepCostToken({ basis: "measured", cents: 0.8, note: "" })).toBe("cost=measured 0.8000c");
    expect(stepCostToken(UNKNOWN_COST)).toBe("cost=unknown");
    expect(describeCostCents(null)).toBe("custo sem medição");
    expect(describeCostCents(null, 4)).toBe("custo sem medição (4 passos sem custo)");
    expect(describeCostCents("420")).toBe("4.20 USD");
    expect(describeCostCents("420", 2)).toBe("4.20 USD (parcial: 2 passos sem custo)");
  });
});

describe("wiring: every task step records its cost state; a run of unknowns totals NULL", () => {
  const root = join(__dirname, "../..");
  it("the runner passes cost on every task finish that names the engine", () => {
    const src = readFileSync(join(root, "apps/api/src/lib/graph-runner.ts"), "utf8");
    const engineLines = (src.match(/engine: res\.engineUsed,/g) ?? []).length;
    const costLines = (src.match(/cost: res\.cost \?\? UNKNOWN_COST,/g) ?? []).length;
    expect(engineLines).toBeGreaterThan(0);
    expect(costLines).toBe(engineLines);
  });
  it("the worker never coalesces an unmeasured run to zero", () => {
    const src = readFileSync(join(root, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    expect(src).toContain("CASE WHEN COUNT(cost_cents) = 0 THEN NULL ELSE SUM(cost_cents) END");
    expect(src).not.toContain("cost_cents = (SELECT COALESCE(SUM(cost_cents), 0)");
    expect(src).toContain("describeCostCents(g.cost_cents");
  });
});
