-- =============================================================================
-- DOWN Migration: 20260506000006_billing
-- Reverses the UP migration for C6 Billing.
--
-- Order matters: remove dependent objects first, then columns, then table.
-- =============================================================================

-- Remove plan_tier column from tenants (added in UP)
ALTER TABLE tenants
  DROP COLUMN IF EXISTS plan_tier;

-- Drop trigger and function for billing_subscriptions
DROP TRIGGER IF EXISTS trg_billing_subscriptions_updated_at ON billing_subscriptions;
DROP FUNCTION IF EXISTS trg_billing_subscriptions_updated_at();

-- Drop billing_subscriptions table (CASCADE removes indexes and policies automatically)
DROP TABLE IF EXISTS billing_subscriptions CASCADE;
