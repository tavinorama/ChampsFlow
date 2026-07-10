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
    'usage_counters'
  )
  AND NOT relrowsecurity;

-- Expected result: 0 rows.
-- If any rows are returned, one or more tables is missing RLS.
-- CI pipeline must fail if row count > 0.
