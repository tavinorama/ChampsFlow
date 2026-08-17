/**
 * nurture.ts — Email nurture sequence enrollment helpers + unsubscribe endpoint
 *
 * Route registered here:
 *   GET /api/nurture/unsubscribe?token=<uuid>  — public, no auth, one-click opt-out
 *
 * Exported helpers (called from other route modules, not HTTP routes):
 *   enrollNurture()            — create / look up a nurture_enrollment row
 *   checkNurtureEligibility()  — suppression check before enrolling
 *   suppressOnConversion()     — suppress lower-rung sequences when a contact buys a higher rung
 *
 * Cadence / steps / chain / suppression map: packages/shared/src/nurture-cadence.ts
 * (founder rule 17/08: 0d, +1d, +2d, +2d for EVERY sequence).
 *
 * Compliance:
 *   - CAN-SPAM / LGPD Art. 18: one-click unsubscribe — token in email footer links here
 *   - No email address logged anywhere in this module (PII minimization)
 *   - Unsubscribe is idempotent: UPDATE has AND suppressed = FALSE guard
 *   - Token is truncated (first 8 chars) in logs — never the full value
 *
 * DB tables touched:
 *   nurture_enrollment (SELECT, INSERT, UPDATE)
 *
 * Hard rules:
 *   - All queries parameterized — no string interpolation
 *   - Enrollment and suppression are best-effort — callers catch and continue
 *   - No PII (email, full token) in any log call
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { publicRateLimit } from "../lib/public-rate-limit";

// ---------------------------------------------------------------------------
// Sequence configuration — single source of truth lives in
// packages/shared/src/nurture-cadence.ts (steps, delays, chain, suppression).
// ---------------------------------------------------------------------------

import {
  NURTURE_SUPPRESS_ON_CONVERSION,
  isSequenceCheckViolation,
  nurtureTotalSteps,
  type NurtureConversionKind,
  type NurtureSequence,
} from "../../../../packages/shared/src/nurture-cadence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sequence = NurtureSequence;

interface NurtureEnrollmentRow {
  id: string;
}

interface NurtureEligibilityResult {
  suppressed: boolean;
  alreadyEnrolled?: boolean;
}

interface EnrollResult {
  enrollmentId: string;
  alreadyEnrolled: boolean;
  /**
   * TRUE when the live DB CHECK constraint does not accept this sequence name
   * yet (migration not applied). Logged as nurture_sequence_not_allowed and
   * skipped: never a crash, never a fake "enrolled".
   */
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Exported helper: enrollNurture
// ---------------------------------------------------------------------------

/**
 * Create a nurture_enrollment row for the given email + sequence.
 * Idempotent: ON CONFLICT (email, sequence) DO NOTHING.
 * Returns { enrollmentId, alreadyEnrolled: true } if a row already existed.
 *
 * NEVER throws for business-logic conflicts — only re-throws unexpected DB errors.
 * Callers must wrap in try/catch and treat failures as best-effort.
 */
export async function enrollNurture(
  db: PostgresClient,
  params: {
    email: string;
    sequence: Sequence;
    brand: string;
    metadata: Record<string, unknown>;
    sourceLeadId?: string;
    sourceKitId?: string;
    delayMs?: number;
  }
): Promise<EnrollResult> {
  const {
    email,
    sequence,
    brand,
    metadata,
    sourceLeadId,
    sourceKitId,
    delayMs = 0,
  } = params;

  const id = randomUUID();
  const unsubscribeToken = randomUUID();
  const totalSteps = nurtureTotalSteps(sequence);

  // Build the INSERT. We use ON CONFLICT (email, sequence) DO NOTHING for idempotency.
  // Two branches for delayMs > 0 vs 0 keep all param positions explicit and unambiguous.
  // next_send_at with delay: NOW() + ($5::bigint * INTERVAL '1 millisecond')
  // next_send_at immediate: NOW() — worker picks it up on next poll cycle.

  try {
    if (delayMs > 0) {
      await db.query(
        `INSERT INTO nurture_enrollment
           (id, email, sequence, current_step, total_steps, enrolled_at,
            next_send_at, suppressed, unsubscribe_token,
            source_lead_id, source_kit_id, brand, metadata, created_at, updated_at)
         VALUES
           ($1, $2, $3, 0, $4, NOW(),
            NOW() + ($5::bigint * INTERVAL '1 millisecond'), FALSE, $6,
            $7, $8, $9, $10::jsonb, NOW(), NOW())
         ON CONFLICT (email, sequence) DO NOTHING`,
        [
          id,
          email,
          sequence,
          totalSteps,
          String(delayMs),
          unsubscribeToken,
          sourceLeadId ?? null,
          sourceKitId ?? null,
          brand,
          jsonbParam(metadata),
        ]
      );
    } else {
      await db.query(
        `INSERT INTO nurture_enrollment
           (id, email, sequence, current_step, total_steps, enrolled_at,
            next_send_at, suppressed, unsubscribe_token,
            source_lead_id, source_kit_id, brand, metadata, created_at, updated_at)
         VALUES
           ($1, $2, $3, 0, $4, NOW(),
            NOW(), FALSE, $5,
            $6, $7, $8, $9::jsonb, NOW(), NOW())
         ON CONFLICT (email, sequence) DO NOTHING`,
        [
          id,
          email,
          sequence,
          totalSteps,
          unsubscribeToken,
          sourceLeadId ?? null,
          sourceKitId ?? null,
          brand,
          jsonbParam(metadata),
        ]
      );
    }
  } catch (err) {
    if (isSequenceCheckViolation(err)) {
      // Migration widening nurture_enrollment_sequence_check not applied yet.
      // Log loudly (this is a lost enrollment, not an "ok") and skip.
      logger.error("nurture_sequence_not_allowed", {
        sequence,
        brand,
        message: (err as Error).message?.slice(0, 200),
        // No email logged — PII minimization
      });
      return { enrollmentId: "", alreadyEnrolled: false, skipped: true };
    }
    throw err;
  }

  // Check whether the INSERT succeeded (rows affected = 1) or was a no-op.
  // The simplest way is to query for the enrollment row by email + sequence.
  const existing = await db.query<NurtureEnrollmentRow>(
    `SELECT id FROM nurture_enrollment WHERE email = $1 AND sequence = $2 LIMIT 1`,
    [email, sequence]
  );

  const existingId = existing.rows[0]?.id ?? id;
  const alreadyEnrolled = existingId !== id;

  logger.info("nurture_enrolled", {
    sequence,
    brand,
    source: sourceLeadId ? "lead" : "kit",
    already_enrolled: alreadyEnrolled,
    // No email logged — PII minimization
  });

  return { enrollmentId: existingId, alreadyEnrolled };
}

// ---------------------------------------------------------------------------
// Exported helper: checkNurtureEligibility
// ---------------------------------------------------------------------------

/**
 * Check whether an email is already enrolled or suppressed in a given sequence.
 *
 * Returns:
 *   { suppressed: true }                               — do not enroll; email opted out
 *   { suppressed: false, alreadyEnrolled: true }       — already in sequence, not suppressed
 *   { suppressed: false, alreadyEnrolled: false }      — not enrolled; safe to enroll
 */
export async function checkNurtureEligibility(
  db: PostgresClient,
  email: string,
  sequence: Sequence
): Promise<NurtureEligibilityResult> {
  const { rows } = await db.query<{ suppressed: boolean }>(
    `SELECT suppressed FROM nurture_enrollment WHERE email = $1 AND sequence = $2 LIMIT 1`,
    [email, sequence]
  );

  if (rows.length === 0) {
    return { suppressed: false, alreadyEnrolled: false };
  }

  if (rows[0]!.suppressed) {
    return { suppressed: true };
  }

  return { suppressed: false, alreadyEnrolled: true };
}

// ---------------------------------------------------------------------------
// Exported helper: suppressOnConversion
// ---------------------------------------------------------------------------

/**
 * Suppress every LOWER-rung nurture sequence for an email once they buy a
 * higher rung. The rung → sequences map lives in nurture-cadence.ts
 * (NURTURE_SUPPRESS_ON_CONVERSION). Default kind = "kit" (the original
 * behaviour: a Kit purchase ends free_to_kit).
 *
 * Idempotent: UPDATE has AND suppressed = FALSE so a double-call is a no-op.
 * Best-effort: callers must wrap in try/catch.
 */
export async function suppressOnConversion(
  db: PostgresClient,
  email: string,
  kind: NurtureConversionKind = "kit"
): Promise<void> {
  const sequences = NURTURE_SUPPRESS_ON_CONVERSION[kind];
  await db.query(
    `UPDATE nurture_enrollment
     SET suppressed = TRUE,
         suppressed_at = NOW(),
         suppressed_reason = 'converted',
         updated_at = NOW()
     WHERE email = $1
       AND sequence = ANY($2::text[])
       AND suppressed = FALSE`,
    [email, [...sequences]]
  );

  logger.info("nurture_suppressed_conversion", {
    kind,
    sequences,
    // No email logged — PII minimization
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerNurtureRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/nurture/unsubscribe?token=<uuid>
  // Public — no auth required.
  // One-click unsubscribe (CAN-SPAM / LGPD Art. 18).
  // Idempotent: safe to call twice.
  // -------------------------------------------------------------------------

  app.get("/api/nurture/unsubscribe", async (c) => {
    // Unsubscribe by token. Generous, because a real person clicking twice
    // must never be blocked from opting out, but bounded so the endpoint
    // cannot be walked to enumerate tokens.
    const limited = await publicRateLimit(c, {
      bucket: "unsubscribe",
      limit: 60,
      windowMs: 60 * 60 * 1000,
      message: "Too many requests. Your unsubscribe link still works — try again shortly.",
    });
    if (limited) return limited;

    const token = c.req.query("token") ?? "";

    if (!token) {
      return c.json({ message: "Missing unsubscribe token." }, 400);
    }

    // Log only the first 8 chars of the token — never the full value (PII-adjacent)
    const tokenPrefix = token.slice(0, 8);

    let rows: { id: string; suppressed: boolean }[];
    try {
      const result = await db.query<{ id: string; suppressed: boolean }>(
        `SELECT id, suppressed FROM nurture_enrollment WHERE unsubscribe_token = $1 LIMIT 1`,
        [token]
      );
      rows = result.rows;
    } catch (err) {
      logger.error("nurture_unsubscribe_db_error", {
        token_prefix: tokenPrefix,
        message: (err as Error).message,
      });
      return c.json({ message: "Unable to process request. Please try again." }, 500);
    }

    if (rows.length === 0) {
      logger.info("nurture_unsubscribe_not_found", { token_prefix: tokenPrefix });
      return c.json({ message: "Already unsubscribed or link expired." }, 200);
    }

    const row = rows[0]!;

    if (row.suppressed) {
      logger.info("nurture_unsubscribe_already_suppressed", { token_prefix: tokenPrefix });
      return c.json({ message: "Already unsubscribed." }, 200);
    }

    try {
      await db.query(
        `UPDATE nurture_enrollment
         SET suppressed = TRUE,
             suppressed_at = NOW(),
             suppressed_reason = 'unsubscribed',
             updated_at = NOW()
         WHERE unsubscribe_token = $1
           AND suppressed = FALSE`,
        [token]
      );
    } catch (err) {
      logger.error("nurture_unsubscribe_update_error", {
        token_prefix: tokenPrefix,
        message: (err as Error).message,
      });
      return c.json({ message: "Unable to process request. Please try again." }, 500);
    }

    logger.info("nurture_unsubscribe", { token_prefix: tokenPrefix });
    return c.json({ message: "You have been unsubscribed." }, 200);
  });
}
