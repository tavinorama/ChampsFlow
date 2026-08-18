/**
 * nurture-cadence.ts — SINGLE source of truth for every nurture sequence:
 * name, number of steps, inter-step delays, chaining and purchase suppression.
 *
 * Read by:
 *   apps/api/src/routes/nurture.ts        (enrollNurture / suppressOnConversion)
 *   apps/api/src/routes/billing.ts        (webhook triggers)
 *   apps/api/src/routes/operator.ts       (Hermes-approved sequence list)
 *   apps/worker/src/jobs/nurture-send.ts  (poll / send / advance / chain)
 *   tests/unit/nurture-cadence.test.ts    (pins the founder rule)
 *
 * FOUNDER RULE (17/08/2026): every sequence is AGGRESSIVE. Step 1 goes out at
 * enrollment (0d), step 2 one day later, step 3 two days after that, step 4
 * two days after that. Nothing waits longer than two days. Sequences with
 * fewer steps take the prefix of that rule.
 *
 * DB CHECK constraint: nurture_enrollment.sequence is guarded by
 * nurture_enrollment_sequence_check. Names added here that the live DB does
 * not know yet make the INSERT fail with SQLSTATE 23514 — callers MUST treat
 * that as "log nurture_sequence_not_allowed + skip", never crash. The widening
 * SQL ships in a SEPARATE migration PR (founder-merged).
 */

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delay, in days, BEFORE each step: step1 = 0d, step2 = +1d, step3 = +2d, step4 = +2d. */
export const FOUNDER_CADENCE_DAYS: readonly number[] = [0, 1, 2, 2];

/** Same rule, in milliseconds. */
export const FOUNDER_CADENCE_MS: readonly number[] = FOUNDER_CADENCE_DAYS.map((d) => d * DAY_MS);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type NurtureSequence =
  | "free_to_kit"
  | "kit_to_growth"
  | "kit_to_dfy"
  | "credit_pack_bought"
  | "ai_audit_bought"
  | "pages_bought"
  | "book_to_dfy"
  | "subscriber_onboarding"
  | "ai_audit_to_full";
// ai_audit_to_full: defined by PR #479 (AI Audit $49 → OrganicPosts bundle,
// emails nurture-ai-audit-1/2 + trigger in the ai_audit_stack webhook branch).
// Registered HERE already so it inherits the 0d/+1d cadence the moment #479
// lands: on merge, delete #479's local AI_AUDIT_TO_FULL_STEPS / delay tables
// and route its two emails through dispatchEmail (nurture-send.ts).

export interface NurtureSequenceSpec {
  /** Number of emails in the sequence. */
  steps: number;
  /** Delay before step 1 at enrollment (always 0 under the founder rule). */
  enrollDelayMs: number;
  /**
   * Delay applied AFTER step i is sent, before step i+1 goes out.
   * Length = steps - 1. Index = the step that was just sent (0-based).
   */
  nextStepDelayMs: readonly number[];
  /** Human trigger description (kept in sync with docs/marketing/nurture-sequences.md). */
  trigger: string;
}

function spec(steps: number, trigger: string): NurtureSequenceSpec {
  return {
    steps,
    enrollDelayMs: FOUNDER_CADENCE_MS[0]!,
    nextStepDelayMs: FOUNDER_CADENCE_MS.slice(1, steps),
    trigger,
  };
}

export const NURTURE_SEQUENCES: Record<NurtureSequence, NurtureSequenceSpec> = {
  free_to_kit: spec(4, "free GEO test with marketing consent (products.ts)"),
  kit_to_growth: spec(3, "Stripe webhook: get_cited_kit paid (billing.ts)"),
  kit_to_dfy: spec(3, "worker chain: kit_to_growth completed without a subscription (nurture-send.ts)"),
  credit_pack_bought: spec(2, "Stripe webhook: credit_pack paid (billing.ts)"),
  ai_audit_bought: spec(3, "Stripe webhook: ai_audit_stack paid (billing.ts, PR #479 branch)"),
  pages_bought: spec(2, "Stripe webhook: ozvor_pages_site paid (billing.ts)"),
  book_to_dfy: spec(2, "/api/book/intake (pending PR) or operator enroll (operator.ts)"),
  subscriber_onboarding: spec(3, "Stripe webhook: growth/agency subscription checkout (billing.ts)"),
  ai_audit_to_full: spec(2, "Stripe webhook: ai_audit_stack paid → fulfillAiAuditOrder (PR #479, not on main yet)"),
};

export const ALL_NURTURE_SEQUENCES = Object.keys(NURTURE_SEQUENCES) as NurtureSequence[];

export function isNurtureSequence(value: string): value is NurtureSequence {
  return Object.prototype.hasOwnProperty.call(NURTURE_SEQUENCES, value);
}

/** Total steps for a sequence. */
export function nurtureTotalSteps(sequence: NurtureSequence): number {
  return NURTURE_SEQUENCES[sequence].steps;
}

/**
 * Delay to wait after `sentStep` (0-based) was sent, before the next step.
 * Falls back to the last founder rule value (2d) for out-of-range input so a
 * bad cursor never stalls or floods.
 */
export function nurtureNextStepDelayMs(sequence: NurtureSequence, sentStep: number): number {
  const table = NURTURE_SEQUENCES[sequence].nextStepDelayMs;
  return table[sentStep] ?? FOUNDER_CADENCE_MS[FOUNDER_CADENCE_MS.length - 1]!;
}

// ---------------------------------------------------------------------------
// Chaining: when a sequence completes without conversion, start the next rung.
// ---------------------------------------------------------------------------

/**
 * kit_to_growth → kit_to_dfy: the worker enrolls kit_to_dfy the moment the
 * last Growth email is sent, IF the buyer still has no paid subscription.
 * Chosen over "enroll both at once with +5d offset" because the chain adapts:
 * a Growth conversion during the first three emails means the DFY rung is
 * never started (suppressOnConversion also covers the race).
 */
export const NURTURE_CHAIN: Partial<Record<NurtureSequence, NurtureSequence>> = {
  kit_to_growth: "kit_to_dfy",
};

// ---------------------------------------------------------------------------
// Suppression on purchase: a higher rung kills the lower ones.
// ---------------------------------------------------------------------------

export type NurtureConversionKind =
  | "kit"
  | "credit_pack"
  | "pages"
  | "ai_audit"
  | "subscription"
  | "organicposts";

export const NURTURE_SUPPRESS_ON_CONVERSION: Record<NurtureConversionKind, readonly NurtureSequence[]> = {
  // $29 Kit: the free rung is done.
  kit: ["free_to_kit"],
  // $49 AI Audit: the free rung is done.
  ai_audit: ["free_to_kit"],
  // $99 Pages: the free rung is done.
  pages: ["free_to_kit"],
  // Credit pack = already a subscriber topping up: every pre-subscription rung is done.
  credit_pack: ["free_to_kit", "kit_to_growth", "kit_to_dfy"],
  // Growth / Agency subscription: every rung below a subscription is done.
  subscription: ["free_to_kit", "kit_to_growth", "kit_to_dfy", "pages_bought"],
  // OrganicPosts (DFY) engagement: everything selling something smaller is done.
  organicposts: [
    "free_to_kit",
    "kit_to_growth",
    "kit_to_dfy",
    "credit_pack_bought",
    "ai_audit_bought",
    "pages_bought",
    "book_to_dfy",
    "subscriber_onboarding",
    "ai_audit_to_full",
  ],
};

/** SQLSTATE for a CHECK-constraint violation (sequence name not yet allowed by the DB). */
export const PG_CHECK_VIOLATION = "23514";

export function isSequenceCheckViolation(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.code === PG_CHECK_VIOLATION) return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return msg.includes("nurture_enrollment_sequence_check");
}
