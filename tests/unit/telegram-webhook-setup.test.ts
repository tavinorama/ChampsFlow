/**
 * telegram-webhook-setup — the api self-registers its Telegram webhook at
 * boot. Pins the 21/08 "bichado" incident class: buttons that LOOK alive but
 * whose clicks go nowhere because setWebhook was never run.
 *
 * Pins: not-configured is a quiet no-op (never throws, never calls Telegram);
 * idempotence via getWebhookInfo; the exact setWebhook payload (URL shape +
 * allowed_updates including "message" for the reject force-reply); failure is
 * reported, not thrown; the bot token never leaks into the result.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ensureTelegramWebhook,
  desiredWebhookUrl,
} from "../../apps/api/src/lib/telegram-webhook-setup";

const ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_BASE_URL",
  "RAILWAY_PUBLIC_DOMAIN",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function fakeFetch(
  handler: (url: string, init?: RequestInit) => { ok?: boolean; result?: unknown; description?: string }
): { impl: typeof fetch; calls: Array<{ url: string; body?: unknown }> } {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(handler(u, init)), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("ensureTelegramWebhook", () => {
  it("not configured → quiet no-op, Telegram never called, never throws", async () => {
    const { impl, calls } = fakeFetch(() => ({ ok: true }));
    const r = await ensureTelegramWebhook(impl);
    expect(r).toEqual({ registered: false, reason: "not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("already registered (getWebhookInfo matches) → no setWebhook call", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok-123";
    process.env["TELEGRAM_WEBHOOK_SECRET"] = "sec-abcd";
    process.env["RAILWAY_PUBLIC_DOMAIN"] = "api.example.up.railway.app";
    const want = desiredWebhookUrl()!.url;
    const { impl, calls } = fakeFetch((u) =>
      u.includes("getWebhookInfo") ? { ok: true, result: { url: want } } : { ok: true }
    );
    const r = await ensureTelegramWebhook(impl);
    expect(r).toEqual({ registered: true, how: "already" });
    expect(calls.filter((c) => c.url.includes("setWebhook"))).toHaveLength(0);
  });

  it("registers with the exact URL and allowed_updates incl. 'message' (reject force-reply)", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok-123";
    process.env["TELEGRAM_WEBHOOK_SECRET"] = "sec-abcd";
    process.env["RAILWAY_PUBLIC_DOMAIN"] = "api.example.up.railway.app";
    const { impl, calls } = fakeFetch((u) =>
      u.includes("getWebhookInfo") ? { ok: true, result: { url: "https://old.example/hook" } } : { ok: true }
    );
    const r = await ensureTelegramWebhook(impl);
    expect(r).toEqual({ registered: true, how: "set" });
    const set = calls.find((c) => c.url.includes("setWebhook"))!;
    expect(set.body).toEqual({
      url: "https://api.example.up.railway.app/api/telegram/webhook/sec-abcd",
      allowed_updates: ["callback_query", "message"],
    });
    // TELEGRAM_WEBHOOK_BASE_URL overrides Railway's domain (non-Railway deploys).
    process.env["TELEGRAM_WEBHOOK_BASE_URL"] = "https://custom.host/";
    expect(desiredWebhookUrl()!.url).toBe("https://custom.host/api/telegram/webhook/sec-abcd");
  });

  it("Telegram refuses → reported, not thrown; token never in the result", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok-123";
    process.env["TELEGRAM_WEBHOOK_SECRET"] = "sec-abcd";
    process.env["RAILWAY_PUBLIC_DOMAIN"] = "api.example.up.railway.app";
    const { impl } = fakeFetch((u) =>
      u.includes("getWebhookInfo")
        ? { ok: true, result: { url: "" } }
        : { ok: false, description: "bad webhook: HTTPS url must be provided" }
    );
    const r = await ensureTelegramWebhook(impl);
    expect(r.registered).toBe(false);
    expect(JSON.stringify(r)).not.toContain("tok-123");
  });
});
