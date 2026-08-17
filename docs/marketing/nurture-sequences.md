# Nurture sequences (as built)

**TL;DR.** Every nurture drip now follows one founder rule (17/08/2026): **aggressive cadence 0d, +1d, +2d, +2d**. Step 1 goes out the moment the contact is enrolled; nothing waits more than two days. Every sequence is started by a **webhook or a worker chain**, never by hand only (the operator endpoint stays as a manual extra). Every purchase **suppresses the lower rungs** for that email. Every email carries the one-click unsubscribe (`GET /api/nurture/unsubscribe?token=`). Single source of truth for steps, delays, chain and suppression: `packages/shared/src/nurture-cadence.ts`. New email copy: `packages/shared/src/emails/nurture-catalog.ts` (English, no em-dash, sentences of twelve words or fewer, first-person CTAs). **DB gate:** the `nurture_enrollment.sequence` CHECK must be widened by the separate migration PR before the six new names can be inserted; until then the code logs `nurture_sequence_not_allowed` and skips, never crashes.

## The rule

| Step | Delay from previous | Cumulative |
|---|---|---|
| 1 | 0d (at enrollment) | day 0 |
| 2 | +1d | day 1 |
| 3 | +2d | day 3 |
| 4 | +2d | day 5 |

Sequences with fewer steps take the prefix. Pinned by `tests/unit/nurture-cadence.test.ts`.

## Sequences

| Sequence | Existed before? | Trigger (event, file:line) | Steps | Delays | Emails | Unsubscribe | Suppressed by |
|---|---|---|---|---|---|---|---|
| `free_to_kit` | yes | free GEO test with marketing consent: `apps/api/src/routes/products.ts:454` and `:563` | 4 | 0 / +1d / +2d / +2d (was 0 / +3d / +2d / +2d) | `nurture-free-1..4.ts` | footer link | any purchase (kit, ai_audit, pages, credit_pack, subscription, organicposts) |
| `kit_to_growth` | yes | Stripe `checkout.session.completed`, product `get_cited_kit`: `apps/api/src/routes/billing.ts:1571` | 3 | 0 / +1d / +2d (was enroll +2d, then +4d / +3d) | `nurture-growth-1..3.ts` | footer link | credit_pack, subscription, organicposts |
| `kit_to_dfy` | yes (never enrolled by code) | **worker chain**: last `kit_to_growth` step sent and the email has no paid `tenants.plan_tier`: `apps/worker/src/jobs/nurture-send.ts:164` (`enrollChainedSequence`) | 3 | 0 / +1d / +2d (was +4d / +3d) | `nurture-kit-1..3.ts` | footer link | credit_pack, subscription, organicposts |
| `credit_pack_bought` | **new** | Stripe `checkout.session.completed`, product `credit_pack`: `billing.ts:1433` | 2 | 0 / +1d | catalog: "Your 1,000 credits are in" then "The credit math" | footer link | organicposts |
| `ai_audit_bought` | **new** | Stripe `ai_audit_stack` branch from PR #479 (not on main yet): TODO at `billing.ts:1450`, one call to `nurtureAfterPurchase(kind:"ai_audit", sequence:"ai_audit_bought")` | 3 | 0 / +1d / +2d | catalog: "first 24 hours checklist", "The 8 tools we held back" (OrganicPosts), "book the call" (/book) | footer link | organicposts |
| `pages_bought` | **new** | Stripe `checkout.session.completed`, product `ozvor_pages_site`: `billing.ts:1706` | 2 | 0 / +1d | catalog: "publish it and get cited", "regenerate and monitor" (Growth) | footer link | subscription, organicposts |
| `book_to_dfy` | **new** | `/api/book/intake` (pending PR by another agent; call `enrollNurture(db,{sequence:"book_to_dfy"})`) or operator `POST /api/v1/operator/nurture/enroll`: `apps/api/src/routes/operator.ts:443` | 2 | 0 / +1d | catalog: "what OrganicPosts actually does", "One question before we talk" | footer link | organicposts |
| `subscriber_onboarding` | **new** | Stripe `checkout.session.completed` for growth/agency: authed flow `billing.ts:1878`, direct flow known user `:2256`, direct flow pending `:2302` | 3 | 0 / +1d / +2d | catalog: run first audit, add competitors, three action cards + soft OrganicPosts | footer link | organicposts |
| `ai_audit_to_full` | PR #479 (open, not on main) | Stripe `ai_audit_stack` paid, `fulfillAiAuditOrder` (#479) | 2 | 0 / +1d (**pre-registered** in `NURTURE_SEQUENCES`; #479 ships +4d, on merge delete its local `AI_AUDIT_TO_FULL_STEPS`/delay table and route `nurture-ai-audit-1/2` through `dispatchEmail`) | #479: `nurture-ai-audit-1/2.ts` | footer link | organicposts |

## Suppression map (`NURTURE_SUPPRESS_ON_CONVERSION`)

| Purchase (`kind`) | Kills |
|---|---|
| `kit` | free_to_kit |
| `ai_audit` | free_to_kit |
| `pages` | free_to_kit |
| `credit_pack` | free_to_kit, kit_to_growth, kit_to_dfy |
| `subscription` | free_to_kit, kit_to_growth, kit_to_dfy, pages_bought |
| `organicposts` | everything (all nine sequences, `ai_audit_to_full` included) |

`suppressOnConversion(db, email, kind)` runs one parameterized `UPDATE ... WHERE sequence = ANY($2::text[]) AND suppressed = FALSE`; default `kind` is `kit` (the original behaviour). `organicposts` fires on `POST /api/engagements` (`apps/api/src/routes/engagements.ts`, contact email or tenant owner) and on operator `PATCH /api/v1/operator/engagements/:id` with `status: "won"` (`apps/api/src/routes/operator.ts`). The /book intake (other agent's PR) should call it too.

## Chain decision: `kit_to_growth` -> `kit_to_dfy`

Chosen: **chain in the worker**, not "enroll both at once with +5d offset". When the third Growth email is sent, `enrollChainedSequence` checks `users -> tenants.plan_tier`; if it is still `free` (or no account), it inserts `kit_to_dfy` with `next_send_at = NOW()` (step 1 immediately). Reasons: the chain adapts (a Growth conversion during days 0-3 means DFY never starts), it needs no new webhook, and `suppressOnConversion(kind:"subscription")` still covers the race. Idempotent through the `(email, sequence)` UNIQUE.

## Operational notes

- **Migration (separate PR, founder-merged):** `packages/db/migrations/20260817000001_nurture_sequences_widen.up.sql` widens the CHECK to all nine names above (`ai_audit_to_full` included). Timestamp is later than #478's `20260815000002`, so it wins regardless of merge order. Until applied: `nurture_sequence_not_allowed` errors in the API/worker logs mean lost enrollments for the six new names (legacy three keep working).
- **Operator endpoint** now accepts every catalog name (`ALL_NURTURE_SEQUENCES`); it is still a fixed drip with unsubscribe, never free-form email.
- **Worker poll** every 5 minutes; step 1 of any sequence therefore lands within ~5 minutes of the webhook.
- **Tests:** `tests/unit/nurture-cadence.test.ts` (rule, copy rules, maps), `tests/unit/billing/webhook-nurture-triggers.test.ts` (each webhook enrolls + suppresses, CHECK tolerance), `tests/unit/nurture-worker-chain.test.ts` (delays written by worker, chain, dispatch), `tests/unit/nurture.test.ts` (helpers).
