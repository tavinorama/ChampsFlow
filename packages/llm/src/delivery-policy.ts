/**
 * delivery-policy.ts — the ONE policy that decides whether a client may be
 * told "All caught up" (audit P0-01, RELATORIO-AUDITORIA-COMPLETA-OZVOR.md
 * §3.1 lines 100–110, §16 P0-01).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * #574 put the Do Next generator back on the audit path, and the dashboard
 * already refuses to say "all caught up" while claims are unchecked. But the
 * generator itself is FAIL-SOFT: apps/worker/src/jobs/audit-run.ts wraps the
 * whole block in try/catch, logs `visibility_loop_failed`, and the audit
 * reports success. A brand whose loop threw on every run shows zero open cards
 * and a cheerful empty state — the exact photograph in the report, reached by
 * a different road. That is the house rule "nada degrada calado" broken on the
 * new path.
 *
 * So the invariant lives HERE, once, as data, and three consumers read it:
 *   1. the worker (opens an investigation card when it is violated),
 *   2. Delivery Health / #591 (the `do_next_invariant` indicator turns amber
 *      or red — System Health cannot stay green while the loop is broken),
 *   3. the client dashboard (an honest sentence, never "all caught up").
 *
 * THE INVARIANT, verbatim from RELATORIO §3.1:
 *
 *   if visibility < target
 *      or lost_intent_count > 0
 *      or critical_profile_missing
 *   then open_action_count > 0
 *      or active_investigation != null
 *
 * TWO RULES BAKED INTO THE TYPES
 * ---------------------------------------------------------------------------
 * 1. ABSENT DATA IS NEVER ZERO, AND NEVER GREEN. `visibilityScore: null` does
 *    not mean 0 and does not mean "fine". It means we cannot prove the client
 *    is caught up, so `mayShowAllCaughtUp` is false and, with no open action
 *    and no investigation, the verdict is DELIVERY_LOOP_BROKEN. Being blind is
 *    a delivery failure, not a clean slate.
 *
 * 2. THE TARGET IS CONFIGURATION, NOT A CONSTANT IN A BRANCH. There was no
 *    visibility target anywhere in the codebase (rg: only prose "target: >50%"
 *    in strategy-generator.ts). `resolveVisibilityTarget` reads
 *    OZVOR_VISIBILITY_TARGET, then a per-brand override, and documents the
 *    default it fell back to — the verdict always says which source it used.
 *
 * Pure module: no I/O, no SQL, no LLM.
 */

/** The single code the whole company uses for this failure. */
export const DELIVERY_LOOP_BROKEN = "DELIVERY_LOOP_BROKEN" as const;

export type DoNextVerdictCode = "OK" | typeof DELIVERY_LOOP_BROKEN;

/**
 * DEFAULT VISIBILITY TARGET — 50 (percent of probed buyer prompts that cite
 * the brand).
 *
 * Where the number comes from: it is the target the product has already been
 * promising clients in the GEO plan since C3 —
 * packages/llm/src/strategy-generator.ts:136 writes
 * "Citation rate across buyer prompts (current: N% → target: >50%)". Making
 * the policy disagree with the plan we hand the client would be a second lie,
 * so the default is that same 50 until the founder sets another.
 *
 * Override with OZVOR_VISIBILITY_TARGET (0–100) or per brand.
 */
export const DEFAULT_VISIBILITY_TARGET = 50;

export const VISIBILITY_TARGET_ENV = "OZVOR_VISIBILITY_TARGET";

export interface VisibilityTarget {
  value: number;
  /** Which configuration answered — shown in the verdict so it is auditable. */
  source: "brand" | "env" | "default";
  /** Set when a configured value was present but unusable. Never swallowed. */
  invalidValue?: string;
}

/**
 * Resolve the target the invariant compares against.
 *
 * An unusable configured value does NOT fall through silently: the default is
 * used and `invalidValue` records what was rejected, so the caller can log it.
 */
export function resolveVisibilityTarget(
  env: Record<string, string | undefined> = {},
  brandTarget?: number | null
): VisibilityTarget {
  if (typeof brandTarget === "number" && Number.isFinite(brandTarget) && brandTarget >= 0 && brandTarget <= 100) {
    return { value: brandTarget, source: "brand" };
  }
  const raw = env[VISIBILITY_TARGET_ENV];
  if (raw !== undefined && String(raw).trim() !== "") {
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n >= 0 && n <= 100) return { value: n, source: "env" };
    return { value: DEFAULT_VISIBILITY_TARGET, source: "default", invalidValue: String(raw).slice(0, 40) };
  }
  return { value: DEFAULT_VISIBILITY_TARGET, source: "default" };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Why the last Do Next generation is or is not trustworthy. */
export type LoopGenerationStatus =
  /** The generator ran and wrote cards. */
  | "ok"
  /** It threw. The fail-soft catch in audit-run.ts. */
  | "failed"
  /** It ran but had no probe evidence to work from. */
  | "no_evidence"
  /** It has not run for this brand at all (or not since the last audit). */
  | "never_ran";

export interface DoNextPolicyInput {
  brandId: string;
  auditId: string | null;
  /**
   * The AI visibility score of the latest completed audit, 0–100.
   * null = not measured. NEVER pass 0 for "unknown".
   */
  visibilityScore: number | null;
  target: VisibilityTarget;
  /**
   * Prompts probed in the latest audit where the brand was not cited.
   * null = the count could not be read (again: not zero).
   */
  lostIntentCount: number | null;
  /** A profile the audit deems critical (GBP, Organization schema…) is absent. */
  criticalProfileMissing: boolean;
  /** Open plan_task rows for the brand (OPEN_STATES, see plan-task-state.ts). */
  openActionCount: number;
  /** An investigation card is already open for this brand. */
  activeInvestigation: boolean;
  /** Outcome of the last Do Next generation, with its instant. */
  loopGeneration: { status: LoopGenerationStatus; at: string | null; detail?: string | null };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A plan_task row, in the shape the worker inserts. No new table needed. */
export interface InvestigationCard {
  /** Stable key: re-running the audit REFRESHES this card, never duplicates it. */
  gap: string;
  vector: "ai";
  action: string;
  evidence: string;
  metric: string;
  owner: "platform";
  effort: "medium";
  impact: "high";
  priority: number;
}

export interface DoNextPolicyVerdict {
  code: DoNextVerdictCode;
  /** True when the invariant's left-hand side fired (a gap the client can feel). */
  materialGap: boolean;
  /** True when a material gap could not be evaluated because data is missing. */
  materialGapUnknown: boolean;
  /** One sentence per reason, in the order the invariant lists them. */
  reasons: string[];
  /**
   * FALSE whenever anything is unproven. The dashboard may only render the
   * celebratory empty state when this is true.
   */
  mayShowAllCaughtUp: boolean;
  /** What the client is told. Never "all caught up" unless it is true. */
  clientMessage: string;
  /** The card the worker must open. null when the invariant holds. */
  investigation: InvestigationCard | null;
}

/** The stable gap key of the investigation card. Matching is by exact text. */
export const INVESTIGATION_GAP = `Investigation: ${DELIVERY_LOOP_BROKEN} — a gap is open and no action was generated`;

const HONEST_WORKING_MESSAGE =
  "We found gaps in how AI answers your buyer questions, and our system is generating and reviewing the actions for them right now. This is not 'all caught up' — check back shortly, or contact us if this message is still here tomorrow.";

/**
 * Evaluate the invariant. This is the only place the product decides whether
 * the loop is delivering.
 */
export function evaluateDoNextPolicy(input: DoNextPolicyInput): DoNextPolicyVerdict {
  const reasons: string[] = [];
  let materialGap = false;
  let materialGapUnknown = false;

  // --- left-hand side: is there a gap the client can feel? ------------------
  if (input.visibilityScore === null) {
    materialGapUnknown = true;
    reasons.push("visibility is not measured for this brand — unknown is not zero and it is not fine");
  } else if (input.visibilityScore < input.target.value) {
    materialGap = true;
    reasons.push(
      `visibility ${input.visibilityScore} is below the target of ${input.target.value} (${input.target.source})`
    );
  }

  if (input.lostIntentCount === null) {
    materialGapUnknown = true;
    reasons.push("the count of lost buyer questions could not be read");
  } else if (input.lostIntentCount > 0) {
    materialGap = true;
    reasons.push(
      `${input.lostIntentCount} buyer ${input.lostIntentCount === 1 ? "question is" : "questions are"} answered without the brand`
    );
  }

  if (input.criticalProfileMissing) {
    materialGap = true;
    reasons.push("a critical profile is missing");
  }

  // --- the generator's own health ------------------------------------------
  const gen = input.loopGeneration;
  const generationTrusted = gen.status === "ok";
  if (!generationTrusted) {
    reasons.push(loopGenerationReason(gen));
  }

  // --- right-hand side: is there work, or an investigation? -----------------
  const hasWork = input.openActionCount > 0 || input.activeInvestigation;

  // The invariant is violated when a gap exists (or cannot be ruled out) and
  // nothing is open — and ALSO whenever the generator itself did not run
  // cleanly, because then "zero open cards" is not evidence of anything.
  const broken =
    (!hasWork && (materialGap || materialGapUnknown)) || (!generationTrusted && !input.activeInvestigation);

  const code: DoNextVerdictCode = broken ? DELIVERY_LOOP_BROKEN : "OK";

  const mayShowAllCaughtUp =
    !broken && !materialGap && !materialGapUnknown && generationTrusted && input.openActionCount === 0;

  return {
    code,
    materialGap,
    materialGapUnknown,
    reasons,
    mayShowAllCaughtUp,
    clientMessage: buildClientMessage({
      broken,
      mayShowAllCaughtUp,
      openActionCount: input.openActionCount,
      materialGap,
      materialGapUnknown,
    }),
    investigation: broken ? buildInvestigation(input, reasons) : null,
  };
}

function loopGenerationReason(gen: DoNextPolicyInput["loopGeneration"]): string {
  const when = gen.at ? ` (last attempt ${gen.at})` : "";
  switch (gen.status) {
    case "failed":
      return `the Do Next generator failed${when}${gen.detail ? `: ${gen.detail}` : ""} — an empty list here proves nothing`;
    case "no_evidence":
      return `the Do Next generator ran with no probe evidence${when} — no engine answers to classify`;
    case "never_ran":
      return "the Do Next generator has never run for this brand";
    default:
      return "the Do Next generator reported an unrecognised status";
  }
}

function buildClientMessage(x: {
  broken: boolean;
  mayShowAllCaughtUp: boolean;
  openActionCount: number;
  materialGap: boolean;
  materialGapUnknown: boolean;
}): string {
  if (x.broken) return HONEST_WORKING_MESSAGE;
  if (x.openActionCount > 0) {
    return `${x.openActionCount} ${x.openActionCount === 1 ? "action is" : "actions are"} open on your fix list.`;
  }
  if (x.mayShowAllCaughtUp) {
    return "All caught up — every fix has been verified by an audit, and no gap is open.";
  }
  // Not broken, nothing open, but something is unproven: say so plainly.
  return "Nothing is waiting on you right now, and we are still checking the last changes. We will not call this done until an audit confirms it.";
}

function buildInvestigation(input: DoNextPolicyInput, reasons: string[]): InvestigationCard {
  const why = reasons.join("; ");
  return {
    gap: INVESTIGATION_GAP,
    vector: "ai",
    action:
      "Ozvor is investigating why no action was generated for an open visibility gap. " +
      "Nothing is required from you — this card exists so the system cannot report an empty fix list as good news.",
    evidence: `${DELIVERY_LOOP_BROKEN} on audit ${input.auditId ?? "unknown"}: ${why}.`,
    metric: "A specific action, with its evidence, replaces this card on the next audit.",
    owner: "platform",
    effort: "medium",
    impact: "high",
    priority: 100,
  };
}

// ---------------------------------------------------------------------------
// Aggregate view — what Delivery Health (#591) reads
// ---------------------------------------------------------------------------

export interface DoNextInvariantRollup {
  /** Brands evaluated. */
  total: number;
  /** Brands where the invariant holds. */
  holding: number;
  /** Brands in DELIVERY_LOOP_BROKEN, with the first reason each. */
  broken: { brandId: string; reason: string }[];
  /** holding / total, or null when nothing could be evaluated (never 0). */
  rate: number | null;
}

export function rollupDoNextInvariant(
  verdicts: { brandId: string; verdict: DoNextPolicyVerdict }[]
): DoNextInvariantRollup {
  const broken = verdicts
    .filter((v) => v.verdict.code === DELIVERY_LOOP_BROKEN)
    .map((v) => ({ brandId: v.brandId, reason: v.verdict.reasons[0] ?? DELIVERY_LOOP_BROKEN }));
  const total = verdicts.length;
  const holding = total - broken.length;
  return { total, holding, broken, rate: total > 0 ? holding / total : null };
}
