-- Rollback: 20260728000001_operator_tables_rls
-- Restores the pre-migration RLS state on the operator tables and the original
-- (PUBLIC-wide) pending_subscription policy. Deliberately does NOT re-grant
-- anon/authenticated privileges: no code path ever used the PostgREST surface,
-- so restoring those grants would only re-open the advisor finding's exposure.

DROP POLICY IF EXISTS service_only ON waitlist;
ALTER TABLE waitlist NO FORCE ROW LEVEL SECURITY;
ALTER TABLE waitlist DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_claimed_read ON lead_capture;
DROP POLICY IF EXISTS service_only ON lead_capture;
ALTER TABLE lead_capture NO FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_capture DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_claimed_read ON kit_order;
DROP POLICY IF EXISTS service_only ON kit_order;
ALTER TABLE kit_order NO FORCE ROW LEVEL SECURITY;
ALTER TABLE kit_order DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only ON nurture_enrollment;
ALTER TABLE nurture_enrollment NO FORCE ROW LEVEL SECURITY;
ALTER TABLE nurture_enrollment DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only ON nurture_send_log;
ALTER TABLE nurture_send_log NO FORCE ROW LEVEL SECURITY;
ALTER TABLE nurture_send_log DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only ON pages_order;
ALTER TABLE pages_order NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pages_order DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only ON crm_contact;
ALTER TABLE crm_contact NO FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_contact DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only ON schema_migrations;
ALTER TABLE schema_migrations DISABLE ROW LEVEL SECURITY;

-- pending_subscription: restore the original PUBLIC-wide service_all policy
-- exactly as created in 20260627000007_pending_subscription.
DROP POLICY IF EXISTS "service_all" ON pending_subscription;
CREATE POLICY "service_all" ON pending_subscription
  FOR ALL
  USING (true)
  WITH CHECK (true);
