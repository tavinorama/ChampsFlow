-- =============================================================================
-- Migration: 20260625000001_nurture_sequence
-- Capability: Multi-step email nurture sequences
--   (see docs/02-prd.md — acquisition ladder: free-to-kit and kit-to-dfy)
--
-- Changes:
--   1. ALTER lead_capture — add marketing_consent BOOLEAN (LGPD Art. 7(I) consent
--        gate: only consented leads are enrolled in the nurture sequence)
--   2. CREATE nurture_enrollment — one row per (email, sequence); tracks step
--        cursor, suppression state, and scheduling metadata
--   3. CREATE nurture_send_log — append-only audit of every send attempt;
--        idempotency key is (enrollment_id, step)
--
-- Both new tables are PUBLIC-FACING, single-tenant operator data (like
-- lead_capture / kit_order — no tenant_id, no RLS). Pre-account marketing
-- contacts. PII = email only.
--
-- Retention: governed by ROPA activity G12 (transactional email via Resend).
-- nurture_enrollment holds email for the duration of the sequence plus 1 year
-- after suppression or completion (retention policy: MARKETING_NURTURE_1YR).
-- nurture_send_log is audit data retained for 3 years (AUDIT_3YR).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALTER lead_capture — add marketing_consent
-- ---------------------------------------------------------------------------
-- LGPD Art. 7(I) / GDPR Art. 6(1)(a): consent basis for marketing email.
-- Default FALSE so every pre-existing row is treated as non-consented (correct —
-- those rows predate the consent UI). The column is set by the free-test endpoint
-- when the user explicitly ticks the opt-in checkbox.
-- Retention: inherits lead_capture retention policy (MARKETING_LEAD_1YR from ROPA).
ALTER TABLE lead_capture
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;
  -- LGPD Art. 7(I) / GDPR Art. 6(1)(a) consent flag

-- Index for the enrollment worker: find consented leads by email quickly.
CREATE INDEX IF NOT EXISTS idx_lead_capture_email_consent
  ON lead_capture (email, marketing_consent);

-- ---------------------------------------------------------------------------
-- 2. TABLE: nurture_enrollment
-- ---------------------------------------------------------------------------
-- One row per (email, sequence). The background worker polls on next_send_at
-- to dispatch the next email step, then advances current_step and sets the
-- next next_send_at. Suppression (unsubscribe / convert / bounce) flips the
-- suppressed flag so the worker skips the row permanently.
--
-- PII: email -- LGPD Art. 7(I) consent basis (lead enrolled only if
-- marketing_consent = TRUE on lead_capture, or via kit purchase which implies
-- transactional basis). Retention policy: MARKETING_NURTURE_1YR (suppressed_at
-- or completed_at + 1 year, whichever comes first; purge job must check both).
CREATE TABLE IF NOT EXISTS nurture_enrollment (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PII: email -- ENCRYPTED: AES-256 at application layer
  -- Retention: MARKETING_NURTURE_1YR — purge at MAX(suppressed_at, completed_at) + 1 year
  email            CITEXT      NOT NULL,
  -- Sequence identifier: 'free_to_kit' (lead → $29 Kit) | 'kit_to_dfy' (kit buyer → DFY consult)
  sequence         TEXT        NOT NULL
                   CHECK (sequence IN ('free_to_kit', 'kit_to_dfy')),
  -- Step cursor: 0 = no step sent yet; incremented by worker after each send.
  current_step     INT         NOT NULL DEFAULT 0
                   CHECK (current_step >= 0),
  -- Total steps in the sequence (set at enrollment time from sequence config).
  total_steps      INT         NOT NULL,
  enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Scheduler: worker reads rows WHERE suppressed = FALSE AND completed_at IS NULL
  -- AND next_send_at <= NOW(). After each send, worker sets next_send_at for step+1.
  next_send_at     TIMESTAMPTZ,
  -- All steps sent successfully (set when current_step = total_steps).
  completed_at     TIMESTAMPTZ,
  -- Suppression flag: TRUE stops the worker from sending further steps.
  suppressed       BOOLEAN     NOT NULL DEFAULT FALSE,
  suppressed_at    TIMESTAMPTZ,
  suppressed_reason TEXT
                   CHECK (
                     suppressed_reason IN ('unsubscribed', 'converted', 'bounced')
                     OR suppressed_reason IS NULL
                   ),
  -- One-click unsubscribe token (UUID v4 in application; unique per enrollment).
  -- Delivered in email footer as /unsubscribe?token=<value>.
  unsubscribe_token TEXT        UNIQUE,
  -- Source references: at most one is set, depending on the sequence.
  -- source_lead_id: FK to lead_capture.id (set for 'free_to_kit' enrollments).
  -- ON DELETE SET NULL: lead_capture row can be erased (DSR/LGPD) independently.
  source_lead_id   UUID        REFERENCES lead_capture (id) ON DELETE SET NULL,
  -- source_kit_id: FK to kit_order.id (set for 'kit_to_dfy' enrollments).
  -- ON DELETE SET NULL: same DSR erasure independence principle.
  source_kit_id    UUID        REFERENCES kit_order (id) ON DELETE SET NULL,
  -- Personalization fields (non-PII): brand name and score snapshot.
  brand            TEXT        NOT NULL,
  -- metadata: non-PII personalization payload (TrustIndex score, top fix teaser,
  -- kit tier, etc.). Populated at enrollment time from the source row.
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One enrollment per contact per sequence (prevents duplicate enrollments).
ALTER TABLE nurture_enrollment
  ADD CONSTRAINT uq_nurture_enrollment_email_sequence
    UNIQUE (email, sequence);

-- Worker query: look up by email for suppression checks / re-enrollment guards.
CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_email
  ON nurture_enrollment (email);

-- Primary worker poll index: fetch all due, non-suppressed, incomplete rows.
-- Partial index keeps this lean — suppressed and completed rows are excluded.
CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_next_send
  ON nurture_enrollment (next_send_at)
  WHERE suppressed = FALSE AND completed_at IS NULL;

-- Unsubscribe endpoint lookup: /unsubscribe?token=<value>
CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_unsubscribe_token
  ON nurture_enrollment (unsubscribe_token);

-- Ops/monitoring: filter by suppression state and completion (dashboard queries).
CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_suppressed_completed
  ON nurture_enrollment (suppressed, completed_at);

-- FK indexes (every FK must be indexed per hard rule 3).
CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_source_lead
  ON nurture_enrollment (source_lead_id);

CREATE INDEX IF NOT EXISTS idx_nurture_enrollment_source_kit
  ON nurture_enrollment (source_kit_id);

-- ---------------------------------------------------------------------------
-- 3. TABLE: nurture_send_log
-- ---------------------------------------------------------------------------
-- Append-only audit table. One row per (enrollment_id, step) attempt.
-- The UNIQUE constraint on (enrollment_id, step) is the idempotency key —
-- the worker checks for an existing row before sending; if found, it skips.
-- resend_message_id NULL = send attempted but failed / not yet confirmed.
--
-- Retention: AUDIT_3YR (mirrors G14 audit log retention from ROPA: 3 years).
-- No PII stored directly — enrollment_id is a UUID FK to the enrollment row
-- which holds the email. Erasure of an enrollment cascades to these rows.
CREATE TABLE IF NOT EXISTS nurture_send_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Retention: AUDIT_3YR — purge at sent_at + 3 years (cascade from enrollment erasure)
  enrollment_id       UUID        NOT NULL REFERENCES nurture_enrollment (id) ON DELETE CASCADE,
  step                INT         NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The message ID returned by Resend API. NULL if the send attempt failed or
  -- is pending confirmation. Used for delivery-status reconciliation.
  resend_message_id   TEXT
);

-- Idempotency: each (enrollment, step) pair is sent at most once.
ALTER TABLE nurture_send_log
  ADD CONSTRAINT uq_nurture_send_log_enrollment_step
    UNIQUE (enrollment_id, step);

-- FK index: look up all send log rows for a given enrollment efficiently.
CREATE INDEX IF NOT EXISTS idx_nurture_send_log_enrollment
  ON nurture_send_log (enrollment_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- lead_capture: grant UPDATE so the test endpoint can set marketing_consent = TRUE.
-- (SELECT + INSERT were already granted in 20260611000001_products.)
GRANT UPDATE ON lead_capture TO app_user;

-- nurture_enrollment: full CRUD for the worker (it inserts, reads, and advances
-- step cursor / suppression state). No DELETE — suppression is a soft flag.
GRANT SELECT, INSERT, UPDATE ON nurture_enrollment TO app_user;

-- nurture_send_log: INSERT + SELECT only — append-only table.
-- Explicitly revoke UPDATE and DELETE to enforce the append-only invariant.
GRANT SELECT, INSERT ON nurture_send_log TO app_user;
REVOKE UPDATE, DELETE ON nurture_send_log FROM app_user;
