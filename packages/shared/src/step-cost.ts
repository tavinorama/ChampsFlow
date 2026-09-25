/**
 * step-cost.ts — C17 / P15 (Codex 19/09, confirmed 23/09): "custo dos graphs
 * nunca gravado". ops.agent_step.cost_cents was NULL on every row and the
 * boletim printed "0.00 USD" per graph, which reads as "free". A number that
 * was never measured must not become zero.
 *
 * Three states, one per step:
 *   measured  — the engine returned a cost (or tokens the caller priced);
 *   estimated — a flat-fee engine (claude on Max, codex on ChatGPT) with an
 *               operator-set per-task allocation, HERMES_EST_COST_CENTS_<ENGINE>;
 *   unknown   — nothing to go on: cents stay NULL, never 0.
 */

export type StepCostBasis = "measured" | "estimated" | "unknown";

export interface StepCost {
  basis: StepCostBasis;
  /** Cents with up to 4 decimals; NULL unless measured or estimated. */
  cents: number | null;
  /** Where the number came from, for the step summary and the boletim. */
  note: string;
}

export const UNKNOWN_COST: StepCost = { basis: "unknown", cents: null, note: "no usage returned by the engine; no estimate configured" };

/** What a Hermes /task body may carry, today or later. All optional. */
export interface HermesCostFields {
  cost_cents?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; cost_usd?: unknown } | null;
}

function finite(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Env key for a flat-fee engine's per-task allocation, e.g. HERMES_EST_COST_CENTS_CLAUDE=3. */
export function estimateEnvKey(engine: string): string {
  return `HERMES_EST_COST_CENTS_${engine.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Decide the cost state of one task step. Pure. Order: measured (body says
 * cents, or usage.cost_usd) → estimated (env allocation for the engine) →
 * unknown. Never returns cents: 0 for "we do not know".
 */
export function stepCostFromHermes(
  body: HermesCostFields | null | undefined,
  engineUsed: string | null,
  env: NodeJS.ProcessEnv = process.env
): StepCost {
  const cents = finite(body?.cost_cents);
  if (cents !== null) return { basis: "measured", cents, note: "engine returned cost_cents" };
  const usd = finite(body?.usage?.cost_usd);
  if (usd !== null) return { basis: "measured", cents: Math.round(usd * 100 * 10000) / 10000, note: "engine returned usage.cost_usd" };
  if (engineUsed) {
    const key = estimateEnvKey(engineUsed);
    const raw = env[key];
    const est = raw === undefined ? null : finite(Number(raw));
    if (est !== null) return { basis: "estimated", cents: est, note: `flat-fee engine ${engineUsed}; per-task allocation from ${key}` };
    return { basis: "unknown", cents: null, note: `engine ${engineUsed} returned no usage; ${key} not set` };
  }
  return UNKNOWN_COST;
}

/** One token for a step summary: "cost=measured 0.8000c" / "cost=unknown". */
export function stepCostToken(c: StepCost | null | undefined): string {
  if (!c) return "cost=unknown";
  return c.cents === null ? `cost=${c.basis}` : `cost=${c.basis} ${c.cents.toFixed(4)}c`;
}

/** Boletim line for a run/graph total: NULL is "sem medição", never "0.00 USD". */
export function describeCostCents(total: string | number | null | undefined, unknownSteps = 0): string {
  if (total === null || total === undefined || total === "") return unknownSteps > 0 ? `custo sem medição (${unknownSteps} passos sem custo)` : "custo sem medição";
  const usd = (Number(total) / 100).toFixed(2);
  return unknownSteps > 0 ? `${usd} USD (parcial: ${unknownSteps} passos sem custo)` : `${usd} USD`;
}
