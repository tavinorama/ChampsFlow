-- Rollback for 20260902000001_smartlead_event_rls.
-- Does NOT re-grant anon/authenticated — no code path ever needed those grants.

DROP POLICY IF EXISTS service_only ON smartlead_event;
ALTER TABLE smartlead_event NO FORCE ROW LEVEL SECURITY;
ALTER TABLE smartlead_event DISABLE ROW LEVEL SECURITY;
