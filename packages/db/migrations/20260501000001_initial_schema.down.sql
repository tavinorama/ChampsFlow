-- =============================================================================
-- DOWN Migration: 20260501000001_initial_schema
-- Reverses all tables, roles, indexes, and triggers from the UP migration.
-- WARNING: This will destroy ALL data. Only run in development environments.
-- =============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_dsr_requests_updated_at ON dsr_requests;
DROP TRIGGER IF EXISTS trg_publish_jobs_updated_at ON publish_jobs;
DROP TRIGGER IF EXISTS trg_drafts_updated_at ON drafts;
DROP TRIGGER IF EXISTS trg_social_accounts_updated_at ON social_accounts;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;

DROP FUNCTION IF EXISTS set_updated_at();

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS dsr_requests CASCADE;
DROP TABLE IF EXISTS publish_jobs CASCADE;
DROP TABLE IF EXISTS drafts CASCADE;
DROP TABLE IF EXISTS generation_log CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS social_accounts CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop roles
DROP ROLE IF EXISTS organicposts_admin;
DROP ROLE IF EXISTS app_user;

-- Drop extensions (only if safe to do so in this environment)
-- DROP EXTENSION IF EXISTS "uuid-ossp";
-- DROP EXTENSION IF EXISTS "pgcrypto";
