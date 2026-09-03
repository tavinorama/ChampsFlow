-- =============================================================================
-- Migration: 20260902000001_smartlead_event_rls
-- Capability: 10.B.10 — smartlead_event holds lead PII (lead_email + raw
-- webhook payload) and shipped WITHOUT RLS, outside check-rls.sql, reachable
-- through Supabase PostgREST default grants exactly like the operator tables
-- fixed in 20260728000001_operator_tables_rls. Same posture as crm_contact:
--
--   - ENABLE + FORCE ROW LEVEL SECURITY;
--   - explicit `service_only` policy TO postgres (the privileged runtime
--     login role — the token-gated webhook insert and requireSuperAdmin reads
--     both run as it, unscoped). Explicit policy, not owner/BYPASSRLS
--     reliance, so the paths keep working on a deployment where the runtime
--     role lacks BYPASSRLS;
--   - anon / authenticated (Supabase PostgREST): no policy → denied by RLS;
--     grants additionally revoked (defense in depth).
--
-- After this is applied, remove the temporary 'smartlead_event' allowlist
-- entry in packages/db/scripts/check-rls.sql (its TODO points here).
--
-- Reversible: the .down drops the policy and disables RLS again (it does NOT
-- re-grant anon/authenticated — no code path ever needed those grants).
-- =============================================================================

ALTER TABLE smartlead_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlead_event FORCE ROW LEVEL SECURITY;

CREATE POLICY service_only ON smartlead_event
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- Defense in depth: revoke the PostgREST roles' default grants where those
-- roles exist (Supabase); no-op on plain Postgres (CI containers).
DO $$
DECLARE
  pg_role TEXT;
BEGIN
  FOREACH pg_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = pg_role) THEN
      EXECUTE format('REVOKE ALL ON public.smartlead_event FROM %I', pg_role);
    END IF;
  END LOOP;
END $$;
