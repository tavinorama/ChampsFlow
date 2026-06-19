-- 20260618000002_dsr_ccpa_null_tenant_tighten.down.sql
-- Restore the original (NULL-permissive) tenant_isolation policies.

DROP POLICY IF EXISTS tenant_isolation ON dsr_requests;
CREATE POLICY tenant_isolation ON dsr_requests
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    OR tenant_id IS NULL
  );

DROP POLICY IF EXISTS tenant_isolation ON ccpa_requests;
CREATE POLICY tenant_isolation ON ccpa_requests
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
