-- B16 (Codex D18) — list prices read on the vendors' own pricing pages on
-- 2026-09-25. Record: docs/ai-audit/catalog-verification-2026-09-25.md.
-- Founder runs this in production. Only verified rows, only where the value
-- differs; `verified` is NOT touched (hours saved are still estimates).
--
-- Before:  SELECT id, monthly_cost_usd, verified FROM ai_tool ORDER BY id;
BEGIN;
UPDATE ai_tool SET monthly_cost_usd = v.cost, updated_at = NOW()
  FROM (VALUES
    ('claude',       20.00),
    ('jasper',       69.00),
    ('intercom-fin', 29.00),
    ('make',         16.00),
    ('zapier',       29.99),
    ('opus-clip',    29.00),
    ('buffer',        5.00),
    ('hex',          36.00),
    ('weave',       199.00)
  ) AS v(id, cost)
 WHERE ai_tool.id = v.id AND ai_tool.monthly_cost_usd <> v.cost;
-- Expected: up to 5 rows updated (jasper, intercom-fin, zapier, buffer, weave), depending on what production holds.
SELECT id, monthly_cost_usd, verified, updated_at FROM ai_tool ORDER BY id;
COMMIT;
