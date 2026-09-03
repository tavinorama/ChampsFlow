/**
 * webhooks-smartlead.ts — P34: Smartlead events → evidence + CRM, BEFORE the
 * first cold email is dispatched (the founder's precondition).
 *
 * Flow per event:
 *   1. Auth: constant-time token check against SMARTLEAD_WEBHOOK_SECRET.
 *      The token travels in the URL Smartlead was registered with — Smartlead
 *      offers no request signing, so a capability URL is the available
 *      mechanism. 503 (not 401) when the env var is unset: an unconfigured
 *      webhook must scream "not configured", never masquerade as auth failure.
 *   2. Evidence first: the raw payload lands append-only in smartlead_event.
 *      If the CRM derivation below ever looks wrong, this table answers what
 *      the provider actually sent.
 *   3. Derivation second: upsert crm_contact — a reply promotes toward
 *      'contacted', an unsubscribe moves new/contacted to 'lost', and NOTHING
 *      here ever downgrades a human-set stage (qualified/customer are the
 *      founder's judgments; a bounce does not un-qualify a customer).
 *
 * No auth middleware on this path (mirrors /api/billing/webhook) — the token
 * IS the auth. Runs unscoped (no tenant): outbound leads are not tenants.
 */

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { config } from "../config";
import { nextStageFor, type Stage } from "../lib/smartlead-stage";

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerSmartleadWebhookRoutes(app: Hono, db: PostgresClient): void {
  app.post("/api/webhooks/smartlead", async (c) => {
    const secret = config.SMARTLEAD_WEBHOOK_SECRET;
    if (!secret) {
      // Not configured is an OPERATOR error, loudly distinct from bad auth.
      logger.error("smartlead_webhook_unconfigured", {
        effect: "event dropped — set SMARTLEAD_WEBHOOK_SECRET on the api service",
      });
      return c.json({ message: "Webhook not configured." }, 503);
    }
    if (!tokenMatches(c.req.query("token"), secret)) {
      return c.json({ message: "Unauthorized." }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ message: "Body must be JSON." }, 400);
    }

    // Smartlead's payload shape varies by event; read defensively, keep raw.
    const eventType = String(payload["event_type"] ?? payload["eventType"] ?? "UNKNOWN");
    const campaignRaw = payload["campaign_id"] ?? payload["campaignId"];
    const campaignId = Number.isFinite(Number(campaignRaw)) ? Number(campaignRaw) : null;
    // BUG 03/09: o payload real de EMAIL_REPLY traz o lead em `sl_lead_email`
    // (a chave `lead_email` não existe), e `to_email` numa RESPOSTA é a NOSSA
    // caixa remetente — cair nela promovia a caixa errada no CRM. Preferência:
    // sl_lead_email → lead_email → to_email (NUNCA num reply) → email.
    const emailRaw =
      payload["sl_lead_email"] ??
      payload["lead_email"] ??
      (eventType === "EMAIL_REPLY" ? null : payload["to_email"]) ??
      payload["email"] ??
      null;
    const leadEmail =
      typeof emailRaw === "string" && emailRaw.includes("@")
        ? emailRaw.trim().toLowerCase()
        : null;

    // 1. Evidence, append-only. This must succeed for the request to count.
    await db.query(
      `INSERT INTO smartlead_event (event_type, campaign_id, lead_email, payload)
       VALUES ($1, $2, $3, $4)`,
      [eventType, campaignId, leadEmail, JSON.stringify(payload)]
    );

    // 2. Derivation. Fails open with a loud log: a CRM annotation error must
    // never make Smartlead retry (and re-store) the event.
    if (leadEmail) {
      try {
        const noteLine = `[smartlead] ${eventType}${campaignId ? ` (campaign ${campaignId})` : ""} ${new Date().toISOString().slice(0, 10)}`;
        const res = await db.query<{ stage: Stage }>(
          `SELECT stage FROM crm_contact WHERE email = $1`,
          [leadEmail]
        );
        const current = (res.rows[0]?.stage as Stage | undefined) ?? null;
        const next = nextStageFor(current, eventType);
        await db.query(
          `INSERT INTO crm_contact (email, stage, note, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (email) DO UPDATE SET
             stage = COALESCE($4, crm_contact.stage),
             note = LEFT(COALESCE(crm_contact.note || E'\\n', '') || $3, 4000),
             updated_at = NOW()`,
          [leadEmail, next ?? "new", noteLine, next]
        );
      } catch (err) {
        logger.error("smartlead_crm_annotation_failed", {
          leadEmail,
          eventType,
          message: (err as Error).message?.slice(0, 160),
          effect: "event stored; CRM row NOT annotated — reconcile from smartlead_event",
        });
      }
    }

    return c.json({ ok: true });
  });
}
