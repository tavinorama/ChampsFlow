/**
 * Weekly monitoring reconcile — makes the sold "weekly monitoring" feature
 * FULL-AUTO instead of opt-in-per-brand.
 *
 * Problem this fixes: weekly monitoring only turned on when a user manually hit
 * POST /api/brands/:id/monitoring (audits.ts). A paying Growth/Agency customer
 * who never touched that toggle got NO weekly tracking — a promise-vs-delivery
 * gap. This reconcile closes it: for every brand whose tenant has an ACTIVE
 * paid subscription on a plan that INCLUDES weekly_monitoring, it ensures
 *   1. brands.monitoring_enabled = TRUE, and
 *   2. the weekly repeatable ("monitor:${brandId}", cron "0 6 * * 1") is
 *      registered on the 'geo-audit' queue — the exact jobId + pattern the
 *      manual toggle uses (apps/api/src/routes/audits.ts), so the two paths are
 *      interchangeable and never double-register.
 *
 * Idempotent by construction:
 *   - BullMQ repeatable jobs dedupe on the repeat key (jobId + pattern), so
 *     adding the same monitor:${brandId} weekly job repeatedly is a no-op.
 *   - The monitoring_enabled UPDATE only touches rows that are still FALSE.
 *   Safe to run every week (and once at boot) forever.
 *
 * Respects the plan's monthly_audit_cap: this function only SCHEDULES the weekly
 * repeatable. The actual per-run cost ceiling (PLAN_LIMITS[tier].monthly_audit_cap)
 * is enforced where audits are produced — the scheduled branch of processAuditJob
 * (apps/worker/src/jobs/audit-run.ts) skips + deletes a run once the tenant hits
 * its monthly cap. Registering the repeatable never bypasses that guard.
 *
 * Eligibility (conservative — never enables free/ineligible tenants):
 *   - The tenant must have a billing_subscriptions row with status='active'
 *     whose plan_tier is a paid tier that includes weekly_monitoring
 *     (derived from PLAN_LIMITS so it can never drift from the plan matrix).
 *   - Founder-granted plans (tenants.plan_tier set with NO active subscription
 *     row) are intentionally EXCLUDED — this reconcile only acts on real paid
 *     subscriptions. Those accounts can still enable monitoring manually.
 *
 * Scope: ENABLE-only. It never DISABLES monitoring (e.g. for a churned tenant)
 * so it can't fight a user's manual choice or silently turn tracking off. Churn
 * cost is already bounded by the monthly_audit_cap guard above.
 *
 * Graceful fallback (mirrors processDailyMonitoredBrands): a missing column
 * (42703) or missing table (42P01) logs a warning and returns — the worker MUST
 * NOT crash. Per-brand failures are caught so one bad brand never blocks others.
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import type postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";
import { PLAN_LIMITS, type PlanTier } from "../../../api/src/integrations/stripe";

// Paid tiers whose plan includes weekly monitoring — derived from the single
// source of truth (PLAN_LIMITS) so this can never drift from the plan matrix.
// 'free' is excluded even if a future edit flipped its flag: monitoring is a
// paid entitlement.
function weeklyMonitoringTiers(): PlanTier[] {
  return (Object.keys(PLAN_LIMITS) as PlanTier[]).filter(
    (tier) => tier !== "free" && PLAN_LIMITS[tier]?.weekly_monitoring === true
  );
}

let _reconcileQueue: Queue | null = null;

function getReconcileAuditQueue(): Queue {
  if (_reconcileQueue) return _reconcileQueue;
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  redis.on("error", (err: Error) => {
    logger.error("monitor_reconcile_redis_error", { message: err.message });
  });
  // Same queue the audit worker consumes AND the manual monitoring toggle
  // registers on (apps/api/src/routes/audits.ts) — so the repeatable we add
  // here is the same schedule the API would have added.
  _reconcileQueue = new Queue("geo-audit", { connection: redis });
  return _reconcileQueue;
}

interface EligibleBrandRow {
  id: string;
  tenant_id: string;
  region: string;
  monitoring_enabled: boolean;
}

/**
 * Reconcile weekly monitoring for all eligible paid tenants. See file header.
 * `sql` MUST be a privileged (RLS-bypassing) worker client — this is a
 * cross-tenant read/write, exactly like processDailyMonitoredBrands.
 */
export async function reconcileWeeklyMonitoring(sql: postgres.Sql): Promise<void> {
  const tiers = weeklyMonitoringTiers();
  if (tiers.length === 0) {
    logger.warn("monitor_reconcile_no_eligible_tiers", {
      message: "no paid tier has weekly_monitoring enabled; nothing to reconcile",
    });
    return;
  }

  let rows: EligibleBrandRow[];
  try {
    // Brands whose tenant has an ACTIVE paid subscription on a monitoring-
    // eligible tier. EXISTS keeps it to one row per brand regardless of how many
    // subscription rows the tenant has.
    rows = await sql<EligibleBrandRow[]>`
      SELECT b.id, b.tenant_id, b.region, b.monitoring_enabled
        FROM brands b
       WHERE EXISTS (
               SELECT 1
                 FROM billing_subscriptions bs
                WHERE bs.tenant_id = b.tenant_id
                  AND bs.status = 'active'
                  AND bs.plan_tier = ANY(${sql.array(tiers as string[])})
             )
    `;
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42703" || pgCode === "42P01") {
      // A column/table isn't in this schema yet (e.g. brands.monitoring_enabled
      // or billing_subscriptions pre-migration). Non-fatal — skip this cycle.
      logger.warn("monitor_reconcile_schema_missing", {
        code: pgCode,
        message: "required column/table missing; skipping weekly monitoring reconcile",
      });
      return;
    }
    logger.error("monitor_reconcile_query_failed", {
      message: (err as Error).message?.slice(0, 200),
    });
    return;
  }

  if (rows.length === 0) {
    logger.info("monitor_reconcile_no_eligible_brands", { count: 0 });
    return;
  }

  const queue = getReconcileAuditQueue();
  let registered = 0;
  let enabled = 0;

  for (const brand of rows) {
    // 1. Ensure the weekly repeatable exists. Stable jobId + fixed cron pattern
    //    make this idempotent: BullMQ dedupes on the repeat key, so re-adding is
    //    a no-op. Identical to the manual toggle (audits.ts) so both paths land
    //    on exactly one schedule per brand.
    try {
      await queue.add(
        "scheduled-audit",
        { tenant_id: brand.tenant_id, brand_id: brand.id, region: brand.region },
        {
          jobId: `monitor:${brand.id}`,
          repeat: { pattern: "0 6 * * 1" }, // every Monday 06:00 UTC
        }
      );
      registered += 1;
    } catch (err: unknown) {
      logger.error("monitor_reconcile_register_failed", {
        brand_id: brand.id,
        message: (err as Error).message?.slice(0, 200),
      });
      // Do NOT flip monitoring_enabled if we couldn't register the schedule —
      // the flag would then lie. Skip to the next brand.
      continue;
    }

    // 2. Flip the flag ON only when it's still OFF (idempotent — no needless
    //    writes on brands already monitoring). One failure never blocks others.
    if (!brand.monitoring_enabled) {
      try {
        await sql`UPDATE brands SET monitoring_enabled = TRUE WHERE id = ${brand.id}`;
        enabled += 1;
      } catch (err: unknown) {
        logger.error("monitor_reconcile_enable_failed", {
          brand_id: brand.id,
          message: (err as Error).message?.slice(0, 200),
        });
      }
    }
  }

  logger.info("monitor_reconcile_done", {
    eligible: rows.length,
    schedules_registered: registered,
    newly_enabled: enabled,
    tiers: tiers.join(","),
  });
}
