/**
 * coverage-retry.ts — an audit measured on an incomplete panel does not stay
 * the week's data point (P1-07).
 *
 * WHAT HAPPENED (2026-09-07)
 * ---------------------------------------------------------------------------
 * The weekly scheduled audit ran with 4 of 5 engines: Gemini was held back by
 * the drift guard. Everything downstream behaved: the panel said "not
 * comparable", the coverage notice went out, the trend refused to draw the
 * point as comparable. And then nothing happened. Nobody re-ran it when Gemini
 * came back, so the week kept a point measured with a different ruler.
 *
 * Honest reporting of a hole is not the same as filling it.
 *
 * THE POLICY, and why each number is what it is
 * ---------------------------------------------------------------------------
 * An audit costs ~US$0.80. A repeat loop is therefore a money leak, so:
 *
 *   - ONE repeat is scheduled at a time, 24h later — long enough for a drift
 *     verdict to clear, short enough to stay inside the week.
 *   - At most COVERAGE_RETRY_MAX_ATTEMPTS (2) repeats per weekly slot. After
 *     that we stop and say why; we do not keep paying to be disappointed.
 *   - Only SCHEDULED runs. A person who triggered an audit is standing there
 *     and can press the button again; spending their money for them is not
 *     ours to decide.
 *   - Never when the next scheduled audit already lands inside the retry
 *     window (daily brands): that run re-measures anyway, for free.
 *   - The repeat only SPENDS when the panel is whole again. `panelReadyForRetry`
 *     is checked before probing, so a still-drifting engine costs nothing.
 *
 * When the panel never comes back, the reason is recorded on the original
 * audit and Delivery Health's `incomplete_panel_recovery` indicator goes amber
 * carrying it. Nothing degrades quietly.
 *
 * Pure module + injected ports: the worker supplies the real BullMQ queue and
 * the real UPDATE; the test supplies fakes.
 */

import { AUDIT_ROW_UNMARKABLE } from "./audit-queue";

/** 24h: long enough for a drift verdict to clear, short enough to stay in-week. */
export const COVERAGE_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

/** At most two automatic repeats per weekly slot. ~US$0.80 each. */
export const COVERAGE_RETRY_MAX_ATTEMPTS = 2;

export interface CoverageRetryInput {
  /** True only for cron-triggered runs. Manual runs never self-repeat. */
  scheduled: boolean;
  /** cov.comparable — was this run measured on the full comparison panel? */
  comparable: boolean;
  /** Engines we held back ourselves (drift guard). */
  paused: readonly string[];
  /** Engines we asked and got nothing from (key, quota, outage). */
  missing: readonly string[];
  /** Automatic repeats already made for this weekly slot (0 on the first run). */
  attemptsUsed: number;
  /**
   * Milliseconds until this brand's next scheduled audit, or null when it is
   * not monitored on a cadence. A daily brand re-measures inside the retry
   * window, so paying for a repeat would buy nothing.
   */
  nextScheduledInMs: number | null;
}

export type CoverageRetryDecision =
  | { action: "none"; reason: string }
  | { action: "retry"; attempt: number; delayMs: number; reason: string }
  | { action: "give_up"; reason: string };

/**
 * What gets written onto the ORIGINAL audit's breakdown.
 *
 * A `type` and not an `interface` on purpose: this value is handed straight to
 * postgres-js `sql.json()`, and only a type alias carries the implicit index
 * signature that its JSONValue parameter requires.
 */
export type CoverageRetryState = {
  /**
   * scheduled — a repeat is queued;
   * exhausted — we stopped trying and this is why;
   * recovered — a later run measured the full panel.
   */
  status: "scheduled" | "exhausted" | "recovered";
  attempt: number;
  /** Plain sentence. Read by the admin and by Delivery Health. */
  reason: string;
  /** The engines that made the panel incomplete. */
  engines: string[];
  at: string;
};

/** Renders the engines in a sentence without inventing any. */
function describeGap(paused: readonly string[], missing: readonly string[]): string {
  const parts: string[] = [];
  if (paused.length > 0) parts.push(`held back for drift: ${[...paused].sort().join(", ")}`);
  if (missing.length > 0) parts.push(`no answer: ${[...missing].sort().join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "the panel was not complete";
}

export function planCoverageRetry(i: CoverageRetryInput): CoverageRetryDecision {
  if (i.comparable) {
    return { action: "none", reason: "the full panel answered — nothing to repeat" };
  }
  if (!i.scheduled) {
    return {
      action: "none",
      reason: "a person triggered this run — repeating it is their call, not ours",
    };
  }

  const gap = describeGap(i.paused, i.missing);

  if (i.nextScheduledInMs !== null && i.nextScheduledInMs <= COVERAGE_RETRY_DELAY_MS) {
    return {
      action: "none",
      reason: `${gap} — the next scheduled audit lands inside the repeat window and re-measures it`,
    };
  }

  if (i.attemptsUsed >= COVERAGE_RETRY_MAX_ATTEMPTS) {
    return {
      action: "give_up",
      reason: `${gap} — ${COVERAGE_RETRY_MAX_ATTEMPTS} automatic repeats already used this week; this week's point stays flagged as not comparable`,
    };
  }

  const attempt = i.attemptsUsed + 1;
  return {
    action: "retry",
    attempt,
    delayMs: COVERAGE_RETRY_DELAY_MS,
    reason: `${gap} — repeating in 24h (attempt ${attempt} of ${COVERAGE_RETRY_MAX_ATTEMPTS}), and only if the full panel is back`,
  };
}

export interface PanelReadiness {
  ready: boolean;
  reason: string;
  /** Panel engines still unavailable right now. */
  blocking: string[];
}

/**
 * Checked by a repeat BEFORE it spends anything: is the panel whole again?
 * A repeat that probes a still-paused panel produces the same non-comparable
 * run and bills us ~US$0.80 for it.
 */
export function panelReadyForRetry(
  panel: readonly string[],
  pausedNow: readonly string[]
): PanelReadiness {
  const blocking = panel.filter((p) => pausedNow.includes(p)).sort();
  if (blocking.length === 0) {
    return { ready: true, reason: "the full panel is available", blocking: [] };
  }
  return {
    ready: false,
    reason: `still held back for drift: ${blocking.join(", ")}`,
    blocking,
  };
}

export interface CoverageRetryPorts {
  /** Queues the repeat. The worker passes BullMQ; the test passes a spy. */
  enqueue(job: { attempt: number; delayMs: number; originAuditId: string }): Promise<void>;
  /** Writes the state onto the ORIGINAL audit's breakdown. */
  record(state: CoverageRetryState): Promise<void>;
}

/**
 * Applies a decision through the ports. Returns the decision so the caller can
 * log it. Ports may throw — the caller decides how loudly to complain; this
 * module never swallows an error, because a repeat that was never queued while
 * the breakdown says "scheduled" is exactly the silent degradation we ban.
 */
export async function applyCoverageRetry(
  input: CoverageRetryInput,
  ports: CoverageRetryPorts,
  ctx: { originAuditId: string; now?: () => Date }
): Promise<CoverageRetryDecision> {
  const decision = planCoverageRetry(input);
  const at = (ctx.now ? ctx.now() : new Date()).toISOString();
  const engines = [...new Set([...input.paused, ...input.missing])].sort();

  if (decision.action === "retry") {
    // Queue FIRST: if the enqueue throws, nothing claims a repeat is coming.
    await ports.enqueue({
      attempt: decision.attempt,
      delayMs: decision.delayMs,
      originAuditId: ctx.originAuditId,
    });
    await ports.record({
      status: "scheduled",
      attempt: decision.attempt,
      reason: decision.reason,
      engines,
      at,
    });
  } else if (decision.action === "give_up") {
    await ports.record({
      status: "exhausted",
      attempt: input.attemptsUsed,
      reason: decision.reason,
      engines,
      at,
    });
  }

  return decision;
}

// ---------------------------------------------------------------------------
// An un-run audit row is MARKED, never deleted (2026-09-15).
//
// WHAT HAPPENED (15/09, 06:04 / 06:15 / 06:35 UTC)
// ---------------------------------------------------------------------------
// The repeat of the 14/09 audit found anthropic still held back for drift and
// correctly refused to probe (nothing spent). It then ran
// `DELETE FROM geo_audit WHERE id = …` to drop the un-run row — and the worker's
// database role has INSERT/SELECT/UPDATE on geo_audit, not DELETE. The job
// threw "permission denied", BullMQ retried it twice more, each attempt had
// already INSERTed its own row, and three audits stayed `running` for ever:
// the brand page said "Probing AI engines…", the manual re-run button answered
// AUDIT_ALREADY_RUNNING, no plan was generated, and the coverage-retry state
// was never recorded because the DELETE ran before it.
//
// The policy is unchanged. What changes is the bookkeeping:
//   - the un-run row is marked `failed` with a PROSE reason carrying a
//     machine-readable prefix (status has a CHECK on pending/running/complete/
//     failed, so there is no 'skipped' without a migration);
//   - the decision is RECORDED before the row is marked, so a mark that fails
//     never loses the retry state;
//   - a mark that fails is `audit_row_unmarkable`, a PERMANENT job failure:
//     one alert, no retry, no further rows.
// ---------------------------------------------------------------------------

/** error_message prefix of a repeat that did not probe because the panel was still incomplete. */
export const COVERAGE_RETRY_SKIPPED_PREFIX = "coverage_retry_skipped";
/** error_message prefix of a scheduled run not started because the plan's monthly ceiling was reached. */
export const MONTHLY_CAP_REACHED_PREFIX = "monthly_cap_reached";
/** Rows carrying these prefixes never probed: not audits that failed, audits that did not run. */
export const UNRUN_AUDIT_PREFIXES: readonly string[] = [
  COVERAGE_RETRY_SKIPPED_PREFIX,
  MONTHLY_CAP_REACHED_PREFIX,
];

export { AUDIT_ROW_UNMARKABLE };

/** Customer-visible (brand page shows error_message verbatim): prose, no raw runtime strings. */
export function coverageRetrySkippedMessage(blocking: readonly string[]): string {
  const who = [...blocking].sort().join(", ") || "an engine";
  return `${COVERAGE_RETRY_SKIPPED_PREFIX}: repeat not run — ${who} still held back for drift; nothing was probed or charged.`;
}

export function monthlyCapReachedMessage(i: { completed: number; cap: number; plan: string }): string {
  return `${MONTHLY_CAP_REACHED_PREFIX}: ${i.completed} of ${i.cap} audits already completed this month on the ${i.plan} plan — scheduled run not started; nothing was probed or charged.`;
}

/** True for a row that never probed (Delivery Health must not count it as a failed audit). */
export function isUnrunAuditMessage(message: string | null | undefined): boolean {
  if (typeof message !== "string") return false;
  const m = message.trimStart();
  return UNRUN_AUDIT_PREFIXES.some((p) => m.startsWith(`${p}:`));
}

export interface UnrunAuditPorts {
  /**
   * Durable record of the DECISION, first — e.g. queue the next repeat and
   * write the coverage-retry state on the ORIGINAL audit. May be a no-op.
   * A throw here is reported, not fatal: the row still gets marked.
   */
  record(): Promise<void>;
  /**
   * Marks THIS un-run row terminal: status='failed' + the prose reason.
   * Must be an UPDATE, never a DELETE. A throw here is fatal and PERMANENT.
   */
  mark(): Promise<void>;
}

export interface UnrunAuditOutcome {
  recorded: boolean;
  /** The record() error message when recorded is false; null otherwise. */
  recordError: string | null;
}

/**
 * Abandons an audit row that will not probe: record the decision, then mark
 * the row. Order matters — a mark that fails must not take the retry state
 * with it. A failed mark throws `audit_row_unmarkable: …`, which the queue
 * policy treats as permanent (no retry ⇒ no new zombie row).
 */
export async function abandonUnrunAudit(ports: UnrunAuditPorts): Promise<UnrunAuditOutcome> {
  let recorded = true;
  let recordError: string | null = null;
  try {
    await ports.record();
  } catch (err) {
    recorded = false;
    recordError = (err as Error)?.message ?? String(err);
  }
  try {
    await ports.mark();
  } catch (err) {
    throw new Error(`${AUDIT_ROW_UNMARKABLE}: ${(err as Error)?.message ?? String(err)}`);
  }
  return { recorded, recordError };
}
