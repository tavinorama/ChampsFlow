/**
 * plan-task-state.ts — the Verified Execution state machine for `plan_task`.
 *
 * WHY THIS EXISTS (audit P0-02, RELATORIO-AUDITORIA-COMPLETA-OZVOR.md §3.1/§5.2)
 * ---------------------------------------------------------------------------
 * Until now a client ticking a checkbox wrote `status = 'done'` straight to the
 * database (apps/api/src/routes/audits.ts:1946 before this change) and the
 * Execution % counted those rows (audits.ts:363). That made Execution a measure
 * of *declared activity*, not of execution. A brand with a failing audit could
 * — and did — show Execution 100.
 *
 * This module is the single source of truth for:
 *   1. which lifecycle states exist,
 *   2. which transitions are legal, and who may make them,
 *   3. which transitions require proof (artifact URL / evidence),
 *   4. which states count toward Verified Execution.
 *
 * It is deliberately PURE (no db, no io) so the rules can be tested directly
 * and so the API layer cannot accidentally route around them.
 *
 * The client can never reach VERIFIED. That is the whole point.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * The happy path, per RELATORIO §5.2:
 *   PROPOSED → DRAFTING → REVIEW → PUBLISHED → INDEXED → CITED → VERIFIED
 * Exits: REJECTED, BLOCKED, EXPIRED, REGRESSED.
 *
 * Four states exist outside that spine and are NOT part of it:
 *   - `accepted`                         legacy: "client agreed to do it".
 *   - `client_acknowledged`              client read it. No work claimed.
 *   - `manual_done_pending_verification` client says they did it. Unproven.
 *   - `legacy_self_reported`             pre-2026-09-03 `done` rows, backfilled.
 * None of them counts as execution.
 */
export const PLAN_TASK_STATES = [
  // spine
  "proposed",
  "drafting",
  "review",
  "published",
  "indexed",
  "cited",
  "verified",
  // exits
  "rejected",
  "blocked",
  "expired",
  "regressed",
  // client-reachable, unproven
  "accepted",
  "client_acknowledged",
  "manual_done_pending_verification",
  // backfill only — never a live transition target
  "legacy_self_reported",
] as const;

export type PlanTaskState = (typeof PLAN_TASK_STATES)[number];

/** Statuses the pre-P0-02 CHECK constraint allowed, minus `done`. */
export const LEGACY_PLAN_TASK_STATES: readonly PlanTaskState[] = [
  "proposed",
  "accepted",
  "rejected",
] as const;

/**
 * `done` no longer exists as a state. Callers that still send it (an old web
 * bundle in a cached browser tab) are mapped to the honest equivalent: the
 * client says it is done, and nothing has verified that.
 */
export const DONE_COMPAT_STATE: PlanTaskState = "manual_done_pending_verification";

/** Actors permitted to drive a transition. */
export type PlanTaskActor = "client" | "ozvor" | "system";

// ---------------------------------------------------------------------------
// Which states carry proof
// ---------------------------------------------------------------------------

/**
 * VERIFIED EXECUTION FORMULA — documented here, mirrored in the UI copy.
 *
 *   verifiedExecution = round(100 * verified / (all tasks except rejected+expired))
 *
 * Only `verified` counts. Not `published`, not `cited`, and emphatically not a
 * checkbox. `published`/`indexed`/`cited` are real progress and are reported
 * separately as `inFlight` so the client can see movement without the number
 * claiming an outcome the engines have not confirmed.
 */
export const VERIFIED_STATES: readonly PlanTaskState[] = ["verified"] as const;

/** Proof exists, outcome not yet confirmed by a re-probe. */
export const IN_FLIGHT_STATES: readonly PlanTaskState[] = [
  "published",
  "indexed",
  "cited",
] as const;

/** Work claimed with no proof attached. Counts as activity, never execution. */
export const SELF_REPORTED_STATES: readonly PlanTaskState[] = [
  "manual_done_pending_verification",
  "client_acknowledged",
  "legacy_self_reported",
] as const;

/** Excluded from the denominator: the client said no, or the window closed. */
export const NOT_OWED_STATES: readonly PlanTaskState[] = ["rejected", "expired"] as const;

/** States that still need someone to act. Drives "All caught up" (P0-01). */
export const OPEN_STATES: readonly PlanTaskState[] = [
  "proposed",
  "accepted",
  "drafting",
  "review",
  "blocked",
  "regressed",
  "client_acknowledged",
  "manual_done_pending_verification",
  "legacy_self_reported",
] as const;

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

export interface TransitionRule {
  /** Who may perform it. A client is never in the list for `verified`. */
  actors: readonly PlanTaskActor[];
  /** Requires a URL for the artifact that was produced/changed. */
  requiresArtifactUrl?: boolean;
  /** Requires an evidence string (what was observed, and where). */
  requiresEvidence?: boolean;
  /** Requires a human-readable reason (why it stopped / was refused). */
  requiresReason?: boolean;
}

const ANY: readonly PlanTaskActor[] = ["client", "ozvor", "system"];
const OPERATOR: readonly PlanTaskActor[] = ["ozvor", "system"];
/** Only the machine proves an outcome. Never a person, never the client. */
const MACHINE_ONLY: readonly PlanTaskActor[] = ["system"];

/**
 * from → to → rule. Anything absent is illegal.
 * Terminal-by-omission: `verified` only leaves via `regressed`.
 */
export const TRANSITIONS: Readonly<
  Partial<Record<PlanTaskState, Partial<Record<PlanTaskState, TransitionRule>>>>
> = {
  proposed: {
    accepted: { actors: ANY },
    client_acknowledged: { actors: ANY },
    manual_done_pending_verification: { actors: ANY },
    drafting: { actors: OPERATOR },
    rejected: { actors: ANY, requiresReason: true },
    blocked: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  accepted: {
    proposed: { actors: ANY },
    client_acknowledged: { actors: ANY },
    manual_done_pending_verification: { actors: ANY },
    drafting: { actors: OPERATOR },
    rejected: { actors: ANY, requiresReason: true },
    blocked: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  client_acknowledged: {
    accepted: { actors: ANY },
    manual_done_pending_verification: { actors: ANY },
    drafting: { actors: OPERATOR },
    rejected: { actors: ANY, requiresReason: true },
    blocked: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  manual_done_pending_verification: {
    // The client can undo their own claim.
    accepted: { actors: ANY },
    client_acknowledged: { actors: ANY },
    // An operator can pick the claim up and put real proof behind it.
    review: { actors: OPERATOR },
    published: { actors: OPERATOR, requiresArtifactUrl: true },
    rejected: { actors: ANY, requiresReason: true },
    blocked: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  legacy_self_reported: {
    // Same doors as any other unproven claim: it can be redone properly,
    // dropped, or re-opened. It can never walk straight into `verified`.
    accepted: { actors: ANY },
    client_acknowledged: { actors: ANY },
    manual_done_pending_verification: { actors: ANY },
    drafting: { actors: OPERATOR },
    review: { actors: OPERATOR },
    published: { actors: OPERATOR, requiresArtifactUrl: true },
    rejected: { actors: ANY, requiresReason: true },
    blocked: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  drafting: {
    review: { actors: OPERATOR },
    blocked: { actors: OPERATOR, requiresReason: true },
    rejected: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  review: {
    drafting: { actors: OPERATOR, requiresReason: true },
    published: { actors: OPERATOR, requiresArtifactUrl: true },
    blocked: { actors: OPERATOR, requiresReason: true },
    rejected: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  published: {
    indexed: { actors: MACHINE_ONLY, requiresEvidence: true },
    regressed: { actors: MACHINE_ONLY, requiresReason: true },
    blocked: { actors: OPERATOR, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  indexed: {
    cited: { actors: MACHINE_ONLY, requiresEvidence: true },
    regressed: { actors: MACHINE_ONLY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  cited: {
    verified: { actors: MACHINE_ONLY, requiresEvidence: true },
    regressed: { actors: MACHINE_ONLY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  verified: {
    // The only way out. Regression re-opens the work; history is appended,
    // never deleted (see plan_task_transition).
    regressed: { actors: MACHINE_ONLY, requiresReason: true },
  },
  regressed: {
    drafting: { actors: OPERATOR },
    review: { actors: OPERATOR },
    published: { actors: OPERATOR, requiresArtifactUrl: true },
    blocked: { actors: OPERATOR, requiresReason: true },
    rejected: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  blocked: {
    proposed: { actors: ANY },
    accepted: { actors: ANY },
    drafting: { actors: OPERATOR },
    rejected: { actors: ANY, requiresReason: true },
    expired: { actors: OPERATOR, requiresReason: true },
  },
  expired: {
    proposed: { actors: OPERATOR, requiresReason: true },
  },
  rejected: {
    // A client can change their mind. Nothing is lost either way.
    proposed: { actors: ANY },
    accepted: { actors: ANY },
  },
};

/**
 * The complete set of states a `client` actor can ever land a task in.
 * Guarded by a test — if someone widens the table so `verified` shows up here,
 * the suite fails.
 */
export const CLIENT_REACHABLE_STATES: readonly PlanTaskState[] = [
  "proposed",
  "accepted",
  "client_acknowledged",
  "manual_done_pending_verification",
  "rejected",
  "blocked",
] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TransitionRequest {
  from: PlanTaskState;
  to: PlanTaskState;
  actor: PlanTaskActor;
  artifactUrl?: string | null;
  evidence?: string | null;
  reason?: string | null;
}

export type TransitionRejection =
  | "unknown_state"
  | "illegal_transition"
  | "actor_not_permitted"
  | "artifact_url_required"
  | "evidence_required"
  | "reason_required"
  | "no_op";

export interface TransitionResult {
  ok: boolean;
  /** Present when ok === false. */
  code?: TransitionRejection;
  /** Client-safe explanation. Safe to render verbatim. */
  message?: string;
}

export function isPlanTaskState(value: unknown): value is PlanTaskState {
  return typeof value === "string" && (PLAN_TASK_STATES as readonly string[]).includes(value);
}

/**
 * normalizePlanTaskState — read-side coercion for rows written before this
 * change, or by a stale API pod mid-deploy.
 *
 *   'done'    → 'legacy_self_reported'   (a claim, never proof)
 *   unknown   → 'proposed'                (open work; never silently verified)
 *
 * Deliberately asymmetric: anything we cannot identify falls to the OPEN side,
 * never to the verified side. Unreadable data must cost us a number, not the
 * client's trust.
 */
export function normalizePlanTaskState(value: unknown): PlanTaskState {
  if (isPlanTaskState(value)) return value;
  if (value === "done") return "legacy_self_reported";
  return "proposed";
}

/**
 * The vector a client-authored to-do is filed under.
 *
 * Bug fixed in passing (discovery §1 D1.3): `POST /api/brands/:id/tasks`
 * inserted `vector = 'custom'`, which violates `plan_task_vector_check`
 * (brand|performance|ai) — so "Add your own to-do" failed 100% of the time.
 * Fixed in CODE rather than by widening the CHECK, so the button works before
 * any migration lands, and because 'custom' carries no vector meaning.
 * 'brand' is the honest bucket: work the client owns on their own presence.
 */
export const CLIENT_TODO_VECTOR = "brand";

const nonEmpty = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * validateTransition — the server-side gate. The client never decides this;
 * the API calls it with the actor derived from the session, not from the body.
 */
export function validateTransition(req: TransitionRequest): TransitionResult {
  if (!isPlanTaskState(req.from) || !isPlanTaskState(req.to)) {
    return { ok: false, code: "unknown_state", message: "Unknown task state." };
  }
  if (req.from === req.to) {
    return { ok: false, code: "no_op", message: "The task is already in that state." };
  }
  const rule = TRANSITIONS[req.from]?.[req.to];
  if (!rule) {
    return {
      ok: false,
      code: "illegal_transition",
      message: `A task cannot go from ${req.from} to ${req.to}.`,
    };
  }
  if (!rule.actors.includes(req.actor)) {
    // The headline case: a client trying to mark something verified.
    return {
      ok: false,
      code: "actor_not_permitted",
      message:
        req.to === "verified"
          ? "Verified is set by the next audit when it finds the proof — it cannot be set by hand."
          : `That change is not yours to make (${req.to}).`,
    };
  }
  if (rule.requiresArtifactUrl && !nonEmpty(req.artifactUrl)) {
    return {
      ok: false,
      code: "artifact_url_required",
      message: `Moving to ${req.to} needs the URL of what was published.`,
    };
  }
  if (rule.requiresEvidence && !nonEmpty(req.evidence)) {
    return {
      ok: false,
      code: "evidence_required",
      message: `Moving to ${req.to} needs the evidence that was observed.`,
    };
  }
  if (rule.requiresReason && !nonEmpty(req.reason)) {
    return {
      ok: false,
      code: "reason_required",
      message: `Moving to ${req.to} needs a reason.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Verified Execution
// ---------------------------------------------------------------------------

export interface ExecutionBreakdown {
  /**
   * Verified Execution %, 0–100. null when there is nothing to measure yet —
   * no tasks, or the denominator is empty. NEVER 0 for "we don't know":
   * absent data stays absent.
   */
  verifiedPct: number | null;
  /** Self-reported activity %, for the "why did my number change" copy. */
  selfReportedPct: number | null;
  /** Counts, for the UI to show its work. */
  counts: {
    total: number;
    denominator: number;
    verified: number;
    inFlight: number;
    selfReported: number;
    open: number;
    notOwed: number;
  };
}

/**
 * computeExecution — Verified Execution from a list of states.
 *
 * verifiedPct     = verified / (total − rejected − expired)
 * selfReportedPct = (verified + inFlight + selfReported) / same denominator
 *
 * The second number is what the product used to call "Execution". It is kept
 * so the UI can say, honestly and specifically, what changed and why.
 */
export function computeExecution(states: readonly PlanTaskState[]): ExecutionBreakdown {
  const count = (set: readonly PlanTaskState[]) =>
    states.filter((s) => set.includes(s)).length;

  const total = states.length;
  const notOwed = count(NOT_OWED_STATES);
  const denominator = total - notOwed;
  const verified = count(VERIFIED_STATES);
  const inFlight = count(IN_FLIGHT_STATES);
  const selfReported = count(SELF_REPORTED_STATES);
  const open = count(OPEN_STATES);

  const counts = { total, denominator, verified, inFlight, selfReported, open, notOwed };
  if (denominator <= 0) {
    return { verifiedPct: null, selfReportedPct: null, counts };
  }
  return {
    verifiedPct: Math.round((verified / denominator) * 100),
    selfReportedPct: Math.round(
      ((verified + inFlight + selfReported) / denominator) * 100
    ),
    counts,
  };
}
