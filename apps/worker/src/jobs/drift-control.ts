/**
 * BullMQ drift-control job — B4 daily anti-drift control battery (Ozvor)
 *
 * Queue: 'geo-drift'. Job payload: {} (platform-global, no tenant, no PII).
 *
 * What it does, once a day:
 *   1. Runs the control battery (packages/llm/src/drift-control.ts) against all
 *      5 engines: 4 positive controls (dominant brands every engine names) and
 *      3 negative controls (entities that do not exist).
 *   2. Evaluates each engine → healthy | degraded | failing.
 *   3. Writes one engine_drift_check row per engine (rates + PII-free detail).
 *   4. Marks failing engines as PAUSED for new audits: audit-run reads the
 *      latest verdict per engine before probing and drops the paused ones.
 *   5. Records the battery's estimated platform API cost in api_spend.
 *
 * Why pausing matters: an engine that hallucinates fictional companies is not
 * producing citations, it is producing fiction. Feeding that into a customer's
 * Visibility score would hand them a number we know is wrong. Better to run the
 * audit on 4 honest engines and say so than on 5 with one lying.
 *
 * Safety rails (each one is a lesson, not decoration):
 *   - If NO engine produced a usable answer, nothing is written and nothing is
 *     paused: that pattern means OUR side broke (keys, network, deploy), and
 *     recording "all 5 engines are failing" would be a lie that also disables
 *     the product.
 *   - The pause check is fail-open: a missing table, a DB error, or a stale
 *     verdict older than the freshness window never blocks an audit.
 *   - GEO_DRIFT_PAUSE=0 is the founder override: keep measuring and recording,
 *     stop acting on it.
 *
 * Hard rules: parameterized SQL only; no secrets in logs; no fabricated data —
 * when the battery cannot measure, it says so instead of guessing.
 */

import type { Job } from "bullmq";
import postgres from "postgres";
import { createHash } from "crypto";
import {
  runDriftBattery,
  evaluateDrift,
  driftControlEnabled,
  estimateDriftCostCents,
  runProbes,
  DRIFT_CONTROLS,
  DRIFT_THRESHOLDS,
  DRIFT_BATTERY_VERSION,
  GEO_METHODOLOGY_VERSION,
  type DriftBatteryOutcome,
  type DriftEngine,
  type DriftEvaluation,
  type DriftLLMCaller,
} from "../../../../packages/llm/src/index";
import { logger } from "../../../../packages/shared/src/logger";

/** The 5 engines under control. Gateway provider ids (see the migration note). */
export const DRIFT_ENGINES: DriftEngine[] = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serp",
];

/**
 * A verdict older than this is ignored by the pause check. If the battery
 * stopped running (worker down, flag off), a stale "failing" must not keep an
 * engine disabled forever — that would silently shrink every audit.
 */
const PAUSE_FRESHNESS_HOURS = 48;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Runs per (engine × control). GEO_DRIFT_RUNS tunes it; clamped 1–3 by cost. */
function driftRuns(): number {
  const raw = Number(process.env["GEO_DRIFT_RUNS"] ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(3, Math.floor(raw)));
}

/** GEO_DRIFT_PAUSE default ON; "0" keeps measuring but stops pausing engines. */
export function driftPauseEnabled(): boolean {
  return process.env["GEO_DRIFT_PAUSE"] !== "0";
}

/**
 * Engines the founder wants kept IN the panel even when the battery says they
 * are failing. Comma-separated, e.g. GEO_DRIFT_PAUSE_EXEMPT=serp.
 *
 * Why this exists rather than GEO_DRIFT_PAUSE=0: the blunt override switches
 * pausing off for EVERY engine, so keeping one questionable engine in the panel
 * would also mean losing the guard on the four that are fine. This narrows the
 * decision to the engine it is actually about.
 *
 * The trade it encodes is real, and it is the founder's to make. The product
 * sells "all 5 engines your buyers use", and a panel that silently drops to 4
 * breaks both that promise and week-to-week comparability. Against that: an
 * engine below the positive-control floor has measurably stopped naming brands
 * it should name, so its silence about a customer means less than it looks like.
 *
 * WHAT THIS MUST NEVER DO IS HIDE THE STATE. An exempt engine still gets
 * measured, still gets its verdict recorded, and now travels in coverage.degraded
 * so the customer is told the panel was complete but one member was unreliable.
 * Exempting from the PAUSE is a product decision; exempting from the DISCLOSURE
 * would be the thing this whole battery exists to prevent.
 */
export function pauseExemptEngines(): DriftEngine[] {
  const raw = process.env["GEO_DRIFT_PAUSE_EXEMPT"] ?? "";
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return DRIFT_ENGINES.filter((e) => wanted.includes(e));
}

// ---------------------------------------------------------------------------
// LLM caller — wires the battery to the real gateway (one engine per call, so
// the routing gate, retries and circuit breaker all still apply).
//
// Region 'US': the battery measures ENGINE BEHAVIOUR, not a tenant's data. Its
// prompts contain no personal data and no customer brand, so no EU restriction
// applies — and running the full 5 is the whole point of a control.
// ---------------------------------------------------------------------------
const gatewayCaller: DriftLLMCaller = async ({ engine, control }) => {
  const res = await runProbes(
    [
      {
        queryHash: sha256(control.prompt),
        queryText: control.prompt,
        brandName: control.entity,
      },
    ],
    { region: "US", requestedProviders: [engine], repeat: 1 }
  );
  return res.responses[0]?.rawText ?? null;
};

// ---------------------------------------------------------------------------
// processDriftControlJob
// ---------------------------------------------------------------------------

export interface DriftJobResult {
  skipped?: "flag_off" | "no_usable_responses";
  engines_checked: number;
  failing: string[];
  degraded: string[];
  cost_cents: number;
}

export async function processDriftControlJob(
  _job: Job<Record<string, never>> | undefined,
  sql: postgres.Sql,
  caller: DriftLLMCaller = gatewayCaller
): Promise<DriftJobResult> {
  if (!driftControlEnabled()) {
    logger.info("drift_battery_disabled", { flag: "GEO_DRIFT_CONTROL=0" });
    return { skipped: "flag_off", engines_checked: 0, failing: [], degraded: [], cost_cents: 0 };
  }

  const runs = driftRuns();
  const outcome = await runDriftBattery(DRIFT_ENGINES, caller, { runs });
  const evaluations = evaluateDrift(outcome);

  // Integrity guard: zero usable answers across ALL engines is our outage, not
  // engine drift. Record nothing, pause nothing.
  const anyUsable = outcome.results.some((r) => r.usableRuns > 0);
  if (!anyUsable) {
    logger.error("drift_battery_no_usable_responses", {
      engines: DRIFT_ENGINES.length,
      controls: DRIFT_CONTROLS.length,
      runs,
      note: "every control run errored or returned empty — treating this as OUR outage, not engine drift",
    });
    return {
      skipped: "no_usable_responses",
      engines_checked: 0,
      failing: [],
      degraded: [],
      cost_cents: 0,
    };
  }

  // Persist one row per engine. A single bad row must not lose the others.
  let written = 0;
  for (const evaluation of evaluations) {
    const detail = buildDetail(evaluation, outcome, runs);
    try {
      await sql`
        INSERT INTO engine_drift_check
          (checked_at, engine, positive_rate, negative_rate, status, detail, methodology_version)
        VALUES (
          ${outcome.checkedAt},
          ${evaluation.engine},
          ${evaluation.positive_rate},
          ${evaluation.negative_rate},
          ${evaluation.status},
          ${sql.json(detail)},
          ${GEO_METHODOLOGY_VERSION}
        )
      `;
      written += 1;
    } catch (err: unknown) {
      logger.error("drift_check_write_failed", {
        engine: evaluation.engine,
        message: (err as Error).message?.slice(0, 200),
      });
    }
  }

  const failing = evaluations.filter((e) => e.status === "failing").map((e) => e.engine);
  const degraded = evaluations.filter((e) => e.status === "degraded").map((e) => e.engine);

  // Record the battery's platform API spend (visibility only — never blocking).
  const costCents = estimateDriftCostCents(outcome.generations, outcome.verificationCalls);
  try {
    await sql`INSERT INTO api_spend (op, est_cost_cents) VALUES ('drift_control', ${costCents})`;
  } catch (err) {
    logger.warn("drift_spend_record_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  if (failing.length > 0) {
    logger.error("drift_engines_failing", {
      engines: failing.join(","),
      paused: driftPauseEnabled() ? "yes" : "no (GEO_DRIFT_PAUSE=0)",
    });
  }
  if (degraded.length > 0) {
    logger.warn("drift_engines_degraded", { engines: degraded.join(",") });
  }

  logger.info("drift_battery_completed", {
    engines_checked: written,
    generations: outcome.generations,
    runs,
    battery_version: DRIFT_BATTERY_VERSION,
    failing: failing.length,
    degraded: degraded.length,
    cost_cents: costCents,
  });

  return { engines_checked: written, failing, degraded, cost_cents: costCents };
}

/** PII-free detail jsonb: per-control counts + the reasons + thresholds used. */
function buildDetail(
  evaluation: DriftEvaluation,
  outcome: DriftBatteryOutcome,
  runs: number
): postgres.JSONValue {
  return {
    battery_version: outcome.batteryVersion,
    checked_at: outcome.checkedAt,
    runs_per_control: runs,
    reasons: evaluation.reasons,
    counts: evaluation.counts,
    thresholds: DRIFT_THRESHOLDS,
    controls: outcome.results
      .filter((r) => r.engine === evaluation.engine)
      .map((r) => ({
        id: r.controlId,
        kind: r.kind,
        runs: r.runs,
        usable: r.usableRuns,
        mentions: r.mentions,
        empty: r.emptyRuns,
        errors: r.errorRuns,
        rate: r.mentionRate,
      })),
  };
}

// ---------------------------------------------------------------------------
// Pause check — consumed by audit-run before it probes
// ---------------------------------------------------------------------------

/**
 * pausedDriftEngines — engines whose LATEST fresh verdict is 'failing'.
 *
 * Fail-open by design: table missing, DB error, flag off, or verdict older than
 * PAUSE_FRESHNESS_HOURS → empty list (no engine is dropped). An audit must
 * never break because the drift history is unavailable.
 */
export async function pausedDriftEngines(sql: postgres.Sql): Promise<DriftEngine[]> {
  const { paused } = await driftVerdicts(sql);
  return paused;
}

export interface DriftVerdicts {
  /** Failing AND not exempt — dropped from the panel before probing. */
  paused: DriftEngine[];
  /**
   * Failing but KEPT in the panel by GEO_DRIFT_PAUSE_EXEMPT. These probe
   * normally and their answers count, so the customer has to be told: a full
   * panel containing an engine we know is unreliable is a worse claim than an
   * incomplete one, if nobody says so.
   */
  degraded: DriftEngine[];
}

/**
 * The battery's latest fresh verdict, split by what we DO about it.
 *
 * Fail-open by design: table missing, DB error, flag off, or verdict older than
 * PAUSE_FRESHNESS_HOURS → nothing paused and nothing flagged. An audit must
 * never break because the drift history is unavailable.
 */
export async function driftVerdicts(sql: postgres.Sql): Promise<DriftVerdicts> {
  if (!driftControlEnabled() || !driftPauseEnabled()) return { paused: [], degraded: [] };

  try {
    const rows = await sql<Array<{ engine: string; status: string }>>`
      SELECT DISTINCT ON (engine) engine, status
        FROM engine_drift_check
       WHERE checked_at >= NOW() - make_interval(hours => ${PAUSE_FRESHNESS_HOURS})
       ORDER BY engine, checked_at DESC
    `;
    const failing = rows
      .filter((r) => r.status === "failing")
      .map((r) => r.engine as DriftEngine);
    const exempt = pauseExemptEngines();
    const paused = failing.filter((e) => !exempt.includes(e));
    const degraded = failing.filter((e) => exempt.includes(e));

    if (degraded.length > 0) {
      // Loud on purpose. Someone chose to keep a failing engine in the panel;
      // that choice should be visible in the logs on every audit, not just on
      // the day the env var was set.
      logger.warn("drift_engine_kept_despite_failing", {
        engines: degraded.join(","),
        via: "GEO_DRIFT_PAUSE_EXEMPT",
        effect: "engine probes normally; customer is told the panel is degraded",
      });
    }
    return { paused, degraded };
  } catch (err: unknown) {
    // Fail-open by design (a broken check must not pause engines), but never
    // silently: every failure is logged, table-missing included.
    logger.warn("drift_pause_check_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    return { paused: [], degraded: [] };
  }
}
