-- Rollback: 20260531000001_citation_evidence
ALTER TABLE citation_check DROP COLUMN IF EXISTS sources;
