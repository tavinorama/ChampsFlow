/**
 * deliverable.ts — what the $49 AI Audit Stack order actually buys, and the
 * one place that builds + stores it (shared by the sync /deliver route and the
 * Stripe webhook, so the email can carry the real result inline).
 *
 * The $49 buys:
 *   - the ENTRY pick: ONE niche-fit tool (never a household-name giant), why it
 *     was picked for this business, and which of the buyer's pains it answers;
 *   - an HONEST TEASER of the full 9-section report: how many tools matched,
 *     how the Impact–Effort matrix splits (counts only, no names), the hours
 *     the quick wins would return and the Financial Impact numbers (flagged
 *     as estimates when the catalog says so).
 * The FULL report (ranked stack, 4-day plan, what comes after) stays the
 * $1.5k OrganicPosts deliverable — bundled with the Ozvor GEO Search audit.
 *
 * Pure builder + one DB writer. No email, no Stripe here.
 */

import type { PostgresClient } from "../../../../../packages/shared/src/db-client";
import { logger } from "../../../../../packages/shared/src/logger";
import { loadCatalog } from "./catalog-repo";
import { buildAuditReport, buildEntryResult } from "./engine";
import type { BusinessEngine, EntryResult, FinancialImpact, Quadrant, QuestionnaireAnswers, Tool } from "./types";

export const AI_AUDIT_PRICE_USD = 49;
export const AI_AUDIT_DELIVERABLE_VERSION = 1;

/** The upsell ladder shipped with every result — every product connects. */
export interface AiAuditUpsell {
  limitation: string;
  fullAudit: { name: string; gets: string; bundledWith: string; price: string; href: string };
  alsoOffer: { text: string; href: string };
}

export function aiAuditUpsell(totalMatched: number): AiAuditUpsell {
  return {
    limitation:
      "Your $49 result shows one niche tool and the size of the full picture. It skips the big-name AIs and holds back the ranked stack.",
    fullAudit: {
      name: "The full AI Audit Stack",
      gets: `We matched ${totalMatched} tools to your needs. The full audit ranks them all, maps quick wins, plans your first days, and shows your monthly ROI.`,
      bundledWith: "You get it inside OrganicPosts, together with your Ozvor GEO Search audit.",
      price: "from $1,500",
      href: "/organicposts",
    },
    alsoOffer: {
      text: "Free GEO test. See how AI engines describe your brand, then fix it.",
      href: "/test",
    },
  };
}

/** Counts-only view of the full report — the honest teaser. */
export interface AiAuditReportTeaser {
  matrixCounts: Record<Quadrant, number>;
  quickWinCount: number;
  recommendedCount: number;
  hoursReclaimedWeekly: number;
  outcomeSummary: string;
  financialImpact: FinancialImpact;
}

export interface AiAuditDeliverable {
  version: number;
  generatedAt: string;
  businessType: string;
  primaryFocus: string;
  entry: EntryResult;
  report: AiAuditReportTeaser;
  upsell: AiAuditUpsell;
  catalog: { source: string; estimatesUnverified: boolean };
}

export function buildAiAuditDeliverable(
  answers: QuestionnaireAnswers,
  catalog: { tools: Tool[]; source: string; allVerified: boolean },
  now: Date = new Date()
): AiAuditDeliverable {
  const entry = buildEntryResult(answers, catalog.tools);
  const full = buildAuditReport(answers, catalog.tools);
  return {
    version: AI_AUDIT_DELIVERABLE_VERSION,
    generatedAt: now.toISOString(),
    businessType: answers.businessType,
    primaryFocus: answers.primaryFocus,
    entry,
    report: {
      matrixCounts: {
        "quick-win": full.matrix["quick-win"].length,
        "major-project": full.matrix["major-project"].length,
        "fill-in": full.matrix["fill-in"].length,
        ignore: full.matrix.ignore.length,
      },
      quickWinCount: full.quickWins.length,
      recommendedCount: full.recommendedSolutions.length,
      hoursReclaimedWeekly: full.hoursReclaimedWeekly,
      outcomeSummary: full.outcomeSummary,
      financialImpact: full.financialImpact,
    },
    upsell: aiAuditUpsell(entry.totalMatched),
    catalog: { source: catalog.source, estimatesUnverified: !catalog.allVerified },
  };
}

/** Postgres undefined_table — the migration (PR A) has not been applied yet. */
export function isUndefinedTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42P01";
}

/** Coerce a stored answers jsonb back into the engine's input shape. */
export function answersFromRow(raw: unknown): QuestionnaireAnswers {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const engines = strs(o["engines"]).filter((e): e is BusinessEngine =>
    (["attract", "convert", "deliver", "retain", "run"] as string[]).includes(e)
  );
  return {
    businessType: typeof o["businessType"] === "string" ? o["businessType"] : "",
    primaryFocus: typeof o["primaryFocus"] === "string" ? o["primaryFocus"] : "",
    pains: strs(o["pains"]),
    engines,
    toolsInUse: strs(o["toolsInUse"]),
  };
}

export interface AiAuditOrderRow {
  id: string;
  answers: unknown;
  status: string;
  deliverable: unknown;
}

/**
 * Build + store the deliverable for a PAID order. Idempotent: an order already
 * delivered returns its stored deliverable untouched (transitioned=false). Only
 * the call whose UPDATE flips 'paid' → 'delivered' gets transitioned=true — the
 * caller uses that to send the one delivery email even when the webhook and
 * the sync /deliver path race. The caller has verified payment; this never
 * checks it.
 */
export async function deliverAiAuditOrder(
  db: PostgresClient,
  order: AiAuditOrderRow
): Promise<{ deliverable: AiAuditDeliverable; transitioned: boolean }> {
  if (order.status === "delivered" && order.deliverable && typeof order.deliverable === "object") {
    return { deliverable: order.deliverable as AiAuditDeliverable, transitioned: false };
  }
  const catalog = await loadCatalog(db);
  const deliverable = buildAiAuditDeliverable(answersFromRow(order.answers), catalog);
  // jsonb column: pass the object, let postgres.js serialize (the Kit's lesson —
  // JSON.stringify here double-encodes and the page renders blank).
  const upd = await db.query<{ id: string }>(
    `UPDATE ai_audit_order SET status='delivered', deliverable=$2, delivered_at=NOW()
      WHERE id=$1 AND status='paid'
      RETURNING id`,
    [order.id, deliverable]
  );
  if (upd.rows.length > 0) {
    logger.info("ai_audit_delivered", { ai_audit_order_id: order.id });
    return { deliverable, transitioned: true };
  }
  // Lost the race (or the order was revoked meanwhile): trust the row, not
  // our in-memory copy.
  const again = await db.query<{ status: string; deliverable: unknown }>(
    `SELECT status, deliverable FROM ai_audit_order WHERE id=$1`,
    [order.id]
  );
  const row = again.rows[0];
  if (row?.status === "delivered" && row.deliverable && typeof row.deliverable === "object") {
    return { deliverable: row.deliverable as AiAuditDeliverable, transitioned: false };
  }
  logger.warn("ai_audit_deliver_no_row_updated", { ai_audit_order_id: order.id, status: row?.status ?? null });
  return { deliverable, transitioned: false };
}
