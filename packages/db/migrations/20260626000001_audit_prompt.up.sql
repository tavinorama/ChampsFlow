-- =============================================================================
-- Migration: 20260626000001_audit_prompt
-- Capability: Prompt Library — per-brand custom audit prompts
-- Date: 2026-06-26
-- Jurisdiction: EU + US + BR (LGPD)
--
-- Tables created (all tenant-scoped + RLS):
--   1. audit_prompt — stores per-brand custom and default probe prompts;
--      ordered by sort_order for deterministic rendering in the Prompt Library UI.
--
-- No personal data is stored in audit_prompt.text. The prompt text contains
-- synthetic probe questions authored by the tenant about their own brand
-- category (e.g. "best CRM for small business in Brazil"). No natural-person
-- names, email addresses, or other personal data appear in prompt text by
-- design (GEO-A2 compliance).
--
-- Retention: account life + 30-day grace (mirrors brands / strategy_plan;
-- covered under ROPA G2/G9 — brand profile and strategy plan management).
-- No ENCRYPTED annotation required — no PII columns.
--
-- RLS: ENABLE + FORCE + tenant_isolation policy (§4.1 mandatory pattern).
-- Grants: app_user (SELECT, INSERT, UPDATE, DELETE); organicposts_admin (SELECT).
--
-- Architecture refs:
--   §4 Data Model — audit_prompt entity
--   §4.1 RLS Migration Standard
--   ROPA G2 / G9 — brand and strategy processing activities (same retention)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure required extensions (idempotent)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Ensure application roles exist (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'organicposts_admin') THEN
    CREATE ROLE organicposts_admin NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- TABLE: audit_prompt
-- Per-brand prompt library. Each row represents one probe prompt that will be
-- sent to the LLM gateway during an audit run for the associated brand.
--
-- is_custom = TRUE  → tenant-authored prompt
-- is_custom = FALSE → platform-default prompt (seeded by worker; tenant can
--                     reorder or override but not delete platform defaults via UI)
--
-- sort_order: ascending display order within a brand's prompt list.
--   Lower numbers appear first. Allows tenant drag-and-drop reordering.
--
-- Retention: account life + 30-day grace (ROPA G2/G9).
--   On CASCADE delete of brand or tenant, all associated prompts are removed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_prompt (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id    UUID        NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_custom   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: §4.1 mandatory pattern
ALTER TABLE audit_prompt ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_prompt FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_prompt
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary query pattern: fetch ordered prompts for a brand
--   WHERE brand_id = $1 ORDER BY sort_order ASC
CREATE INDEX IF NOT EXISTS idx_audit_prompt_brand ON audit_prompt (brand_id, sort_order);

-- FK index (every FK must be indexed per hard rule #3)
CREATE INDEX IF NOT EXISTS idx_audit_prompt_tenant ON audit_prompt (tenant_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_prompt TO app_user;
GRANT SELECT ON audit_prompt TO organicposts_admin;
