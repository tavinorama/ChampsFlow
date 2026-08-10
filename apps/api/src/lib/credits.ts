/**
 * credits.ts — the DB side of the B5 credit ledger (#144).
 *
 * The pure arithmetic (unit, cost model, derivations, pack pricing) moved to
 * packages/shared/src/credits.ts on 2026-08-10 so the public pricing page can
 * derive the numbers it advertises from the same source production bills
 * with. Re-exported below, so every existing import site keeps working. What
 * remains here is everything that touches Postgres: grants, balance, debit.
 */

// Type comes from packages/shared, NOT from a route file: the worker imports
// this module, and a route-file type import drags hono into the worker's tsc
// closure — that exact edge held the worker on a pre-#423 build for 2 days.
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import type { PlanTier } from "../../../../packages/shared/src/plan-limits";
import { logger } from "../../../../packages/shared/src/logger";
import {
  FREE_SIGNUP_RESIDUAL_CREDITS,
  creditsForAudit,
  currentPeriod,
  monthlyCreditsFor,
} from "../../../../packages/shared/src/credits";

export {
  CREDITS_PER_PROMPT_AUDIT,
  USD_PER_PROMPT_AUDIT,
  usdPerCredit,
  OVERAGE_MARGIN_FLOOR,
  OVERAGE_PREMIUM_OVER_PLAN,
  overagePackUsd,
  creditsForAudit,
  monthlyCreditsFor,
  FREE_SIGNUP_RESIDUAL_CREDITS,
  currentPeriod,
} from "../../../../packages/shared/src/credits";

export async function ensureFreeSignupResidual(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier
): Promise<void> {
  if (tier !== "free") return;
  await db.query(
    `INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)
     SELECT $1, $2, 'adjustment', 'signup_residual', $1::uuid,
            COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1), 0) + $2
      ON CONFLICT (tenant_id, ref_type, ref_id)
        WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING`,
    [tenantId, FREE_SIGNUP_RESIDUAL_CREDITS]
  );
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
