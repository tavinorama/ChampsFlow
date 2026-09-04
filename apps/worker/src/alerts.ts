/**
 * alerts.ts — make a job failure audible.
 *
 * "Nada degrada calado" is a house rule, and the geo-audit queue was breaking
 * it in the most expensive way: on 17/08 three audits failed a minute apart with
 * the same message, wrote it to `geo_audit.error_message`, and told nobody. The
 * customer saw a generic "The audit failed. Please run it again." The founder
 * found out weeks later, from a report.
 *
 * There was no shortage of alerting machinery — the worker already talks to
 * Telegram from graph-tick — only no path from a failed job to it. The
 * `sendTelegram` there is private to that module and carries approve/reject
 * button plumbing this does not need, so rather than widen it, this is a small
 * self-contained sender for operational alerts.
 *
 * Rules it follows:
 *  - Never throws. An alerter that can break the thing it is watching is worse
 *    than no alerter.
 *  - Says so in the log when it CANNOT alert (missing env). A silent alerter is
 *    the exact failure mode being fixed — "não consegui olhar" ≠ "ok".
 *  - Carries no secrets, no tokens, no draft bodies.
 */
import { logger } from "../../../packages/shared/src/logger";

const TG_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TG_CHAT = process.env["TELEGRAM_CHAT_ID"] ?? "";

/**
 * Fire-and-forget operational alert.
 *
 * Returns whether the message actually left the process, so a caller that needs
 * to record "we alerted" can record the truth rather than the intention.
 */
export async function alertOps(text: string): Promise<boolean> {
  const body = text.slice(0, 3500);
  if (!TG_TOKEN || !TG_CHAT) {
    // Loud on purpose: this is the branch where the watchdog is blind.
    logger.error("ops_alert_undeliverable", {
      reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set",
      preview: body.slice(0, 200),
    });
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.error("ops_alert_send_failed", { status: res.status, preview: body.slice(0, 200) });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("ops_alert_send_threw", {
      message: (err as Error).message?.slice(0, 200),
      preview: body.slice(0, 200),
    });
    return false;
  }
}

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
