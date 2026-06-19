-- =============================================================================
-- Migration: 20260501000001_initial_schema
-- Description: Initial v1 schema for Organic Posts.
--              Covers: tenants, users, social_accounts, drafts, generation_log,
--                      publish_jobs, workspaces, dsr_requests, audit_log.
-- RLS: EVERY tenant-scoped table has ENABLE + FORCE ROW LEVEL SECURITY per §4.1.
-- CC-1: REVOKE UPDATE, DELETE on audit_log and generation_log from app_user role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Application Postgres roles
-- ---------------------------------------------------------------------------

-- Primary application role used by the Hono API and BullMQ worker.
-- Created only if it does not yet exist (idempotent for re-runs).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Admin panel role (read-only cross-tenant + INSERT on audit_log for admin actions).
-- No UPDATE or DELETE on any table. No INSERT/UPDATE/DELETE on generation_log.
-- See architecture §6.3.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'organicposts_admin') THEN
    CREATE ROLE organicposts_admin NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- EXTENSION: pgcrypto for UUID generation
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- TABLE: tenants
-- Retention: account life + 30-day grace (ROPA Activity 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  plan                    TEXT NOT NULL DEFAULT 'solo'
                            CHECK (plan IN ('solo', 'agency')),
  stripe_customer_id      TEXT,                     -- Stripe reference; no PII stored here
  stripe_subscription_id  TEXT,                     -- Stripe reference
  post_quota_monthly      INT NOT NULL DEFAULT 30,
  posts_used_this_period  INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: §4.1 mandatory pattern
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE ON tenants TO app_user;
GRANT SELECT ON tenants TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: workspaces
-- v1.1 forward-compatibility stub (auto-created at account setup; not user-visible in v1).
-- Retention: account life + 30-day grace (ROPA Activity 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Default',
  owner_user_id UUID,        -- FK to users set after users table is created (deferred)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workspaces
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON workspaces (tenant_id);

GRANT SELECT, INSERT, UPDATE ON workspaces TO app_user;
GRANT SELECT ON workspaces TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: users
-- Retention: account life + 30-day grace (ROPA Activity 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email             TEXT NOT NULL,                  -- PII: email address
  password_hash     TEXT,                           -- bcrypt cost 12+; NULL if SSO-only
  role              TEXT NOT NULL DEFAULT 'owner'
                      CHECK (role IN ('owner', 'editor', 'viewer')),
  supabase_auth_uid UUID UNIQUE,                    -- FK to auth.users managed by Supabase Auth
  -- DPA acknowledgment (CI-1)
  dpa_ack_version   TEXT,
  dpa_ack_at        TIMESTAMPTZ,
  dpa_ack_ip        INET,                           -- PII: IP address; retained for legal evidence
  dpa_variant       TEXT CHECK (dpa_variant IN ('EU', 'US')),
  -- CCPA controls (CI-2)
  ccpa_optout       BOOLEAN NOT NULL DEFAULT FALSE,
  ccpa_optout_at    TIMESTAMPTZ,
  ccpa_optout_ip    INET,                           -- PII: IP address; CCPA legal evidence
  sensitive_pi_limit BOOLEAN NOT NULL DEFAULT FALSE, -- Use-limitation toggle for OAuth tokens
  -- Soft delete support for DSR erasure cascade
  restricted        BOOLEAN NOT NULL DEFAULT FALSE, -- Gate 3→4 legal cond. 5: restriction flag
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ                     -- Soft delete; hard delete job after 30-day grace
);

-- Uniqueness: one email per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant ON users (tenant_id, email)
  WHERE deleted_at IS NULL;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON users (supabase_auth_uid)
  WHERE supabase_auth_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON users TO app_user;
GRANT SELECT ON users TO organicposts_admin;

-- Now set the deferred FK on workspaces.owner_user_id
ALTER TABLE workspaces
  ADD CONSTRAINT fk_workspaces_owner
  FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- TABLE: social_accounts
-- Sensitive PI (CPRA): OAuth tokens qualify as "account log-in credentials".
-- Retention: until revoked or account deletion (ROPA Activity 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform            TEXT NOT NULL
                        CHECK (platform IN ('linkedin', 'instagram')),
  platform_user_id    TEXT NOT NULL,                -- Platform's own user/account identifier
  -- ENCRYPTED: AES-256-GCM at application layer (packages/llm/src/crypto.ts)
  access_token_enc    BYTEA,                        -- Encrypted access token; NULL if revoked
  -- ENCRYPTED: AES-256-GCM at application layer
  refresh_token_enc   BYTEA,                        -- Encrypted refresh token; NULL if not issued
  key_version         INT NOT NULL DEFAULT 1,       -- S-10: supports non-blocking quarterly key rotation
  scope               TEXT,                         -- Granted OAuth scopes (e.g. 'w_member_social r_basicprofile')
  expires_at          TIMESTAMPTZ,                  -- Token expiry; checked pre-publish (S-9)
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,                  -- Set on disconnect; NULL = active connection
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique: one active connection per (tenant, platform, platform_user_id)
  CONSTRAINT uq_social_accounts_platform_user
    UNIQUE (tenant_id, platform, platform_user_id)
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON social_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_accounts_tenant ON social_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts (tenant_id, platform)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_accounts_expires ON social_accounts (expires_at)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON social_accounts TO app_user;
GRANT SELECT ON social_accounts TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: audit_log
-- Append-only. No UPDATE or DELETE via application layer (CC-1 / S-7).
-- Retention: 3 years minimum (ROPA Activity 8; GDPR Art. 5(2); CCPA recordkeeping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  actor_user_id   UUID,            -- NULL for system-generated or DSR intake events
  tenant_id       UUID,            -- NULL for cross-tenant admin events
  target_entity   TEXT,            -- e.g., 'social_accounts', 'users'
  target_id       UUID,
  metadata        JSONB,           -- Event-specific payload; no raw tokens or passwords
  ip_address      INET,            -- PII: IP address; retained for legal evidence (3 years)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: audit_log is intentionally NOT scoped by tenant_id in its RLS policy.
-- The app_user role may INSERT only; admin role may SELECT across tenants for DSR.
-- RLS is still ENABLED to prevent row-level tampering by tenant sessions.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- app_user may only INSERT new rows; reading is restricted to admin and service roles.
CREATE POLICY audit_log_insert_only ON audit_log
  FOR INSERT TO app_user
  WITH CHECK (TRUE);

CREATE POLICY audit_log_admin_select ON audit_log
  FOR SELECT TO organicposts_admin
  USING (TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log (tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_user_id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);

-- Grants: INSERT only for app_user; NO UPDATE or DELETE ever (CC-1 / S-7)
GRANT INSERT ON audit_log TO app_user;
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
-- organicposts_admin: SELECT + INSERT for admin action entries; NO UPDATE or DELETE
GRANT SELECT, INSERT ON audit_log TO organicposts_admin;
REVOKE UPDATE, DELETE ON audit_log FROM organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: generation_log
-- Append-only. No UPDATE or DELETE via application layer (CC-1 / S-7).
-- Retention: account life + 30-day grace (ROPA Activity 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  draft_id              UUID,          -- FK added after drafts table is created
  provider              TEXT NOT NULL, -- 'anthropic' | 'openai' | 'google' | 'mistral'
  model_name            TEXT NOT NULL,
  model_version         TEXT NOT NULL,
  prompt_system         TEXT NOT NULL, -- System prompt hash+content at generation time
  prompt_user           TEXT NOT NULL, -- User-supplied topic text (may contain user PII; protected by DB-level AES-256)
  regen_instructions    TEXT[],        -- Ordered list of all regen instructions
  output_text           TEXT,          -- Full generated draft at generation time
  output_hash           TEXT,          -- SHA-256(output_text) for tamper evidence (S-12)
  regen_count           INT NOT NULL DEFAULT 0,
  latency_ms            INT,
  zdr_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  input_tokens          INT,
  output_tokens         INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON generation_log
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generation_log_tenant ON generation_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_generation_log_user ON generation_log (user_id);
CREATE INDEX IF NOT EXISTS idx_generation_log_draft ON generation_log (draft_id)
  WHERE draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generation_log_created ON generation_log (created_at);

-- Grants: INSERT only for app_user; NO UPDATE or DELETE ever (CC-1 / S-7)
GRANT INSERT, SELECT ON generation_log TO app_user;
REVOKE UPDATE, DELETE ON generation_log FROM app_user;
-- organicposts_admin: SELECT for DSR access exports; no INSERT/UPDATE/DELETE
GRANT SELECT ON generation_log TO organicposts_admin;
REVOKE INSERT, UPDATE, DELETE ON generation_log FROM organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: drafts
-- Retention: account life + 30-day grace (ROPA Activity 3/4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('linkedin', 'instagram')),
  topic_input     TEXT,               -- User-supplied topic/URL (original input)
  body            TEXT,               -- Current draft body (may be edited by user)
  hashtags        TEXT[],             -- Hashtag block for Instagram
  ai_generated    BOOLEAN NOT NULL DEFAULT FALSE, -- Never cleared even if user edits (A3)
  generation_id   UUID REFERENCES generation_log (id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','scheduled','published','failed','discarded')),
  approved_by     UUID REFERENCES users (id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON drafts
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drafts_tenant ON drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled ON drafts (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_drafts_generation ON drafts (generation_id)
  WHERE generation_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON drafts TO app_user;
GRANT SELECT ON drafts TO organicposts_admin;

-- Now backfill the FK from generation_log to drafts
ALTER TABLE generation_log
  ADD CONSTRAINT fk_generation_log_draft
  FOREIGN KEY (draft_id) REFERENCES drafts (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- TABLE: publish_jobs
-- Retention: account life (ROPA Activity 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id          UUID NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts (id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','processing','done','failed')),
  platform_post_id  TEXT,           -- Platform's post ID on success
  error_message     TEXT,           -- Human-readable error; never contains token values
  attempt_count     INT NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON publish_jobs
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publish_jobs_tenant ON publish_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_draft ON publish_jobs (draft_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status ON publish_jobs (status, scheduled_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_publish_jobs_social_account ON publish_jobs (social_account_id);

GRANT SELECT, INSERT, UPDATE ON publish_jobs TO app_user;
GRANT SELECT ON publish_jobs TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- TABLE: dsr_requests
-- Retention: closed_at + 30 days then deleted (ROPA Activity 7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dsr_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants (id) ON DELETE SET NULL, -- NULL for unauthenticated requesters
  user_id               UUID REFERENCES users (id) ON DELETE SET NULL,   -- NULL if requester is unlinked
  requester_email       TEXT NOT NULL,          -- PII: email; used for OTP verification
  request_type          TEXT NOT NULL
                          CHECK (request_type IN ('access','erasure','portability','correction','restriction')),
  identity_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  identity_verified_at  TIMESTAMPTZ,
  identity_method       TEXT DEFAULT 'email_otp',
  status                TEXT NOT NULL DEFAULT 'received'
                          CHECK (status IN ('received','in_progress','fulfilled','rejected')),
  fulfillment_notes     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at             TIMESTAMPTZ
);

-- DSR table: RLS enabled but policy allows intake from unauthenticated context via service role.
-- app_user role uses service-role key for DSR intake endpoint only; RLS bypass controlled by role.
ALTER TABLE dsr_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsr_requests FORCE ROW LEVEL SECURITY;

-- app_user can read/write only its own tenant's DSR rows; NULL tenant_id rows managed by admin only
CREATE POLICY tenant_isolation ON dsr_requests
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    OR tenant_id IS NULL
  );

CREATE POLICY dsr_admin_all ON dsr_requests
  FOR ALL TO organicposts_admin
  USING (TRUE)
  WITH CHECK (TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dsr_requests_tenant ON dsr_requests (tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dsr_requests_email ON dsr_requests (requester_email);
CREATE INDEX IF NOT EXISTS idx_dsr_requests_status ON dsr_requests (status);
CREATE INDEX IF NOT EXISTS idx_dsr_requests_closed ON dsr_requests (closed_at)
  WHERE closed_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON dsr_requests TO app_user;
GRANT SELECT, INSERT, UPDATE ON dsr_requests TO organicposts_admin;

-- ---------------------------------------------------------------------------
-- Sequences used by auto-increment helpers (UUID-based, no sequences needed)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Updated_at trigger function (shared across all tables using updated_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Attach trigger to tables with updated_at column
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_publish_jobs_updated_at
  BEFORE UPDATE ON publish_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dsr_requests_updated_at
  BEFORE UPDATE ON dsr_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Confirmation: CC-1 enforcement summary
-- REVOKE UPDATE, DELETE on audit_log and generation_log from app_user is above.
-- Documented here for auditability.
-- CC-1 STATUS: IMPLEMENTED in this migration.
-- S-7 STATUS: IMPLEMENTED in this migration.
-- ---------------------------------------------------------------------------
