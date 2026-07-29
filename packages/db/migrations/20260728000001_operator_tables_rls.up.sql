-- =============================================================================
-- Migration: 20260728000001_operator_tables_rls
-- Capability: Close the Supabase PostgREST surface on operator (non-tenant)
--   tables. Supabase security advisor: "RLS disabled in public" on waitlist,
--   lead_capture, kit_order, schema_migrations, nurture_enrollment,
--   nurture_send_log, pages_order, crm_contact.
--
-- Why this matters: Supabase's default privileges grant table access in the
-- public schema to its PostgREST roles (anon / authenticated). With RLS off,
-- anyone holding the public anon key (shipped in the web bundle as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY) can read/write these tables through the
-- PostgREST REST API — lead emails, kit order tokens + deliverables, nurture
-- state, CRM notes. The app itself never uses PostgREST for data (verified:
-- the anon key is used for Supabase Auth only; all data access is direct
-- Postgres), so nothing legitimate flows through that surface.
--
-- Access model after this migration (explicit-policy pattern from
-- 20260707000001_platform_provider_key — do not rely on implicit
-- owner/BYPASSRLS behavior under FORCE RLS):
--
--   - `postgres` — the privileged runtime login role. Every current write/read
--     path on these tables runs as it, unscoped: public routes (/api/test,
--     /api/kit/checkout, /api/pages/checkout, /api/waitlist, /api/nurture/
--     unsubscribe, chat), Stripe webhooks, the nurture worker poll loop,
--     admin/operator (super-admin) routes, first-login onboarding claims, and
--     migrate.js. Verified rolbypassrls = TRUE on the production instance; the
--     explicit `service_only` policy below keeps these paths working even on a
--     deployment where the runtime role lacks BYPASSRLS.
--
--   - `app_user` — the tenant-scoped runtime role (RLS-enforced requests).
--     The ONLY scoped path that touches any of these tables is
--     GET /api/account/claimed-history (apps/api/src/routes/products.ts),
--     which reads the tenant's own claimed pre-account history from
--     lead_capture and kit_order. Those two tables get a SELECT policy keyed
--     on claimed_by_tenant_id = app.current_tenant_id (identity-claim #166 /
--     #218). No other table gets an app_user policy → deny by RLS. The
--     existing app_user GRANTs are left untouched; RLS is now the gate.
--
--   - anon / authenticated (Supabase PostgREST) — no policy → denied by RLS.
--     Grants are additionally revoked below (defense in depth, so a future
--     permissive policy cannot silently re-open the surface).
--
-- schema_migrations: ENABLE (not FORCE) RLS. The table is created and written
-- by scripts/migrate.js as the login role, which owns it — without FORCE the
-- owner always bypasses RLS, so the migration tool can never lock itself out,
-- while non-owner roles (anon / authenticated / app_user) are still denied.
--
-- Also fixes the same-class hole on pending_subscription (RLS already ON):
-- its `service_all` policy had no TO clause, so it applied to PUBLIC —
-- including the PostgREST roles. Recreated scoped to the runtime roles.
--
-- Reversible: the .down drops the policies and disables RLS again (it does
-- NOT re-grant anon/authenticated — no code path ever needed those grants).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. waitlist — pre-launch email collection (public signup, admin reads).
-- ---------------------------------------------------------------------------
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON waitlist
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. lead_capture — free AI Invisibility Test leads (pre-account).
--    app_user additionally reads rows claimed to the current tenant
--    (GET /api/account/claimed-history).
-- ---------------------------------------------------------------------------
ALTER TABLE lead_capture ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_capture FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON lead_capture
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);
CREATE POLICY tenant_claimed_read ON lead_capture
  FOR SELECT TO app_user
  USING (claimed_by_tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ---------------------------------------------------------------------------
-- 3. kit_order — $29 Get-Cited Kit orders (pre-account).
--    Same claimed-history read policy as lead_capture.
-- ---------------------------------------------------------------------------
ALTER TABLE kit_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_order FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON kit_order
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);
CREATE POLICY tenant_claimed_read ON kit_order
  FOR SELECT TO app_user
  USING (claimed_by_tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ---------------------------------------------------------------------------
-- 4. nurture_enrollment — email nurture cursor state (worker-only).
-- ---------------------------------------------------------------------------
ALTER TABLE nurture_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE nurture_enrollment FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON nurture_enrollment
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. nurture_send_log — append-only send audit (worker-only).
-- ---------------------------------------------------------------------------
ALTER TABLE nurture_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE nurture_send_log FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON nurture_send_log
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. pages_order — $99 Ozvor Pages orders (pre-account; webhook + claims).
-- ---------------------------------------------------------------------------
ALTER TABLE pages_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_order FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON pages_order
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. crm_contact — founder-only CRM annotations (requireSuperAdmin routes).
-- ---------------------------------------------------------------------------
ALTER TABLE crm_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact FORCE ROW LEVEL SECURITY;
CREATE POLICY service_only ON crm_contact
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 8. schema_migrations — migration bookkeeping (scripts/migrate.js).
--    ENABLE only, no FORCE: the owner (the migration login role) must always
--    bypass RLS so migrate.js can never lock itself out. The explicit policy
--    keeps a non-owner `postgres` runtime working too; everyone else is denied.
-- ---------------------------------------------------------------------------
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_only ON schema_migrations
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. pending_subscription — tighten the existing service_all policy.
--    It had no TO clause (applied to PUBLIC → PostgREST roles included).
--    Same consumers as before: webhook + onboarding claim run as `postgres`;
--    app_user retained for parity with its grants.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_all" ON pending_subscription;
CREATE POLICY "service_all" ON pending_subscription
  FOR ALL TO postgres, app_user
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 10. Defense in depth: revoke the Supabase PostgREST roles' default-privilege
--     grants on all of the above. Guarded — the roles only exist on Supabase
--     (not in CI / local Postgres). RLS already denies these roles; revoking
--     the grants means a future permissive policy cannot re-open the surface.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pg_role TEXT;
  tbl TEXT;
BEGIN
  FOREACH pg_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = pg_role) THEN
      FOREACH tbl IN ARRAY ARRAY[
        'waitlist', 'lead_capture', 'kit_order', 'schema_migrations',
        'nurture_enrollment', 'nurture_send_log', 'pages_order', 'crm_contact',
        'pending_subscription'
      ] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', tbl, pg_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
