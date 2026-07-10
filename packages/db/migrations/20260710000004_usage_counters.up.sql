-- =============================================================================
-- Migration: 20260710000004_usage_counters
-- Capability: Cost-control quotas (issue #217) — generic per-tenant usage
-- ledger for features that need an atomic counter but have no natural
-- countable row (Ozvor Pages regenerations aren't persisted anywhere: the
-- worker overwrites landing_pages in place and landing_page_versions gets
-- pruned, so "how many times has this site been regenerated this month" has
-- no source of truth without this table).
--
-- Manual audits do NOT use this table — geo_audit.triggered_by already
-- distinguishes 'cron' from manual ('free_tier'/'paid'), so the weekly/daily
-- guard in apps/api/src/routes/audits.ts is a plain COUNT(*) against
-- geo_audit. A counter table there would just drift from the source of truth.
--
-- Row shape: one row per (tenant, feature, subject, period). `period_start`
-- is the bucket key — DATE '1970-01-01' for a LIFETIME quota (the free-tier
-- $99-credit site's 2-regeneration cap), date_trunc('month', now()) for a
-- MONTHLY quota (growth/agency's 5/site/month). Incremented atomically via
-- INSERT ... ON CONFLICT (tenant_id, feature, subject_id, period_start) DO
-- UPDATE SET count = usage_counters.count + 1 RETURNING count — no
-- read-then-write race. A denied attempt (RETURNING count > quota) is
-- decremented back by the caller so it doesn't burn quota.
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_counters (
  tenant_id    UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  feature      TEXT NOT NULL,           -- 'pages_regeneration'
  subject_id   UUID NOT NULL,           -- e.g. landing_site id
  period_start DATE NOT NULL,           -- date_trunc('month', now()) / '1970-01-01' for lifetime
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, feature, subject_id, period_start)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_counters
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

GRANT SELECT, INSERT, UPDATE ON usage_counters TO app_user;
