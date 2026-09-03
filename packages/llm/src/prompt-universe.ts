/**
 * prompt-universe.ts — P0-06: Prompt Universe v2.
 *
 * WHAT THIS REPLACES
 * ------------------
 * The pre-v2 default portfolio (packages/llm/src/prompt-portfolio.ts) asks
 * "What is the best <category> for small businesses?" and "Best <category> for
 * SMBs on a budget". For Ozvor's OWN workspace those questions do not describe
 * the category we compete in: nobody arrives at an AI-visibility product by
 * asking for the best SaaS for SMBs. Measuring against them produced a score
 * that moved with noise in a market we are not in.
 *
 * v2 keeps the portfolio idea and gives every prompt the metadata the audit
 * report (section 4, "Correcao metodologica") requires, plus three cohorts:
 *
 *   benchmark    frozen for 90 days — this is the cohort that carries the
 *                trend line. Freezing is the whole point: a trend is only a
 *                trend if the questions did not move under it.
 *   opportunity  rotating, derived from new signals, sources and competitors.
 *   customer     questions the customer approved.
 *
 * COMPOSITION IS CONFIGURABLE, NOT A LAW
 * --------------------------------------
 * The report suggests 60/20/20. That is a default, not a universal truth: an
 * agency tenant tracking 25 brands and a single local business do not want the
 * same split. DEFAULT_COHORT_MIX holds the 60/20/20; resolveCohortMix() takes
 * an override (per tenant/brand, or the OZVOR_COHORT_MIX env) and validates
 * it. The mix that was actually used is returned by composeUniverse() so the
 * caller can record it on the run — a composition nobody can read back is a
 * hidden methodology change.
 *
 * VERSIONING
 * ----------
 * PROMPT_UNIVERSE_VERSION identifies the SHAPE of the universe (schema +
 * default set). promptSetHash() identifies the exact texts probed in one run.
 * Two runs are only prompt-comparable when both match — see
 * apps/api/src/lib/methodology-comparability.ts, which turns those two facts
 * plus the engine set into the trend badge.
 *
 * Pure module: no I/O, no DB, no clock of its own (callers pass `now`). All
 * time-dependent behaviour is therefore testable without faking timers.
 *
 * No PII: prompts are synthetic category/brand questions (GEO-A2).
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Vocabulary — mirrors the CHECK constraints in migration
// 20260903000001_prompt_universe. Keep the two in sync: the DB is the
// authority, this list is the compile-time echo of it.
// ---------------------------------------------------------------------------

export const PROMPT_COHORTS = ["benchmark", "opportunity", "customer"] as const;
export type PromptCohort = (typeof PROMPT_COHORTS)[number];

export const PROMPT_INTENTS = [
  "discovery",
  "problem",
  "solution",
  "comparison",
  "trust",
  "local",
  "branded",
] as const;
export type PromptIntent = (typeof PROMPT_INTENTS)[number];

export const FUNNEL_STAGES = ["awareness", "consideration", "decision", "retention"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const OWNER_TYPES = ["ozvor", "client", "partner"] as const;
export type PromptOwnerType = (typeof OWNER_TYPES)[number];

/**
 * Version of the universe SHAPE (this schema + the shipped default sets).
 * Bumping it is a methodology event: it must be accompanied by a
 * docs/methodology-changelog.md entry and it makes new runs prompt-set
 * incomparable with older ones. That break is the intended behaviour.
 */
export const PROMPT_UNIVERSE_VERSION = "2.0";

// ---------------------------------------------------------------------------
// PromptDefinition
// ---------------------------------------------------------------------------

/**
 * Where a demand number came from. A number with no source is a number we
 * invented, so demandValue and demandSource travel together or not at all
 * (enforced here by the type and in the DB by audit_prompt_demand_source_chk).
 */
export interface PromptDemand {
  /** Observed demand: search volume, occurrence count, CRM hit count, … */
  value: number;
  /** Provenance, e.g. "gsc:2026-08", "dataforseo:volume", "crm:won-deals". */
  source: string;
}

export interface PromptDefinition {
  /** Stable id. For shipped defaults this is a slug; DB rows use their uuid. */
  id: string;
  text: string;

  cohort: PromptCohort;
  intent: PromptIntent;

  /** Vertical / subvertical this question belongs to. */
  vertical: string | null;
  /** ISO-3166-1 alpha-2 market. */
  market: string;
  /** BCP-47 locale the question is asked in. */
  locale: string;
  funnelStage: FunnelStage;

  /**
   * Demand evidence. NULL means "we have not measured demand for this
   * question" — which is a legitimate state and must never be read as zero
   * demand. Consumers that rank by demand must skip nulls, not coerce them.
   */
  demand: PromptDemand | null;

  /** Commercial value of winning this question, 0..1 relative scale. */
  businessValue: number;
  /** Composite relevance, 0..1. Below the gate's floor the prompt is refused. */
  relevanceScore: number;

  /**
   * Branded vs non-branded, EXPLICIT. There is no default: a question that
   * names the brand measures something structurally different from one that
   * does not, and guessing which is which corrupts the aggregate. `null` is
   * not allowed here — the quality gate is where "unclassified" is rejected.
   */
  branded: boolean;

  /** Brands we expect to win this question (used by share-of-voice). */
  expectedCompetitors: string[];

  /** Freshness window. ISO-8601. validUntil null = open-ended. */
  validFrom: string;
  validUntil: string | null;

  /** Definition version — bumped when the TEXT or its classification changes. */
  version: string;
  /** Who approved it. null = not yet approved (proposed state). */
  approvedBy: string | null;
  ownerType: PromptOwnerType;

  /** Soft archive. Non-null = retired; history is append-only, never deleted. */
  archivedAt: string | null;
  archivedReason: string | null;
}

// ---------------------------------------------------------------------------
// Cohort composition
// ---------------------------------------------------------------------------

export type CohortMix = Record<PromptCohort, number>;

/**
 * The report's suggested split. A DEFAULT, deliberately overridable — see the
 * module header. Never treat this as a universal truth about measurement.
 */
export const DEFAULT_COHORT_MIX: Readonly<CohortMix> = Object.freeze({
  benchmark: 0.6,
  opportunity: 0.2,
  customer: 0.2,
});

export interface CohortMixResolution {
  mix: CohortMix;
  /** Where the mix came from — recorded on the run alongside the scores. */
  source: "default" | "override";
  /** Non-fatal notes (e.g. "renormalised from 0.9 to 1.0"). */
  notes: string[];
}

/**
 * Resolve the cohort mix from an optional override.
 *
 * Rules:
 *  - a partial override fills the rest from the default, then renormalises;
 *  - negative or non-finite weights are rejected (throw) — a silently dropped
 *    weight would change the measurement without anyone noticing;
 *  - an all-zero override is rejected for the same reason;
 *  - weights that do not sum to 1 are renormalised, WITH a note. Renormalising
 *    quietly is how a 60/20/20 becomes a 75/25/0 that nobody can explain.
 */
export function resolveCohortMix(override?: Partial<CohortMix> | null): CohortMixResolution {
  const notes: string[] = [];
  if (!override || Object.keys(override).length === 0) {
    return { mix: { ...DEFAULT_COHORT_MIX }, source: "default", notes };
  }

  const merged: CohortMix = { ...DEFAULT_COHORT_MIX };
  for (const cohort of PROMPT_COHORTS) {
    const raw = override[cohort];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      throw new Error(
        `cohort_mix_invalid: ${cohort}=${String(raw)} — weights must be finite and >= 0`
      );
    }
    merged[cohort] = raw;
  }

  const total = PROMPT_COHORTS.reduce((s, c) => s + merged[c], 0);
  if (total <= 0) {
    throw new Error("cohort_mix_invalid: weights sum to 0 — no cohort would be probed");
  }
  if (Math.abs(total - 1) > 1e-9) {
    notes.push(`Cohort weights summed to ${round4(total)}; renormalised to 1.`);
    for (const c of PROMPT_COHORTS) merged[c] = merged[c] / total;
  }

  return { mix: merged, source: "override", notes };
}

/**
 * Parse a cohort mix from an env string like "benchmark=0.5,opportunity=0.3,
 * customer=0.2". Returns null for empty/absent input so callers fall through
 * to the default. Throws on malformed input rather than falling back — a typo
 * in an env var must not silently reshape the measurement.
 */
export function parseCohortMixEnv(raw: string | undefined | null): Partial<CohortMix> | null {
  if (!raw || !raw.trim()) return null;
  const out: Partial<CohortMix> = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (!k || v === undefined) throw new Error(`cohort_mix_env_malformed: "${part.trim()}"`);
    if (!(PROMPT_COHORTS as readonly string[]).includes(k)) {
      throw new Error(`cohort_mix_env_unknown_cohort: "${k}"`);
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`cohort_mix_env_not_a_number: "${part.trim()}"`);
    out[k as PromptCohort] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** How many prompts the run may probe (plan cap). */
  size: number;
  /** Cohort mix override. Omitted = DEFAULT_COHORT_MIX. */
  mix?: Partial<CohortMix> | null;
  /** ISO timestamp used for freshness filtering. Callers pass it — no clock here. */
  now: string;
}

export interface ComposedUniverse {
  prompts: PromptDefinition[];
  /** The mix actually applied, recorded so the run can carry it. */
  mix: CohortMix;
  mixSource: "default" | "override";
  /** Prompts per cohort actually selected (may fall short of quota). */
  counts: Record<PromptCohort, number>;
  /** Human notes: renormalisation, unmet quotas, cohorts with no supply. */
  notes: string[];
  /** Identity of this exact prompt set — see promptSetHash(). */
  setHash: string;
  version: string;
}

/**
 * Compose a run's prompt universe from a pool of definitions.
 *
 * Order of operations:
 *  1. drop archived prompts and prompts outside their freshness window;
 *  2. allocate `size` across cohorts by the resolved mix (largest remainder,
 *     so the quotas sum to exactly `size` without a rounding leak);
 *  3. within each cohort, take the highest-priority prompts, priority =
 *     relevanceScore * (0.5 + 0.5 * businessValue), tie-broken by id so the
 *     selection is deterministic (a run-to-run reshuffle would itself be an
 *     unlabelled prompt-set change);
 *  4. if a cohort cannot fill its quota, the shortfall is redistributed to the
 *     cohorts that can, AND a note says so. Silently shipping a 40/20/20 while
 *     the UI claims 60/20/20 is exactly the kind of hidden change this whole
 *     capability exists to end.
 *
 * Demand is deliberately NOT part of priority when it is null: an unmeasured
 * question is not a zero-demand question.
 */
export function composeUniverse(
  pool: readonly PromptDefinition[],
  opts: ComposeOptions
): ComposedUniverse {
  const notes: string[] = [];
  const { mix, source, notes: mixNotes } = resolveCohortMix(opts.mix);
  notes.push(...mixNotes);

  if (!Number.isInteger(opts.size) || opts.size < 0) {
    throw new Error(`compose_size_invalid: ${String(opts.size)} — must be a non-negative integer`);
  }

  const nowMs = Date.parse(opts.now);
  if (Number.isNaN(nowMs)) throw new Error(`compose_now_invalid: "${opts.now}"`);

  const live = pool.filter((p) => isLive(p, nowMs));
  const droppedArchived = pool.filter((p) => p.archivedAt !== null).length;
  const droppedStale = pool.length - live.length - droppedArchived;
  if (droppedArchived > 0) notes.push(`${droppedArchived} archived prompt(s) excluded.`);
  if (droppedStale > 0) notes.push(`${droppedStale} prompt(s) outside their freshness window.`);

  const byCohort = new Map<PromptCohort, PromptDefinition[]>();
  for (const c of PROMPT_COHORTS) byCohort.set(c, []);
  for (const p of live) byCohort.get(p.cohort)?.push(p);
  for (const c of PROMPT_COHORTS) byCohort.get(c)?.sort(byPriority);

  const quotas = largestRemainder(mix, opts.size);

  // First pass: take up to quota from each cohort.
  const chosen: PromptDefinition[] = [];
  const counts: Record<PromptCohort, number> = { benchmark: 0, opportunity: 0, customer: 0 };
  const leftovers: PromptDefinition[] = [];
  for (const c of PROMPT_COHORTS) {
    const available = byCohort.get(c) ?? [];
    const take = Math.min(quotas[c], available.length);
    chosen.push(...available.slice(0, take));
    counts[c] = take;
    leftovers.push(...available.slice(take));
    if (take < quotas[c]) {
      notes.push(
        `Cohort "${c}" could only supply ${take} of ${quotas[c]} slots — shortfall redistributed.`
      );
    }
  }

  // Second pass: redistribute the shortfall by global priority.
  const shortfall = opts.size - chosen.length;
  if (shortfall > 0 && leftovers.length > 0) {
    leftovers.sort(byPriority);
    for (const p of leftovers.slice(0, shortfall)) {
      chosen.push(p);
      counts[p.cohort] += 1;
    }
  }
  if (chosen.length < opts.size) {
    notes.push(`Universe supplied ${chosen.length} of ${opts.size} requested prompts.`);
  }

  // Stable output order: cohort order, then priority. Deterministic given the
  // same pool — the set hash below depends on the texts, not this order, but a
  // stable order keeps the UI and the probe log readable.
  const cohortRank: Record<PromptCohort, number> = { benchmark: 0, opportunity: 1, customer: 2 };
  chosen.sort((a, b) => cohortRank[a.cohort] - cohortRank[b.cohort] || byPriority(a, b));

  return {
    prompts: chosen,
    mix,
    mixSource: source,
    counts,
    notes,
    setHash: promptSetHash(chosen.map((p) => p.text)),
    version: PROMPT_UNIVERSE_VERSION,
  };
}

function isLive(p: PromptDefinition, nowMs: number): boolean {
  if (p.archivedAt !== null) return false;
  const from = Date.parse(p.validFrom);
  if (!Number.isNaN(from) && from > nowMs) return false;
  if (p.validUntil !== null) {
    const until = Date.parse(p.validUntil);
    if (!Number.isNaN(until) && until <= nowMs) return false;
  }
  return true;
}

export function promptPriority(p: PromptDefinition): number {
  return p.relevanceScore * (0.5 + 0.5 * p.businessValue);
}

function byPriority(a: PromptDefinition, b: PromptDefinition): number {
  const d = promptPriority(b) - promptPriority(a);
  if (Math.abs(d) > 1e-12) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Allocate `size` slots across cohorts by weight, using the largest-remainder
 * method so the quotas sum to exactly `size`. Plain rounding leaks or invents
 * a slot, and an invented slot is an unlabelled composition change.
 */
export function largestRemainder(mix: CohortMix, size: number): Record<PromptCohort, number> {
  const exact = PROMPT_COHORTS.map((c) => ({ c, v: mix[c] * size }));
  const out: Record<PromptCohort, number> = { benchmark: 0, opportunity: 0, customer: 0 };
  let used = 0;
  for (const { c, v } of exact) {
    out[c] = Math.floor(v);
    used += out[c];
  }
  const remainders = exact
    .map(({ c, v }) => ({ c, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || (a.c < b.c ? -1 : 1));
  let left = size - used;
  for (const { c } of remainders) {
    if (left <= 0) break;
    out[c] += 1;
    left -= 1;
  }
  return out;
}

/**
 * Identity of a prompt SET. Order-independent (the same questions asked in a
 * different order are the same measurement) and whitespace/case-normalised, so
 * a cosmetic edit does not fake a methodology break — while a real change of
 * question always does.
 */
export function promptSetHash(texts: readonly string[]): string {
  const norm = texts
    .map((t) => t.trim().replace(/\s+/g, " ").toLowerCase())
    .filter((t) => t.length > 0)
    .sort();
  return createHash("sha256").update(norm.join("\n")).digest("hex").slice(0, 32);
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
