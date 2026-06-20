-- =============================================================================
-- Migration: 20260613000001_plan_tier_widen
-- Fix: plan_tier CHECK constraints only allowed ('free','starter','pro'), but
-- the billing code writes the GEO tiers 'growth' and 'agency' (PLAN_LIMITS in
-- apps/api/src/integrations/stripe.ts) → CHECK violation on paid checkout.
-- Widen both tenants.plan_tier and billing_subscriptions.plan_tier to allow
-- free / starter / growth / agency (keep 'pro' for back-compat).
-- Idempotent: drops the conventional auto-named CHECK then re-adds a named one.
-- =============================================================================

ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_plan_tier_check;
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_plan_tier_check
  CHECK (plan_tier IS NULL OR plan_tier IN ('free', 'starter', 'growth', 'agency', 'pro'));

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'growth', 'agency', 'pro'));
