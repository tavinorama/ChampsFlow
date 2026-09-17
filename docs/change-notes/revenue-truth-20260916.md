# R11-a — a granted tier is not a paying customer; count × price is not revenue (2026-09-16)

Local branch `prep/r11-revenue-truth`, base `7a64900`. Risk **LOW/MEDIUM** (admin API read shape extended, admin page labels, cockpit shape extended — nothing customer-facing). **No migration, no env, no writes.** HELD until F2/F3.

## What was measured

| Fact | Evidence |
| --- | --- |
| Tenants | 1 `agency` + 3 `free` (`tenants.plan_tier`) |
| Subscriptions | 2 `canceled`, **0 active** (`billing_subscriptions`) |
| Admin overview tile | "Paid (Agency): 1" — the founder's own comp (`admin.ts` counted `plan_tier != 'free'`) |
| Kits | 2 `delivered` (`refunded_at` NULL), 1 `refunded`, 6 `pending`; Stripe (Codex 14/09 18:13Z): all three charged US$29 and **fully refunded** |
| Cockpit | "Kit revenue US$58" = `(paid + delivered) × US$29` (`cockpit.ts`) |
| Refund handler | `charge.refunded → status='refunded'` exists since #271 (12/07); the July refunds (8–13/07) straddle it, which is consistent with two of three never being written locally |

No external paying customer exists in these systems.

## What changes

1. **`apps/api/src/lib/cockpit.ts`** — `splitBilledFromGranted(byTier, billedByTier)` (pure): BILLED = tenants with an ACTIVE Stripe-backed subscription, GRANTED = the rest of the tier headcount, never negative. `RevenueSummary.oneTime.{kit,pages}` gain `basis: "list_value_of_local_status"` and `basisNote` ("orders in local status paid/delivered × current list price — not Stripe receipts; refunds recorded in Stripe but not locally are still counted here"). `revenueUsd` is kept (same number) so nothing downstream breaks; its meaning is now written next to it.
2. **`apps/api/src/routes/admin.ts`** — `GET /api/admin/overview` also counts `billing_subscriptions WHERE status='active'` per tier and returns `tenants.billed` and `tenants.granted` beside the unchanged `byTier`.
3. **`apps/web/src/app/admin/page.tsx`** — tiles: "Billed (Growth)", "Billed (Agency)" (active Stripe subscription), "Granted, not billed" (tier set by hand — never revenue); "Kit revenue" / "Pages revenue" / "Kit Revenue" become "list value … — not Stripe receipts".
4. **`scripts/sql/orders-vs-stripe-reconcile.sql`** — read-only listing of every paid/delivered/refunded Kit, Pages and Stack order with its `stripe_session_id` (no e-mail) for the founder to check in Stripe, plus the counts the cockpit currently uses. The backfill `UPDATE` is a commented template: **founder-authorized, per id, after checking Stripe.**

## What this does NOT do (R11 proper, later)

- No per-event financial ledger with idempotent Stripe event ids; no automatic reconciliation against Stripe; no "US$87 charged / US$87 refunded / US$0 retained" line — that needs the backfill first (a production write) and then a receipts-based figure (Stripe API read from the worker, out of scope here).
- Does not touch `fetchReceivedMrr` (already Stripe-based) or the plan-tier gating of features.

## Tests

`tests/unit/revenue-truth.test.ts`: the 15/09 state (agency 1, active 0 → granted 1, billed 0); subtraction never below zero; the API reads active subscriptions and returns both numbers; the page never says "Paid" for a tier nor "revenue" for an order count; the cockpit lines carry the basis; the SQL selects no e-mail. `credits.test.ts` (honesty lint: no price literals in source) still green.

## Rollback

Revert the branch. Response shapes only gain fields; labels revert.

## Proof owed after deploy

Admin Today shows "Billed (Agency): 0 · Granted, not billed: 1" and "Kit list value" with the note; after the founder's backfill of the two July Kits, the Kit list value drops to US$0 on its own.
