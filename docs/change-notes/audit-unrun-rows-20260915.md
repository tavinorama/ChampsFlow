# T0.1 — an un-run audit row is marked, never deleted (2026-09-15)

Local branch `prep/t0-1-coverage-retry`, base `db65caa`. Risk **MEDIUM** (worker behaviour + one Delivery Health read). **No migration, no env, no cron.** HELD: no push/PR/merge/deploy/production SQL in this preparation.

## What happened (production, 15/09, read-only evidence)

| Fact | Evidence |
| --- | --- |
| Three own-brand audits stuck in `running` since 06:04:50, 06:15:00 and 06:35:09 UTC | `geo_audit` rows `56569683…`, `e7ad092f…`, `55b0fbbd…`, `triggered_by='cron'`, `methodology_version='1.0'`, `providers_used=[]` |
| Same job, three attempts | worker log `audit_job_started job_id=coverage-retry:d4cb18ab…:1` attempt 1/2/3 |
| The repeat correctly declined to probe | `audit_drift_engines_paused paused=anthropic remaining=4` → `audit_coverage_retry_panel_not_ready` ("not probing — a repeat on the same incomplete panel costs money and changes nothing"); `api_spend` since deploy: no audit rows |
| Then it died | `audit_job_failed "permission denied for table geo_audit"`, attempt 3 `permanent=true` (the queue's terminal alert fired via `alertOps`) |
| Why | `audit-run.ts` ran `DELETE FROM geo_audit WHERE id = …` (P1-07, #599, 11/09). `information_schema.role_table_grants`: `app_user` has INSERT, SELECT, UPDATE on `geo_audit` — **no DELETE** |
| Collateral | `recordCoverageRetry` never ran (the DELETE sat before it); `strategy_plan` since the 14/09 deploy: 0; `POST /api/brands/:id/audit` answers `AUDIT_ALREADY_RUNNING` (409) while a row is `running`; Delivery Health `queue_minutes` grows for ever |
| Why the panel is incomplete at all | `engine_drift_check`: anthropic `failing` on 7 consecutive daily checks since 09/09 (`empty_runs: 7`) — separate investigation (T0.2) |

## What changes

1. **`packages/shared/src/coverage-retry.ts`** — `abandonUnrunAudit({ record, mark })`: records the decision first, then marks the row; a `mark()` that throws becomes `audit_row_unmarkable: …`. Prose reasons with machine prefixes: `coverage_retry_skipped:` and `monthly_cap_reached:` (`UNRUN_AUDIT_PREFIXES`, `isUnrunAuditMessage`). `status` has a CHECK on `pending|running|complete|failed`, so `failed` + reason is the only honest terminal state without a migration.
2. **`packages/shared/src/audit-queue.ts`** — `audit_row_unmarkable` is non-retryable; `isAuditFailurePermanent` also accepts `code: detail`. One attempt, one alert, no further rows.
3. **`apps/worker/src/jobs/audit-run.ts`**
   - coverage-retry "panel not ready": `DELETE` → `abandonUnrunAudit` (record = `applyCoverageRetry` + state on the ORIGINAL audit; mark = `UPDATE … status='failed', error_message=<prose>`); new `audit_coverage_retry_rescheduled` info line.
   - monthly ceiling: the mark moves **outside** the count's fail-open `try/catch`. A count error still fails open (unchanged); a mark error now stops the job instead of probing past the ceiling.
   - `processAuditJob` is a tracked wrapper: any throw after the row exists marks it `failed` (`status IN ('pending','running')` only) with a customer-safe sentence, logs `audit_failed_row_marked` / `audit_failed_row_unmarked`, and rethrows. Retry policy unchanged.
4. **`apps/api/src/lib/delivery-health-read.ts`** — `probeAudits` no longer counts a deliberately un-run row as a failed audit (`raw_error_leak` still reads every `failed` row, and the new reasons are prose).

## Tests

- `tests/unit/coverage-retry.test.ts`: source contract inverted (no `DELETE FROM geo_audit`; mark via `abandonUnrunAudit` in both paths; tracked wrapper present); unit tests for record-before-mark, record failure reported + row still marked, mark failure ⇒ permanent code; reasons are prose, carry the prefix, and do not trip `looksLikeRawError`; Delivery Health exclusion.
- `tests/unit/audit-retry-policy.test.ts`: `audit_row_unmarkable` permanent with/without detail; a code mid-sentence is not; transient messages with colons still retry.

## What this does NOT do

- Does not clean the three existing zombie rows. Proposed, **founder-authorized only** (production write):
  ```sql
  UPDATE geo_audit
     SET status = 'failed',
         error_message = 'coverage_retry_skipped: repeat not run — anthropic still held back for drift; nothing was probed or charged.'
   WHERE id IN ('56569683-ce9a-490d-959f-dd9e3cb8c211',
                'e7ad092f-0705-4793-a495-cbcb62b52143',
                '55b0fbbd-7803-44e1-ad70-52444f3168e1')
     AND status = 'running';
  ```
  Read-only listing first: `scripts/sql/list-unrun-audits.sql`.
- Does not grant DELETE to `app_user` (a migration; not needed by this code any more).
- Does not fix anthropic returning empty answers to the drift battery (T0.2).
- Does not re-record the coverage-retry state for the 14/09 origin audit `d4cb18ab…` (its breakdown still says `scheduled`; the next scheduled run re-measures).

## Rollback

Revert the branch. Rows marked `failed` by it stay `failed` (true state). No data is deleted by this change.

## Proof still owed after deploy

One scheduled audit on an incomplete panel ending as `failed` + `coverage_retry_skipped:` with the origin audit's breakdown updated, zero new `running` rows older than the job timeout, and one `audit_failed_row_marked` line for any job that throws.
