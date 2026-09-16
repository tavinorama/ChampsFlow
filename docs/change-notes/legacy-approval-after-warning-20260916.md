# R04/R06-a — an approval given before the G03 warning is not a human gate (2026-09-16)

Local branch `prep/r04-legacy-approval-after-warning`, base `7a64900`. Risk **HIGH** (graph runner: decides whether a legacy marketing run continues or halts). **No migration, no env.** HELD until F2/F3 — founder merge.

## The hole (read by the Codex audit, confirmed in `apps/api/src/lib/graph-runner.ts`)

Reconciliation decision F-C (#618, 14/09): a marketing run created before containment is not killed — it is marked, the founder is warned once on Telegram, and *"its human gate decides"*. The code let a run past a quarantined legacy artifact when its approval node was `waiting` **or `succeeded`**. A `succeeded` approval recorded before the warning was an approval of a draft nobody had flagged — the "human gate" had already been passed blind, and the run could continue to publish on it.

No harmful publication was observed; the path was open. 12 legacy runs were warned on 14/09 12:00Z; their approval nodes were `waiting` (parked at the gate), so the tightened rule changes nothing for them — it only closes the door for a run whose approval predates its review.

## What changes

`advanceRun`: `reviewedAt` = the earliest `__g03_review__` step of the run, or the moment this tick creates it. `humanGated` is true only when an approval node is `waiting`, or `succeeded` with `started_at` **after** `reviewedAt`. Otherwise the existing legacy-artifact guard applies: `__invalid_g03__` step `failed`, run `failed`, history preserved, no publish. The one-time Telegram warning still fires before the halt, so the halt is not silent.

Not in this PR (R06 proper): binding the approval to the artifact **hash** so an edit after approval invalidates it, and re-approval on evidence change. The runner's approval port does not carry a content hash today; that is a substrate change with its own tests.

## Tests

`tests/unit/graph-metric-containment.test.ts` — harness `seed` accepts a `started_at`; two new cases: (1) memory artifact + approval both **before** the review → run halts with `__invalid_g03__`, nothing published, history intact, one warning; (2) approval recorded **after** the review → run continues. The existing F-C cases (warn once, `waiting` gate continues, engineering report halts) unchanged.

## Rollback

Revert the branch: back to `waiting || succeeded`.

## Proof owed after deploy

A legacy run with a pre-review `succeeded` approval (if any remains) ending `failed` with `__invalid_g03__` instead of publishing; the 12 parked runs behaving as before when the founder decides at the gate.
