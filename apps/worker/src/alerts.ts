/**
 * alerts.ts — worker-side operational alerting.
 *
 * `alertOps` MOVED to packages/shared/src/ops-alert.ts (P0-08, 2026-09-04) and
 * is re-exported here so every existing import site in this app keeps working
 * unchanged. The move happened because the API now needs the same alerter: the
 * hosted content path fails inside an HTTP request rather than in a queue, and
 * "nada degrada calado" is not a rule about queues, it is a rule about
 * failures. A second copy would be a second alerter to keep configured, and the
 * copy that rots is the one nobody notices has gone quiet.
 *
 * What stays here is the worker's own alert FORMATTING — text about BullMQ jobs
 * has no business in a shared package.
 */
export { alertOps } from "../../../packages/shared/src/ops-alert";

/**
 * The alert for an audit job that has run out of attempts.
 *
 * Deliberately fired ONLY on the final attempt. Alerting on every attempt would
 * reproduce the 17/08 storm in the notification channel instead of the queue —
 * three messages for one problem, which is how people learn to mute a channel.
 */
export function formatAuditFailureAlert(input: {
  jobId: string | undefined;
  attemptsMade: number;
  attempts: number;
  message: string;
  auditId?: string | null;
  brandId?: string | null;
}): string {
  return [
    "🚨 Audit failed permanently",
    `job: ${input.jobId ?? "unknown"}`,
    input.auditId ? `audit: ${input.auditId}` : null,
    input.brandId ? `brand: ${input.brandId}` : null,
    `attempts: ${input.attemptsMade}/${input.attempts} — no more retries`,
    `reason: ${input.message.slice(0, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
