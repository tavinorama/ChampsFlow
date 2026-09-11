-- Reverse 20260911000001_crm_design_partner
--
-- ORDER MATTERS AND THE FIRST STEP LOSES DATA, ON PURPOSE.
--
-- Narrowing the CHECK back would fail while any row still sits on a funnel
-- stage, so the rollback must first move those rows to a value the OLD
-- constraint accepts. The mapping is the closest honest equivalent:
--
--   call_booked -> qualified   (a booked call is a qualified contact)
--   call_done   -> qualified
--   proposal    -> qualified
--   paid        -> customer    (same meaning, older word)
--
-- That collapses three distinct steps into one. It is a genuine loss of
-- information, and it is why this rollback should only be run deliberately.
-- The contact's note (the dossier) still carries the [design-partner] lines
-- that record what actually happened, so the history is not erased — only the
-- stage label is coarsened.

UPDATE crm_contact SET stage = 'customer'  WHERE stage = 'paid';
UPDATE crm_contact SET stage = 'qualified' WHERE stage IN ('call_booked', 'call_done', 'proposal');

ALTER TABLE crm_contact
  DROP CONSTRAINT IF EXISTS crm_contact_stage_allowed;

ALTER TABLE crm_contact
  ADD CONSTRAINT crm_contact_stage_check
  CHECK (stage IN ('new', 'contacted', 'qualified', 'customer', 'lost'));

DROP INDEX IF EXISTS idx_crm_contact_source;

ALTER TABLE crm_contact
  DROP COLUMN IF EXISTS source;
