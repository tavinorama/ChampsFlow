/**
 * hosted-content.ts — P0-08. The PURE side of hosted content generation.
 *
 * THE DEFECT THIS CLOSES
 * The audit finished, said "here is the gap", and then asked the customer for
 * an API key before it would write a single line (RELATORIO §3.2; the guard is
 * `content-studio.ts` `if (!apiKey)` → HTTP 402 in `routes/audits.ts`). For an
 * agency with a technical owner, BYOK is a cost control. For the SMB we sell
 * "we do the work" to, it is a wall in the middle of the promise.
 *
 * THE FOUNDER'S DECISION (03/09), AND WHY IT IS THE RIGHT GUARD
 * The cost guardian is the CREDIT BALANCE — not a draft counter, not an audit
 * counter. A credit is already defined as a unit of COST (see ./credits.ts), so
 * a hosted draft and a prompt-audit can be spent from the same wallet without
 * either subsidising the other, and reshaping the plans cannot silently change
 * what a draft is allowed to cost us.
 *
 * WHY THIS FILE IS PURE AND LIVES IN packages/shared
 * Identical reason to ./credits.ts: the arithmetic that decides "you have 41
 * drafts left" must be the SAME arithmetic the API bills with, and the web app
 * cannot import API code. Everything that touches Postgres or a hash lives in
 * apps/api/src/lib/hosted-content.ts. Nothing here imports a runtime.
 *
 * NOTHING HERE IS A HARDCODED BALANCE. The credit price of a draft is DERIVED
 * from the same usdPerCredit() the audit price is derived from.
 */

import { usdPerCredit } from "./credits";

// ---------------------------------------------------------------------------
// What a hosted draft costs us
// ---------------------------------------------------------------------------

/**
 * Platform LLM cost of ONE hosted draft, USD. THE SINGLE LINE TO CHANGE when
 * the measured cost moves — the credit price below derives from it.
 *
 * Sizing, and it is honestly an ASSUMPTION until reconciled against the
 * `api_spend` table (the same caveat USD_PER_PROMPT_AUDIT carries): the measured
 * Ozvor Pages run bills ~$0.15 for five pages (~$0.03/page) on one long-form
 * call each. A blog draft is longer than a landing page section and carries a
 * bigger grounded prompt (evidence pack + claims), so this is set at 0.05 —
 * deliberately ABOVE the nearest measured neighbour rather than below it.
 * Underpricing our own cost is how a plan goes margin-negative quietly.
 */
export const USD_PER_HOSTED_DRAFT = 0.05;

/**
 * Credits one hosted draft costs. Derived, never restated.
 *
 * Rounded UP: a fractional credit that rounds down is a rounding error the
 * house always loses, once per draft, forever.
 */
export function creditsForHostedDraft(): number {
  return Math.ceil(USD_PER_HOSTED_DRAFT / usdPerCredit());
}

// ---------------------------------------------------------------------------
// The customer-facing meter
// ---------------------------------------------------------------------------

/**
 * How many more drafts this balance buys.
 *
 * A missing/NaN balance is NOT zero — "dado ausente nunca vira zero" is a house
 * rule written in blood. `null` means "we do not know", and every caller must
 * render that as "we could not read your balance", never as "you have none".
 */
export function draftsRemaining(balance: number | null | undefined): number | null {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return null;
  const cost = creditsForHostedDraft();
  if (cost <= 0) return null;
  return Math.max(0, Math.floor(balance / cost));
}

export type HostedDraftBlock = "none" | "insufficient_credits" | "balance_unknown";

export interface HostedDraftAllowance {
  /** False when this generation must not start. */
  canGenerate: boolean;
  /** Why not — machine-readable, so the UI can pick the right CTA. */
  block: HostedDraftBlock;
  /** Credits this draft would cost. */
  costCredits: number;
  /** Drafts the current balance buys, or null when the balance is unknown. */
  remaining: number | null;
  /**
   * The sentence a customer reads. Client language only: drafts, never tokens,
   * never "credits per prompt-audit" arithmetic — RELATORIO §16 P0-08 is
   * explicit that the meter must be legible to an SMB owner.
   */
  message: string;
  /** The way out, when there is one. Empty string when nothing is blocked. */
  offer: string;
}

/**
 * The ONE decision the hosted path makes before spending money.
 *
 * Deliberately returns a full sentence rather than a code the route has to
 * translate: the 402 the customer used to get said "add an API key", which was
 * a true statement of our implementation and a useless statement of their
 * options. An honest block names the path out (RELATORIO §16 P0-08, item 8).
 */
export function hostedDraftAllowance(input: {
  balance: number | null | undefined;
}): HostedDraftAllowance {
  const costCredits = creditsForHostedDraft();
  const remaining = draftsRemaining(input.balance);

  if (remaining === null) {
    return {
      canGenerate: false,
      block: "balance_unknown",
      costCredits,
      remaining: null,
      message: "We could not read your credit balance, so we did not start a draft or charge you.",
      offer: "Try again in a moment. If it keeps happening, tell us and we will look.",
    };
  }

  if (remaining < 1) {
    return {
      canGenerate: false,
      block: "insufficient_credits",
      costCredits,
      remaining: 0,
      message: "You are out of credits, so we did not write this draft. Nothing was charged.",
      offer: "Buy a 1,000-credit pack, move up a plan, or wait for your credits to reset on the 1st.",
    };
  }

  return {
    canGenerate: true,
    block: "none",
    costCredits,
    remaining,
    message: describeDraftsLeft(remaining),
    offer: "",
  };
}

/**
 * "You have 41 drafts left this month." — the string the dashboard shows.
 *
 * Singular/plural handled because a meter that says "1 drafts left" reads as
 * broken, and a meter that reads as broken is not believed.
 */
export function describeDraftsLeft(remaining: number | null): string {
  if (remaining === null) return "We could not read how many drafts you have left.";
  if (remaining <= 0) return "You have no drafts left this month.";
  if (remaining === 1) return "You have 1 draft left this month.";
  return `You have ${remaining.toLocaleString("en-US")} drafts left this month.`;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export interface DraftIdentity {
  /** The audit the evidence came from. Null for a draft with no audit behind it. */
  auditId: string | null;
  /** The plan_task (action) this draft executes. Null for a free-form topic. */
  actionId: string | null;
  /** blog | linkedin | faq — the artifact shape. */
  artifactType: string;
  /** Bumped when the caller deliberately wants a NEW draft of the same action. */
  version: number;
}

/**
 * The stable identity of one draft: `auditId + actionId + artifactType + version`,
 * exactly as RELATORIO §16 P0-08 item 2 specifies.
 *
 * Reprocessing the same job must not charge twice and must not produce a second
 * draft. That is enforced by the DATABASE (a unique index on this key and the
 * ledger's uniq_credit_ref), not by a read-then-write check in code — the
 * check-then-act window is precisely where double-charging lives, and this
 * project already learned that once on the audit debit.
 *
 * `null` segments are spelled out rather than dropped, so a draft with no audit
 * cannot collide with a draft whose auditId happens to be the empty string.
 */
export function draftGenerationKey(id: DraftIdentity): string {
  const v = Number.isFinite(id.version) ? Math.max(1, Math.floor(id.version)) : 1;
  return [
    `audit:${id.auditId ?? "none"}`,
    `action:${id.actionId ?? "none"}`,
    `artifact:${id.artifactType}`,
    `v:${v}`,
  ].join("|");
}

// ---------------------------------------------------------------------------
// Retry policy for the hosted generation path
// ---------------------------------------------------------------------------

/**
 * Retry spacing, in ms. Patient for the same reason AUDIT_RETRY_BASE_DELAY_MS is
 * patient (see ./audit-queue.ts, the 17/08 retry storm): the failures this path
 * actually sees — provider 429, 5xx, timeout — are minute-scale events, and a
 * fast retry against a down dependency turns one outage into three bills.
 *
 * Kept short enough that a synchronous request still returns: 2s, then 4s.
 */
export const HOSTED_DRAFT_RETRY_BASE_DELAY_MS = 2_000;

export const HOSTED_DRAFT_ATTEMPTS = 3;

/** Delay before attempt N (1-based). Pure, so the spacing is testable. */
export function hostedDraftRetryDelayMs(attempt: number): number {
  if (attempt <= 1) return 0;
  return HOSTED_DRAFT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 2);
}

/**
 * Failures that must NOT be retried.
 *
 * A sanitizer rejection and an unusable artifact are REFUSALS, not crashes:
 * asking the same provider the same rejected question again spends money to
 * fail identically. Same reasoning as isAuditFailurePermanent.
 */
const NON_RETRYABLE_DRAFT_FAILURES = new Set([
  "prompt_rejected",
  "fact_check_failed",
  "insufficient_credits",
  "ledger_not_ready",
]);

export function isDraftFailurePermanent(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return NON_RETRYABLE_DRAFT_FAILURES.has(reason.trim());
}
