-- Rollback: 20260613000001_plan_tier_widen
-- Restores the original narrow CHECK (free/starter/pro). Rows with growth/agency
-- must be migrated first or this will fail validation.
ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_plan_tier_check;
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro'));

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro'));
