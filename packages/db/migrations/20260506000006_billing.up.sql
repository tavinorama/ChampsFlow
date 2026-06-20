-- =============================================================================
-- Migration: 20260506000006_billing
-- Capability: C6 — Billing (Stripe) + users.restricted enforcement
-- Date: 2026-05-06
--
-- Changes:
--   1. CREATE TABLE billing_subscriptions
--      Tracks Stripe subscription state per tenant.
--      Stripe references only — no PII, no card data stored here.
--      Architecture refs: §4, §4.1, §11 (Stripe sub-processor)
--   2. ALTER TABLE tenants — ADD COLUMN plan_tier
--      Denormalized fast-lookup column for plan enforcement middleware.
--
-- Retention: account life + 30-day grace (ROPA Activity 1 — billing data).
-- No PII columns. stripe_customer_id and stripe_subscription_id are opaque
-- Stripe references with no personal data embedded.
--
-- RLS: §4.1 mandatory pattern applied (ENABLE + FORCE + tenant_isolation policy).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: billing_subscriptions
-- One row per tenant subscription. Updated by webhook handler.
-- stripe_customer_id / stripe_subscription_id: opaque Stripe refs — no PII.
-- Retention: account life + 30-day grace (ROPA Activity 1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,

  -- Stripe references (opaque IDs — no PII stored)
  stripe_customer_id    TEXT          UNIQUE,           -- cus_xxxxx
  stripe_subscription_id TEXT         UNIQUE,           -- sub_xxxxx
  stripe_price_id       TEXT,                           -- price_xxxxx (maps to plan_tier via env vars)

  -- Plan state
  plan_tier             TEXT          CHECK (plan_tier IN ('free', 'starter', 'pro')),
  status                TEXT          CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),

  -- Billing period
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Idempotency: last Stripe event ID processed for this subscription.
  -- Used together with Redis idempotency keys (TTL 7d) for webhook deduplication.
  stripe_event_id_last  TEXT,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- §4.1 mandatory RLS pattern
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON billing_subscriptions
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant_id
  ON billing_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_customer_id
  ON billing_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_subscription_id
  ON billing_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Grants
-- app_user may SELECT (read plan state), INSERT (create subscription record on checkout),
-- and UPDATE (webhook updates). DELETE is revoked — subscription history is protected.
GRANT SELECT, INSERT, UPDATE ON billing_subscriptions TO app_user;
GRANT SELECT ON billing_subscriptions TO organicposts_admin;
REVOKE DELETE ON billing_subscriptions FROM app_user;

-- updated_at trigger (matches pattern used across all tables in initial schema)
CREATE OR REPLACE FUNCTION trg_billing_subscriptions_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trg_billing_subscriptions_updated_at();

-- ---------------------------------------------------------------------------
-- ALTER TABLE tenants — add plan_tier (denormalized fast-lookup)
-- plan_tier is kept in sync by the webhook handler whenever billing_subscriptions
-- is updated. Used by requirePlanLimit middleware for O(1) plan checks without
-- a JOIN to billing_subscriptions on every request.
--
-- The existing `plan` column (CHECK 'solo'|'agency') is the legacy billing tier
-- from the initial schema and is NOT removed — it may be used by existing code.
-- plan_tier ('free'|'starter'|'pro') is the new billing tier introduced in C6.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free', 'starter', 'pro'));

-- Index for middleware lookups (requirePlanLimit reads this column on hot paths)
CREATE INDEX IF NOT EXISTS idx_tenants_plan_tier
  ON tenants (plan_tier);
