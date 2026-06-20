-- =============================================================================
-- Migration: 20260511000001_waitlist
-- Capability: Marketing / Landing Page — waitlist signup
-- Date: 2026-05-11
--
-- Creates the `waitlist` table for pre-launch email collection.
--
-- Design notes:
--  - email stored as citext (case-insensitive text, requires pg citext extension)
--    for collision-safe UNIQUE constraint regardless of case variation.
--  - NO RLS / NO tenant_id: this is single-tenant, public-facing data.
--    All waitlist entries belong to Organic Posts as controller.
--    The instruction in docs/03-architecture.md §4.1 applies to tenant-scoped
--    tables (which this is not). Waitlist is operator data, not user data.
--  - ip_truncated stores the /24 (IPv4) or /48 (IPv6) prefix per the same
--    truncateIp() helper used in dpa.ts and dsr.ts (GDPR data minimization).
--  - confirmed column reserved for future double-opt-in flow (not wired in v1).
--  - confirmation_token reserved for future double-opt-in email token.
--  - source defaults to 'landing'; can be 'blog' etc. for future attribution.
--
-- Retention: defined in ROPA — marketing consent data retained until
-- unsubscribe or DSR erasure request. Row deletion handled by ops tooling.
--
-- Sub-processor: Resend handles email delivery (approved in architecture §11).
-- =============================================================================

-- Ensure citext extension is available (Supabase enables it by default)
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- TABLE: waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS waitlist (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Email: citext for case-insensitive uniqueness (UNIQUE enforced below).
  -- citext equality is case-insensitive; indexes work correctly.
  email                CITEXT        NOT NULL,

  -- GDPR consent: whether user opted in to marketing emails.
  -- FALSE = joined for launch notification only (no marketing).
  -- Pre-ticking is prohibited; this is always the user's explicit choice.
  opted_in             BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Double-opt-in workflow (reserved for v1.1; not wired in v1)
  confirmed            BOOLEAN       NOT NULL DEFAULT FALSE,
  confirmation_token   TEXT,                       -- random 32-byte hex when generated

  -- Attribution
  source               TEXT          NOT NULL DEFAULT 'landing',
                                     -- 'landing' | 'blog' | 'referral' etc.

  -- GDPR data minimization: truncated IP only (see truncateIp() in dpa.ts)
  ip_truncated         INET,

  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

-- UNIQUE on email (case-insensitive via citext)
ALTER TABLE waitlist
  ADD CONSTRAINT waitlist_email_unique UNIQUE (email);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: email (also covered by UNIQUE constraint index, but explicit)
CREATE INDEX IF NOT EXISTS idx_waitlist_email
  ON waitlist (email);

-- Attribution analytics (non-critical; deferred stats on signup source)
CREATE INDEX IF NOT EXISTS idx_waitlist_source
  ON waitlist (source);

-- Date-ordered queries (e.g. "show first 100 signups")
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON waitlist (created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- app_user: INSERT (signups) + SELECT (admin reads, future unsubscribe flow)
-- No UPDATE — waitlist entries are immutable except via direct DB ops for erasure.
-- No DELETE via app — erasure handled by DSR fulfillment path (super_admin or ops tooling).
GRANT SELECT, INSERT ON waitlist TO app_user;
GRANT SELECT ON waitlist TO organicposts_admin;

-- Revoke DELETE from app_user — signups are append-only via API.
-- Erasure on DSR request is handled by organicposts_admin or a dedicated erasure function.
REVOKE DELETE ON waitlist FROM app_user;
REVOKE UPDATE ON waitlist FROM app_user;
