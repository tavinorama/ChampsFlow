-- =============================================================================
-- Migration: 20260623000002_engagement
-- Capability: OrganicPosts done-for-you (DFY) handoff — the consultancy arm
--   surfaced as a billable, in-product request (not a passive marketing line).
--
-- When a subscriber decides they don't want to execute their GEO plan themselves
-- (publish weekly, implement schema, seed off-site presence, build the entity),
-- they request an OrganicPosts engagement from /brands/[id]. This row is the
-- "seen + costed" handoff: which brand, which SKU, a snapshot of the brand
-- context for sales, and a status the ops team advances out-of-band.
--
-- Tenant-scoped + RLS (mirrors the brands table: ENABLE + FORCE + tenant_isolation).
-- app_user can create + read its own requests; status transitions are an ops
-- action (organicposts_admin), so app_user has no UPDATE/DELETE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS engagement (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id       UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  -- Which done-for-you product the client requested.
  sku            TEXT        NOT NULL CHECK (sku IN ('geo_sprint', 'managed_geo')),
  -- Sales pipeline status, advanced by ops (organicposts_admin), never the client.
  status         TEXT        NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested', 'contacted', 'won', 'lost')),
  contact_email  TEXT,
  note           TEXT,
  -- Brand context captured at request time so sales can act without DB spelunking.
  brand_snapshot JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: §4.1 mandatory pattern (mirrors brands)
ALTER TABLE engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON engagement
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_engagement_tenant ON engagement (tenant_id);
CREATE INDEX IF NOT EXISTS idx_engagement_brand  ON engagement (brand_id);

-- Grants: client (app_user) creates + reads its own; ops (organicposts_admin)
-- reads + advances status. No DELETE anywhere (keep the pipeline history).
GRANT SELECT, INSERT ON engagement TO app_user;
GRANT SELECT, UPDATE ON engagement TO organicposts_admin;
