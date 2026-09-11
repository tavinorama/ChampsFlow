/**
 * audit-cost.ts — the ONE place that answers "what does an audit cost us?".
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The per-engine rates lived inline in apps/worker/src/jobs/audit-run.ts, where
 * only the worker could read them. The design-partner pack generator has to
 * PRINT the cost before it spends a cent (house rule: no paid action without an
 * explicit confirmation), and a second copy of those numbers would drift from
 * the ledger the moment one of them moved. So the rates, the env overrides and
 * the arithmetic move here; audit-run.ts imports them and behaves exactly as
 * before.
 *
 * THESE ARE ESTIMATES, AND THEY SAY SO
 * ---------------------------------------------------------------------------
 * They are per-engine measurements pending invoice reconciliation (#152), not
 * quotes. The api_spend ledger still prefers MEASURED token cost when the
 * adapter reports usage; these rates are the fallback and the pre-flight
 * forecast. Never present an estimate from here to a client as a price.
 *
 * Measured 2026-08 (delta over 22 calls each):
 *   anthropic  1.64c · openai 0.41c · perplexity 0.68c · gemini 0c (free tier
 *   today — recorded as 0 because this ledger reports actual spend, not
 *   worst-case planning) · serp 0.40c (DataForSEO list-derived).
 *
 * Env overrides, in precedence order (unchanged from the worker):
 *   AUDIT_COST_CENTS                     flat per-audit override (whole audit)
 *   AUDIT_COST_PER_GEN_CENTS_<ENGINE>    per-engine rate
 *   AUDIT_COST_PER_GEN_CENTS             uniform rate for engines without one
 *   AUDIT_COST_PER_EXTRACTION_CENTS      per extraction/verification LLM call
 *
 * Pure module: no I/O, no SQL, no LLM. `env` is injectable so tests never touch
 * process.env.
 */

export type CostEnv = Record<string, string | undefined>;

/** Per-generation rate in cents, by engine. See the header for provenance. */
export const MEASURED_GEN_CENTS: Readonly<Record<string, number>> = Object.freeze({
  anthropic: 1.64,
  openai: 0.41,
  perplexity: 0.68,
  gemini: 0,
  serp: 0.4,
});

/** Rate used for an engine we have never measured. Deliberately pessimistic. */
export const UNKNOWN_ENGINE_GEN_CENTS = 1.2;

/** Approximately one cheap-tier call (haiku-4-5 / gpt-4o-mini, ~1k in + ~200 out). */
export const DEFAULT_EXTRACTION_CENTS = 0.2;

/**
 * Two-pass extraction (B3) runs at most an extractor and a verifier per
 * non-empty answer. The pre-flight forecast uses the ceiling — a forecast that
 * under-states cost is worse than one that over-states it.
 */
export const MAX_EXTRACTION_CALLS_PER_ANSWER = 2;

function positiveNumber(raw: string | undefined, allowZero: boolean): number | null {
  const n = Number(raw ?? NaN);
  if (!Number.isFinite(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;
  return n;
}

/** Per-generation rate for one engine, honouring the env overrides. */
export function genRateCents(engine: string, env: CostEnv = process.env): number {
  // A specific override may legitimately be 0 (an engine moved to a free tier).
  const specific = positiveNumber(env[`AUDIT_COST_PER_GEN_CENTS_${engine.toUpperCase()}`], true);
  if (specific !== null) return specific;
  const uniform = positiveNumber(env["AUDIT_COST_PER_GEN_CENTS"], false);
  if (uniform !== null) return uniform;
  const measured = MEASURED_GEN_CENTS[engine];
  return measured === undefined ? UNKNOWN_ENGINE_GEN_CENTS : measured;
}

/** Per extraction/verification call rate, honouring AUDIT_COST_PER_EXTRACTION_CENTS. */
export function extractionRateCents(env: CostEnv = process.env): number {
  return positiveNumber(env["AUDIT_COST_PER_EXTRACTION_CENTS"], false) ?? DEFAULT_EXTRACTION_CENTS;
}

/** The flat per-audit override, when AUDIT_COST_CENTS is set to a finite number. */
export function flatAuditOverrideCents(env: CostEnv = process.env): number | null {
  const n = Number(env["AUDIT_COST_CENTS"] ?? NaN);
  return Number.isFinite(n) ? n : null;
}

export interface AuditCostInput {
  /** Live generations per engine (cached probes cost nothing and must be excluded). */
  gensByEngine: Readonly<Record<string, number>>;
  /** Extraction + verification LLM calls made (or forecast) for this audit. */
  extractionCalls: number;
}

/**
 * Total audit cost in cents — the number audit-run writes to the ledger.
 * With AUDIT_COST_CENTS set, that flat number wins verbatim (including 0).
 * Otherwise: sum(generations x engine rate) + extraction calls x extraction
 * rate, rounded, with a 1c floor so a real audit never books as free.
 */
export function auditCostCents(input: AuditCostInput, env: CostEnv = process.env): number {
  const flat = flatAuditOverrideCents(env);
  if (flat !== null) return flat;
  const genCost = Object.entries(input.gensByEngine).reduce(
    (sum, [engine, gens]) => sum + gens * genRateCents(engine, env),
    0
  );
  return Math.max(1, Math.round(genCost + input.extractionCalls * extractionRateCents(env)));
}

export interface EngineCostLine {
  engine: string;
  generations: number;
  rateCents: number;
  cents: number;
}

export interface AuditCostEstimate {
  lines: EngineCostLine[];
  extractionCalls: number;
  extractionRateCents: number;
  extractionCents: number;
  totalCents: number;
  totalUsd: number;
  /** True when AUDIT_COST_CENTS replaced the arithmetic with a flat number. */
  flatOverride: boolean;
}

/**
 * Pre-flight forecast, itemised so a human can check it before approving.
 * `lines` is sorted by cost descending so the expensive engine is read first.
 */
export function estimateAuditCost(
  input: AuditCostInput,
  env: CostEnv = process.env
): AuditCostEstimate {
  const rate = extractionRateCents(env);
  const lines: EngineCostLine[] = Object.entries(input.gensByEngine)
    .map(([engine, generations]) => {
      const rateCents = genRateCents(engine, env);
      return { engine, generations, rateCents, cents: generations * rateCents };
    })
    .sort((a, b) => b.cents - a.cents || a.engine.localeCompare(b.engine));
  const totalCents = auditCostCents(input, env);
  return {
    lines,
    extractionCalls: input.extractionCalls,
    extractionRateCents: rate,
    extractionCents: input.extractionCalls * rate,
    totalCents,
    totalUsd: totalCents / 100,
    flatOverride: flatAuditOverrideCents(env) !== null,
  };
}

/**
 * Forecast a pack/audit run from its SHAPE (prompts x engines x runs) instead
 * of from responses that do not exist yet. `runsPerPrompt` is the base sampling
 * depth; escalation can add runs, so the caller should say the number is a
 * floor when it prints it.
 */
export function forecastAuditCost(
  shape: { prompts: number; engines: readonly string[]; runsPerPrompt: number },
  env: CostEnv = process.env
): AuditCostEstimate {
  const prompts = Math.max(0, Math.floor(shape.prompts));
  const runs = Math.max(1, Math.floor(shape.runsPerPrompt));
  const gensByEngine: Record<string, number> = {};
  for (const engine of shape.engines) gensByEngine[engine] = prompts * runs;
  const answers = prompts * shape.engines.length * runs;
  return estimateAuditCost(
    { gensByEngine, extractionCalls: answers * MAX_EXTRACTION_CALLS_PER_ANSWER },
    env
  );
}

/** "$0.80" — the one formatting of money these tools use. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
