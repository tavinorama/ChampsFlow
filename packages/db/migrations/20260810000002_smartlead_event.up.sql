-- =============================================================================
-- Migration: 20260810000002_smartlead_event
-- Capability: P34 — Smartlead webhook events land somewhere queryable BEFORE
-- the first cold email is ever sent (the founder's precondition for dispatch).
--
-- One append-only table of raw provider events. The CRM annotation
-- (crm_contact.stage/note) is derived FROM these rows by the webhook route,
-- but the raw event is the evidence: when a stage looks wrong, this table
-- answers "what did Smartlead actually send, and when" without trusting the
-- derivation. Same auditability rule as everywhere else: the watcher
-- (raw events) stays outside the watched (the derived CRM state).
--
-- Deliberately NO RLS and no tenant_id: outbound leads are not tenants, and
-- this mirrors the existing cross-tenant ops tables (lead_capture, kit_order,
-- crm_contact) — reachable only through requireSuperAdmin reads and the
-- token-gated webhook insert, both of which run as the privileged login role.
--
-- Reversible: the .down drops the table. Additive; no existing table touched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS smartlead_event (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Smartlead's event_type string, stored as received (EMAIL_REPLY,
  -- EMAIL_OPEN, EMAIL_BOUNCE, LEAD_UNSUBSCRIBED, ...). Not CHECK-constrained:
  -- the provider adds types without asking us, and a webhook that rejects
  -- unknown events loses the evidence exactly when something new happens.
  event_type   TEXT        NOT NULL,
  campaign_id  BIGINT,
  -- Normalized (lower-cased, trimmed) — the same identity key crm_contact uses.
  lead_email   TEXT,
  payload      JSONB       NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "What happened with this lead" is the hot query from the CRM side.
CREATE INDEX IF NOT EXISTS idx_smartlead_event_email
  ON smartlead_event (lead_email, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_smartlead_event_received
  ON smartlead_event (received_at DESC);
