-- =============================================================================
-- Migration: 20260531000003_competitors
-- Capability: C2 step — Competitor Trust Benchmark.
--
-- competitor          — competitor brands a tenant tracks per brand
-- competitor_citation — per-audit, per-competitor mention tally (how often each
--                       competitor was recommended in the same probe answers)
--
-- This powers "who AI recommends instead of you" — the entrance-product hook.
-- Stores only competitor brand NAMES (public, not PII) + mention counts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS competitor (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id    UUID         NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_brand_name_uniq UNIQUE (brand_id, name)
);

ALTER TABLE competitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON competitor
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_competitor_brand ON competitor (brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON competitor TO app_user;
GRANT SELECT ON competitor TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- competitor_citation — per audit, how often each competitor was mentioned
-- across the probe answers, and in how many of those the client was ABSENT
-- (the displacement signal).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_citation (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  audit_id           UUID         NOT NULL REFERENCES geo_audit (id) ON DELETE CASCADE,
  competitor_name    TEXT         NOT NULL,
  mention_count      INTEGER      NOT NULL DEFAULT 0,  -- probes where competitor appeared
  displacement_count INTEGER      NOT NULL DEFAULT 0,  -- of those, where client was absent
  recorded_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE competitor_citation ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_citation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON competitor_citation
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_competitor_citation_audit ON competitor_citation (audit_id);

GRANT SELECT, INSERT ON competitor_citation TO app_user;
GRANT SELECT ON competitor_citation TO organicposts_admin;
