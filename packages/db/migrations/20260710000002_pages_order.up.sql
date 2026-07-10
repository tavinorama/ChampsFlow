-- =============================================================================
-- Migration: 20260710000002_pages_order
-- Capability: Ozvor Pages — $99 one-time standalone purchase (issue #208, PR-2).
--
-- pages_order — one row per "Ozvor Pages — 5-page website" checkout. Like
-- kit_order, this is PUBLIC-FACING, pre-account operator data: no RLS, no
-- tenant_id (the buyer may not have an account yet). PII = email only.
--
-- Lifecycle:
--   pending  — order created, Stripe Checkout started
--   paid     — webhook confirmed payment; no tenant matched the email yet
--   credited — +1 tenants.extra_landing_sites granted (either immediately by
--              the webhook when the email already maps to a user, or at first
--              login by the bootstrap claim — onboarding.ts, #166 pattern)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pages_order (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT       NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'credited')),
  stripe_session_id   TEXT,
  credited_tenant_id  UUID         REFERENCES tenants (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ,
  credited_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pages_order_email  ON pages_order (email);
CREATE INDEX IF NOT EXISTS idx_pages_order_status ON pages_order (status);
