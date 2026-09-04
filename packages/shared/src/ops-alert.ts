/**
 * ops-alert.ts — make a failure audible, from any app.
 *
 * MOVED HERE FROM apps/worker/src/alerts.ts (P0-08, 2026-09-04), unchanged.
 * The worker file now re-exports it, so every existing import site keeps
 * working — the same move packages/shared/src/credits.ts and plan-limits.ts
 * made, and for the same reason: a second copy of an alerter is a second
 * alerter to keep configured, and the one that rots is the one nobody notices
 * is silent.
 *
 * The API needed it because hosted content generation (P0-08) fails in the
 * request path, not in a queue: a customer clicks "generate draft", our
 * provider 500s, and until now that produced an HTTP 402 and no record
 * anywhere. "Nada degrada calado" applies to synchronous failures too.
 *
 * Original rationale, preserved:
 *   The geo-audit queue was breaking the rule in the most expensive way: on
 *   17/08 three audits failed a minute apart with the same message, wrote it to
 *   `geo_audit.error_message`, and told nobody. The customer saw a generic "The
 *   audit failed. Please run it again." The founder found out weeks later, from
 *   a report.
 *
 * Rules it follows:
 *  - Never throws. An alerter that can break the thing it is watching is worse
 *    than no alerter.
 *  - Says so in the log when it CANNOT alert (missing env). A silent alerter is
 *    the exact failure mode being fixed — "não consegui olhar" ≠ "ok".
 *  - Carries no secrets, no tokens, no draft bodies.
 *  - Reads env at CALL time, not at module load: the platform-key rotation path
 *    mutates process.env after boot, and a module-level snapshot would pin the
 *    alerter to whatever was set at import.
 */
import { logger } from "./logger";

/**
 * Fire-and-forget operational alert.
 *
 * Returns whether the message actually left the process, so a caller that needs
 * to record "we alerted" can record the truth rather than the intention.
 */
export async function alertOps(text: string): Promise<boolean> {
  const token = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const chat = process.env["TELEGRAM_CHAT_ID"] ?? "";
  const body = text.slice(0, 3500);
  if (!token || !chat) {
    // Loud on purpose: this is the branch where the watchdog is blind.
    logger.error("ops_alert_undeliverable", {
      reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set",
      preview: body.slice(0, 200),
    });
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: body }),
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
