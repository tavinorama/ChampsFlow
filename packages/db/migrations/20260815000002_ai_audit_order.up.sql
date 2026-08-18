-- =============================================================================
-- Migration: 20260815000002_ai_audit_order
-- Capability: AI Audit Stack becomes a PAID $49 one-time product (founder,
--   2026-08-15). /ai-audit now requires an email and a Stripe checkout before
--   the entry pick is shown, exactly like the $29 Get-Cited Kit.
--
-- Creates:
--   ai_audit_order — one row per $49 order: the buyer's email, the questionnaire
--                    answers (jsonb), the Stripe session binding and the stored
--                    deliverable (entry pick + honest teaser of the full report).
--
-- Mirrors kit_order column-for-column where the concept exists
-- (20260611000001_products + 20260623000001_kit_test_link +
--  20260708000001_identity_claim + 20260712000001_billing_session_unique +
--  20260712000002_order_refund_status + 20260728000001_operator_tables_rls):
--   - order_token is the unguessable delivery handle (/ai-audit/:token)
--   - stripe_session_id UNIQUE partial index: one paid session unlocks at most
--     ONE order even if the application binding check were bypassed
--   - status includes 'refunded' + 'failed' so the existing webhook revocation
--     and async_payment_failed paths can be mirrored without a follow-up
--   - lead_capture_id links the order to the lead_capture row minted at
--     checkout (source='ai_audit'); ON DELETE SET NULL so a DSR erasure of the
--     lead never breaks the paid order
--   - claimed_at / claimed_by_tenant_id: identity continuity (#166 / #218)
--   - RLS posture identical to kit_order: FORCE RLS, service_only for postgres,
--     app_user may only SELECT rows claimed to the current tenant, PostgREST
--     roles (anon / authenticated) revoked.
--
-- Also widens nurture_enrollment.sequence to accept 'ai_audit_to_full' (the
-- post-purchase sequence into the OrganicPosts $1.5k GEO + AI Audit bundle),
-- following 20260715000001_nurture_kit_to_growth.
--
-- The code (PR B) tolerates this migration NOT being applied yet: on
-- undefined_table (42P01) the routes answer 503 AI_AUDIT_ORDERS_NOT_READY.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS ai_audit_order (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unguessable handle used in the delivery URL (/ai-audit/:token).
  order_token           TEXT         NOT NULL UNIQUE,
  email                 CITEXT       NOT NULL,
  business_type         TEXT,
  primary_focus         TEXT,
  -- The questionnaire answers as sent to the engine (pains, engines, toolsInUse…).
  answers               JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- 'pending' (awaiting payment) | 'paid' | 'delivered' | 'refunded' | 'failed'
  status                TEXT         NOT NULL DEFAULT 'pending'
                        CONSTRAINT ai_audit_order_status_check
                        CHECK (status IN ('pending', 'paid', 'delivered', 'refunded', 'failed')),
  stripe_session_id     TEXT,
  paid_at               TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  -- The stored deliverable (entry pick + teaser of the full report).
  deliverable           JSONB,
  lead_capture_id       UUID         REFERENCES lead_capture (id) ON DELETE SET NULL,
  claimed_at            TIMESTAMPTZ,
  claimed_by_tenant_id  UUID,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_order_token        ON ai_audit_order (order_token);
CREATE INDEX IF NOT EXISTS idx_ai_audit_order_email        ON ai_audit_order (email);
CREATE INDEX IF NOT EXISTS idx_ai_audit_order_lead_capture ON ai_audit_order (lead_capture_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_order_claimed_by   ON ai_audit_order (claimed_by_tenant_id);
-- One Stripe session binds to at most one order (partial: unpaid rows share NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_audit_order_session
  ON ai_audit_order (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Grants — same as kit_order: app_user may insert/select/update (status
-- transitions + deliverable), never delete.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON ai_audit_order TO app_user;
REVOKE DELETE ON ai_audit_order FROM app_user;

-- ---------------------------------------------------------------------------
-- RLS — identical posture to kit_order (20260728000001_operator_tables_rls).
-- ---------------------------------------------------------------------------
ALTER TABLE ai_audit_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_order FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_only ON ai_audit_order;
CREATE POLICY service_only ON ai_audit_order
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS tenant_claimed_read ON ai_audit_order;
CREATE POLICY tenant_claimed_read ON ai_audit_order
  FOR SELECT TO app_user
  USING (claimed_by_tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Close the Supabase PostgREST surface (defense in depth, same as the other
-- operator tables). Roles may not exist outside Supabase — guard.
DO $$
DECLARE
  pg_role TEXT;
BEGIN
  FOREACH pg_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = pg_role) THEN
      EXECUTE format('REVOKE ALL ON public.ai_audit_order FROM %I', pg_role);
    END IF;
  END LOOP;
END $$;

-- NOTE: 'ai_audit_to_full' is already permitted by 20260817000001_nurture_sequences_widen
-- (the 9-sequence CHECK). This migration deliberately does NOT touch
-- nurture_enrollment_sequence_check, so re-narrowing cannot regress that CHECK
-- regardless of apply order. This migration only creates ai_audit_order.
