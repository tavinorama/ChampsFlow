/**
 * nurture-send.ts — Nurture email poll-and-send job
 *
 * Exported function:
 *   processNurtureJobs(sql) — called every 5 minutes from index.ts via setInterval.
 *
 * Flow per invocation:
 *   1. Query nurture_enrollment for due, non-suppressed, incomplete rows (LIMIT 50).
 *   2. For each row:
 *      a. Idempotency check: query nurture_send_log for (enrollment_id, step). If
 *         found, advance cursor and continue — already sent.
 *      b. Suppression re-check: re-read row from DB in case of mid-poll conversion.
 *      c. Determine which email sender to call based on (sequence, current_step).
 *         Build unsubscribeUrl from WEB_ORIGIN env.
 *      d. Send email (best-effort):
 *         - Missing RESEND_API_KEY → warn, skip (do NOT advance cursor; retry later).
 *         - Other send error → warn, skip advancing cursor (retry on next poll).
 *      e. On success:
 *         - INSERT nurture_send_log ON CONFLICT DO NOTHING.
 *         - If next_step >= total_steps: mark completed_at.
 *         - Else: advance current_step + set next_send_at using fixed inter-step delays.
 *      f. Log nurture_step_sent (no PII — no email, no token).
 *   3. Errors in any individual row are caught and logged; poll continues.
 *
 * Hard rules:
 *   - postgres-js tagged template literals ONLY (sql`...`) — never .query()
 *   - No PII in any log call (no email addresses, no unsubscribe tokens)
 *   - Missing RESEND_API_KEY → warn + skip (never mark sent, never crash)
 *   - Missing DATABASE_URL → createWorkerDb throws → caller logs + returns
 *   - Idempotency: check nurture_send_log BEFORE every send, insert AFTER ON CONFLICT DO NOTHING
 *
 * Inter-step delays (from NOW()): packages/shared/src/nurture-cadence.ts.
 * Founder rule 17/08: EVERY sequence is 0d, +1d, +2d, +2d.
 *
 * Chain (nurture-cadence NURTURE_CHAIN): when the LAST step of kit_to_growth
 * is sent and the buyer still has no paid subscription, the worker enrolls
 * kit_to_dfy immediately (step 1 at 0d). If the DB CHECK constraint does not
 * accept the chained name yet, log nurture_sequence_not_allowed and skip.
 */

import postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";
import { sendNurtureFree1Email } from "../../../../packages/shared/src/emails/nurture-free-1";
import { sendNurtureFree2Email } from "../../../../packages/shared/src/emails/nurture-free-2";
import { sendNurtureFree3Email } from "../../../../packages/shared/src/emails/nurture-free-3";
import { sendNurtureFree4Email } from "../../../../packages/shared/src/emails/nurture-free-4";
import { sendNurtureKit1Email } from "../../../../packages/shared/src/emails/nurture-kit-1";
import { sendNurtureKit2Email } from "../../../../packages/shared/src/emails/nurture-kit-2";
import { sendNurtureKit3Email } from "../../../../packages/shared/src/emails/nurture-kit-3";
import { sendNurtureGrowth1Email } from "../../../../packages/shared/src/emails/nurture-growth-1";
import { sendNurtureGrowth2Email } from "../../../../packages/shared/src/emails/nurture-growth-2";
import { sendNurtureGrowth3Email } from "../../../../packages/shared/src/emails/nurture-growth-3";
import {
  isCatalogSequence,
  sendNurtureCatalogEmail,
} from "../../../../packages/shared/src/emails/nurture-catalog";
import {
  NURTURE_CHAIN,
  isSequenceCheckViolation,
  nurtureNextStepDelayMs,
  nurtureTotalSteps,
  type NurtureSequence,
} from "../../../../packages/shared/src/nurture-cadence";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

// Inter-step delays: nurtureNextStepDelayMs() (nurture-cadence.ts). No local
// delay tables — the founder rule has one home.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrollmentRow {
  id: string;
  email: string;
  sequence: NurtureSequence;
  current_step: number;
  total_steps: number;
  unsubscribe_token: string;
  brand: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Email sender dispatch
// ---------------------------------------------------------------------------

type NurtureEmailParams = {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
};

export async function dispatchEmail(
  sequence: NurtureSequence,
  step: number,
  params: NurtureEmailParams
): Promise<void> {
  if (isCatalogSequence(sequence)) {
    return sendNurtureCatalogEmail(sequence, step, params);
  }
  if (sequence === "free_to_kit") {
    if (step === 0) return sendNurtureFree1Email(params);
    if (step === 1) return sendNurtureFree2Email(params);
    if (step === 2) return sendNurtureFree3Email(params);
    if (step === 3) return sendNurtureFree4Email(params);
  } else if (sequence === "kit_to_growth") {
    if (step === 0) return sendNurtureGrowth1Email(params);
    if (step === 1) return sendNurtureGrowth2Email(params);
    if (step === 2) return sendNurtureGrowth3Email(params);
  } else if (sequence === "kit_to_dfy") {
    if (step === 0) return sendNurtureKit1Email(params);
    if (step === 1) return sendNurtureKit2Email(params);
    if (step === 2) return sendNurtureKit3Email(params);
  }
  // ai_audit_to_full: senders (nurture-ai-audit-1/2) arrive with PR #479.
  // Until then an enrollment of that name (impossible on this branch: no
  // trigger) throws here, the row is kept and retried, never marked sent.
  throw new Error(
    `Unknown nurture step: sequence=${sequence} step=${step}`
  );
}

// ---------------------------------------------------------------------------
// Advance cursor helpers (called whether we sent or found idempotency hit)
// ---------------------------------------------------------------------------

async function advanceCursor(
  sql: postgres.Sql,
  row: EnrollmentRow,
  nextStep: number,
  resendMessageId?: string
): Promise<void> {
  // FIX: INSERT into nurture_send_log BEFORE updating nurture_enrollment.
  // Safe failure mode: if the process crashes after the insert but before the
  // update, the next poll re-reads current_step (still the old value), finds
  // the send log row, takes the idempotency branch (skip send), and then
  // advances the cursor. If we wrote the UPDATE first (old order) and crashed
  // before the INSERT, the next poll would find no log row for the incremented
  // step and dispatch the wrong email.
  if (resendMessageId !== undefined) {
    // Insert send log entry (ON CONFLICT DO NOTHING for idempotency)
    await sql`
      INSERT INTO nurture_send_log (enrollment_id, step, resend_message_id)
      VALUES (${row.id}, ${row.current_step}, ${resendMessageId})
      ON CONFLICT (enrollment_id, step) DO NOTHING
    `;
  }

  if (nextStep >= row.total_steps) {
    // Sequence complete
    await sql`
      UPDATE nurture_enrollment
      SET current_step = ${nextStep},
          completed_at = NOW(),
          updated_at   = NOW()
      WHERE id = ${row.id}
    `;
    // Chain to the next rung (kit_to_growth → kit_to_dfy) when nothing converted.
    await enrollChainedSequence(sql, row);
  } else {
    const delayMs = nurtureNextStepDelayMs(row.sequence, row.current_step);

    await sql`
      UPDATE nurture_enrollment
      SET current_step  = ${nextStep},
          next_send_at  = NOW() + (${String(delayMs)}::bigint * INTERVAL '1 millisecond'),
          updated_at    = NOW()
      WHERE id = ${row.id}
    `;
  }
}

// ---------------------------------------------------------------------------
// Chain: sequence completed → enroll the next rung if the contact did not buy
// ---------------------------------------------------------------------------

/**
 * Does this email belong to a workspace with a paid plan? Checked via
 * users → tenants.plan_tier (the denormalized column every billing webhook
 * syncs). "Paid" = anything but 'free'.
 */
export async function hasPaidSubscription(sql: postgres.Sql, email: string): Promise<boolean> {
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE lower(u.email) = lower(${email})
      AND t.plan_tier IS NOT NULL
      AND t.plan_tier <> 'free'
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Enroll the chained sequence for a completed enrollment. Best-effort:
 * never throws (a chain failure must not undo the completion above).
 * Idempotent through the (email, sequence) UNIQUE + ON CONFLICT DO NOTHING.
 */
export async function enrollChainedSequence(sql: postgres.Sql, row: EnrollmentRow): Promise<void> {
  const next = NURTURE_CHAIN[row.sequence];
  if (!next) return;
  try {
    if (await hasPaidSubscription(sql, row.email)) {
      logger.info("nurture_chain_skipped_converted", {
        from: row.sequence,
        to: next,
        enrollment_id: row.id,
      });
      return;
    }
    const totalSteps = nurtureTotalSteps(next);
    const metadata = { ...(row.metadata ?? {}), chained_from: row.sequence };
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO nurture_enrollment
        (email, sequence, current_step, total_steps, enrolled_at,
         next_send_at, suppressed, unsubscribe_token, brand, metadata,
         created_at, updated_at)
      VALUES
        (${row.email}, ${next}, 0, ${totalSteps}, NOW(),
         NOW(), FALSE, gen_random_uuid()::text, ${row.brand}, ${sql.json(metadata as never)},
         NOW(), NOW())
      ON CONFLICT (email, sequence) DO NOTHING
      RETURNING id
    `;
    logger.info("nurture_chain_enrolled", {
      from: row.sequence,
      to: next,
      enrollment_id: row.id,
      already_enrolled: inserted.length === 0,
    });
  } catch (err) {
    if (isSequenceCheckViolation(err)) {
      logger.error("nurture_sequence_not_allowed", {
        sequence: next,
        chained_from: row.sequence,
        enrollment_id: row.id,
        message: (err as Error).message?.slice(0, 200),
      });
      return;
    }
    logger.error("nurture_chain_enroll_error", {
      from: row.sequence,
      to: next,
      enrollment_id: row.id,
      message: (err as Error).message?.slice(0, 200),
    });
  }
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function processNurtureJobs(sql: postgres.Sql): Promise<void> {
  // 1. Fetch due, non-suppressed, incomplete enrollments
  let rows: EnrollmentRow[];
  try {
    rows = await sql<EnrollmentRow[]>`
      SELECT id, email, sequence, current_step, total_steps,
             unsubscribe_token, brand, metadata
      FROM nurture_enrollment
      WHERE suppressed    = FALSE
        AND completed_at  IS NULL
        AND next_send_at  IS NOT NULL
        AND next_send_at  <= NOW()
      ORDER BY next_send_at ASC
      LIMIT 50
    `;
  } catch (err) {
    logger.error("nurture_poll_fetch_error", {
      message: (err as Error).message,
    });
    return;
  }

  for (const row of rows) {
    try {
      // 2a. Idempotency check — was this step already sent?
      const sendLogRows = await sql<{ id: string }[]>`
        SELECT id FROM nurture_send_log
        WHERE enrollment_id = ${row.id}
          AND step = ${row.current_step}
        LIMIT 1
      `;

      if (sendLogRows.length > 0) {
        // Already sent — advance cursor without inserting another log row
        const nextStep = row.current_step + 1;
        await advanceCursor(sql, row, nextStep);
        logger.info("nurture_step_idempotent_skip", {
          sequence: row.sequence,
          step: row.current_step,
          enrollment_id: row.id,
        });
        continue;
      }

      // 2b. Suppression re-check (conversion may have happened mid-poll)
      const freshRows = await sql<{ suppressed: boolean }[]>`
        SELECT suppressed FROM nurture_enrollment
        WHERE id = ${row.id}
        LIMIT 1
      `;
      if (!freshRows[0] || freshRows[0].suppressed) {
        logger.info("nurture_step_suppressed_skip", {
          sequence: row.sequence,
          step: row.current_step,
          enrollment_id: row.id,
        });
        continue;
      }

      // 2c. Build params for the email sender
      const unsubscribeUrl = `${WEB_ORIGIN}/api/nurture/unsubscribe?token=${row.unsubscribe_token}`;
      const emailParams: NurtureEmailParams = {
        to: row.email,
        brand: row.brand,
        unsubscribeUrl,
        metadata: row.metadata ?? undefined,
      };

      // 2d. Send email (best-effort)
      let resendMessageId = "";
      try {
        await dispatchEmail(row.sequence, row.current_step, emailParams);
        // resendMessageId remains "" because the 7 nurture email sender functions
        // (nurture-free-1…4, nurture-kit-1…3) currently return Promise<void> and
        // discard the Resend API response object. Capturing the real message ID
        // requires each sender to return the Resend response and thread it back
        // here — tracked as a future refactor. Until then, deliverability tracing
        // via resend_message_id is unavailable; use Resend's dashboard for that.
        resendMessageId = "";
      } catch (sendErr) {
        const message = (sendErr as Error).message ?? "";
        if (message.includes("RESEND_API_KEY is not configured")) {
          // Missing key — warn and skip advancing cursor; will retry on next poll
          logger.warn("nurture_resend_key_missing", {
            sequence: row.sequence,
            step: row.current_step,
            enrollment_id: row.id,
          });
          continue;
        }
        // Other send error — log warning, skip advancing cursor (retry next poll)
        logger.warn("nurture_step_send_error", {
          sequence: row.sequence,
          step: row.current_step,
          enrollment_id: row.id,
          message: message.slice(0, 200),
        });
        continue;
      }

      // 2e. On successful send — insert log + advance cursor
      const nextStep = row.current_step + 1;
      await advanceCursor(sql, row, nextStep, resendMessageId);

      // 2f. Structured log (no PII — no email, no token)
      logger.info("nurture_step_sent", {
        sequence: row.sequence,
        step: row.current_step,
        enrollment_id: row.id,
      });
    } catch (rowErr) {
      // 3. Degrade gracefully — any unexpected error on a single row must not crash the poll
      logger.error("nurture_step_unexpected_error", {
        enrollment_id: row.id,
        sequence: row.sequence,
        step: row.current_step,
        message: (rowErr as Error).message?.slice(0, 200),
      });
    }
  }
}
