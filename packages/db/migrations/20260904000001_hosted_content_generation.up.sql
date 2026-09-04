-- =============================================================================
-- Migration: 20260904000001_hosted_content_generation
-- Capability: P0-08 — hosted content generation, metered by the credit ledger.
--
-- WHAT THIS UNBLOCKS
-- Until now a paying customer without their own LLM API key could not generate
-- the content the audit told them to write (RELATORIO §3.2). The fix is a
-- platform-funded generation path, and the founder's decision (03/09) is that
-- the thing which authorises, meters and refuses it is the CREDIT BALANCE that
-- already exists. This migration is the schema that decision needs — three
-- pieces, no rewrites, nothing destructive.
--
-- 1. A NEW LEDGER REASON, 'content'
--    The ledger stays append-only and the existing reasons keep their meaning.
--    'content' is a separate reason rather than reusing 'audit' because a
--    balance you cannot decompose is a balance you cannot dispute: a founder
--    asking "how much of last month went to drafts?" must get an answer from
--    the ledger, not from an estimate. Widening a CHECK is additive — every
--    existing row still satisfies the new constraint.
--
-- 2. content_piece.generation_key
--    The idempotency key RELATORIO §16 P0-08 item 2 specifies:
--    auditId + actionId + artifactType + version. Reprocessing must not create
--    a second draft, and the guard is a UNIQUE INDEX rather than a
--    read-then-write check in code — the check-then-act window is exactly where
--    duplicates live. NULLable, and the index is partial, so every draft that
--    predates this migration stays valid and unconstrained.
--
-- 3. content_generation_failure — the dead-letter table
--    "Nada degrada calado." Today a failed draft returns a 402 and vanishes:
--    nothing is persisted, so nobody can answer "how often does generation
--    fail, and why?" This is the durable record behind the ops alert, holding
--    the reason and the attempt count and NEVER the draft body or a key.
-- =============================================================================

-- 1 -------------------------------------------------------------------------
-- Widen the ledger reason. Drop-and-recreate is the only way to alter a CHECK
-- in Postgres; the constraint name is the one 20260805000001 created.
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;
ALTER TABLE credit_ledger
  ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN ('monthly_grant', 'audit', 'purchase', 'adjustment', 'content'));

-- 2 -------------------------------------------------------------------------
ALTER TABLE content_piece ADD COLUMN IF NOT EXISTS generation_key TEXT;

COMMENT ON COLUMN content_piece.generation_key IS
  'P0-08 idempotency: audit:<id>|action:<id>|artifact:<type>|v:<n>. Built by '
  'draftGenerationKey() in packages/shared/src/hosted-content.ts. NULL for '
  'drafts created before the hosted path existed.';

-- Partial: pre-existing rows (generation_key IS NULL) do not participate, so
-- this cannot fail on historical data.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_content_generation_key
  ON content_piece (tenant_id, generation_key)
  WHERE generation_key IS NOT NULL;

-- 3 -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_generation_failure (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  brand_id      UUID,

  -- The same identity the draft would have had, so a failure can be matched to
  -- the retry that eventually succeeded.
  generation_key TEXT       NOT NULL,

  -- Short machine reason: provider_no_draft, no_key, fact_check_failed,
  -- prompt_rejected, ledger_not_ready. NOT a stack trace, NOT a provider body.
  reason        TEXT        NOT NULL,

  -- How many attempts were spent before giving up. 'Retried once and died' and
  -- 'died on the first try' are different incidents.
  attempts      INTEGER     NOT NULL DEFAULT 1 CHECK (attempts >= 1),

  -- Whether the ops alert actually left the process. Recording the INTENTION
  -- to alert is how a blind watchdog looks healthy (30/07 lesson).
  alerted       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Client key or ours. Tells us whether a failure cost us money.
  key_source    TEXT        NOT NULL DEFAULT 'platform'
                  CHECK (key_source IN ('client', 'platform', 'none')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE content_generation_failure IS
  'P0-08 dead-letter for hosted content generation. Never stores draft bodies, '
  'prompts, provider responses or keys — only what an operator needs to see '
  'that generation is failing and how often.';

ALTER TABLE content_generation_failure ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_generation_failure FORCE ROW LEVEL SECURITY;

-- app.current_tenant_id is the setting 48 of the 50 policies in this repo use;
-- the two that say app.tenant_id are the outliers, not the convention.
CREATE POLICY tenant_isolation ON content_generation_failure
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX IF NOT EXISTS idx_content_gen_failure_tenant
  ON content_generation_failure (tenant_id, created_at DESC);

-- Insert-only from the app: a dead-letter row that can be edited or deleted by
-- the code that wrote it is not evidence.
GRANT SELECT, INSERT ON content_generation_failure TO app_user;
GRANT SELECT ON content_generation_failure TO organicposts_admin;
