-- ai_tool — the AI Audit Stack catalog (new product, founder 2026-08-13).
--
-- The recommendation engine (apps/api/src/lib/ai-audit/engine.ts) is pure and
-- takes a catalog as input; this table is where that catalog lives in
-- production. Same shape as the in-code SEED_CATALOG so the repository can map
-- rows 1:1 — and the repo FALLS BACK to that seed when this table is empty or
-- absent, so the product runs before this migration is ever applied.
--
-- Reference data, not per-tenant data: no RLS, readable by the app role — the
-- exact pattern of source_registry. Rows are UPDATED as pricing/capabilities
-- change (upsert on id); history lives in git and in curation PRs. Writes are
-- privileged (superadmin / curation job), never a tenant path.
--
-- HONESTY (founder rule: audits are real or fail honestly): every seeded number
-- is a PLAUSIBLE ESTIMATE, so rows land verified = FALSE. A client-facing report
-- must not present an unverified cost/ROI as fact — the report layer reads this
-- flag. Curation flips verified = TRUE once a human confirms the numbers.
--
-- Capilaridade (founder's depth bar): niches[] + pains[] are arrays so one tool
-- can serve many verticals and address many pains — the axis that lets the
-- recommendation stay niche-aware as the catalog grows to thousands of rows.
--
-- Reversible: the .down drops the table. Additive; no existing table touched.

CREATE TABLE IF NOT EXISTS ai_tool (
  id                 TEXT        PRIMARY KEY,          -- stable slug (e.g. 'chatgpt')
  name               TEXT        NOT NULL,
  url                TEXT        NOT NULL DEFAULT '',
  category           TEXT        NOT NULL,             -- writing · support · ops · marketing · sales · dev · data · video · meetings · design
  niches             TEXT[]      NOT NULL DEFAULT '{}',-- verticals it fits; {} = general
  pains              TEXT[]      NOT NULL DEFAULT '{}',-- pain slugs it addresses (join key with the questionnaire)
  monthly_cost_usd   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monthly_cost_usd >= 0),
  setup_effort       TEXT        NOT NULL CHECK (setup_effort IN ('low', 'medium', 'high')),
  impact             TEXT        NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  hours_saved_weekly NUMERIC(6,2)  NOT NULL DEFAULT 0 CHECK (hours_saved_weekly >= 0),
  one_liner          TEXT        NOT NULL DEFAULT '',
  -- FALSE until a human verifies the cost/hours — the report gates on this.
  verified           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot query: "which tools address these pains, in this niche?"
CREATE INDEX IF NOT EXISTS idx_ai_tool_pains ON ai_tool USING GIN (pains);
CREATE INDEX IF NOT EXISTS idx_ai_tool_niches ON ai_tool USING GIN (niches);
CREATE INDEX IF NOT EXISTS idx_ai_tool_category ON ai_tool (category);

-- Seed = the in-code SEED_CATALOG (starter, verified = FALSE). Upsert so a
-- re-run refreshes the row without duplicating; curation PRs edit these values.
INSERT INTO ai_tool (id, name, url, category, niches, pains, monthly_cost_usd, setup_effort, impact, hours_saved_weekly, one_liner, verified) VALUES
  ('chatgpt', 'ChatGPT', 'https://chat.openai.com', 'writing', '{}', '{content-volume,repetitive-tasks,email-overload}', 20, 'low', 'high', 5, 'General-purpose assistant for drafts, replies and quick analysis.', FALSE),
  ('claude', 'Claude', 'https://claude.ai', 'writing', '{}', '{content-volume,data-analysis,repetitive-tasks}', 20, 'low', 'high', 5, 'Long-context assistant strong at documents, analysis and code.', FALSE),
  ('jasper', 'Jasper', 'https://jasper.ai', 'marketing', '{agency,ecommerce}', '{content-volume,seo-visibility}', 49, 'medium', 'medium', 4, 'Brand-tuned marketing copy at volume across channels.', FALSE),
  ('fireflies', 'Fireflies.ai', 'https://fireflies.ai', 'meetings', '{}', '{meeting-notes}', 18, 'low', 'medium', 3, 'Records, transcribes and summarizes meetings automatically.', FALSE),
  ('intercom-fin', 'Intercom Fin', 'https://intercom.com/fin', 'support', '{saas,ecommerce}', '{customer-support-load,email-overload}', 99, 'high', 'high', 8, 'AI agent that resolves front-line support tickets on its own.', FALSE),
  ('apollo', 'Apollo.io', 'https://apollo.io', 'sales', '{saas,agency}', '{lead-research}', 49, 'medium', 'high', 6, 'Finds, enriches and sequences outbound leads.', FALSE),
  ('make', 'Make', 'https://make.com', 'ops', '{}', '{repetitive-tasks,email-overload}', 16, 'high', 'high', 7, 'Visual automation to connect apps and kill manual busywork.', FALSE),
  ('zapier', 'Zapier', 'https://zapier.com', 'ops', '{}', '{repetitive-tasks}', 30, 'low', 'medium', 4, 'No-code automations between the tools you already use.', FALSE),
  ('opus-clip', 'Opus Clip', 'https://opus.pro', 'video', '{creator,agency}', '{video-editing,content-volume}', 29, 'low', 'medium', 4, 'Turns long videos into ready-to-post short clips.', FALSE),
  ('buffer', 'Buffer', 'https://buffer.com', 'marketing', '{}', '{social-scheduling,content-volume}', 12, 'low', 'medium', 3, 'Schedules and drafts social posts across channels.', FALSE),
  ('gamma', 'Gamma', 'https://gamma.app', 'design', '{agency,consulting}', '{design-assets,content-volume}', 10, 'low', 'medium', 2, 'Generates polished decks and one-pagers from a prompt.', FALSE),
  ('hex', 'Hex', 'https://hex.tech', 'data', '{saas}', '{data-analysis}', 36, 'high', 'high', 6, 'Notebook + AI for exploring and sharing data analyses.', FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, category = EXCLUDED.category,
  niches = EXCLUDED.niches, pains = EXCLUDED.pains,
  monthly_cost_usd = EXCLUDED.monthly_cost_usd, setup_effort = EXCLUDED.setup_effort,
  impact = EXCLUDED.impact, hours_saved_weekly = EXCLUDED.hours_saved_weekly,
  one_liner = EXCLUDED.one_liner, updated_at = NOW();
