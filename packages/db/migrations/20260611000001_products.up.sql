-- =============================================================================
-- Migration: 20260611000001_products
-- Capability: Acquisition ladder — lead magnet + low-ticket Kit
--   (see docs/marketing/value-ladder.md)
--
-- Creates:
--   lead_capture — emails + result from "The AI Invisibility Test" (free hook)
--   kit_order    — one-time "$29 Get-Cited Kit" orders + stored deliverable
--
-- Both are PUBLIC-FACING, single-tenant operator data (like `waitlist`): no
-- RLS, no tenant_id. The buyer/lead is pre-account. PII = email only.
-- Retention governed by ROPA (marketing/transactional). citext for email.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- TABLE: lead_capture (The AI Invisibility Test)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_capture (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT,                       -- nullable: result can be shown before capture
  brand         TEXT         NOT NULL,
  competitor    TEXT,
  category      TEXT         NOT NULL,
  region        TEXT         NOT NULL DEFAULT 'US',  -- 'EU' | 'US'
  -- The scorecard result (engines, verdict, status) — no PII, no raw answers.
  result        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  source        TEXT         NOT NULL DEFAULT 'invisibility_test',
  ip_truncated  INET,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_email      ON lead_capture (email);
CREATE INDEX IF NOT EXISTS idx_lead_capture_created_at ON lead_capture (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: kit_order (The Get-Cited Kit — $29 one-time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kit_order (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- order_token: unguessable handle used in the delivery URL (/kit/:token).
  order_token     TEXT         NOT NULL UNIQUE,
  email           CITEXT       NOT NULL,
  brand           TEXT         NOT NULL,
  domain          TEXT,
  category        TEXT         NOT NULL,
  region          TEXT         NOT NULL DEFAULT 'US',
  -- 'pending' (created, awaiting payment) | 'paid' | 'delivered'
  status          TEXT         NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'delivered')),
  stripe_session_id TEXT,
  -- The generated deliverable (score + top fixes + drafts + checklist).
  deliverable     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kit_order_token   ON kit_order (order_token);
CREATE INDEX IF NOT EXISTS idx_kit_order_email   ON kit_order (email);
CREATE INDEX IF NOT EXISTS idx_kit_order_session ON kit_order (stripe_session_id);

-- ---------------------------------------------------------------------------
-- Grants — app_user can insert/select; updates allowed on kit_order for status
-- transitions (pending → paid → delivered) and storing the deliverable.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON lead_capture TO app_user;
GRANT SELECT, INSERT, UPDATE ON kit_order TO app_user;
REVOKE UPDATE, DELETE ON lead_capture FROM app_user;
REVOKE DELETE ON kit_order FROM app_user;
