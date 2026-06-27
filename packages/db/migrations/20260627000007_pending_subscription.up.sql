-- =============================================================================
-- Migration: 20260627000007_pending_subscription
-- Capability: Checkout-first onboarding
-- Date: 2026-06-27
-- Jurisdictions: Brazil (LGPD) + EU (GDPR) + US (CCPA/CPRA)
--
-- Purpose:
--   Holds a paid Stripe subscription for a buyer who has completed checkout but
--   has not yet created a platform account.  Created by the Stripe webhook when
--   metadata.flow = 'direct' and no existing tenant matches the buyer email.
--   Claimed (and soft-retained for audit) by the onboarding bootstrap route on
--   first login when the verified email matches pending_subscription.email.
--
-- Changes:
--   1. pending_subscription (NEW TABLE)
--      One row per Stripe subscription in the pre-account limbo state.
--      The stripe_subscription_id UNIQUE constraint prevents duplicate rows for
--      the same Stripe object.  stripe_event_id UNIQUE prevents the same webhook
--      event from being processed twice.
--      claimed_at / claimed_by_tenant_id are NULL until an account is created;
--      they are SET (not deleted) on claim so the row acts as an audit trail.
--
-- RLS note:
--   This table is intentionally NOT tenant-scoped — the pending buyer has no
--   tenant yet.  A permissive "service_all" policy grants full access to app_user
--   (used by both the webhook handler and the onboarding route).  RLS is still
--   ENABLED and FORCED (required by §4.1 and check-rls.sql CI assertion).
--
-- PII columns:
--   email — stores the Stripe-verified buyer email (lower-cased at application
--   layer before insert).  This is personal data under GDPR Art. 4(1), LGPD
--   Art. 5(I), and CCPA § 1798.140.
--   Retention: until claimed_at + 30-day grace, or 90 days from created_at
--   if never claimed (application-layer purge job, not enforced in DB).
--   ROPA activity: G11 (billing and subscription management).
--   Lawful basis: Art. 6(1)(b) GDPR — contract; Art. 7(V) LGPD — contract.
--
-- Stripe IDs (stripe_customer_id, stripe_subscription_id, stripe_event_id):
--   Opaque Stripe references.  No personal data embedded.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure application role exists (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- TABLE: pending_subscription
--
-- One row per in-flight Stripe subscription awaiting account creation.
-- The row is retained after claiming (claimed_at IS NOT NULL) as an audit trail.
--
-- email:
--   -- ENCRYPTED: not stored encrypted — stored as lower(email) plaintext because
--   it is the lookup key for onboarding matching and the Stripe webhook.
--   Application layer stores lower(trim(email)) before INSERT.
--   Retention: ROPA §G11 — account life + 30-day grace (or 90 days if unclaimed).
--
-- claimed_by_tenant_id:
--   Intentionally has NO foreign key constraint to tenants(id).  The tenant row
--   is created by the onboarding bootstrap in the same transaction that sets
--   claimed_at; a FK would risk a constraint violation on ordering ambiguity in
--   future refactors.  Referential integrity is enforced at the application layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_subscription (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe-verified buyer email (lower-cased at application layer before INSERT).
  -- Personal data — see retention annotation above.
  -- Retention: ROPA §G11 — account life + 30-day grace; 90 days if unclaimed.
  email                   TEXT        NOT NULL,

  -- Opaque Stripe customer reference (cus_xxxxx). No PII embedded.
  stripe_customer_id      TEXT        NOT NULL,

  -- Opaque Stripe subscription reference (sub_xxxxx). UNIQUE for idempotency.
  stripe_subscription_id  TEXT        NOT NULL UNIQUE,

  -- Subscription plan tier at the time of checkout.
  plan_tier               TEXT        NOT NULL
                            CHECK (plan_tier IN ('growth', 'agency')),

  -- Billing cadence captured from the Stripe price object.
  billing_interval        TEXT        NOT NULL
                            CHECK (billing_interval IN ('month', 'year')),

  -- Mirror of the Stripe subscription status at last webhook event.
  status                  TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN (
                              'active', 'past_due', 'canceled',
                              'incomplete', 'trialing'
                            )),

  -- Idempotency: one row per Stripe event. Prevents duplicate webhook processing.
  stripe_event_id         TEXT        NOT NULL UNIQUE,

  -- Claim tracking — both NULL until the buyer completes onboarding.
  -- claimed_at: timestamp when the onboarding bootstrap claimed this row.
  claimed_at              TIMESTAMPTZ DEFAULT NULL,
  -- claimed_by_tenant_id: the newly-created tenant UUID. No FK (see note above).
  claimed_by_tenant_id    UUID        DEFAULT NULL,

  -- Audit timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Partial unique index: at most one *unclaimed* pending subscription per email.
-- Claimed rows (claimed_at IS NOT NULL) are exempt — they are audit records and
-- there may legitimately be multiple historical entries for the same email.
CREATE UNIQUE INDEX IF NOT EXISTS pending_subscription_email_idx
  ON pending_subscription (lower(email))
  WHERE claimed_at IS NULL;

-- Index on stripe_event_id for fast idempotency look-ups in the webhook handler
-- (supplementary — the UNIQUE constraint already creates a B-tree index, but an
-- explicit named index makes intent clear and matches project conventions).
CREATE INDEX IF NOT EXISTS pending_subscription_stripe_event_idx
  ON pending_subscription (stripe_event_id);

-- Index on stripe_customer_id for look-ups during webhook correlation.
CREATE INDEX IF NOT EXISTS pending_subscription_customer_idx
  ON pending_subscription (stripe_customer_id);

-- Index on claimed_at to support the purge job scanning for old unclaimed rows.
CREATE INDEX IF NOT EXISTS pending_subscription_claimed_at_idx
  ON pending_subscription (claimed_at)
  WHERE claimed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- §4.1 mandatory pattern: ENABLE + FORCE RLS on every table.
-- This table has no tenant_id column (by design — the buyer has no tenant yet),
-- so the standard tenant_isolation policy cannot be applied.  Instead, a
-- permissive "service_all" policy is used, which grants full access to app_user.
-- This is intentional and documented: the webhook handler and onboarding route
-- both run as app_user and must read/write rows regardless of tenant context.
-- ---------------------------------------------------------------------------
ALTER TABLE pending_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_subscription FORCE ROW LEVEL SECURITY;

-- Permissive policy: allows all operations for app_user.
-- There is no tenant filter because the table is pre-tenant by design.
CREATE POLICY "service_all" ON pending_subscription
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_subscription TO app_user;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- Keeps updated_at current on every UPDATE (mirrors pattern from billing,
-- strategy_plan, and all other mutable tables in this schema).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_pending_subscription_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pending_subscription_updated_at
  BEFORE UPDATE ON pending_subscription
  FOR EACH ROW EXECUTE FUNCTION trg_pending_subscription_updated_at();
