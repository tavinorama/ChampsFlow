-- =============================================================================
-- Migration: 20260531000002_provider_keys
-- BYOK — customer-supplied AI provider API keys, stored encrypted.
--
-- Keys are encrypted at rest (AES-256-GCM via packages/shared encryptToken)
-- and NEVER returned to the client. Only presence ("you have a key saved") is
-- ever surfaced. One row per (tenant, provider); upsert on re-save.
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_keys (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  provider      TEXT         NOT NULL,         -- 'anthropic'|'openai'|'gemini'|'perplexity'|'serp'
  key_encrypted BYTEA        NOT NULL,         -- AES-256-GCM blob; never decrypted to client
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_keys_provider_check
    CHECK (provider IN ('anthropic', 'openai', 'gemini', 'perplexity', 'serp')),
  CONSTRAINT provider_keys_tenant_provider_uniq UNIQUE (tenant_id, provider)
);

ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_keys
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_provider_keys_tenant ON provider_keys (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON provider_keys TO app_user;
GRANT SELECT ON provider_keys TO organicposts_admin;
