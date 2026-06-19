-- =============================================================================
-- Migration: 20260531000005_content_piece
-- Capability: C4 — Multi-Channel Content Engine (Content Studio).
--
-- content_piece — AI-generated draft content for owned channels (blog/LinkedIn/
-- FAQ). Draft-and-confirm: nothing auto-publishes (AC-C4-4). Every row carries
-- ai_generated=true (AC-C4-3). Approval is logged with timestamp + user (AC-C4-5).
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_piece (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id      UUID         NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  plan_task_id  UUID         REFERENCES plan_task (id) ON DELETE SET NULL,
  content_type  TEXT         NOT NULL,   -- 'blog' | 'linkedin' | 'faq'
  title         TEXT,
  body          TEXT         NOT NULL,   -- draft content (markdown / text)
  schema_markup TEXT,                    -- schema.org JSON-LD for blog/faq
  ai_generated  BOOLEAN      NOT NULL DEFAULT TRUE,   -- AC-C4-3 (non-removable label)
  status        TEXT         NOT NULL DEFAULT 'draft', -- 'draft'|'approved'|'published'|'discarded'
  generated_by  TEXT         NOT NULL DEFAULT 'rules', -- 'rules' | 'llm'
  approved_at   TIMESTAMPTZ,
  approved_by   UUID,                     -- AC-C4-5 approving user
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT content_piece_type_check CHECK (content_type IN ('blog', 'linkedin', 'faq')),
  CONSTRAINT content_piece_status_check CHECK (status IN ('draft', 'approved', 'published', 'discarded'))
);

ALTER TABLE content_piece ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_piece FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_piece
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_content_piece_brand ON content_piece (brand_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON content_piece TO app_user;
GRANT SELECT ON content_piece TO organicposts_admin;
