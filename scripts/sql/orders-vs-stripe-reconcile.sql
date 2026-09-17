-- orders-vs-stripe-reconcile.sql — READ ONLY (R11, 2026-09-16).
--
-- The local order tables say what the webhook managed to record; Stripe says
-- what was charged and refunded. On 14/09 the Codex reconciliation found the
-- three July Kits charged US$29 each and fully refunded in Stripe while two of
-- them still read `delivered` here (refunded_at NULL), and the delivered Stack
-- with a US$0 session. This listing gives the founder each order's identifiers
-- to check in the Stripe dashboard (Payments → search the session id). No
-- customer e-mail is selected.
--
-- Backfill, ONLY after the founder confirms each id against Stripe (template,
-- commented — never run blind):
--   UPDATE kit_order SET status = 'refunded', refunded_at = <stripe refund time>
--    WHERE id = '<id>' AND status = 'delivered';

SELECT 'kit'       AS product, id, status, stripe_session_id, created_at, paid_at, delivered_at, refunded_at
  FROM kit_order
 WHERE status IN ('paid', 'delivered', 'refunded')
UNION ALL
SELECT 'pages',    id, status, stripe_session_id, created_at, paid_at, credited_at AS delivered_at, refunded_at
  FROM pages_order
 WHERE status IN ('paid', 'credited', 'refunded')
UNION ALL
SELECT 'ai_audit', id, status, stripe_session_id, created_at, paid_at, delivered_at, refunded_at
  FROM ai_audit_order
 WHERE status IN ('paid', 'delivered', 'refunded')
 ORDER BY product, created_at;

-- What the cockpit currently counts as "list value" (orders × price), per product:
SELECT 'kit' AS product, count(*) FILTER (WHERE status IN ('paid','delivered')) AS counted_as_paid,
       count(*) FILTER (WHERE status = 'refunded') AS refunded_locally
  FROM kit_order
UNION ALL
SELECT 'pages', count(*) FILTER (WHERE status IN ('paid','credited')), count(*) FILTER (WHERE status = 'refunded') FROM pages_order
UNION ALL
SELECT 'ai_audit', count(*) FILTER (WHERE status IN ('paid','delivered')), count(*) FILTER (WHERE status = 'refunded') FROM ai_audit_order;
