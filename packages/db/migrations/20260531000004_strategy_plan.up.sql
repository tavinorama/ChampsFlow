-- =============================================================================
-- Migration: 20260531000004_strategy_plan
-- Capability: C3 — Strategy Generator (GEO Content Plan).
--
-- strategy_plan  — one plan per audit (the generated set of recommendations
--                  + 4-week calendar, stored as jsonb).
-- plan_task      — individual recommendations the client can accept/reject;
--                  accepted tasks form the live plan (AC-C3-5).
--
-- All outputs are AI/algorithm-generated DRAFTS; nothing auto-executes (AC-C3-4).
-- =============================================================================

CREATE TABLE IF NOT EXISTS strategy_plan (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id    UUID         NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  audit_id    UUID         REFERENCES geo_audit (id) ON DELETE SET NULL,
  calendar    JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- 4-week content calendar
  generated_by TEXT        NOT NULL DEFAULT 'rules',      -- 'rules' | 'llm'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE strategy_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON strategy_plan
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_strategy_plan_brand ON strategy_plan (brand_id, created_at DESC);

GRANT SELECT, INSERT ON strategy_plan TO app_user;
GRANT SELECT ON strategy_plan TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- plan_task — individual recommendations (accept/reject tracked, AC-C3-5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_task (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  plan_id       UUID         NOT NULL REFERENCES strategy_plan (id) ON DELETE CASCADE,
  vector        TEXT         NOT NULL,   -- 'brand' | 'performance' | 'ai'
  gap           TEXT         NOT NULL,   -- plain-language gap description
  action        TEXT         NOT NULL,   -- suggested action
  effort        TEXT         NOT NULL,   -- 'low' | 'medium' | 'high'
  impact        TEXT         NOT NULL,   -- 'low' | 'medium' | 'high'
  priority      INTEGER      NOT NULL DEFAULT 0,  -- higher = more important
  status        TEXT         NOT NULL DEFAULT 'proposed',  -- 'proposed'|'accepted'|'rejected'|'done'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_task_vector_check CHECK (vector IN ('brand', 'performance', 'ai')),
  CONSTRAINT plan_task_effort_check CHECK (effort IN ('low', 'medium', 'high')),
  CONSTRAINT plan_task_impact_check CHECK (impact IN ('low', 'medium', 'high')),
  CONSTRAINT plan_task_status_check CHECK (status IN ('proposed', 'accepted', 'rejected', 'done'))
);

ALTER TABLE plan_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_task FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON plan_task
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_plan_task_plan ON plan_task (plan_id);

GRANT SELECT, INSERT, UPDATE ON plan_task TO app_user;
GRANT SELECT ON plan_task TO organicposts_admin;
