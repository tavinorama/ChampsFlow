-- 20260618000002_dsr_ccpa_null_tenant_tighten.up.sql
--
-- Close a latent cross-tenant read leak on dsr_requests / ccpa_requests.
--
-- Their tenant_isolation policies read:
--   USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
--          OR tenant_id IS NULL)
-- The `OR tenant_id IS NULL` makes unauthenticated-intake rows (tenant_id NULL)
-- visible to ANY scoped tenant — contradicting the policies' own comments
-- ("NULL tenant_id rows managed by admin only"). With runtime RLS now active
-- (the app drops into app_user per request), this becomes a real leak the
-- moment any authenticated read path touches these tables.
--
-- Fix: restrict READ visibility (USING) to the caller's own tenant, but keep
-- WITH CHECK permissive of NULL so the public/unscoped INSERT paths (DSR intake,
-- unauthenticated access request, CCPA do-not-sell — all of which run as the
-- privileged login role and bypass RLS anyway) remain correct even if a future
-- scoped path inserts a NULL-tenant row. organicposts_admin keeps full access
-- via its own FOR ALL policy (dsr_requests) / unscoped super-admin routes.

DROP POLICY IF EXISTS tenant_isolation ON dsr_requests;
CREATE POLICY tenant_isolation ON dsr_requests
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    OR tenant_id IS NULL
  );

DROP POLICY IF EXISTS tenant_isolation ON ccpa_requests;
CREATE POLICY tenant_isolation ON ccpa_requests
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    OR tenant_id IS NULL
  );
