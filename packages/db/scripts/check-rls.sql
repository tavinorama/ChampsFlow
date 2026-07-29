-- =============================================================================
-- CI Assertion: check-rls.sql
-- Purpose: Verify that every tenant-scoped table has Row Level Security enabled.
--          This query MUST return 0 rows. Any row returned = CI FAIL.
-- Reference: docs/03-architecture.md §4.1 (Security Block 2 resolution)
-- Run: psql $DATABASE_URL -f scripts/check-rls.sql --tuples-only
-- =============================================================================

SELECT relname AS table_missing_rls
FROM pg_class
JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
WHERE nspname = 'public'
  AND relkind = 'r'
  AND relname IN (
    -- Core (initial_schema)
    'tenants',
    'users',
    'social_accounts',
    'drafts',
    'generation_log',
    'audit_log',
    'dsr_requests',
    'publish_jobs',
    'workspaces',
    'dpa_acknowledgments',
    'ccpa_requests',
    'billing_subscriptions',
    -- GEO Audit Engine (20260530000001_geo_audit_engine)
    'brands',
    'geo_audit',
    'geo_score',
    'citation_check',
    'ai_generation_log',
    -- GEO follow-ups (strategy_plan / competitors / content_piece / provider_keys)
    'strategy_plan',
    'plan_task',
    'competitor',
    'competitor_citation',
    'content_piece',
    'provider_keys',
    -- Attribution v1 (20260627000006_google_attribution)
    'google_connection',
    'google_metric_cache',
    -- Checkout-first onboarding (20260627000007_pending_subscription)
    -- NOTE: this table has no tenant_id; RLS is enabled with a permissive
    -- "service_all" policy (intentional — pre-tenant by design).
    'pending_subscription',
    -- Ozvor Pages (20260710000001_ozvor_pages_schema)
    'landing_sites',
    'landing_pages',
    'landing_page_versions',
    'landing_testimonials',
    'landing_leads',
    'landing_events',
    -- Cost-control quotas (20260710000004_usage_counters, issue #217)
    'usage_counters',
    -- Operator (non-tenant) tables (20260728000001_operator_tables_rls).
    -- No tenant_id by design; RLS closes the Supabase PostgREST surface
    -- (service_only policy TO postgres; lead_capture/kit_order additionally
    -- allow app_user SELECT on rows claimed to the current tenant).
    'waitlist',
    'lead_capture',
    'kit_order',
    'nurture_enrollment',
    'nurture_send_log',
    'pages_order',
    'crm_contact',
    'schema_migrations',
    -- B4 anti-drift control battery (20260729000001_engine_drift_check).
    -- Platform-global, PII-free; RLS on with a permissive policy (api_spend
    -- pattern) so both the unscoped worker and app_user can use it.
    'engine_drift_check'
  )
  AND NOT relrowsecurity;

-- Expected result: 0 rows.
-- If any rows are returned, one or more tables is missing RLS.
-- CI pipeline must fail if row count > 0.
