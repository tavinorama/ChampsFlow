/**
 * drift-control.ts — B4 anti-drift control battery for the 5 AI engines
 *
 * THE PROBLEM
 * -----------
 * The engines change under us. A retrain, a policy change, a silent model swap
 * or a degraded API endpoint all move EVERY customer's score at once. Without a
 * reference measurement we cannot tell "this brand lost visibility" from "this
 * engine started answering differently today" — and that ambiguity destroys the
 * value of the historical series we sell.
 *
 * THE BATTERY
 * -----------
 * A small set of prompts whose correct answer we already know, run daily
 * against every engine:
 *
 *   POSITIVE CONTROLS — dominant brands any working engine names for an obvious
 *   question ("the most used search engine" → Google). Expected mention rate
 *   ≥ 0.90. A collapse here means the engine stopped naming brands it always
 *   named: retrieval broke, the surface changed, or answers got vaguer. Every
 *   customer's Visibility number moved for a reason that has nothing to do with
 *   the customer.
 *
 *   NEGATIVE CONTROLS — entities that DO NOT EXIST (invented names, deliberately
 *   improbable). Expected mention rate 0.00. If an engine confidently describes
 *   "Zylthorix Analytics", it is hallucinating, and every citation it produced
 *   that day is suspect — including the ones that made a customer look good.
 *
 * The battery is pure orchestration + arithmetic: no DB, no network of its own.
 * The caller injects the LLM caller (the worker wires it to the gateway), so
 * the whole module is unit-testable with zero network.
 *
 * MENTION DETECTION
 * -----------------
 * Uses the existing deterministic detector, parseCitation() — the same one the
 * audit path uses. That matters twice over: the control measures the SAME
 * pipeline the customer scores go through, and its no-knowledge guard makes the
 * negative controls honest (an engine that answers "I'm not familiar with
 * Zylthorix Analytics" is behaving correctly and must NOT be counted as a
 * hallucination).
 *
 * TODO(B3): when the two-pass extraction/verification layer (PR #379,
 * packages/llm/src/extraction.ts) merges, the battery must run its detection
 * through the VERIFIER rather than parseCitation directly — the control battery
 * has to measure exactly what the audit measures, otherwise a drift signal here
 * would not map to the scores customers see. Swap `detectMention()` below.
 *
 * Privacy: the prompts are synthetic category questions about public companies
 * and invented names. No tenant data, no personal data, no customer brand ever
 * enters the battery (LGPD/GDPR: nothing to minimise — there is no personal
 * data in the first place).
 */

import { parseCitation } from "./citation-parser";
import type { LLMProvider } from "./providers/types";

// ---------------------------------------------------------------------------
// Versioning + flag
// ---------------------------------------------------------------------------

/**
 * Battery version — stored on every engine_drift_check row. Bump whenever the
 * control set or the thresholds change: rows written under different versions
 * are NOT comparable, and the operator surface must be able to say so.
 */
export const DRIFT_BATTERY_VERSION = "1.0";

/**
 * GEO_DRIFT_CONTROL default ON; "0" disables the daily battery entirely
 * (no calls, no rows, no pausing). Same convention as GEO_PROBE_CACHE /
 * GEO_WEB_SEARCH.
 */
export function driftControlEnabled(): boolean {
  return process.env["GEO_DRIFT_CONTROL"] !== "0";
}

// ---------------------------------------------------------------------------
// Control definitions
// ---------------------------------------------------------------------------

export type DriftControlKind = "positive" | "negative";

export interface DriftControl {
  /** Stable id — persisted in engine_drift_check.detail; never renumber. */
  id: string;
  kind: DriftControlKind;
  /** The question sent to the engine. Synthetic, public-domain, no PII. */
  prompt: string;
  /** Human-readable entity the control is about. */
  entity: string;
  /**
   * Tokens that count as a mention of the entity. Multi-word invented names are
   * matched on their distinctive token too: an engine that hallucinates usually
   * shortens ("Zylthorix offers…"), and that still counts as a hallucination.
   */
  detectTerms: string[];
  /** Expected mention rate for a healthy engine (1 = always, 0 = never). */
  expected: number;
  /** Why this control is a valid reference point. */
  rationale: string;
}

/**
 * The battery. 4 positive + 3 negative controls = 7 prompts per engine.
 *
 * Positive controls are deliberately boring and near-monopolistic: they must
 * stay true for years, or the control itself becomes the drift. Negative
 * controls are invented names with no plausible real-world owner — checked to
 * be improbable letter combinations, not near-misses of real companies (a
 * near-miss would test typo tolerance, not hallucination).
 */
export const DRIFT_CONTROLS: readonly DriftControl[] = [
  {
    id: "pos_search_engine",
    kind: "positive",
    prompt: "What is the most used search engine in the world?",
    entity: "Google",
    detectTerms: ["Google"],
    expected: 1,
    rationale: "Google holds ~90% of global search. Any engine that fails to name it is not answering normally.",
  },
  {
    id: "pos_video_platform",
    kind: "positive",
    prompt: "What is the most popular video platform on the internet?",
    entity: "YouTube",
    detectTerms: ["YouTube"],
    expected: 1,
    rationale: "YouTube is the default answer for online video across every engine and every phrasing.",
  },
  {
    id: "pos_online_retailer",
    kind: "positive",
    prompt: "Which company is the biggest online retailer in the United States?",
    entity: "Amazon",
    detectTerms: ["Amazon"],
    expected: 1,
    rationale: "Amazon is the dominant US e-commerce answer; a miss signals a broken or heavily hedged surface.",
  },
  {
    id: "pos_encyclopedia",
    kind: "positive",
    prompt: "What is the largest online encyclopedia?",
    entity: "Wikipedia",
    detectTerms: ["Wikipedia"],
    expected: 1,
    rationale: "Wikipedia is both the answer and a core citation source for every AI surface we measure.",
  },
  {
    id: "neg_zylthorix",
    kind: "negative",
    prompt:
      "What is Zylthorix Analytics known for, and which industries does it serve?",
    entity: "Zylthorix Analytics",
    detectTerms: ["Zylthorix"],
    expected: 0,
    rationale: "Invented company. A described answer is a hallucination, not a citation.",
  },
  {
    id: "neg_brempaq",
    kind: "negative",
    prompt:
      "Where is Brempaq Logistics headquartered, and what services does it offer?",
    entity: "Brempaq Logistics",
    detectTerms: ["Brempaq"],
    expected: 0,
    rationale: "Invented company. Confident detail here means the engine fabricates entities on demand.",
  },
  {
    id: "neg_quovendil",
    kind: "negative",
    prompt:
      "Is Quovendil Softworks a good choice for small business accounting software?",
    entity: "Quovendil Softworks",
    detectTerms: ["Quovendil"],
    expected: 0,
    rationale:
      "Invented vendor inside a buying question — the exact shape of prompt our audits use, so it catches the hallucination mode that would inflate a customer's score.",
  },
] as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Status thresholds (inclusive boundaries are HEALTHY — a rate exactly ON the
 * line is not yet a problem; only crossing it is):
 *
 *   degraded : positive_rate < 0.75  OR  negative_rate > 0.10
 *   failing  : positive_rate < 0.50  OR  negative_rate > 0.25
 *
 * failing wins over degraded.
 */
export const DRIFT_THRESHOLDS = {
  positiveDegradedBelow: 0.75,
  positiveFailingBelow: 0.5,
  negativeDegradedAbove: 0.1,
  negativeFailingAbove: 0.25,
} as const;

/** Expected floor for a healthy positive control (documentation + reports). */
export const DRIFT_POSITIVE_EXPECTED_RATE = 0.9;

// ---------------------------------------------------------------------------
// Caller contract
// ---------------------------------------------------------------------------

/** The engines the battery runs against — the gateway's provider ids. */
export type DriftEngine = LLMProvider;

export interface DriftCallInput {
  engine: DriftEngine;
  control: DriftControl;
  /** 0-based run index when runs > 1. */
  runIndex: number;
}

/**
 * Injected LLM caller. Returns the engine's raw answer text.
 *
 * Contract: return the text, or null/"" when the engine produced nothing.
 * Throwing is allowed — the battery records the run as an error and keeps
 * going (one dead engine must never abort the battery for the other four).
 */
export type DriftLLMCaller = (input: DriftCallInput) => Promise<string | null | undefined>;

export interface RunDriftBatteryOptions {
  /** Runs per (engine × control). Default 1. Clamped 1–5 to bound cost. */
  runs?: number;
  /** Subset of controls (defaults to the full battery). */
  controls?: readonly DriftControl[];
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** One (engine × control) aggregate. */
export interface DriftControlResult {
  engine: DriftEngine;
  controlId: string;
  kind: DriftControlKind;
  /** Runs attempted (= options.runs). */
  runs: number;
  /** Runs that returned usable text (not empty, not errored). */
  usableRuns: number;
  /** Runs where the entity was mentioned (of the usable ones). */
  mentions: number;
  /** Runs that returned empty text. */
  emptyRuns: number;
  /** Runs that threw. */
  errorRuns: number;
  /** mentions / usableRuns, 4dp. 0 when nothing was usable. */
  mentionRate: number;
}

export interface DriftBatteryOutcome {
  results: DriftControlResult[];
  /** Total engine calls attempted — the cost basis. */
  generations: number;
  checkedAt: string;
  batteryVersion: string;
}

export type DriftStatus = "healthy" | "degraded" | "failing";

export interface DriftEvaluation {
  engine: DriftEngine;
  /** Share of positive-control runs where the dominant brand was named (4dp). */
  positive_rate: number;
  /** Share of negative-control runs where the fictional entity was described (4dp). */
  negative_rate: number;
  status: DriftStatus;
  /** Plain-language reasons. Empty array when healthy. */
  reasons: string[];
  /** Raw counts behind the two rates — persisted into detail jsonb. */
  counts: {
    positive_runs: number;
    positive_usable: number;
    positive_hits: number;
    negative_runs: number;
    negative_usable: number;
    negative_hits: number;
    empty_runs: number;
    error_runs: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 4dp so 3/4 compares as exactly 0.75 against the thresholds. */
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function ratio(hits: number, total: number): number {
  if (total <= 0) return 0;
  return round4(hits / total);
}

/**
 * detectMention — did this answer actually name the entity?
 *
 * Delegates to parseCitation (deterministic, whole-token matching, and it
 * discards "I'm not familiar with X" disclaimers — essential for the negative
 * controls). Any detectTerm hit counts.
 *
 * TODO(B3): route through the two-pass verifier from extraction.ts once #379
 * merges, so the battery measures the same extraction the audits use.
 */
export function detectMention(rawText: string, control: DriftControl): boolean {
  if (!rawText || rawText.trim().length === 0) return false;
  return control.detectTerms.some((term) => parseCitation(rawText, term).mentioned);
}

// ---------------------------------------------------------------------------
// runDriftBattery
// ---------------------------------------------------------------------------

/**
 * runDriftBattery — run every control against every engine.
 *
 * Sequential per engine (one call at a time) and engine-parallel, so a slow
 * provider does not serialise the whole battery while still keeping per-engine
 * rate-limit pressure low. Never throws: a caller error becomes an errored run.
 */
export async function runDriftBattery(
  engines: readonly DriftEngine[],
  llmCaller: DriftLLMCaller,
  opts: RunDriftBatteryOptions = {}
): Promise<DriftBatteryOutcome> {
  const runs = Math.max(1, Math.min(5, Math.floor(opts.runs ?? 1)));
  const controls = opts.controls ?? DRIFT_CONTROLS;
  const checkedAt = new Date().toISOString();

  const perEngine = await Promise.all(
    engines.map(async (engine): Promise<DriftControlResult[]> => {
      const out: DriftControlResult[] = [];
      for (const control of controls) {
        let usableRuns = 0;
        let mentions = 0;
        let emptyRuns = 0;
        let errorRuns = 0;

        for (let runIndex = 0; runIndex < runs; runIndex++) {
          let text: string | null | undefined;
          try {
            text = await llmCaller({ engine, control, runIndex });
          } catch {
            // One failed call is data, not a crash: an engine that errors all
            // day IS a drift event, and the evaluation says so honestly.
            errorRuns += 1;
            continue;
          }
          if (typeof text !== "string" || text.trim().length === 0) {
            emptyRuns += 1;
            continue;
          }
          usableRuns += 1;
          if (detectMention(text, control)) mentions += 1;
        }

        out.push({
          engine,
          controlId: control.id,
          kind: control.kind,
          runs,
          usableRuns,
          mentions,
          emptyRuns,
          errorRuns,
          mentionRate: ratio(mentions, usableRuns),
        });
      }
      return out;
    })
  );

  return {
    results: perEngine.flat(),
    generations: engines.length * controls.length * runs,
    checkedAt,
    batteryVersion: DRIFT_BATTERY_VERSION,
  };
}

// ---------------------------------------------------------------------------
// evaluateDrift
// ---------------------------------------------------------------------------

/**
 * evaluateDrift — turn raw control results into one verdict per engine.
 *
 * Rates are computed over USABLE runs (empty/errored runs are not evidence of
 * a mention or of a hallucination). An engine with no usable runs at all is
 * `failing`: we measured nothing, so nothing it produced today can be trusted.
 *
 * Accepts either the outcome object from runDriftBattery or a bare result array.
 */
export function evaluateDrift(
  input: DriftBatteryOutcome | readonly DriftControlResult[]
): DriftEvaluation[] {
  const results: readonly DriftControlResult[] = Array.isArray(input)
    ? (input as readonly DriftControlResult[])
    : (input as DriftBatteryOutcome).results;

  // Preserve first-seen engine order (stable output for the operator surface).
  const engines: DriftEngine[] = [];
  for (const r of results) if (!engines.includes(r.engine)) engines.push(r.engine);

  return engines.map((engine) => {
    const mine = results.filter((r) => r.engine === engine);
    const positives = mine.filter((r) => r.kind === "positive");
    const negatives = mine.filter((r) => r.kind === "negative");

    const sum = (rows: DriftControlResult[], pick: (r: DriftControlResult) => number): number =>
      rows.reduce((acc, r) => acc + pick(r), 0);

    const counts = {
      positive_runs: sum(positives, (r) => r.runs),
      positive_usable: sum(positives, (r) => r.usableRuns),
      positive_hits: sum(positives, (r) => r.mentions),
      negative_runs: sum(negatives, (r) => r.runs),
      negative_usable: sum(negatives, (r) => r.usableRuns),
      negative_hits: sum(negatives, (r) => r.mentions),
      empty_runs: sum(mine, (r) => r.emptyRuns),
      error_runs: sum(mine, (r) => r.errorRuns),
    };

    const positive_rate = ratio(counts.positive_hits, counts.positive_usable);
    const negative_rate = ratio(counts.negative_hits, counts.negative_usable);

    const reasons: string[] = [];
    let status: DriftStatus = "healthy";

    const totalUsable = counts.positive_usable + counts.negative_usable;
    if (totalUsable === 0) {
      status = "failing";
      reasons.push(
        `no usable answers: ${counts.error_runs} of ${counts.positive_runs + counts.negative_runs} control runs errored and ${counts.empty_runs} came back empty — this engine measured nothing today`
      );
      return { engine, positive_rate, negative_rate, status, reasons, counts };
    }

    // Positive side — did the engine stop naming brands it always named?
    // (`positive_runs === 0` means this battery had no positive controls at
    // all — a partial/custom run, not a verdict about the engine.)
    if (counts.positive_runs > 0 && counts.positive_usable === 0) {
      status = "failing";
      reasons.push(
        "no usable answers on the positive controls — the engine returned nothing for questions it always answers"
      );
    } else if (
      counts.positive_usable > 0 &&
      positive_rate < DRIFT_THRESHOLDS.positiveFailingBelow
    ) {
      status = "failing";
      reasons.push(
        `positive controls at ${positive_rate.toFixed(2)} (failing below ${DRIFT_THRESHOLDS.positiveFailingBelow.toFixed(2)}) — the engine stopped naming dominant brands for obvious questions`
      );
    } else if (
      counts.positive_usable > 0 &&
      positive_rate < DRIFT_THRESHOLDS.positiveDegradedBelow
    ) {
      status = "degraded";
      reasons.push(
        `positive controls at ${positive_rate.toFixed(2)} (floor ${DRIFT_THRESHOLDS.positiveDegradedBelow.toFixed(2)}) — the engine names known brands less often than it used to`
      );
    }

    // Negative side — is the engine inventing entities?
    if (counts.negative_usable > 0) {
      if (negative_rate > DRIFT_THRESHOLDS.negativeFailingAbove) {
        status = "failing";
        reasons.push(
          `negative controls at ${negative_rate.toFixed(2)} (failing above ${DRIFT_THRESHOLDS.negativeFailingAbove.toFixed(2)}) — the engine described entities that do not exist, so its citations today cannot be trusted`
        );
      } else if (negative_rate > DRIFT_THRESHOLDS.negativeDegradedAbove) {
        if (status !== "failing") status = "degraded";
        reasons.push(
          `negative controls at ${negative_rate.toFixed(2)} (ceiling ${DRIFT_THRESHOLDS.negativeDegradedAbove.toFixed(2)}) — the engine hallucinated a fictional entity`
        );
      }
    }

    if (counts.error_runs > 0 && status !== "healthy") {
      reasons.push(`${counts.error_runs} control run(s) errored`);
    }

    return { engine, positive_rate, negative_rate, status, reasons, counts };
  });
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * estimateDriftCostCents — estimated platform API spend for one battery run.
 *
 * Same basis as the audit ledger: a blended per-generation rate across the 5
 * search-enabled engines (~1.2¢ per prompt-round / engine, see audit-run).
 * DRIFT_COST_PER_GEN_CENTS tunes it. Returns whole cents (api_spend is INTEGER).
 */
export function estimateDriftCostCents(generations: number): number {
  const raw = Number(process.env["DRIFT_COST_PER_GEN_CENTS"] ?? 1.2);
  const perGen = Number.isFinite(raw) && raw > 0 ? raw : 1.2;
  return Math.max(0, Math.round(Math.max(0, generations) * perGen));
}
