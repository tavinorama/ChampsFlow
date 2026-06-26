-- =============================================================================
-- Migration: 20260626000004_api_key
-- Capability: D2 — Public API + API keys.
--
-- Tenant-scoped API keys let a subscriber call the read-only public API
-- (/api/v1/*) from their own systems (Zapier, Sheets, internal dashboards).
--
-- Security model:
--   - Only the SHA-256 hash of the secret is stored; the plaintext is shown
--     exactly ONCE at creation and never persisted. The key itself is 256 bits
--     of entropy, so a fast hash (not bcrypt) is correct and avoids per-request
--     KDF cost on every API call (same approach Stripe/GitHub use for tokens).
--   - `prefix` is the human-identifiable head ("ozk_live_a1b2…") shown in the UI.
--   - Revocation is a soft delete (revoked_at) so the key history is auditable.
--
-- RLS: §4.1 mandatory pattern (mirrors brands/engagement). The public-API
-- middleware resolves the key UNSCOPED (privileged login role) because it does
-- not yet know the tenant; once resolved it runs the request inside that
-- tenant's scope, so every downstream query is RLS-enforced as app_user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_key (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  -- Display name chosen by the user ("Production", "Zapier", …).
  name          TEXT        NOT NULL,
  -- Human-identifiable head of the key, safe to show ("ozk_live_a1b2c3d4").
  prefix        TEXT        NOT NULL,
  -- SHA-256 (hex) of the full secret. Unique so a presented key maps to one row.
  key_hash      TEXT        NOT NULL UNIQUE,
  -- Allowed scopes. Read-only at launch; column future-proofs write scopes.
  scopes        TEXT[]      NOT NULL DEFAULT ARRAY['read']::text[],
  -- Supabase Auth UID of the creator (for the audit trail).
  created_by    UUID,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: §4.1 mandatory pattern (mirrors brands)
ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON api_key
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_api_key_tenant ON api_key (tenant_id);
-- Hash lookup on every public-API call — must be indexed (UNIQUE already creates it).

-- Grants: app_user manages its own keys (create, list, revoke + last_used touch).
-- No DELETE — revocation is a soft delete to preserve history.
GRANT SELECT, INSERT, UPDATE ON api_key TO app_user;
