-- =============================================================================
-- Migration: 20260929000001_ai_tool_engines_and_provenance
-- D3 (Codex N08 + N09, 28/09/2026; own finding X03).
--
-- What was wrong in production (read 28/09):
--   1. ai_tool held 12 rows, all updated 2026-08-18, with the prices from
--      before the 25/09 verification (jasper 49, intercom-fin 99, buffer 12,
--      zapier 30). The manual SQL of 25/09 was never run.
--   2. The table had no `engines` column and the loader did not select one,
--      so the five business engines of the questionnaire (attract, convert,
--      deliver, retain, run) never reached the ranking on the DB path.
--   3. The three clinic tools of the seed (weave, nexhealth, podium) were not
--      in the table: a clinic audited in production never got a clinic tool.
--
-- What this does: adds the columns and upserts the 15 tools of the in-code
-- seed. It NEVER touches `verified`: hours saved are still estimates, so the
-- report keeps saying so. tests/unit/ai-audit-catalog-sync.test.ts parses this
-- file and fails if a row here differs from SEED_CATALOG.
--
-- NOTE: worker and api run migrations at boot. Merging this PR changes the
-- production catalog. HIGH by house rule (a migration is never auto-merged).
-- =============================================================================

ALTER TABLE ai_tool
  ADD COLUMN IF NOT EXISTS engines          TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_generic       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_checked_at DATE,
  ADD COLUMN IF NOT EXISTS price_note       TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_tool_engines ON ai_tool USING GIN (engines);

INSERT INTO ai_tool
  (id, name, url, category, niches, pains, engines, monthly_cost_usd, setup_effort, impact,
   hours_saved_weekly, one_liner, is_generic, price_checked_at, price_note)
VALUES
  ('chatgpt', 'ChatGPT', 'https://chat.openai.com', 'writing', '{}', '{content-volume,repetitive-tasks,email-overload}', '{attract,deliver,run}', 20, 'low', 'high', 5, 'General-purpose assistant for drafts, replies and quick analysis.', TRUE, NULL, 'Plus $20/mo is the widely published price; openai.com/chatgpt/pricing answered 403 to our check on 2026-09-25, so it stays an estimate.'),
  ('claude', 'Claude', 'https://claude.ai', 'writing', '{}', '{content-volume,data-analysis,repetitive-tasks}', '{deliver,run}', 20, 'low', 'high', 5, 'Long-context assistant strong at documents, analysis and code.', TRUE, '2026-09-25'::date, 'Pro $20/mo (claude.com/pricing, read 2026-09-25).'),
  ('jasper', 'Jasper', 'https://jasper.ai', 'marketing', '{agency,ecommerce}', '{content-volume,seo-visibility}', '{attract}', 69, 'medium', 'medium', 4, 'Brand-tuned marketing copy at volume across channels.', FALSE, '2026-09-25'::date, 'Creator $69/mo billed monthly, $59/mo billed yearly (jasper.ai/pricing, read 2026-09-25). Was 49 (estimate).'),
  ('fireflies', 'Fireflies.ai', 'https://fireflies.ai', 'meetings', '{}', '{meeting-notes}', '{run}', 18, 'low', 'medium', 3, 'Records, transcribes and summarizes meetings automatically.', FALSE, NULL, 'Pro is listed around $18/mo; fireflies.ai/pricing renders client-side and could not be read on 2026-09-25, so it stays an estimate.'),
  ('intercom-fin', 'Intercom Fin', 'https://intercom.com/fin', 'support', '{saas,ecommerce}', '{customer-support-load,email-overload}', '{retain,run}', 29, 'high', 'high', 8, 'AI agent that resolves front-line support tickets on its own.', FALSE, '2026-09-25'::date, 'Essential seat $29/mo plus Fin at $0.99 per resolved conversation (intercom.com/pricing, read 2026-09-25). The seed carried 99 as a blended guess; 29 is the verified floor, usage on top.'),
  ('apollo', 'Apollo.io', 'https://apollo.io', 'sales', '{saas,agency}', '{lead-research}', '{attract,convert}', 49, 'medium', 'high', 6, 'Finds, enriches and sequences outbound leads.', FALSE, NULL, 'apollo.io/pricing could not be read on 2026-09-25 (bot wall); $49/user/mo Basic stays an estimate.'),
  ('make', 'Make', 'https://make.com', 'ops', '{}', '{repetitive-tasks,email-overload}', '{run,deliver}', 16, 'high', 'high', 7, 'Visual automation to connect apps and kill manual busywork.', FALSE, '2026-09-25'::date, 'Pro $16/mo; Core $9, Teams $29 (make.com/pricing, read 2026-09-25).'),
  ('zapier', 'Zapier', 'https://zapier.com', 'ops', '{}', '{repetitive-tasks}', '{run}', 29.99, 'low', 'medium', 4, 'No-code automations between the tools you already use.', FALSE, '2026-09-25'::date, 'Professional $29.99/mo billed monthly, $19.99/mo yearly (zapier.com/pricing, read 2026-09-25). Was 30.'),
  ('opus-clip', 'Opus Clip', 'https://opus.pro', 'video', '{creator,agency}', '{video-editing,content-volume}', '{attract}', 29, 'low', 'medium', 4, 'Turns long videos into ready-to-post short clips.', FALSE, '2026-09-25'::date, 'Pro $29/mo; Starter $15 (opus.pro/pricing, read 2026-09-25).'),
  ('buffer', 'Buffer', 'https://buffer.com', 'marketing', '{}', '{social-scheduling,content-volume}', '{attract}', 5, 'low', 'medium', 3, 'Schedules and drafts social posts across channels.', FALSE, '2026-09-25'::date, 'Essentials $5 per channel per month; Team $10 per channel (buffer.com/pricing, read 2026-09-25). Was 12 (estimate). Multiply by channels.'),
  ('gamma', 'Gamma', 'https://gamma.app', 'design', '{agency,consulting}', '{design-assets,content-volume}', '{attract,deliver}', 10, 'low', 'medium', 2, 'Generates polished decks and one-pagers from a prompt.', FALSE, NULL, 'gamma.app/pricing could not be read on 2026-09-25; Plus $10/mo stays an estimate.'),
  ('hex', 'Hex', 'https://hex.tech', 'data', '{saas}', '{data-analysis}', '{run,deliver}', 36, 'high', 'high', 6, 'Notebook + AI for exploring and sharing data analyses.', FALSE, '2026-09-25'::date, 'Team $36/editor/mo; Professional $75 (hex.tech/pricing, read 2026-09-25).'),
  ('weave', 'Weave', 'https://getweave.com', 'clinic-ops', '{clinic,dental,local-service}', '{phone-answering,no-shows,reviews,appointment-scheduling}', '{convert,retain,run}', 199, 'medium', 'high', 8, 'Phone, texts, reviews and reminders for local clinics in one place.', FALSE, '2026-09-25'::date, 'Listed "from $199/mo" (getweave.com/pricing, read 2026-09-25). Was 99 (estimate).'),
  ('nexhealth', 'NexHealth', 'https://nexhealth.com', 'clinic-ops', '{clinic,dental}', '{appointment-scheduling,no-shows,billing-admin}', '{convert,run}', 79, 'medium', 'high', 6, 'Online booking, reminders and paperwork for dental and medical practices.', FALSE, NULL, 'Quote-only on nexhealth.com (read 2026-09-25); 79 stays an estimate.'),
  ('podium', 'Podium', 'https://podium.com', 'reviews', '{clinic,dental,local-service,restaurant}', '{reviews,phone-answering}', '{attract,retain}', 89, 'low', 'medium', 4, 'Collects reviews and answers customer messages for local businesses.', FALSE, NULL, 'Quote-only on podium.com/pricing (read 2026-09-25); 89 stays an estimate.')

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, category = EXCLUDED.category,
  niches = EXCLUDED.niches, pains = EXCLUDED.pains, engines = EXCLUDED.engines,
  monthly_cost_usd = EXCLUDED.monthly_cost_usd, setup_effort = EXCLUDED.setup_effort,
  impact = EXCLUDED.impact, hours_saved_weekly = EXCLUDED.hours_saved_weekly,
  one_liner = EXCLUDED.one_liner, is_generic = EXCLUDED.is_generic,
  price_checked_at = EXCLUDED.price_checked_at, price_note = EXCLUDED.price_note,
  updated_at = NOW();
-- `verified` is deliberately absent from the list above.
