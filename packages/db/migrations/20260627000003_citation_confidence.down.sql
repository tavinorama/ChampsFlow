-- Rollback: 20260627000003_citation_confidence
-- Removes the three confidence-signal columns added to citation_check.
-- WARNING: Any data stored in these columns will be lost.

ALTER TABLE citation_check
  DROP COLUMN IF EXISTS raw_text_snippet,
  DROP COLUMN IF EXISTS runs_count,
  DROP COLUMN IF EXISTS mention_rate;
