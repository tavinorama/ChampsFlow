/**
 * credits.ts — the B5 credit ledger (#144).
 *
 * WHY THE UNIT IS A PROMPT-AUDIT, NOT AN AUDIT
 * The first sketch priced one audit at 1,000 credits. That is only coherent
 * while every plan audits at the same depth, and after the 2026-08-05 margin
 * calibration they do not: Growth runs 20 prompts per audit, Agency 12. Pricing
 * both at 1,000 would have sold 67% more platform cost on one plan than the
 * other under the same label, and one tier would quietly subsidise the other.
 *
 * So a credit buys a PROMPT-AUDIT: one prompt, asked across the engine panel,
 * once. At 50 credits each, one credit is ~$0.00284 of platform API — a credit
 * is a unit of COST. That is what keeps overage pricing honest when the plans
 * are reshaped again, because the reshaping cannot move what a credit is worth.
 *
 * NOTHING HERE IS HARDCODED
 * Grants and prices are DERIVED from PLAN_LIMITS. A balance restated as a
 * literal is precisely the failure this project spent 2026-08-05 uncovering:
 * prompts_per_audit said 250, the generator produced 10, and the two numbers
 * drifted apart for weeks because nothing forced them to agree. A derived
 * number cannot drift from its source.
 *
 * THE COST MODEL UNDERNEATH IS STILL AN ASSUMPTION
 * $0.142 per prompt-audit comes from api_spend, which computes rather than
 * measures: AUDIT_COST_PER_GEN_CENTS (1.2) and AUDIT_COST_PER_EXTRACTION_CENTS
 * (0.2) are assumed rates that have never been reconciled against provider
 * invoices. Every price in this file inherits that uncertainty. When the
 * reconciliation happens, USD_PER_PROMPT_AUDIT is the single line to change.
 */

import { PLAN_LIMITS, PLAN_PRICE_USD, type PlanTier } from "../integrations/stripe";
import { logger } from "../../../../packages/shared/src/logger";
import type { PostgresClient } from "../routes/social-accounts";

/**
 * Credits per prompt-audit. Deliberately 50 rather than 1 so balances read in
 * the thousands — the founder's call, and a sound one: a plan that grants 6,000
 * of something feels materially different from one that grants 120, and the
 * arithmetic is identical.
 */
export const CREDITS_PER_PROMPT_AUDIT = 50;

/**
 * Measured platform cost of one prompt-audit, from the 2026-08-04 production
 * audit: 156 cents for 11 prompts. THE SINGLE LINE TO CHANGE once provider
 * invoices are reconciled against audit counts (#152).
 */
export const USD_PER_PROMPT_AUDIT = 1.56 / 11;

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
 * on it. Pricing a pack purely off cost gave $15/1,000 = $0.015 per credit,
 * while Growth sells credits at $99/6,000 = $0.0165 — so top-ups were CHEAPER
 * than the plan, and the rational customer stays free and buys packs forever.
 * A number that clears the margin bar can still be the wrong price.
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
 * depth × the monthly audit ceiling. Free 1,000 · Growth 6,000 · Agency 36,000
 * at the current limits — but those figures are outputs, not inputs, so a future
 * change to PLAN_LIMITS carries the balances with it automatically.
 */
export function monthlyCreditsFor(tier: PlanTier): number {
  const limits = PLAN_LIMITS[tier];
  return limits.prompts_per_audit * limits.monthly_audits_total * CREDITS_PER_PROMPT_AUDIT;
}

export interface CreditBalance {
  balance: number;
  /** This plan's monthly allowance, for "X of Y left" in the UI. */
  granted: number;
  /** What the next audit will cost, so the UI can warn BEFORE the click. */
  costPerAudit: number;
  /** False when the next audit would overdraw — the upsell moment. */
  canRunAudit: boolean;
}

/** First of the current month, UTC — the grant period bucket. */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Issue this month's grant if it has not been issued yet, then return the
 * balance.
 *
 * Lazy on read rather than driven by a cron: a tenant that never logs in costs
 * nothing to keep current, and there is no scheduler to fall over silently —
 * which, on 2026-08-05, is exactly how the video job died unnoticed.
 *
 * The race is handled by the DATABASE. uniq_credit_monthly_grant makes a second
 * concurrent grant a conflict, and ON CONFLICT DO NOTHING turns that into a
 * no-op instead of a doubled month. Checking first and inserting after would
 * leave the window open; this closes it.
 */
export async function ensureMonthlyGrant(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier,
  now: Date = new Date()
): Promise<void> {
  const period = currentPeriod(now);
  const amount = monthlyCreditsFor(tier);
  await db.query(
    `INSERT INTO credit_ledger (tenant_id, delta, reason, period, balance_after)
     SELECT $1, $2, 'monthly_grant', $3::date,
            COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1), 0) + $2
      ON CONFLICT (tenant_id, period) WHERE reason = 'monthly_grant' DO NOTHING`,
    [tenantId, amount, period]
  );
}

/** Current balance — SUM(delta) is the authority, never balance_after. */
export async function creditBalance(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier
): Promise<CreditBalance> {
  const res = await db.query<{ balance: string }>(
    `SELECT COALESCE(SUM(delta), 0)::int AS balance FROM credit_ledger WHERE tenant_id = $1`,
    [tenantId]
  );
  const balance = Number(res.rows[0]?.balance ?? 0);
  const costPerAudit = creditsForAudit(tier);
  return {
    balance,
    granted: monthlyCreditsFor(tier),
    costPerAudit,
    canRunAudit: balance >= costPerAudit,
  };
}

export interface DebitResult {
  /** False when the row already existed — a retry, not a second charge. */
  charged: boolean;
  balance: number;
}

/**
 * Charge an audit against the ledger, exactly once.
 *
 * Idempotent by uniq_credit_ref on (tenant_id, ref_type, ref_id): a BullMQ job
 * that retries after a partial failure inserts a conflicting row and is told
 * DO NOTHING, so the customer is never charged twice for one audit. RETURNING
 * tells us which of the two happened, and the caller can log it honestly.
 *
 * Deliberately NOT a gate. This records what an audit cost; whether the tenant
 * was allowed to start it is decided up front by monthly_audits_total in
 * routes/audits.ts. Two systems guarding the same door is how one of them ends
 * up silently doing nothing.
 */
export async function debitForAudit(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier,
  auditId: string
): Promise<DebitResult> {
  const amount = creditsForAudit(tier);
  const res = await db.query<{ id: string }>(
    `INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)
     SELECT $1, $2, 'audit', 'geo_audit', $3::uuid,
            COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1), 0) + $2
      ON CONFLICT (tenant_id, ref_type, ref_id)
        WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING
      RETURNING id`,
    [tenantId, -amount, auditId]
  );
  const charged = res.rows.length > 0;
  if (!charged) {
    logger.info("credit_debit_already_recorded", { tenantId, auditId, amount });
  }
  const after = await creditBalance(db, tenantId, tier);
  return { charged, balance: after.balance };
}
