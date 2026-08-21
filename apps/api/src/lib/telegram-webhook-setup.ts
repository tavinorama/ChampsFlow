/**
 * telegram-webhook-setup.ts — the api registers its OWN Telegram webhook at
 * boot, so the founder's only manual step is setting the 3 envs.
 *
 * Why this exists (incident 18–20/08 + "bichado" report 21/08): the approval
 * buttons were shipped on 17/08, the worker kept SENDING messages with
 * buttons, but a click goes wherever Telegram's registered webhook points —
 * and `setWebhook` was never run, so every click died in the air (HTTP logs:
 * zero requests on /api/telegram, ever). Four finished videos rotted at
 * founder-approval because of it, which then starved the whole graph engine
 * for 3 days. A manual curl step that MUST happen after an env change is a
 * step that will be forgotten — so the api now does it itself, idempotently,
 * every boot.
 *
 * Contract:
 *  - Needs TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET + a public host
 *    (RAILWAY_PUBLIC_DOMAIN, or TELEGRAM_WEBHOOK_BASE_URL override for
 *    non-Railway deploys). Any missing → {registered:false, reason} and an
 *    info log; the boot NEVER fails or blocks on this.
 *  - Idempotent: asks getWebhookInfo first; if the registered URL already
 *    matches, does nothing (survives restarts without hammering Telegram).
 *  - allowed_updates includes "message" — required for the force-reply
 *    "Por quê?" flow on reject, not just the button callback.
 *  - The token NEVER appears in logs or results; the secret is masked.
 */

import { logger } from "../../../../packages/shared/src/logger";

export interface WebhookSetupResult {
  registered: boolean;
  /** "already" when getWebhookInfo matched; "set" when setWebhook ran. */
  how?: "already" | "set";
  reason?: string;
}

const mask = (s: string): string => (s.length <= 4 ? "****" : `…${s.slice(-4)}`);

export function desiredWebhookUrl(): { url: string; masked: string } | null {
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"] ?? "";
  const base =
    process.env["TELEGRAM_WEBHOOK_BASE_URL"]?.replace(/\/+$/, "") ||
    (process.env["RAILWAY_PUBLIC_DOMAIN"] ? `https://${process.env["RAILWAY_PUBLIC_DOMAIN"]}` : "");
  if (!secret || !base) return null;
  return {
    url: `${base}/api/telegram/webhook/${secret}`,
    masked: `${base}/api/telegram/webhook/${mask(secret)}`,
  };
}

export async function ensureTelegramWebhook(
  fetchImpl: typeof fetch = fetch
): Promise<WebhookSetupResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const want = desiredWebhookUrl();
  if (!token || !want) {
    // Not configured is a normal state (local dev, envs not set yet) — say so
    // once at info level, never warn-spam.
    logger.info("telegram_webhook_not_configured", {
      has_token: Boolean(token),
      has_secret: Boolean(process.env["TELEGRAM_WEBHOOK_SECRET"]),
      has_public_host: Boolean(
        process.env["TELEGRAM_WEBHOOK_BASE_URL"] || process.env["RAILWAY_PUBLIC_DOMAIN"]
      ),
    });
    return { registered: false, reason: "not_configured" };
  }

  const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`;

  try {
    // Idempotence: skip setWebhook when Telegram already points at us.
    const infoRes = await fetchImpl(api("getWebhookInfo"), { method: "GET" });
    const info = (await infoRes.json().catch(() => null)) as
      | { ok?: boolean; result?: { url?: string } }
      | null;
    if (info?.ok && info.result?.url === want.url) {
      logger.info("telegram_webhook_already_registered", { url: want.masked });
      return { registered: true, how: "already" };
    }

    const setRes = await fetchImpl(api("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: want.url,
        // "message" is required for the reject force-reply reason, not just
        // the button's callback_query.
        allowed_updates: ["callback_query", "message"],
      }),
    });
    const set = (await setRes.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (set?.ok) {
      logger.info("telegram_webhook_registered", { url: want.masked });
      return { registered: true, how: "set" };
    }
    // Telegram said no — shout (this is the "buttons look alive but are dead"
    // failure mode; it must never be silent again).
    logger.error("telegram_webhook_registration_failed", {
      url: want.masked,
      description: set?.description?.slice(0, 200) ?? `http_${setRes.status}`,
    });
    return { registered: false, reason: set?.description ?? `http_${setRes.status}` };
  } catch (err) {
    logger.error("telegram_webhook_registration_error", {
      message: (err as Error).message?.slice(0, 200),
    });
    return { registered: false, reason: "transport_error" };
  }
}
