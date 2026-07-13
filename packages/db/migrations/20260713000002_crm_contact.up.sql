-- =============================================================================
-- Migration: 20260713000002_crm_contact
-- Capability: lightweight CRM layer on the founder /admin dashboard.
--
-- A single email-keyed annotation table that overlays a sales stage, a free-text
-- note, and a next-follow-up date on top of whoever the person already is
-- (a captured lead, a Kit buyer, a subscriber). Email is the universal identity
-- key across those surfaces (identity-continuity was already built by email), so
-- annotating by email avoids restructuring lead_capture / kit_order / tenants.
--
-- Deliberately NO RLS: this mirrors the existing cross-tenant ops tables
-- (lead_capture, kit_order) — it carries no tenant_id, holds no tenant-scoped
-- data, and is reachable ONLY through requireSuperAdmin routes. Adding a
-- tenant-isolation policy here would be meaningless (there is no tenant column)
-- and would break the founder-only admin reads.
--
-- Reversible: the .down drops the table. Additive to the schema; existing admin
-- endpoints do NOT join this table (they read it via a separate, table-missing-
-- tolerant endpoint), so this migration can land before or after the app deploy
-- without breaking the dashboard.
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_contact (
  -- Normalized (lower-cased, trimmed) email — the identity key.
  email          TEXT PRIMARY KEY,
  stage          TEXT        NOT NULL DEFAULT 'new'
                   CHECK (stage IN ('new', 'contacted', 'qualified', 'customer', 'lost')),
  note           TEXT,
  next_follow_up TIMESTAMPTZ,
  -- Optional free-text owner label (who is handling this contact).
  owner          TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Supabase auth user id of the admin who last edited (audit trail; no FK so a
  -- deleted admin never blocks the annotation).
  updated_by     UUID
);

-- "Who is due for follow-up" is the hot query — partial index skips the many
-- rows with no scheduled follow-up.
CREATE INDEX IF NOT EXISTS idx_crm_contact_follow_up
  ON crm_contact (next_follow_up)
  WHERE next_follow_up IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contact_stage
  ON crm_contact (stage);
