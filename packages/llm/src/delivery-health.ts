/**
 * delivery-health.ts — Delivery Health (audit P0-09, RELATORIO §3.4 / §14).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The admin's System Health tab answers "are the APIs online?" — Postgres,
 * Redis, and the presence of env vars (apps/api/src/routes/admin.ts:888). That
 * panel stayed GREEN through delivery incidents in which clients received no
 * action at all, because none of its probes touches the delivery loop. A
 * provider returning 200 is not a customer receiving an action.
 *
 * This module is the OTHER half, side by side with infra — never replacing it.
 * It answers "are we delivering?" and it goes amber/red on exactly the triggers
 * the audit lists (RELATORIO:142-153):
 *
 *   - a tenant with a low score receives zero actions;
 *   - an audit finishes with no delta diagnosis;
 *   - an eligible draft is not generated;
 *   - a prompt passes with low relevance;
 *   - an entity stays ambiguous;
 *   - a task goes "done" with no URL/proof;
 *   - an action regression does not reopen the task;
 *   - the queue exceeds SLA;
 *   - a public comparison is unreviewed;
 *   - the score moves under a non-comparable method.
 *
 * THREE RULES BAKED INTO THE TYPES
 * ---------------------------------------------------------------------------
 * 1. VOCABULARY IS THE DRIFT VOCABULARY. `healthy | degraded | failing` is
 *    already the house language for a real quality control
 *    (packages/llm/src/drift-control.ts:294). Copying it means the admin has
 *    one word for one colour, not three dialects.
 *
 * 2. ABSENT DATA IS NEVER ZERO AND NEVER GREEN. `not_measured`,
 *    `not_connected` and `insufficient_evidence` are first-class states with
 *    their own colour. A metric we cannot compute is reported as uncomputed —
 *    it does not fall back to 0 (which reads as catastrophe) nor to healthy
 *    (which is the lie this whole workstream exists to stop). The rollup can
 *    NEVER be `healthy` while an indicator is unknown; see `rollupDelivery`.
 *
 * 3. NO METRIC WITHOUT A CONTRACT. Every indicator declares owner, source of
 *    truth, grain, timezone, what it includes and excludes, what happens to
 *    late data, and the name of the test that fails when it lies. The contract
 *    lives HERE, next to the arithmetic that uses it, not in a document that
 *    drifts away from the code. `assertContractsComplete()` is enforced by a
 *    unit test, so a future indicator cannot ship without its contract.
 *
 * Pure module: no I/O, no SQL, no LLM. apps/api/src/lib/delivery-health-read.ts
 * does the reading and hands observations in; tests exercise this directly.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Measured and inside/outside threshold — the drift-control vocabulary. */
export type DeliveryMeasuredStatus = "healthy" | "degraded" | "failing";

/**
 * Why an indicator carries no number. These are STATES, not errors:
 *   not_connected        — the source of truth is unreachable/absent for this
 *                          deployment (table missing, env var unset). Nothing
 *                          is wrong with delivery; we simply cannot see it.
 *   not_measured         — the source exists but this fact is not recorded yet
 *                          (e.g. prompt relevance has no column). Honest gap.
 *   insufficient_evidence— the source is connected and recording, but the
 *                          window holds fewer events than `minSample`. A rate
 *                          over 2 rows is noise wearing a percentage sign.
 */
export type DeliveryUnknownStatus = "not_connected" | "not_measured" | "insufficient_evidence";

export type DeliveryStatus = DeliveryMeasuredStatus | DeliveryUnknownStatus;

export const UNKNOWN_STATUSES: readonly DeliveryUnknownStatus[] = [
  "not_connected",
  "not_measured",
  "insufficient_evidence",
] as const;

export function isUnknownStatus(s: DeliveryStatus): s is DeliveryUnknownStatus {
  return (UNKNOWN_STATUSES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// The metric contract (rule 3)
// ---------------------------------------------------------------------------

/**
 * Which way is good. A rate of citations wants to be HIGH; a rate of leaked
 * stack traces wants to be LOW. Getting this backwards is the classic way a
 * dashboard turns a disaster green, so it is explicit per indicator and the
 * threshold comparison reads it rather than guessing from the name.
 */
export type MetricDirection = "higher_is_better" | "lower_is_better";

export interface MetricContract {
  id: DeliveryIndicatorId;
  /** Short label for the admin panel. */
  label: string;
  /** The delivery question this answers, in the founder's words. */
  question: string;
  /** Who is accountable when it goes red. A metric with no owner is a poster. */
  owner: string;
  /** The ONE place the number comes from. Table.column, or module. */
  sourceOfTruth: string;
  /** What one counted unit is (a row of what, per what). */
  grain: string;
  /** Everything here is UTC — the DB writes timestamptz and we never localise. */
  timezone: "UTC";
  /** Rolling window in days the number is computed over. */
  windowDays: number;
  /** What is counted. */
  includes: string;
  /** What is deliberately left out, and why. */
  excludes: string;
  /** What happens when a row lands after its window closed. */
  lateData: string;
  /** Name of the test that fails if this metric starts lying. */
  qualityTest: string;
  /** Below this many observations the number is `insufficient_evidence`. */
  minSample: number;
  direction: MetricDirection;
  /**
   * higher_is_better: value < degradedAt → degraded; value < failingAt → failing.
   * lower_is_better : value > degradedAt → degraded; value > failingAt → failing.
   * failing always wins over degraded.
   */
  degradedAt: number;
  failingAt: number;
  /** How to render the number. */
  unit: "rate" | "count" | "hours" | "minutes" | "seconds";
}

export const DELIVERY_INDICATOR_IDS = [
  "do_next_invariant",
  "recommendation_coverage",
  "useful_action_rate",
  "prompt_relevance_pass",
  "entity_false_positive_rate",
  "draft_generation_success",
  "draft_generation_time",
  "action_verification_rate",
  "regression_investigation_sla",
  "raw_error_leak",
  "comparable_trend_coverage",
  "queue_age",
  "failed_jobs",
] as const;

export type DeliveryIndicatorId = (typeof DELIVERY_INDICATOR_IDS)[number];

/**
 * The contracts. Thresholds are the audit's own SLOs where it states them and
 * otherwise the first honest number we are willing to be held to — they are
 * data, so moving one is a one-line diff with a test, not a refactor.
 */
export const DELIVERY_CONTRACTS: Readonly<Record<DeliveryIndicatorId, MetricContract>> = {
  /**
   * P0-01 — the invariant of RELATORIO §3.1, aggregated.
   *
   * It is deliberately the FIRST indicator: a green System Health while a
   * client stares at an empty fix list is the single failure this whole
   * workstream exists to stop. One brand out of a handful violating it drops
   * the rate under the failing threshold and the panel goes red; a single
   * violation in a large population still goes amber. Nothing measured here
   * can be "fine on average".
   */
  do_next_invariant: {
    id: "do_next_invariant",
    label: "Do Next invariant",
    question:
      "Does every brand with a material gap have an open action or an active investigation — or are we showing a problem with an empty fix list?",
    owner: "Engineering — Delivery policy (packages/llm/src/delivery-policy.ts)",
    sourceOfTruth:
      "geo_audit (latest complete audit per brand) × citation_check (lost prompts) × plan_task (open cards)",
    grain: "one brand with a completed audit in the window",
    timezone: "UTC",
    windowDays: 30,
    includes:
      "brands whose latest audit completed in the window; a brand carrying an open DELIVERY_LOOP_BROKEN investigation counts as NOT holding, because the investigation is the alarm, not the fix",
    excludes: "brands with no completed audit in the window — unaudited is not the same as underserved",
    lateData: "recomputed on read from the latest audit per brand",
    qualityTest:
      "tests/unit/delivery-health.test.ts › the Do Next invariant indicator goes red when a brand has a gap and no action (probe: tests/unit/delivery-health-read.test.ts)",
    minSample: 1,
    direction: "higher_is_better",
    degradedAt: 1,
    failingAt: 0.95,
    unit: "rate",
  },
  recommendation_coverage: {
    id: "recommendation_coverage",
    label: "Recommendation coverage",
    question: "Does every open gap carry an action, or are we showing problems with no way out?",
    owner: "Engineering — Visibility Loop (packages/llm/src/visibility-loop.ts)",
    sourceOfTruth: "plan_task (gap, action) for brands with a completed audit in the window",
    grain: "one open plan_task row per gap per brand",
    timezone: "UTC",
    windowDays: 30,
    includes: "open cards (proposed/accepted/drafting/review/…) created in the window",
    excludes: "rejected and expired cards — a gap we decided not to chase is not an uncovered gap",
    lateData: "recomputed on read; a card written after the window simply appears in the next read",
    qualityTest: "tests/unit/delivery-health.test.ts › recommendation coverage falls when a gap has no action",
    minSample: 5,
    direction: "higher_is_better",
    degradedAt: 0.95,
    failingAt: 0.8,
    unit: "rate",
  },
  useful_action_rate: {
    id: "useful_action_rate",
    label: "Useful action rate",
    question: "Is the action specific enough to do, and does it name how we will verify it?",
    owner: "Engineering — Visibility Loop",
    sourceOfTruth: "plan_task (evidence, metric) on open cards",
    grain: "one open plan_task row",
    timezone: "UTC",
    windowDays: 30,
    includes: "open cards that carry BOTH the evidence that triggered them and the metric that verifies them",
    excludes: "closed cards; client-authored to-dos (the client owes us no evidence)",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › a card with no evidence is not a useful action",
    minSample: 5,
    direction: "higher_is_better",
    degradedAt: 0.9,
    failingAt: 0.7,
    unit: "rate",
  },
  prompt_relevance_pass: {
    id: "prompt_relevance_pass",
    label: "Prompt relevance pass",
    question: "Are we probing questions this buyer would actually ask?",
    owner: "Engineering — prompt universe (packages/llm/src/prompt-portfolio.ts)",
    sourceOfTruth: "audit_prompt.intent_id — the intent-classification proxy until P0-06 records a relevance score",
    grain: "one audit_prompt row",
    timezone: "UTC",
    windowDays: 30,
    includes: "prompts attached to brands audited in the window; a prompt PASSES when it carries a classified intent (the strongest signal recorded today) — the panel says so, it does not pretend to score relevance",
    excludes: "nothing — a prompt with no intent is exactly the failure being counted",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › prompts with no intent do not pass relevance",
    minSample: 10,
    direction: "higher_is_better",
    degradedAt: 0.9,
    failingAt: 0.75,
    unit: "rate",
  },
  entity_false_positive_rate: {
    id: "entity_false_positive_rate",
    label: "Entity false positives",
    question: "Do the engines describe entities that do not exist — and do we count that as a citation?",
    owner: "Engineering — drift control (packages/llm/src/drift-control.ts)",
    sourceOfTruth: "engine_drift_check.negative_rate (share of runs where a fictional entity was described as real)",
    grain: "one daily battery row per engine",
    timezone: "UTC",
    windowDays: 7,
    includes: "the negative controls of the daily anti-drift battery, averaged across engines",
    excludes: "positive controls — those measure recall, not hallucination",
    lateData: "battery rows are append-only and timestamped; a late row lands in its own day",
    qualityTest: "tests/unit/delivery-health.test.ts › a hallucinating engine drives entity false positives red",
    minSample: 1,
    direction: "lower_is_better",
    degradedAt: 0.1,
    failingAt: 0.25,
    unit: "rate",
  },
  draft_generation_success: {
    id: "draft_generation_success",
    label: "Draft generation success",
    question: "When a client is owed a draft, does a draft appear?",
    owner: "Engineering — content studio",
    sourceOfTruth: "drafts.status (draft/approved/scheduled/published vs failed)",
    grain: "one drafts row",
    timezone: "UTC",
    windowDays: 30,
    includes: "drafts created in the window",
    excludes: "discarded drafts — a human threw those away, the machine did not fail",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › failed drafts drive draft success down",
    minSample: 3,
    direction: "higher_is_better",
    degradedAt: 0.95,
    failingAt: 0.8,
    unit: "rate",
  },
  draft_generation_time: {
    id: "draft_generation_time",
    label: "Draft generation time (p95)",
    question: "How long does the client wait for the draft they were promised?",
    owner: "Engineering — content studio",
    sourceOfTruth: "drafts.created_at → drafts.updated_at on drafts that reached a body",
    grain: "one drafts row, seconds",
    timezone: "UTC",
    windowDays: 30,
    includes: "drafts that produced a body in the window",
    excludes: "failed drafts (counted by draft_generation_success instead — a failure is not a slow success)",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › slow drafts are degraded, not healthy",
    minSample: 3,
    direction: "lower_is_better",
    degradedAt: 600,
    failingAt: 1800,
    unit: "seconds",
  },
  action_verification_rate: {
    id: "action_verification_rate",
    label: "Action verification rate",
    question: "Of the work claimed done, how much did WE verify instead of taking someone's word?",
    owner: "Engineering — Verified Execution (packages/llm/src/plan-task-state.ts)",
    sourceOfTruth: "computeExecution() over plan_task states (P0-02)",
    grain: "one plan_task row that claims completion",
    timezone: "UTC",
    windowDays: 30,
    includes: "verified ÷ (verified + self-reported + legacy self-reported)",
    excludes: "open and in-flight cards — nobody claimed those were done",
    lateData: "a card verified by a later audit moves the number on the next read; history is in plan_task_transition",
    qualityTest: "tests/unit/delivery-health.test.ts › self-reported completion does not count as verified",
    minSample: 3,
    direction: "higher_is_better",
    degradedAt: 0.6,
    failingAt: 0.3,
    unit: "rate",
  },
  regression_investigation_sla: {
    id: "regression_investigation_sla",
    label: "Regression investigation SLA",
    question: "When something that was working stops working, how long before anyone touches it?",
    owner: "CX + Engineering",
    sourceOfTruth: "plan_task rows in state 'regressed' — age of the OLDEST still-untouched one",
    grain: "hours since the regression was recorded, on the oldest untouched card",
    timezone: "UTC",
    windowDays: 30,
    includes: "cards the loop moved to 'regressed' and that nobody has since transitioned",
    excludes: "regressions already reopened (those are being worked)",
    lateData: "age is computed from the stored transition time, so a late read reports a larger age, never a smaller one",
    qualityTest: "tests/unit/delivery-health.test.ts › an untouched regression ages into red",
    minSample: 1,
    direction: "lower_is_better",
    degradedAt: 24,
    failingAt: 72,
    unit: "hours",
  },
  raw_error_leak: {
    id: "raw_error_leak",
    label: "Customer-visible raw errors",
    question: "Did a client see a stack trace, a provider error string, or a 5xx body?",
    owner: "Engineering",
    sourceOfTruth: "geo_audit.error_message on failed audits reachable from a customer surface",
    grain: "one failed audit whose error_message is a raw provider/runtime string",
    timezone: "UTC",
    windowDays: 7,
    includes: "failed audits whose stored message is not one of our written, human messages",
    excludes: "internal job failures never rendered to a client",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › one leaked raw error is already degraded",
    minSample: 0,
    direction: "lower_is_better",
    degradedAt: 0,
    failingAt: 3,
    unit: "count",
  },
  comparable_trend_coverage: {
    id: "comparable_trend_coverage",
    label: "Comparable trend coverage",
    question: "Are the points on the client's trend line measured the same way, or did the ruler change?",
    owner: "Engineering — trend comparability (apps/api/src/lib/trend-comparability.ts)",
    sourceOfTruth: "markComparableTrend() over geo_score/geo_audit runs",
    grain: "one audit run per brand",
    timezone: "UTC",
    windowDays: 30,
    includes: "runs in the window across all brands; in-trend ÷ total",
    excludes: "brands with a single run — there is no trend to be comparable with",
    lateData: "recomputed on read; the pinned panel can move, which is the point",
    qualityTest: "tests/unit/delivery-health.test.ts › a changed engine panel lowers comparable coverage",
    minSample: 4,
    direction: "higher_is_better",
    degradedAt: 0.8,
    failingAt: 0.6,
    unit: "rate",
  },
  queue_age: {
    id: "queue_age",
    label: "Queue age",
    question: "How long has the oldest unstarted audit been waiting?",
    owner: "Engineering — worker",
    sourceOfTruth: "geo_audit.created_at on rows still pending/running",
    grain: "minutes the oldest still-unfinished audit has been waiting",
    timezone: "UTC",
    windowDays: 7,
    includes: "audits in status pending or running",
    excludes: "complete and failed audits",
    lateData: "not applicable — this is an instantaneous reading, stamped with readAt",
    qualityTest: "tests/unit/delivery-health.test.ts › a stuck queue is failing, not healthy",
    minSample: 0,
    direction: "lower_is_better",
    degradedAt: 60,
    failingAt: 240,
    unit: "minutes",
  },
  failed_jobs: {
    id: "failed_jobs",
    label: "Failed jobs",
    question: "What share of audits ended in failure instead of a report?",
    owner: "Engineering — worker",
    sourceOfTruth: "geo_audit.status",
    grain: "one geo_audit row",
    timezone: "UTC",
    windowDays: 7,
    includes: "audits that reached a terminal state in the window: failed ÷ (failed + complete)",
    excludes: "audits still pending or running — those are counted by queue_age",
    lateData: "recomputed on read",
    qualityTest: "tests/unit/delivery-health.test.ts › a failing worker is not green",
    minSample: 3,
    direction: "lower_is_better",
    degradedAt: 0.05,
    failingAt: 0.15,
    unit: "rate",
  },
};

/**
 * Enforced by a unit test: every id in DELIVERY_INDICATOR_IDS has a contract,
 * every contract is complete, and no contract has thresholds pointing the wrong
 * way for its direction. A metric cannot ship without its contract.
 */
export function assertContractsComplete(): string[] {
  const problems: string[] = [];
  for (const id of DELIVERY_INDICATOR_IDS) {
    const c = DELIVERY_CONTRACTS[id];
    if (!c) {
      problems.push(`${id}: no contract`);
      continue;
    }
    if (c.id !== id) problems.push(`${id}: contract id mismatch (${c.id})`);
    const text: (keyof MetricContract)[] = [
      "label",
      "question",
      "owner",
      "sourceOfTruth",
      "grain",
      "includes",
      "excludes",
      "lateData",
      "qualityTest",
    ];
    for (const k of text) {
      const v = c[k];
      if (typeof v !== "string" || v.trim().length < 8) problems.push(`${id}: ${String(k)} missing`);
    }
    if (c.timezone !== "UTC") problems.push(`${id}: timezone must be UTC`);
    if (!(c.windowDays > 0)) problems.push(`${id}: windowDays must be positive`);
    if (c.direction === "higher_is_better" && !(c.failingAt < c.degradedAt)) {
      problems.push(`${id}: higher_is_better needs failingAt < degradedAt`);
    }
    if (c.direction === "lower_is_better" && !(c.failingAt > c.degradedAt)) {
      problems.push(`${id}: lower_is_better needs failingAt > degradedAt`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Observation → indicator
// ---------------------------------------------------------------------------

/**
 * What the reader hands in. `value === null` is NOT zero: it means the number
 * could not be produced, and `unknown` says which flavour of "could not".
 */
export interface DeliveryObservation {
  id: DeliveryIndicatorId;
  /** The measured number, or null when unknown. */
  value: number | null;
  /** How many units the number was computed over. Drives insufficient_evidence. */
  sample: number;
  /** Set when the value is null on purpose. Defaults to not_measured. */
  unknown?: DeliveryUnknownStatus;
  /** Human sentence shown next to the indicator. Required when unknown. */
  detail?: string;
}

export interface DeliveryIndicator {
  id: DeliveryIndicatorId;
  label: string;
  status: DeliveryStatus;
  /** null whenever status is one of the unknown states. Never coerced to 0. */
  value: number | null;
  sample: number;
  unit: MetricContract["unit"];
  direction: MetricDirection;
  degradedAt: number;
  failingAt: number;
  /** Why it is amber/red, or why there is no number. Empty when healthy. */
  reason: string | null;
  contract: MetricContract;
}

/** Rounds rates to 4dp like drift-control does; leaves counts/durations alone. */
const round = (n: number, unit: MetricContract["unit"]): number =>
  unit === "rate" ? Math.round(n * 10000) / 10000 : Math.round(n * 100) / 100;

export function evaluateIndicator(obs: DeliveryObservation): DeliveryIndicator {
  const contract = DELIVERY_CONTRACTS[obs.id];
  const base = {
    id: contract.id,
    label: contract.label,
    unit: contract.unit,
    direction: contract.direction,
    degradedAt: contract.degradedAt,
    failingAt: contract.failingAt,
    contract,
  };

  // Explicitly unknown, or a null value: NEVER a zero, never green.
  if (obs.value === null || obs.unknown) {
    const status: DeliveryUnknownStatus = obs.unknown ?? "not_measured";
    return {
      ...base,
      status,
      value: null,
      sample: obs.sample,
      reason: obs.detail ?? defaultUnknownReason(status, contract),
    };
  }

  if (!Number.isFinite(obs.value)) {
    return {
      ...base,
      status: "not_measured",
      value: null,
      sample: obs.sample,
      reason: "the source produced a non-finite number — reported as not measured, not as zero",
    };
  }

  if (obs.sample < contract.minSample) {
    return {
      ...base,
      status: "insufficient_evidence",
      value: null,
      sample: obs.sample,
      reason: `${obs.sample} of the ${contract.minSample} observations this metric needs (${contract.grain})`,
    };
  }

  const v = round(obs.value, contract.unit);
  const failing =
    contract.direction === "higher_is_better" ? v < contract.failingAt : v > contract.failingAt;
  const degraded =
    contract.direction === "higher_is_better" ? v < contract.degradedAt : v > contract.degradedAt;

  // failing wins over degraded (drift-control rule).
  const status: DeliveryMeasuredStatus = failing ? "failing" : degraded ? "degraded" : "healthy";
  const cmp = contract.direction === "higher_is_better" ? "below" : "above";
  const threshold = failing ? contract.failingAt : contract.degradedAt;

  return {
    ...base,
    status,
    value: v,
    sample: obs.sample,
    reason: status === "healthy" ? null : `${format(v, contract.unit)} — ${cmp} the ${status} threshold of ${format(threshold, contract.unit)}`,
  };
}

function defaultUnknownReason(status: DeliveryUnknownStatus, c: MetricContract): string {
  switch (status) {
    case "not_connected":
      return `source of truth not reachable in this deployment (${c.sourceOfTruth})`;
    case "insufficient_evidence":
      return `fewer than ${c.minSample} observations (${c.grain})`;
    default:
      return `not recorded yet — ${c.sourceOfTruth} does not carry this fact`;
  }
}

export function format(v: number, unit: MetricContract["unit"]): string {
  switch (unit) {
    case "rate":
      return `${Math.round(v * 1000) / 10}%`;
    case "count":
      return String(v);
    case "hours":
      return `${v}h`;
    case "minutes":
      return `${v}min`;
    case "seconds":
      return `${v}s`;
  }
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

export interface DeliveryRollup {
  /**
   * The single colour of the delivery loop.
   * NOTE the asymmetry, and it is deliberate: any failing indicator (or a
   * failing canary) makes the whole thing `failing`; an unknown indicator can
   * NEVER leave it `healthy`. Green here has to mean "measured, and inside
   * threshold, on every single one".
   */
  status: DeliveryStatus;
  indicators: DeliveryIndicator[];
  /** One sentence per problem, ready to render as attention flags. */
  reasons: string[];
  counts: Record<DeliveryStatus, number>;
  /** UTC instant this rollup was computed. */
  readAt: string;
}

export interface CanarySummaryForRollup {
  status: DeliveryStatus;
  version: string;
  /** Sentences describing the failing/unknown canary checks. */
  reasons: string[];
}

export function rollupDelivery(
  indicators: DeliveryIndicator[],
  canary: CanarySummaryForRollup | null,
  readAt: string
): DeliveryRollup {
  const counts: Record<DeliveryStatus, number> = {
    healthy: 0,
    degraded: 0,
    failing: 0,
    not_connected: 0,
    not_measured: 0,
    insufficient_evidence: 0,
  };
  const reasons: string[] = [];

  for (const ind of indicators) {
    counts[ind.status] += 1;
    if (ind.status !== "healthy" && ind.reason) {
      reasons.push(`${ind.label}: ${ind.reason}`);
    }
  }

  if (canary) {
    counts[canary.status] += 1;
    for (const r of canary.reasons) reasons.push(`Canary ${canary.version}: ${r}`);
  }

  let status: DeliveryStatus;
  if (counts.failing > 0) {
    status = "failing";
  } else if (counts.degraded > 0) {
    status = "degraded";
  } else if (counts.not_connected > 0) {
    // Nothing is known to be broken, but we are blind. Blind is not green.
    status = "not_connected";
  } else if (counts.not_measured > 0) {
    status = "not_measured";
  } else if (counts.insufficient_evidence > 0) {
    status = "insufficient_evidence";
  } else {
    status = "healthy";
  }

  return { status, indicators, reasons, counts, readAt };
}

/**
 * The colour the admin paints. Unknown states are AMBER, never green and never
 * red: "we cannot see" is a real, different thing from "it is broken".
 */
export function deliveryColor(s: DeliveryStatus): "green" | "amber" | "red" {
  if (s === "healthy") return "green";
  if (s === "failing") return "red";
  return "amber";
}

// ---------------------------------------------------------------------------
// Raw-error leakage (the `raw_error_leak` indicator's classifier)
// ---------------------------------------------------------------------------

/**
 * Does this stored failure message read like something a machine wrote at a
 * customer? We write plain sentences; providers and runtimes write these.
 *
 * Deliberately conservative: a false negative costs us one uncounted leak, a
 * false positive puts a permanent amber on the panel and teaches the founder
 * to ignore it. Pure and exported so it is tested rather than trusted.
 */
export const RAW_ERROR_SIGNATURES: readonly RegExp[] = [
  /\bat\s+\w+[.\w]*\s*\(.*:\d+:\d+\)/,        // stack frame
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
  /\bECONN(REFUSED|RESET|ABORTED)\b|\bETIMEDOUT\b|\bENOTFOUND\b|\bEAI_AGAIN\b/,
  /\berror code\s*[:=]?\s*\d{3,}/i,
  /\b(?:status|http)\s*[:=]?\s*(?:4\d{2}|5\d{2})\b/i,
  /^\s*[{[]/,                                       // a raw JSON body
  /\b(?:PG|SQLSTATE)\s*\d{5}\b|\brelation "[^"]+" does not exist/i,
  /\bundefined is not a\b|\bcannot read propert(?:y|ies)\b/i,
  /\bTraceback \(most recent call last\)/,
];

export function looksLikeRawError(message: string | null | undefined): boolean {
  if (typeof message !== "string") return false;
  const m = message.trim();
  if (m.length === 0) return false;
  return RAW_ERROR_SIGNATURES.some((re) => re.test(m));
}
