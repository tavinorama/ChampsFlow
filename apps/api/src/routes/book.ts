/**
 * book.ts — POST /api/book/intake (D3, 2026-08-17).
 *
 * The /book page had a gap: a visitor could open Calendly and leave, and we
 * never learned they came. This small public intake runs BEFORE the calendar
 * (email required, brand optional) so the visit becomes a lead we can follow:
 *
 *   lead_capture (source='book_call')  → the row every funnel report reads
 *   immediate identity claim           → a visitor who already has an account
 *                                        gets the row attached (same rule as
 *                                        /api/test, #218)
 *   enrollNurture("book_to_dfy")       → ONLY with explicit marketing consent
 *                                        (LGPD Art. 7(I) / GDPR Art. 6(1)(a));
 *                                        two honest nudges toward the call
 *
 * Public, so it is rate-limited like /api/test (8 per hour per truncated IP,
 * shared limiter). Every write after the lead row is best-effort: a claim or
 * a nurture failure never turns a 200 into a 500. Email is never logged.
 * Logged-in users skip the form on the page; the route stays the same.
 */

import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { publicRateLimit } from "../lib/public-rate-limit";
import { clientIp } from "../lib/client-ip";
import { truncateIp } from "./dpa";
import { asStr } from "../lib/coerce";
import { enrollNurture } from "./nurture";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STR = 120;
/** Same envelope as /api/test: 8 per hour per (truncated) IP. */
export const BOOK_INTAKE_LIMIT = 8;
export const BOOK_INTAKE_WINDOW_MS = 60 * 60 * 1000;

export interface BookIntakeInput {
  email: string;
  brand: string | null;
  marketingConsent: boolean;
  /** Where the visitor came from (dashboard prime tab, pricing, ...). Free text, capped. */
  from: string | null;
}

/** Pure: shape + validate the body. Returns an error code or the clean input. */
export function parseBookIntake(body: unknown): { ok: true; value: BookIntakeInput } | { ok: false; code: string; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const email = asStr(b["email"]).trim().toLowerCase().slice(0, 254);
  if (!email) return { ok: false, code: "EMAIL_REQUIRED", message: "Email is required to book the call." };
  if (!EMAIL_RE.test(email)) return { ok: false, code: "EMAIL_INVALID", message: "That email does not look right." };
  const brand = asStr(b["brand"]).trim().slice(0, MAX_STR) || null;
  const from = asStr(b["from"]).trim().slice(0, 60) || null;
  return { ok: true, value: { email, brand, marketingConsent: b["marketing_consent"] === true, from } };
}

export function registerBookRoutes(app: Hono, db: PostgresClient): void {
  app.post("/api/book/intake", async (c) => {
    const limited = await publicRateLimit(c, {
      bucket: "book_intake",
      limit: BOOK_INTAKE_LIMIT,
      windowMs: BOOK_INTAKE_WINDOW_MS,
      message: "Too many requests. Please try again in an hour.",
    });
    if (limited) return limited;

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ message: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
    const parsed = parseBookIntake(body);
    if (!parsed.ok) return c.json({ message: parsed.message, code: parsed.code }, 400);
    const { email, brand, marketingConsent, from } = parsed.value;

    const ip = clientIp(c);
    const leadId = randomUUID();
    let leadStored = false;
    try {
      await db.query(
        `INSERT INTO lead_capture (id, email, brand, category, region, result, source, ip_truncated, marketing_consent, created_at)
         VALUES ($1,$2,$3,'book_call','US',$4,'book_call',$5,$6, NOW())`,
        [
          leadId,
          email,
          brand ?? "(not given)",
          jsonbParam({ from, consent: marketingConsent }),
          ip ? truncateIp(ip) : null,
          marketingConsent,
        ]
      );
      leadStored = true;
    } catch (err) {
      logger.warn("book_intake_lead_insert_failed", { message: (err as Error).message?.slice(0, 160) });
    }

    // Identity claim: the visitor already has an account → attach the row now
    // (bootstrap's claim only runs at first login). Best-effort, idempotent.
    let claimedTenantId: string | null = null;
    if (leadStored) {
      try {
        const { rows } = await db.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM users WHERE lower(email) = $1 LIMIT 1`,
          [email]
        );
        claimedTenantId = rows[0]?.tenant_id ?? null;
        if (claimedTenantId) {
          await db.query(
            `UPDATE lead_capture SET claimed_at = NOW(), claimed_by_tenant_id = $2
              WHERE id = $1 AND claimed_at IS NULL`,
            [leadId, claimedTenantId]
          );
        }
      } catch (err) {
        logger.warn("book_intake_claim_failed", { message: (err as Error).message?.slice(0, 160) });
      }
    }

    // Nurture: consent only. The sequence CHECK may not include book_to_dfy
    // yet (migration owned by another PR) — then the insert fails and we log.
    let nurtureEnrolled = false;
    if (marketingConsent) {
      try {
        const r = await enrollNurture(db, {
          email,
          sequence: "book_to_dfy",
          brand: brand ?? "your brand",
          metadata: { source: "book_call", from, lead_id: leadId },
          sourceLeadId: leadStored ? leadId : undefined,
        });
        nurtureEnrolled = !r.alreadyEnrolled;
      } catch (err) {
        logger.warn("book_intake_nurture_failed", { message: (err as Error).message?.slice(0, 160) });
      }
    }

    logger.info("book_intake", { lead_stored: leadStored, claimed: !!claimedTenantId, nurture: nurtureEnrolled, from });
    return c.json({ ok: true, leadId: leadStored ? leadId : null, claimed: !!claimedTenantId, nurtureEnrolled });
  });
}
