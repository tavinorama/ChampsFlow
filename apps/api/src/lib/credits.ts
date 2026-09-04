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
     SELECT $1::uuid, $2::integer, 'adjustment', 'signup_residual', $1::uuid,
            (COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1::uuid), 0) + $2::integer)::integer
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
/**
 * Plan credits do NOT roll over (founder rule, 2026-09-01: "os créditos do
 * plano se reiniciam no primeiro dia do mês, não acrescem"). At the FIRST
 * grant of a new period the unused remainder of the previous allowance
 * expires. Purchased packs (reason 'purchase') never expire — they are
 * treated as spent last, so the expiring amount is the balance minus the
 * total ever purchased, floored at zero.
 */
export function expiringAmount(balanceBefore: number, purchasedTotal: number): number {
  return Math.max(0, balanceBefore - Math.max(0, purchasedTotal));
}

export async function ensureMonthlyGrant(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier,
  now: Date = new Date()
): Promise<void> {
  const period = currentPeriod(now);
  const amount = monthlyCreditsFor(tier);
  // Reset-not-accumulate: only when THIS period's grant does not exist yet
  // (the first call of the month), expire what is left of last month's plan
  // credits. Idempotent per period via uniq_credit_ref (period_expiry ref).
  const granted = await db.query(
    `SELECT 1 FROM credit_ledger
      WHERE tenant_id = $1::uuid AND period = $2::date AND reason = 'monthly_grant'
      LIMIT 1`,
    [tenantId, period]
  );
  if (granted.rows.length === 0) {
    const sums = await db.query<{ balance: string; purchased: string }>(
      `SELECT COALESCE(SUM(delta), 0)::int AS balance,
              COALESCE(SUM(CASE WHEN reason = 'purchase' AND delta > 0 THEN delta ELSE 0 END), 0)::int AS purchased
         FROM credit_ledger WHERE tenant_id = $1::uuid`,
      [tenantId]
    );
    const expire = expiringAmount(Number(sums.rows[0]?.balance ?? 0), Number(sums.rows[0]?.purchased ?? 0));
    if (expire > 0) {
      await db.query(
        `INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)
         SELECT $1::uuid, $2::integer, 'adjustment', 'period_expiry',
                md5('expiry:' || $3::text || ':' || $1::text)::uuid,
                (COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1::uuid), 0) + $2::integer)::integer
          ON CONFLICT (tenant_id, ref_type, ref_id) WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING`,
        [tenantId, -expire, period]
      );
    }
  }
  await db.query(
    `INSERT INTO credit_ledger (tenant_id, delta, reason, period, balance_after)
     SELECT $1::uuid, $2::integer, 'monthly_grant', $3::date,
            (COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1::uuid), 0) + $2::integer)::integer
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
     SELECT $1::uuid, $2::integer, 'audit', 'geo_audit', $3::uuid,
            (COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1::uuid), 0) + $2::integer)::integer
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

// ---------------------------------------------------------------------------
// P0-08 — hosted content generation
// ---------------------------------------------------------------------------

/**
 * Thrown when the ledger cannot record a 'content' debit because migration
 * 20260904000001 has not been applied to this database.
 *
 * It exists so the route can tell the truth about WHY. "Mergeado não é
 * produção" is a house rule: a feature whose dependency is missing must report
 * itself OFF, naming the action that switches it on — not fail with a generic
 * 500, and emphatically not generate on our key with no meter because the
 * insert quietly failed.
 */
export class ContentLedgerNotReadyError extends Error {
  readonly code = "ledger_not_ready";
  constructor() {
    super(
      "Hosted content generation is not switched on: migration " +
        "20260904000001_hosted_content_generation has not been applied to this database."
    );
    this.name = "ContentLedgerNotReadyError";
  }
}

/** Postgres check_violation. The reason CHECK is the only one this insert can hit. */
const PG_CHECK_VIOLATION = "23514";

function isReasonCheckViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  if (!e || e.code !== PG_CHECK_VIOLATION) return false;
  // constraint is present on every modern node-postgres error; when it is not,
  // fall back to the code alone rather than mis-reporting a real bug as
  // "not migrated".
  return e.constraint === undefined || e.constraint === "credit_ledger_reason_check";
}

/**
 * Charge ONE hosted content draft against the ledger, exactly once.
 *
 * Idempotent by the same uniq_credit_ref the audit debit relies on, keyed by
 * `refId` — the UUID derived from auditId + actionId + artifactType + version
 * (see apps/api/src/lib/hosted-content.ts). Reprocessing the same job inserts a
 * conflicting row, is told DO NOTHING, and reports charged:false. The customer
 * is never billed twice for one draft.
 *
 * CALL ORDER MATTERS, and it is the caller's job: this must run only AFTER the
 * generation has produced a valid artifact. RELATORIO §16 P0-08 item 7 —
 * failure does not charge. Debiting up front and refunding on failure would put
 * a compensating UPDATE-shaped hole in an append-only ledger; not spending in
 * the first place has no such hole.
 *
 * BYOK never reaches here. A client generating on their own key pays their own
 * provider and owes us nothing.
 */
export async function debitForContentDraft(
  db: PostgresClient,
  tenantId: string,
  tier: PlanTier,
  refId: string,
  amount: number
): Promise<DebitResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`debitForContentDraft: amount must be a positive integer, got ${String(amount)}`);
  }
  const credits = Math.ceil(amount);
  let res: { rows: Array<{ id: string }> };
  try {
    res = await db.query<{ id: string }>(
      `INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)
       SELECT $1::uuid, $2::integer, 'content', 'content_draft', $3::uuid,
              (COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE tenant_id = $1::uuid), 0) + $2::integer)::integer
        ON CONFLICT (tenant_id, ref_type, ref_id)
          WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING
        RETURNING id`,
      [tenantId, -credits, refId]
    );
  } catch (err) {
    if (isReasonCheckViolation(err)) throw new ContentLedgerNotReadyError();
    throw err;
  }
  const charged = res.rows.length > 0;
  if (!charged) {
    logger.info("content_debit_already_recorded", { tenantId, refId, credits });
  }
  const after = await creditBalance(db, tenantId, tier);
  return { charged, balance: after.balance };
}
