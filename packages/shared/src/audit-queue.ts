/**
 * audit-queue.ts — one retry policy for the `geo-audit` queue.
 *
 * THE INCIDENT (17/08/2026). Three audits failed at 06:00, 06:01 and 06:02 with
 * the identical message: "Only 2 of 5 AI engines answered; held back for drift".
 * One minute apart, three times, same cause. That is not three problems — it is
 * one problem retried into a storm.
 *
 * Two defects produced it:
 *
 *  1. TWO POLICIES ON ONE QUEUE. `geo-audit` had two producers with different
 *     settings: apps/api/src/routes/audits.ts declared attempts:3 with a 30s
 *     exponential backoff, while the daily-monitor producer in
 *     apps/worker/src/jobs/audit-run.ts constructed `new Queue("geo-audit")`
 *     with no defaultJobOptions at all — so it inherited BullMQ's defaults
 *     (attempts:1, no backoff). The scheduled audit, the one a customer never
 *     sees fail, had the FEWEST retries; the manual one retried hardest.
 *     Whichever fired, nobody could predict what would happen next.
 *
 *  2. THE BACKOFF WAS TOO SHORT FOR THE FAILURE IT WAS RETRYING. A 30s base
 *     gives 30s / 60s / 120s — all three attempts inside three minutes. But
 *     "only 2 of 5 engines answered" means a provider is down, rate-limiting, or
 *     an engine is paused for drift. None of those resolve in 30 seconds, and
 *     every retry spends real provider money (~$0.21–0.80 per audit) to fail
 *     the same way. Retrying fast against a down dependency is how you turn one
 *     outage into three.
 *
 * The policy below is deliberately patient: 10 minutes, then 20, then 40, so
 * three attempts span roughly 70 minutes instead of three. An engine outage that
 * clears within the hour is absorbed silently; one that does not gets reported
 * once, loudly, rather than three times, quietly.
 */

export const AUDIT_QUEUE_NAME = "geo-audit";

/**
 * Base delay for the exponential backoff, in milliseconds.
 *
 * Chosen against the failure this queue actually sees rather than a generic
 * default: engine outages and rate-limit windows are minutes-to-hours events.
 * Exported so the test can assert the spacing rather than re-derive it.
 */
export const AUDIT_RETRY_BASE_DELAY_MS = 10 * 60 * 1000;

export const AUDIT_ATTEMPTS = 3;

/**
 * The single default job policy for `geo-audit`. EVERY producer must pass this
 * — see tests/unit/audit-retry-policy.test.ts, which fails if a `new Queue`
 * for this queue is constructed without it.
 */
export const AUDIT_JOB_OPTIONS = {
  attempts: AUDIT_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: AUDIT_RETRY_BASE_DELAY_MS },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * When BullMQ will run attempt N (1-based), in ms after the first failure.
 * Pure, so the spacing is testable without a queue: exponential backoff in
 * BullMQ is delay * 2^(attemptsMade - 1).
 */
export function auditRetryDelayMs(attempt: number): number {
  if (attempt <= 1) return 0;
  return AUDIT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 2);
}

/**
 * Failures that must NOT be retried at all.
 *
 * `insufficient_engine_coverage` is a REFUSAL, not a crash: the run completed,
 * measured too few engines, and we deliberately declined to publish a score
 * that would not be comparable to the brand's history. Retrying it asks the same
 * down engines the same question and spends the money again. It is exactly the
 * error the three 17/08 audits carried.
 */
const NON_RETRYABLE = new Set(["insufficient_engine_coverage"]);

export function isAuditFailurePermanent(message: string | null | undefined): boolean {
  if (!message) return false;
  return NON_RETRYABLE.has(message.trim());
}
