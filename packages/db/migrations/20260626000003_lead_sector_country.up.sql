-- Migration: 20260626000003_lead_sector_country
-- Capture the free-test segmentation fields from the redesigned form (mockup §9):
-- Sector + Country selects. Additive, nullable; no PII beyond what the lead row
-- already holds. Retention follows lead_capture (ROPA).

ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS sector  TEXT;
ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS country TEXT;
