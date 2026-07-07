-- =============================================================================
-- Migration: 20260707000001_platform_provider_key
-- Capability: Admin provider-key rotation (founder dashboard).
--
-- Stores PLATFORM-level LLM/API keys rotated from the founder admin panel.
-- These override the Railway env values at runtime (env stays the fallback,
-- restored automatically when an override row is deleted).
--
-- Security model (stricter than tenant BYOK):
--   - Keys are AES-256-GCM encrypted with OAUTH_TOKEN_KEY (same versioned
--     scheme as provider_keys/oauth tokens — packages/shared/src/crypto.ts).
--   - Plaintext is write-only: the API accepts a new key and returns only the
--     last 4 characters; no endpoint ever returns the stored value.
--   - RLS enabled+forced with NO policies and NO grants to app_user: only the
--     privileged login role (unscoped admin/worker paths) can touch this table.
--     Tenants can never read platform keys, even via SQL injection into an
--     RLS-scoped query path.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_provider_key (
  -- One row per provider; PK doubles as the upsert conflict target.
  provider      TEXT        PRIMARY KEY
                CHECK (provider IN ('anthropic', 'openai', 'gemini', 'perplexity', 'serp')),
  -- [4B key_version][12B IV][ciphertext][16B GCM tag] — see crypto.ts layout.
  key_encrypted BYTEA       NOT NULL,
  -- Safe display fragment for the admin UI ("…x4Fq").
  key_last4     TEXT        NOT NULL,
  -- Supabase Auth UID of the admin who rotated (audit trail).
  rotated_by    UUID,
  rotated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_provider_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_provider_key FORCE ROW LEVEL SECURITY;

-- Access model (made EXPLICIT per Hermes review — do not rely on implicit
-- owner/BYPASSRLS behavior under FORCE RLS):
--   - `postgres` is the privileged runtime role for api/worker/admin paths.
--     Verified on the production instance: rolbypassrls = true. The explicit
--     policy below keeps this table working even on a deployment where the
--     runtime role lacks BYPASSRLS (e.g. self-hosted).
--   - `app_user` (tenant-scoped role) gets NO grants and NO policy: tenants
--     can never read platform keys, even through an RLS-scoped query path.
CREATE POLICY platform_service_only ON platform_provider_key
  FOR ALL TO postgres
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_provider_key TO postgres;
-- Intentionally NO grants to app_user.
