/**
 * nurture.ts — Email nurture sequence enrollment helpers + unsubscribe endpoint
 *
 * Route registered here:
 *   GET /api/nurture/unsubscribe?token=<uuid>  — public, no auth, one-click opt-out
 *
 * Exported helpers (called from other route modules, not HTTP routes):
 *   enrollNurture()            — create / look up a nurture_enrollment row
 *   checkNurtureEligibility()  — suppression check before enrolling
 *   suppressOnConversion()     — suppress free_to_kit sequence when a lead converts
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

// ---------------------------------------------------------------------------
// Sequence configuration (total steps per sequence)
// ---------------------------------------------------------------------------

const FREE_TO_KIT_STEPS = 4;
const KIT_TO_DFY_STEPS = 3;
const KIT_TO_GROWTH_STEPS = 3;

const SEQUENCE_STEPS: Record<Sequence, number> = {
  free_to_kit: FREE_TO_KIT_STEPS,
  kit_to_dfy: KIT_TO_DFY_STEPS,
  kit_to_growth: KIT_TO_GROWTH_STEPS,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Sequence = "free_to_kit" | "kit_to_dfy" | "kit_to_growth";

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
  const totalSteps = SEQUENCE_STEPS[sequence];

  // Build the INSERT. We use ON CONFLICT (email, sequence) DO NOTHING for idempotency.
  // Two branches for delayMs > 0 vs 0 keep all param positions explicit and unambiguous.
  // next_send_at with delay: NOW() + ($5::bigint * INTERVAL '1 millisecond')
  // next_send_at immediate: NOW() — worker picks it up on next poll cycle.

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
 * Suppress the free_to_kit nurture sequence for the given email when they convert
 * (i.e. purchase the Kit). The kit_to_dfy sequence is unaffected.
 *
 * Idempotent: UPDATE has AND suppressed = FALSE so a double-call is a no-op.
 * Best-effort: callers must wrap in try/catch.
 */
export async function suppressOnConversion(
  db: PostgresClient,
  email: string
): Promise<void> {
  await db.query(
    `UPDATE nurture_enrollment
     SET suppressed = TRUE,
         suppressed_at = NOW(),
         suppressed_reason = 'converted',
         updated_at = NOW()
     WHERE email = $1
       AND sequence = 'free_to_kit'
       AND suppressed = FALSE`,
    [email]
  );

  logger.info("nurture_suppressed_conversion", {
    sequence: "free_to_kit",
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
