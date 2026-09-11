-- =============================================================================
-- Migration: 20260911000001_crm_design_partner
-- Capability: the 19-day canal B design-partner funnel on crm_contact.
--
-- WHAT IT DOES
--   1. ADDS crm_contact.source — where the contact came from. The weekly report
--      groups by it, so it is an allowlist in code (crm-validation.CRM_SOURCES),
--      not free text. NULL means "we never labelled this contact", which is a
--      different fact from "this contact came from nowhere", so there is no
--      DEFAULT and no backfill: existing rows keep their honest NULL.
--   2. WIDENS the stage CHECK to accept the funnel the founder approved on
--      2026-09-11: contatado -> conversa marcada -> conversa feita -> proposta
--      -> pago, stored as contacted / call_booked / call_done / proposal / paid.
--      'contacted' is REUSED for the first step; the four new values are added.
--
-- WHY 'customer' STAYS
--   Rows written before this migration use 'customer' for a paying contact.
--   Renaming it would rewrite history, which this house does not do. The funnel
--   roll-up (apps/api/src/lib/design-partner-funnel.ts) counts 'customer' as
--   'paid', so no existing row is lost and no number changes meaning.
--
-- ADDITIVE AND SAFE TO RUN WHILE THE APP IS UP
--   Adding a nullable column and RELAXING a CHECK constraint (every value the
--   old one allowed, the new one allows too) cannot invalidate a stored row and
--   cannot break a deployed reader. The application already runs correctly
--   BEFORE this migration: upsertCrmContact retries without `source` on 42703
--   and refuses a funnel stage with a named error on 23514, and both read
--   endpoints step down and report the funnel as OFF. So this can land before
--   or after the app deploy, in either order.
--
-- NO RLS, deliberately: same as the original 20260713000002 — crm_contact
--   carries no tenant_id and is reachable only through requireSuperAdmin /
--   operator-key routes.
-- =============================================================================

-- 1. Origin track ------------------------------------------------------------
ALTER TABLE crm_contact
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN crm_contact.source IS
  'Origin track: design-partner | cold | inbound | referral | other. NULL = never labelled. Allowlist enforced in apps/api/src/lib/crm-validation.ts.';

-- "Show me the design partners" is the hot query for the weekly report, and
-- almost every row is expected to have a NULL source — so it is partial.
CREATE INDEX IF NOT EXISTS idx_crm_contact_source
  ON crm_contact (source)
  WHERE source IS NOT NULL;

-- 2. The funnel stages -------------------------------------------------------
-- The original constraint was created inline by the CREATE TABLE, so Postgres
-- named it crm_contact_stage_check. Dropping IF EXISTS then adding the wider
-- one under an explicit name makes this re-runnable and the .down exact.
ALTER TABLE crm_contact
  DROP CONSTRAINT IF EXISTS crm_contact_stage_check;

ALTER TABLE crm_contact
  DROP CONSTRAINT IF EXISTS crm_contact_stage_allowed;

ALTER TABLE crm_contact
  ADD CONSTRAINT crm_contact_stage_allowed
  CHECK (stage IN (
    -- pre-existing, unchanged in meaning
    'new', 'contacted', 'qualified', 'customer', 'lost',
    -- design-partner funnel (2026-09-11)
    'call_booked', 'call_done', 'proposal', 'paid'
  ));
