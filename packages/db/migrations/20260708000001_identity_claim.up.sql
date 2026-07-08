-- 20260708000001_identity_claim.up.sql
--
-- Funnel continuity (#166): link a returning visitor's pre-account FREE TEST
-- (lead_capture) and $29 KIT purchase (kit_order) to their account on signup,
-- matched by their Supabase-verified email. Before this, both tables were
-- "pre-account marketing" with no tenant link, so a returning visitor's history
-- was orphaned when they created an account.
--
-- Mirrors the pending_subscription claim pattern (claimed_at +
-- claimed_by_tenant_id). Rows are RETAINED after claiming as an audit trail.
-- The claim itself is done at first-login provisioning (apps/api onboarding.ts,
-- claimFreeTests / claimKitOrders), best-effort, on the verified email only.

ALTER TABLE lead_capture
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE kit_order
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- Fast retrieval of a tenant's recovered history.
CREATE INDEX IF NOT EXISTS idx_lead_capture_claimed_by ON lead_capture (claimed_by_tenant_id);
CREATE INDEX IF NOT EXISTS idx_kit_order_claimed_by ON kit_order (claimed_by_tenant_id);
