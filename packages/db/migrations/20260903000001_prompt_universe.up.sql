-- =============================================================================
-- Migration: 20260903000001_prompt_universe
-- Capability: P0-06 — Prompt Universe v2 + honest methodology break
-- Date: 2026-09-03
-- Jurisdiction: EU (GDPR) + US (CCPA/CPRA) + BR (LGPD)
--
-- WHY (measured, not hypothesised — production data, brand
-- e74fcbc1-a988-4b5d-b054-87329dc881c0, read on 2026-09-03):
--   - methodology_version 1.0 until 2026-07-29, 2.1 after;
--   - the 2026-06-30 audit (Brand 90) ran with TWO engines
--     (perplexity, dataforseo);
--   - 2026-07-29 09:58 ran with ONE engine (dataforseo, method 1.0, Brand 19)
--     and 2026-07-29 14:11 with FIVE engines and method 2.1 (Brand 24);
--   - 2026-08-31 ran without anthropic.
--   Those points were drawn on ONE trend line as if they were continuity.
--   They are different rulers. This migration gives the schema the vocabulary
--   to say so, per run and per prompt.
--
-- WHAT THIS ADDS
--
-- 1. audit_prompt -> the versioned PromptDefinition (report section 4,
--    "Correcao metodologica"). Every column is NULLABLE or carries an explicit
--    legacy default, so existing rows stay truthful without a backfill and
--    older worker/API builds keep running unchanged.
--
--      cohort            TEXT NOT NULL DEFAULT 'customer'
--                          'benchmark'   - frozen 90d, carries the trend
--                          'opportunity' - rotating, derived from new signals
--                          'customer'    - customer-approved questions
--                        Legacy rows default to 'customer': they were authored
--                        by the tenant, and calling them 'benchmark' would
--                        retro-fit a frozen baseline that never existed.
--      intent            TEXT   discovery|problem|solution|comparison|
--                               trust|local|branded
--      vertical          TEXT   free-form vertical/subvertical label
--      market            TEXT   ISO-3166-1 alpha-2 (US, BR, PT, DE, ...)
--      locale            TEXT   BCP-47 (en-US, pt-BR, ...)
--      funnel_stage      TEXT   awareness|consideration|decision|retention
--      demand_value      NUMERIC  observed demand (volume / occurrence)
--      demand_source     TEXT     WHERE that number came from. A demand_value
--                                 without a source is not evidence - the
--                                 CHECK below rejects the pair.
--      business_value    NUMERIC  commercial value of winning this question
--      relevance_score   NUMERIC  0..1 composite; below the floor the prompt
--                                 does not enter the universe
--      branded           BOOLEAN  branded vs non-branded, EXPLICIT.
--                                 NULL = not yet classified. Never coerced to
--                                 false: "we do not know" is not "not branded".
--      expected_competitors TEXT[]  brands we expect to win this question
--      valid_from        TIMESTAMPTZ  freshness window start
--      valid_until       TIMESTAMPTZ  freshness window end (NULL = open)
--      version           TEXT NOT NULL DEFAULT '1.0'  definition version
--      approved_by       UUID REFERENCES users(id) ON DELETE SET NULL
--      owner_type        TEXT   'ozvor' | 'client' | 'partner'
--      archived_at       TIMESTAMPTZ  soft archive - history is append-only in
--                                     this house, prompts are NEVER deleted
--      archived_reason   TEXT
--
-- 2. prompt_universe_event - append-only audit trail of every universe
--    mutation (proposed/approved/rejected/archived/restored/superseded/
--    set_version_bumped). This is what makes the Ozvor-workspace migration
--    (generic "best SaaS for SMBs" -> GEO / AI-visibility / brand-monitoring /
--    local-service / agency prompts) auditable rather than a silent swap.
--
-- 3. geo_audit -> prompt_set_version + prompt_set_hash + engine_set.
--    The trend badge (Comparable / Method changed / Prompt set changed /
--    Engine changed) needs all three facts per run, stored, not re-derived.
--    engine_set is denormalised out of provider_breakdown->coverage so the
--    comparability query does not have to parse JSONB per row.
--
-- PII: none new. Prompts are synthetic category/brand questions (GEO-A2);
-- metadata is fixed-vocabulary labels, numbers and timestamps. approved_by is
-- an existing internal user reference. RLS, grants and retention of
-- audit_prompt and geo_audit are unchanged and inherited.
--
-- BACKFILL POLICY: none, deliberately. No historical row is relabelled. Runs
-- that predate this migration keep prompt_set_version NULL, and the badge
-- reads NULL as "unknown ruler", never as "same ruler".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. audit_prompt - versioned PromptDefinition
-- ---------------------------------------------------------------------------
ALTER TABLE audit_prompt
  ADD COLUMN IF NOT EXISTS cohort               TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS intent               TEXT,
  ADD COLUMN IF NOT EXISTS vertical             TEXT,
  ADD COLUMN IF NOT EXISTS market               TEXT,
  ADD COLUMN IF NOT EXISTS locale               TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage         TEXT,
  ADD COLUMN IF NOT EXISTS demand_value         NUMERIC,
  ADD COLUMN IF NOT EXISTS demand_source        TEXT,
  ADD COLUMN IF NOT EXISTS business_value       NUMERIC,
  ADD COLUMN IF NOT EXISTS relevance_score      NUMERIC,
  ADD COLUMN IF NOT EXISTS branded              BOOLEAN,
  ADD COLUMN IF NOT EXISTS expected_competitors TEXT[],
  ADD COLUMN IF NOT EXISTS valid_from           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_until          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version              TEXT NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS approved_by          UUID,
  ADD COLUMN IF NOT EXISTS owner_type           TEXT,
  ADD COLUMN IF NOT EXISTS archived_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason      TEXT;

-- FK and CHECKs added guarded: ADD CONSTRAINT has no IF NOT EXISTS in
-- Postgres, and boot-time migrations must be re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_approved_by_fkey') THEN
    ALTER TABLE audit_prompt
      ADD CONSTRAINT audit_prompt_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_cohort_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_cohort_chk
      CHECK (cohort IN ('benchmark', 'opportunity', 'customer'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_intent_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_intent_chk
      CHECK (intent IS NULL OR intent IN
        ('discovery', 'problem', 'solution', 'comparison', 'trust', 'local', 'branded'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_funnel_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_funnel_chk
      CHECK (funnel_stage IS NULL OR funnel_stage IN
        ('awareness', 'consideration', 'decision', 'retention'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_owner_type_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_owner_type_chk
      CHECK (owner_type IS NULL OR owner_type IN ('ozvor', 'client', 'partner'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_relevance_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_relevance_chk
      CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 1));
  END IF;

  -- A demand number with no provenance is a number we invented.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_demand_source_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_demand_source_chk
      CHECK (demand_value IS NULL OR demand_source IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_validity_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_validity_chk
      CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);
  END IF;

  -- Archiving is a state, not a mood: an archived row must say why.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_prompt_archived_chk') THEN
    ALTER TABLE audit_prompt ADD CONSTRAINT audit_prompt_archived_chk
      CHECK (archived_at IS NULL OR archived_reason IS NOT NULL);
  END IF;
END
$$;

-- Hot path: "the live universe for this brand" = archived_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_audit_prompt_brand_live
  ON audit_prompt (brand_id, cohort, sort_order)
  WHERE archived_at IS NULL;

-- FK index (every FK must be indexed per hard rule #3).
CREATE INDEX IF NOT EXISTS idx_audit_prompt_approved_by
  ON audit_prompt (approved_by);

-- ---------------------------------------------------------------------------
-- 2. prompt_universe_event - append-only trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_universe_event (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id      UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  -- Nullable + SET NULL: an event can outlive the row it describes (a
  -- brand-level 'set_version_bumped' has no single prompt), and CASCADE here
  -- would erase the very trail this table exists to keep.
  prompt_id     UUID        REFERENCES audit_prompt (id) ON DELETE SET NULL,
  event         TEXT        NOT NULL
                            CHECK (event IN ('proposed', 'approved', 'rejected',
                                             'archived', 'restored', 'superseded',
                                             'set_version_bumped')),
  -- Snapshot of the prompt text at event time: the trail must stay readable
  -- after the row it points at is edited or detached.
  prompt_text   TEXT,
  reason        TEXT        NOT NULL,
  from_version  TEXT,
  to_version    TEXT,
  actor_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  -- 'system' when a migration/worker acted; a human belongs in actor_user_id.
  actor_kind    TEXT        NOT NULL DEFAULT 'system'
                            CHECK (actor_kind IN ('system', 'user', 'agent')),
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE prompt_universe_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_universe_event FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'prompt_universe_event' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON prompt_universe_event
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_prompt_universe_event_brand
  ON prompt_universe_event (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_universe_event_tenant
  ON prompt_universe_event (tenant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_universe_event_prompt
  ON prompt_universe_event (prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_universe_event_actor
  ON prompt_universe_event (actor_user_id);

-- Append-only: no UPDATE, no DELETE grant. Rewriting history is the exact
-- failure mode this table exists to prevent.
GRANT SELECT, INSERT ON prompt_universe_event TO app_user;
GRANT SELECT ON prompt_universe_event TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- 3. geo_audit - the three facts the trend badge needs
-- ---------------------------------------------------------------------------
--   prompt_set_version  TEXT   version of the prompt universe that produced the
--                              run. Legacy rows stay NULL = unknown, never a
--                              fabricated '1.0': an unknown ruler must read as
--                              unknown, and the badge says so.
--   prompt_set_hash     TEXT   stable hash of the exact prompt texts probed.
--                              Same version, different hash = prompt set change.
--   engine_set          TEXT[] engines that actually answered, sorted.
--                              Denormalised from provider_breakdown->coverage.
ALTER TABLE geo_audit
  ADD COLUMN IF NOT EXISTS prompt_set_version TEXT,
  ADD COLUMN IF NOT EXISTS prompt_set_hash    TEXT,
  ADD COLUMN IF NOT EXISTS engine_set         TEXT[];

CREATE INDEX IF NOT EXISTS idx_geo_audit_brand_comparability
  ON geo_audit (brand_id, created_at DESC);
