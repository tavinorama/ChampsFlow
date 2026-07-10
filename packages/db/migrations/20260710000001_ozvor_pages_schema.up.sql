-- =============================================================================
-- Migration: 20260710000001_ozvor_pages_schema
-- Capability: Ozvor Pages (issue #208, PR-1) — 5-page AI-search-ready websites.
--
-- landing_sites          — one site per local business (slug is the public
--                          address: ozvor.com/l/[slug]). Business identity
--                          (NAP/hours/service areas) lives in `business` jsonb
--                          until a Places/GBP integration makes profiles
--                          source-linked entities (deferred, CRITICAL).
-- landing_pages          — 1:N pages of a site (home + service/city + faq +
--                          proof + …). `sections` jsonb is the unit of editing,
--                          generation and versioning.
-- landing_page_versions  — append-only snapshots on save/publish (restore/
--                          rollback). Pruned to ~20 per page app-side.
-- landing_testimonials   — client-imported reviews/testimonials. `authorized`
--                          records the rights attestation — UNAUTHORIZED
--                          content must never render publicly.
-- landing_leads          — end-customer form submissions (PII: Ozvor acts as
--                          PROCESSOR for the tenant). Inserted by the public
--                          API route (privileged role); tenants read/export.
--                          Retention: 24 months (worker job, PR-6/PR-8; ROPA).
-- landing_events         — page_view/cta_click/form_submit counters with
--                          truncated IP only. Retention: 90 days (worker job).
--
-- Also: plan_task gains machine-readable landing action linkage (the audit →
-- regenerate loop, founder requirement in #208), and tenants gains
-- extra_landing_sites (one-time $99 purchases credit; plan tiers grant the
-- base allowance in PLAN_LIMITS app-side).
--
-- Public reads of published pages go through unscoped public API routes
-- filtered by slug + status='published' (the /api/r/:token model) — NOT an
-- anon RLS policy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS landing_sites (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id      UUID         REFERENCES brands (id) ON DELETE SET NULL,
  slug          TEXT         NOT NULL UNIQUE,
  status        TEXT         NOT NULL DEFAULT 'draft',
  business      JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- name, category, NAP, hours, service areas, website
  theme         JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- colors, logo ref, tone
  review_themes JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- derived from authorized testimonials at generation time
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_sites_status_check CHECK (status IN ('draft', 'published', 'suspended')),
  -- lowercase dns-ish slugs, 3–64 chars; reserved words enforced app-side (PR-3)
  CONSTRAINT landing_sites_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

ALTER TABLE landing_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_sites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_sites
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_sites_tenant ON landing_sites (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON landing_sites TO app_user;
GRANT SELECT ON landing_sites TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- landing_pages — the 5-page bundle (and any extras a plan allows).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_pages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  site_id       UUID         NOT NULL REFERENCES landing_sites (id) ON DELETE CASCADE,
  page_type     TEXT         NOT NULL,
  slug          TEXT         NOT NULL DEFAULT '',  -- '' = site root (the landing itself)
  title         TEXT         NOT NULL DEFAULT '',
  sections      JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- ordered section array (editing/versioning unit)
  seo           JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- title, description, og fields
  ai_readiness  JSONB,                                      -- page-level GEO trait score (content-geo)
  status        TEXT         NOT NULL DEFAULT 'draft',
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_pages_type_check CHECK (
    page_type IN ('home', 'service_city', 'service', 'area', 'faq', 'proof', 'campaign')
  ),
  CONSTRAINT landing_pages_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT landing_pages_site_slug_unique UNIQUE (site_id, slug),
  CONSTRAINT landing_pages_slug_check CHECK (
    slug = '' OR slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$' OR slug ~ '^[a-z0-9]$'
  )
);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_pages
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_pages_site ON landing_pages (site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON landing_pages TO app_user;
GRANT SELECT ON landing_pages TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- landing_page_versions — snapshots on save/publish (restore). Pruned app-side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_page_versions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  page_id     UUID         NOT NULL REFERENCES landing_pages (id) ON DELETE CASCADE,
  version     INTEGER      NOT NULL,
  sections    JSONB        NOT NULL,
  seo         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  saved_by    TEXT         NOT NULL DEFAULT 'user',  -- 'user' | 'generator' | 'fix_apply'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_page_versions_saved_by_check CHECK (saved_by IN ('user', 'generator', 'fix_apply')),
  CONSTRAINT landing_page_versions_unique UNIQUE (page_id, version)
);

ALTER TABLE landing_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_page_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_page_versions
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_page ON landing_page_versions (page_id, version DESC);

-- DELETE allowed so the app can prune beyond the version cap (~20/page).
GRANT SELECT, INSERT, DELETE ON landing_page_versions TO app_user;

-- ---------------------------------------------------------------------------
-- landing_testimonials — client-owned reviews with rights attestation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_testimonials (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  site_id     UUID         NOT NULL REFERENCES landing_sites (id) ON DELETE CASCADE,
  author      TEXT         NOT NULL DEFAULT '',
  body        TEXT         NOT NULL,
  rating      INTEGER,
  source      TEXT         NOT NULL DEFAULT 'manual',  -- 'manual' | 'import'
  authorized  BOOLEAN      NOT NULL DEFAULT FALSE,     -- "I have rights to publish this" attestation
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_testimonials_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  CONSTRAINT landing_testimonials_source_check CHECK (source IN ('manual', 'import'))
);

ALTER TABLE landing_testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_testimonials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_testimonials
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_testimonials_site ON landing_testimonials (site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON landing_testimonials TO app_user;

-- ---------------------------------------------------------------------------
-- landing_leads — end-customer PII (processor role). Inserted by the public
-- API route under the privileged role; tenants read/export/delete their own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_leads (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  site_id     UUID         NOT NULL REFERENCES landing_sites (id) ON DELETE CASCADE,
  page_id     UUID         REFERENCES landing_pages (id) ON DELETE SET NULL,
  name        TEXT         NOT NULL DEFAULT '',
  email       TEXT         NOT NULL DEFAULT '',
  phone       TEXT         NOT NULL DEFAULT '',
  message     TEXT         NOT NULL DEFAULT '',
  consent     BOOLEAN      NOT NULL DEFAULT FALSE,
  ip_trunc    TEXT         NOT NULL DEFAULT '',  -- truncated IP only (rate-limit forensics)
  user_agent  TEXT         NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE landing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_leads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_leads
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_leads_site ON landing_leads (site_id, created_at DESC);

-- No INSERT/UPDATE for app_user: writes come from the public route (privileged).
-- DELETE allowed so tenants can honor their own end-customers' erasure asks.
GRANT SELECT, DELETE ON landing_leads TO app_user;

-- ---------------------------------------------------------------------------
-- landing_events — INSERT-only analytics counters (truncated IP, 90-day purge).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  site_id     UUID         NOT NULL REFERENCES landing_sites (id) ON DELETE CASCADE,
  page_id     UUID         REFERENCES landing_pages (id) ON DELETE SET NULL,
  event_type  TEXT         NOT NULL,
  ip_trunc    TEXT         NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_events_type_check CHECK (event_type IN ('page_view', 'cta_click', 'form_submit'))
);

ALTER TABLE landing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON landing_events
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_landing_events_site_created ON landing_events (site_id, created_at DESC);

-- Read-only for tenants; inserts come from the public route (privileged),
-- purge (90 days) runs privileged in the worker.
GRANT SELECT ON landing_events TO app_user;

-- ---------------------------------------------------------------------------
-- plan_task — machine-readable landing linkage for the audit → rebuild loop
-- (#208: "a audit disse que precisa de FAQ page; o rebuild já cria a FAQ page").
-- Nullable, so every existing row/reader keeps working.
-- ---------------------------------------------------------------------------
ALTER TABLE plan_task ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE plan_task ADD COLUMN IF NOT EXISTS landing_site_id UUID REFERENCES landing_sites (id) ON DELETE SET NULL;
ALTER TABLE plan_task ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES landing_pages (id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE plan_task ADD CONSTRAINT plan_task_action_type_check
    CHECK (action_type IS NULL OR action_type IN ('create_landing_page', 'refresh_landing_page'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_plan_task_landing_site ON plan_task (landing_site_id)
  WHERE landing_site_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- tenants — one-time purchase credit ($99 "Ozvor Pages" checkout, PR-2 wires
-- the webhook). Base allowance per plan tier lives in PLAN_LIMITS app-side.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS extra_landing_sites INTEGER NOT NULL DEFAULT 0;
