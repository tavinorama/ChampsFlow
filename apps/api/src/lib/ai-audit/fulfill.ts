/**
 * fulfill.ts — everything that happens AFTER a $49 AI Audit Stack order is
 * paid: build + store the deliverable, claim it to an existing account, send
 * the delivery email WITH the result inline, and enroll the post-purchase
 * nurture (ai_audit_to_full → OrganicPosts $1.5k bundle, free GEO test as the
 * cross-sell rung). Same dynamic as the Kit (billing.ts kit branch), shared by
 * the Stripe webhook and the sync /deliver path so both send exactly one email:
 * only the caller that transitions paid → delivered notifies.
 *
 * Everything after the deliverable is best-effort and logged; nothing here may
 * throw past the deliverable — the buyer already paid.
 */

import type { PostgresClient } from "../../../../../packages/shared/src/db-client";
import { logger } from "../../../../../packages/shared/src/logger";
import { sendAiAuditDeliveryEmail } from "../../../../../packages/shared/src/emails/ai-audit-delivery";
import { enrollNurture, suppressOnConversion } from "../../routes/nurture";
import { deliverAiAuditOrder, type AiAuditDeliverable } from "./deliverable";

export interface FulfillableOrder {
  id: string;
  order_token: string;
  email: string;
  business_type: string | null;
  primary_focus: string | null;
  answers: unknown;
  status: string;
  deliverable: unknown;
}

/** Slug → readable label ("content-volume" → "Content volume"). */
export function humanizePain(slug: string): string {
  const words = slug.split(/[-_]+/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Has this email ever run the free GEO test? Best-effort; unknown → true (no cross-sell noise). */
async function hasRunFreeTest(db: PostgresClient, email: string): Promise<boolean> {
  try {
    const { rows } = await db.query<{ one: number }>(
      `SELECT 1 AS one FROM lead_capture WHERE lower(email) = lower($1) AND source = 'invisibility_test' LIMIT 1`,
      [email]
    );
    return rows.length > 0;
  } catch (err) {
    logger.warn("ai_audit_free_test_lookup_failed", { message: (err as Error).message });
    return true;
  }
}

/**
 * Deliver (idempotent) and, when THIS call made the paid → delivered
 * transition, run the one-time side effects. Returns the deliverable either way.
 */
export async function fulfillAiAuditOrder(
  db: PostgresClient,
  order: FulfillableOrder,
  ctx: { eventId?: string; source: "webhook" | "sync" | "dev_unlock" }
): Promise<{ deliverable: AiAuditDeliverable; fresh: boolean }> {
  const { deliverable, transitioned } = await deliverAiAuditOrder(db, order);
  const fresh = transitioned;
  if (!fresh) return { deliverable, fresh };

  const email = (order.email ?? "").trim();

  // Claim immediately when the buyer already has an account (#218 pattern).
  try {
    if (email) {
      const { rows: ownerRows } = await db.query<{ tenant_id: string }>(
        `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
        [email.toLowerCase()]
      );
      const tenantId = ownerRows[0]?.tenant_id ?? null;
      if (tenantId) {
        await db.query(
          `UPDATE ai_audit_order SET claimed_at = NOW(), claimed_by_tenant_id = $2
            WHERE id = $1 AND claimed_at IS NULL`,
          [order.id, tenantId]
        );
        logger.info("ai_audit_order_claimed", { ai_audit_order_id: order.id, tenant_id: tenantId, event_id: ctx.eventId ?? null });
      }
    }
  } catch (err) {
    logger.warn("ai_audit_order_claim_failed", { ai_audit_order_id: order.id, message: (err as Error).message });
  }

  // Delivery email WITH the result inline (founder rule).
  const hasFreeTest = email ? await hasRunFreeTest(db, email) : true;
  if (email) {
    try {
      const pick = deliverable.entry.pick;
      await sendAiAuditDeliveryEmail({
        to: email,
        orderToken: order.order_token,
        businessType: deliverable.businessType || order.business_type || "",
        primaryFocus: deliverable.primaryFocus || order.primary_focus || undefined,
        pick: pick
          ? {
              name: pick.tool.name,
              url: pick.tool.url,
              oneLiner: pick.tool.oneLiner,
              monthlyCostUsd: pick.tool.monthlyCostUsd,
              setupEffort: pick.tool.setupEffort,
              hoursSavedWeekly: pick.tool.hoursSavedWeekly,
            }
          : null,
        reason: deliverable.entry.reason,
        matchedPains: (pick?.matchedPains ?? []).map(humanizePain),
        totalMatched: deliverable.entry.totalMatched,
        withheldCount: deliverable.entry.withheldCount,
        limitation: deliverable.upsell.limitation,
        estimatesUnverified: deliverable.catalog.estimatesUnverified,
        hasFreeTest,
      });
      logger.info("ai_audit_delivery_email_sent", { ai_audit_order_id: order.id, event_id: ctx.eventId ?? null, source: ctx.source });
    } catch (err) {
      logger.warn("ai_audit_delivery_email_failed", { ai_audit_order_id: order.id, message: (err as Error).message });
    }
  } else {
    logger.warn("ai_audit_delivery_email_skipped", { ai_audit_order_id: order.id, has_email: false });
  }

  // Nurture: they converted (suppress free_to_kit) → ai_audit_to_full. Same
  // shape as kit_to_growth: 2-day delay before step 1. Metadata carries
  // hasFreeTest so the worker's second step can pick the free-test rung.
  if (email) {
    try {
      await suppressOnConversion(db, email);
      await enrollNurture(db, {
        email,
        sequence: "ai_audit_to_full",
        brand: deliverable.businessType || order.business_type || "your business",
        metadata: {
          orderId: order.id,
          orderToken: order.order_token,
          hasFreeTest,
          pick: deliverable.entry.pick?.tool.name ?? null,
          totalMatched: deliverable.entry.totalMatched,
        },
        delayMs: 2 * 24 * 60 * 60 * 1000,
      });
    } catch (err) {
      logger.warn("nurture_ai_audit_enroll_failed", { ai_audit_order_id: order.id, message: (err as Error).message });
    }
  }

  return { deliverable, fresh };
}
