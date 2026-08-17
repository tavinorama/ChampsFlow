/**
 * credits.ts — the PURE arithmetic of the B5 credit ledger (#144).
 *
 * Moved from apps/api/src/lib/credits.ts (2026-08-10, credits-on-pages): the
 * public pricing page must derive every advertised number — monthly credits,
 * audit cost, top-up price — from the same arithmetic production bills with,
 * and the web app cannot import API code. The DB side (grants, balance,
 * debit) stays in the API; this file is constants and math only, importable
 * from any layer without dragging a runtime along.
 *
 * WHY THE UNIT IS A PROMPT-AUDIT, NOT AN AUDIT
 * Pricing one audit at a flat credit price is only coherent while every plan
 * audits at the same depth — and they do not (Growth 33 prompts, Agency 19).
 * So a credit buys a PROMPT-AUDIT: one prompt, asked across the engine panel,
 * once. A credit is a unit of COST, which is what keeps overage pricing honest
 * when the plans are reshaped: reshaping cannot move what a credit is worth.
 *
 * NOTHING HERE IS HARDCODED
 * Grants and prices are DERIVED from PLAN_LIMITS. A balance restated as a
 * literal is precisely the failure this project spent 2026-08-05 uncovering:
 * prompts_per_audit said 250, the generator produced 10, and the two numbers
 * drifted apart for weeks because nothing forced them to agree.
 *
 * THE COST MODEL UNDERNEATH IS STILL AN ASSUMPTION
 * USD_PER_PROMPT_AUDIT encodes the planning-worst-case five-engine audit
 * ($1.08 per 11-prompt audit, Google priced at list even though it bills 0
 * today). Invoice reconciliation (#152) is still pending; when it happens,
 * USD_PER_PROMPT_AUDIT is the single line to change.
 */

import { PLAN_LIMITS, PLAN_PRICE_USD, type PlanTier } from "./plan-limits";

/**
 * Credits per prompt-audit. Deliberately 50 rather than 1 so balances read in
 * the thousands — the founder's call, and a sound one: a plan that grants
 * 9,900 of something feels materially different from one that grants 198, and
 * the arithmetic is identical.
 */
export const CREDITS_PER_PROMPT_AUDIT = 50;

/**
 * Platform cost of one prompt-audit, USD. THE SINGLE LINE TO CHANGE when the
 * cost picture moves — everything priced in this file derives from it.
 * Planning-worst-case five-engine audit: $1.08 per 11-prompt audit.
 */
export const USD_PER_PROMPT_AUDIT = 1.08 / 11;

/** What one credit costs us, derived. */
export function usdPerCredit(): number {
  return USD_PER_PROMPT_AUDIT / CREDITS_PER_PROMPT_AUDIT;
}

/** The same margin floor the plans themselves are held to. */
export const OVERAGE_MARGIN_FLOOR = 0.8;

/**
 * How much dearer a top-up is than the cheapest subscription rate. Overage
 * SHOULD cost more per credit — that is what makes running out an argument for
 * upgrading rather than a reason to stay on a smaller plan and buy packs.
 */
export const OVERAGE_PREMIUM_OVER_PLAN = 1.3;

/** Cheapest per-credit rate any subscription offers. */
function bestPlanRateUsd(): number {
  return Math.min(
    ...(["growth", "agency"] as PlanTier[]).map(
      (t) => PLAN_PRICE_USD[t] / monthlyCreditsFor(t)
    )
  );
}

/**
 * List price of an overage pack.
 *
 * Two floors, and it clears BOTH:
 *   - margin: cost / (1 - 0.8), the same bar the plans meet;
 *   - competitiveness: strictly above the best subscription rate, times a
 *     premium.
 *
 * The second floor exists because a unit test caught the first design underwater
 * on it: pricing a pack purely off cost made top-ups CHEAPER per credit than
 * the plans, and the rational customer stays free and buys packs forever.
 */
export function overagePackUsd(credits = 1000): number {
  const marginFloor = (usdPerCredit() * credits) / (1 - OVERAGE_MARGIN_FLOOR);
  const planFloor = bestPlanRateUsd() * credits * OVERAGE_PREMIUM_OVER_PLAN;
  return Math.ceil(Math.max(marginFloor, planFloor));
}

/** Credits consumed by one audit on this plan — depth × the unit price. */
export function creditsForAudit(tier: PlanTier): number {
  return PLAN_LIMITS[tier].prompts_per_audit * CREDITS_PER_PROMPT_AUDIT;
}

/**
 * The monthly allowance, derived from what the plan actually permits:
 * depth × the monthly audit ceiling. Free 1,000 · Growth 9,900 · Agency 55,100
 * at the current limits — but those figures are outputs, not inputs, so a
 * future change to PLAN_LIMITS carries the balances with it automatically.
 */
export function monthlyCreditsFor(tier: PlanTier): number {
  const limits = PLAN_LIMITS[tier];
  return limits.prompts_per_audit * limits.monthly_audits_total * CREDITS_PER_PROMPT_AUDIT;
}

/**
 * One-time signup residual for FREE tenants (#144, the founder's design).
 *
 * The ask, verbatim: the free allowance should leave "uma quantidade residual"
 * — a balance that is visibly THERE and visibly NOT ENOUGH. A wallet at zero
 * reads as "empty, move on"; a wallet at 200 against a 500-credit audit reads
 * as "300 short", and that gap is the honest version of urgency.
 *
 * 200 = 40% of a free-tier audit (10 prompts × 50). Deliberately under half —
 * close enough to feel owned, never enough to run one.
 */
export const FREE_SIGNUP_RESIDUAL_CREDITS = 200;

// ---------------------------------------------------------------------------
// D1 (2026-08-17): the visible credit state. The header pill, the low/empty
// banners, the audit CTA gate and the account/billing card all read THIS, so
// "running low" means the same thing on every screen.
// ---------------------------------------------------------------------------

/** Below this share of the monthly allowance the UI says "running low". */
export const CREDITS_LOW_PCT = 20;

/** balance ÷ allowance as a whole percent, clamped to 0..100. Allowance 0 → 0. */
export function creditsPct(balance: number, allowance: number): number {
  if (!Number.isFinite(balance) || !Number.isFinite(allowance) || allowance <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((balance / allowance) * 100)));
}

export type CreditsLevel = "ok" | "low" | "empty";

export interface CreditsState {
  level: CreditsLevel;
  pct: number;
  /** False when the next audit would overdraw — the CTA disables with this reason. */
  canRunAudit: boolean;
  /** Plain-English reason for the disabled CTA (empty string when it can run). */
  blockedReason: string;
}

/**
 * The one decision the pill/banners make. `empty` wins over `low` (0 balance
 * is red even on a tiny allowance); a balance that cannot cover ONE audit
 * disables the CTA even when it is not zero, and the reason says why.
 */
export function creditsState(input: {
  balance: number;
  allowance: number;
  costPerAudit: number;
}): CreditsState {
  const balance = Number.isFinite(input.balance) ? input.balance : 0;
  const pct = creditsPct(balance, input.allowance);
  const canRunAudit = balance >= input.costPerAudit && input.costPerAudit >= 0;
  const level: CreditsLevel = balance <= 0 ? "empty" : pct < CREDITS_LOW_PCT ? "low" : "ok";
  const blockedReason = canRunAudit
    ? ""
    : balance <= 0
      ? "You have 0 credits. Buy 1,000 credits or upgrade to run an audit."
      : `An audit needs ${input.costPerAudit.toLocaleString("en-US")} credits. You have ${balance.toLocaleString("en-US")}. Top up or wait for the 1st.`;
  return { level, pct, canRunAudit, blockedReason };
}

/** First of the current month, UTC — the grant period bucket. */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
