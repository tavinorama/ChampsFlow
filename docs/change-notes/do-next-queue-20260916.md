# R08 — old cards do not starve the Do Next plan (2026-09-16)

Local branch `prep/r08-do-next-cap`, base `7a64900`. Risk **MEDIUM** (plan reconciliation in the worker, one API read, one dashboard line). **No migration, no env, no cron.** HELD until F2/F3.

## What was measured (own brand, read-only)

| Fact | Evidence |
| --- | --- |
| Last plan | `strategy_plan` 14/09 06:04:33Z, `generated_by='loop'`, linked to audit `d4cb18ab…` (14/09 06:00Z) |
| Its cards | 7 `proposed` + 5 `legacy_self_reported` = 12 = `LOOP_OPEN_CAP` |
| Codex replay of the persisted probes | 178 candidates, 12 carried, **0 created, 178 dropped by cap** (`evidence-full/loop-production-replay.json`) |
| Codex fixture | 7 proposed + 5 self-reports block a priority-99 candidate; with 11 old cards it enters (`loop-cap-reproduction.json`) |
| Global | `plan_task`: 33 `proposed`, 30 `legacy_self_reported`, 0 `verified_at`, 0 `artifact_url`; 0 plans since the 14/09 deploy |

Cause in code (`db65caa`/`7a64900`): `OPEN_STATES` includes the self-reported states, and `reconcileLoopTasks` counts every carried open card against `LOOP_OPEN_CAP` before it lets a fresh candidate in. A self-report is not work a person can do — it is a claim waiting for a re-probe. Counting it as a slot lets history freeze the plan.

Two more reads lied by construction: `GET /api/brands/:id/plan` said the loop generator was `ok` whenever *any* audit existed (not when a plan existed for the latest audit), and the Do Next card rendered `gap || evidence`, so the evidence — the reason the card exists — was hidden whenever a gap text was present.

## What changes

1. **`packages/llm/src/plan-task-state.ts`** — `SLOT_STATES` (proposed, accepted, drafting, review, blocked, regressed: actionable now) and `VERIFICATION_QUEUE_STATES` (manual_done_pending_verification, client_acknowledged, legacy_self_reported: waiting on a later audit). Together they partition `OPEN_STATES`. `OPEN_STATES` itself is unchanged, so "All caught up" and the delivery policy keep their meaning.
2. **`packages/llm/src/visibility-loop.ts`** — only `SLOT_STATES` count against `LOOP_OPEN_CAP`. Verification-queue cards are still carried (never dropped, never re-proposed, refreshed when a candidate matches) and counted in `stats.verificationQueue`. New `stats.queueBlocked` + `queueBlockedReason`: true when this audit produced fresh candidates, the slots were all carried cards, and **none** entered.
3. **`apps/worker/src/jobs/audit-run.ts`** — `visibility_loop_queue_blocked` warning with the numbers whenever `queueBlocked` is set (the existing `visibility_loop_refreshed` line also carries the new fields).
4. **`apps/api/src/routes/audits.ts`** — the plan read selects `audit_id`; `loopGeneration.status` is `ok` only when the latest plan is linked to the latest audit, else `never_ran` with a detail sentence.
5. **`apps/web/src/app/dashboard-v3/page.tsx`** — a Do Next card shows the gap **and** the evidence (when different), instead of `gap || evidence`.

## What this does NOT do (still R08, later PRs)

- Does not group repeated candidates per question/engine before the cap (Codex D2 #3) — 178 candidates are still 178 candidates; the cap now at least lets the best 12 slot-free ones in.
- Does not mark old cards `superseded` when the prompt panel changes (D2 #2). The 6 SaaS-panel cards on the own brand stay `proposed` until someone rejects them.
- Does not surface `queueBlocked` in the customer UI or in Delivery Health (D2 #5 second half) — it is in the worker log and in the stats only.
- Does not change `evaluateDoNextPolicy`'s `openActionCount` (still counts every OPEN card).

## Tests

`tests/unit/do-next-queue.test.ts`: the state partition; the 14/09 fixture (7+5 → a priority-99 candidate enters, legacy carried untouched, `verificationQueue: 5`); 12 proposed + 3 fresh → `queueBlocked` with the numbers; full cap with nothing fresh → not blocked; one entered → not blocked; a matching self-report is refreshed but stays slot-free; worker/API/dashboard wiring. Existing `visibility-loop`, `plan-task-state`, `plan-task-routes` and lifecycle suites unchanged.

## Rollback

Revert the branch. No data changes; the next audit reconciles under the old rule again.

## Proof owed after deploy

The own brand's weekly audit (Monday 06:00Z) generating a plan where `visibility_loop_refreshed` shows `created > 0` with the 5 legacy cards still present, `verificationQueue: 5`, and the dashboard showing fresh cards above the old ones. If `visibility_loop_queue_blocked` fires instead, the plan was starved for a reason the log names.
