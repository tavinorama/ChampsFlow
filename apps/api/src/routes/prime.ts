/**
 * prime.ts — the OrganicPosts "Prime" tab's data (D3, 2026-08-17).
 *
 *   GET  /api/prime/status  — real tenant facts the unlock/progress panel and
 *                             the nudges read: OrganicPosts engagement state,
 *                             first audit done, competitors added, action
 *                             cards done, latest Visibility + the drop over the
 *                             last 7 days, credit balance. Tenant-scoped (RLS),
 *                             per-brand when ?brand=<id> is given, else the
 *                             tenant's first brand. Every block degrades to
 *                             null on error; nothing here fabricates a number.
 *   POST /api/prime/nudge   — logs a nudge shown/dismissed to audit_log so
 *                             ops can see what the client saw. Best-effort.
 *
 * The nudge DECISION is pure and lives in packages/shared/src/prime-nudges.ts
 * (tested); the client applies it with the facts below.
 */

import type { Hono } from "hono";
import { requireAuth } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { creditBalance } from "../lib/credits";
import type { PlanTier } from "../../../../packages/shared/src/plan-limits";
import { NUDGE_KINDS, type NudgeKind } from "../../../../packages/shared/src/prime-nudges";

export interface PrimeStatus {
  organicPosts: { status: "none" | "requested" | "contacted" | "won" | "lost"; sku: string | null; since: string | null };
  brandId: string | null;
  firstAuditDone: boolean;
  competitorsAdded: number;
  actionCardsDone: number;
  /**
   * P0-03/R12: the denominator the Do Next tab actually shows. Without it
   * the UI had to invent one (it hard-coded 3 while Do Next listed 5), so
   * the same workspace read "3 of 3" on one screen and "3 of 5" on the
   * other. Null when the brand has no plan yet.
   */
  actionCardsTotal: number | null;
  visibility: number | null;
  /** Visibility now minus Visibility ~7 days ago (negative = drop). Null without two points. */
  weeklyChange: number | null;
  credits: { balance: number; granted: number } | null;
  tier: PlanTier;
}

export function registerPrimeRoutes(app: Hono, db: PostgresClient): void {
  app.get("/api/prime/status", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const wantBrand = (c.req.query("brand") ?? "").trim() || null;

    const out: PrimeStatus = {
      organicPosts: { status: "none", sku: null, since: null },
      brandId: null,
      firstAuditDone: false,
      competitorsAdded: 0,
      actionCardsDone: 0,
      actionCardsTotal: null,
      visibility: null,
      weeklyChange: null,
      credits: null,
      tier: "free",
    };

    // OrganicPosts engagement (won beats everything; else the latest row).
    try {
      const { rows } = await db.query<{ sku: string; status: string; created_at: string }>(
        `SELECT sku, status, created_at FROM engagement
          WHERE tenant_id = $1 AND sku IN ('geo_sprint','managed_geo')
          ORDER BY (status = 'won') DESC, created_at DESC LIMIT 1`,
        [auth.tenantId]
      );
      const r = rows[0];
      if (r) {
        const s = r.status as PrimeStatus["organicPosts"]["status"];
        out.organicPosts = { status: ["requested", "contacted", "won", "lost"].includes(s) ? s : "none", sku: r.sku, since: r.created_at };
      }
    } catch (err) {
      logger.warn("prime_status_engagement_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
    }

    // Brand: the one asked for (must belong to the tenant, RLS enforces) or the first.
    try {
      const { rows } = wantBrand
        ? await db.query<{ id: string }>(`SELECT id FROM brands WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [wantBrand, auth.tenantId])
        : await db.query<{ id: string }>(`SELECT id FROM brands WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`, [auth.tenantId]);
      out.brandId = rows[0]?.id ?? null;
    } catch (err) {
      logger.warn("prime_status_brand_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
    }

    if (out.brandId) {
      try {
        const { rows } = await db.query<{ score_ai: number | null; recorded_at: string }>(
          `SELECT score_ai, recorded_at FROM geo_score WHERE brand_id = $1 ORDER BY recorded_at DESC LIMIT 30`,
          [out.brandId]
        );
        out.firstAuditDone = rows.length > 0;
        const latest = rows[0];
        if (latest && latest.score_ai != null) {
          out.visibility = Number(latest.score_ai);
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          // The newest point that is at least 7 days old; if none, the oldest we have (when older than a day).
          const ref = rows.find((r) => new Date(r.recorded_at).getTime() <= weekAgo && r.score_ai != null)
            ?? (rows.length > 1 && new Date(rows[rows.length - 1].recorded_at).getTime() <= Date.now() - 24 * 60 * 60 * 1000 ? rows[rows.length - 1] : undefined);
          if (ref && ref !== latest && ref.score_ai != null) out.weeklyChange = Number(latest.score_ai) - Number(ref.score_ai);
        }
      } catch (err) {
        logger.warn("prime_status_score_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
      }
      try {
        const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM competitor WHERE brand_id = $1`, [out.brandId]);
        out.competitorsAdded = Number(rows[0]?.n ?? 0);
      } catch (err) {
        logger.warn("prime_status_competitors_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
      }
      try {
        // P0-03/R12 — one denominator, not two. This used to count every
        // 'done' task across EVERY plan the brand had ever had, while the Do
        // Next tab and deriveExecutionProgress (apps/api/src/routes/audits.ts)
        // both scope to the LATEST plan and exclude rejected tasks. Two
        // counters over the same reality produced "3 of 3" here and "3 of 5"
        // there. Scope and filter now match deriveExecutionProgress exactly,
        // and the total travels with the count so the UI never invents one.
        const { rows } = await db.query<{ total: string; done: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE t.status != 'rejected') AS total,
             COUNT(*) FILTER (WHERE t.status =  'done')     AS done
           FROM plan_task t
           WHERE t.plan_id = (
             SELECT id FROM strategy_plan
              WHERE brand_id = $1
              ORDER BY created_at DESC
              LIMIT 1
           )`,
          [out.brandId]
        );
        const total = Number(rows[0]?.total ?? 0);
        out.actionCardsDone = Number(rows[0]?.done ?? 0);
        out.actionCardsTotal = total > 0 ? total : null;
      } catch (err) {
        logger.warn("prime_status_tasks_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
      }
    }

    // Tier + credits (read-only; the grant happens on /api/billing/credits).
    try {
      const { rows } = await db.query<{ plan_tier: string | null }>(
        `SELECT plan_tier FROM billing_subscriptions WHERE tenant_id = $1 ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1`,
        [auth.tenantId]
      );
      const raw = rows[0]?.plan_tier;
      out.tier = raw === "growth" || raw === "agency" ? raw : "free";
      const bal = await creditBalance(db, auth.tenantId, out.tier);
      out.credits = { balance: bal.balance, granted: bal.granted };
    } catch (err) {
      logger.warn("prime_status_credits_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
    }

    return c.json(out);
  });

  app.post("/api/prime/nudge", requireAuth, async (c) => {
    const auth = c.get("auth");
    const body = (await c.req.json().catch(() => null)) as { kind?: unknown; action?: unknown; brandId?: unknown } | null;
    const kind = typeof body?.kind === "string" && (NUDGE_KINDS as readonly string[]).includes(body.kind) ? (body.kind as NudgeKind) : null;
    const action = body?.action === "dismissed" ? "dismissed" : body?.action === "clicked" ? "clicked" : "shown";
    if (!kind) return c.json({ message: "Unknown nudge." }, 400);
    await db.setTenantId(auth.tenantId);
    try {
      await db.query(
        `INSERT INTO audit_log (event_type, actor_user_id, tenant_id, target_entity, metadata, created_at)
         VALUES ('prime_nudge', $1, $2, 'prime', $3, NOW())`,
        [auth.userId, auth.tenantId, jsonbParam({ kind, action, brandId: typeof body?.brandId === "string" ? body.brandId : null })]
      );
    } catch (err) {
      logger.warn("prime_nudge_log_failed", { tenant_id: auth.tenantId, message: (err as Error).message?.slice(0, 120) });
    }
    return c.json({ ok: true });
  });
}
