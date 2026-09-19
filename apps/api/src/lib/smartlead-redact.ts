/**
 * What is stored is evidence, not credentials. Measured 19/09: EVERY stored
 * event carried Smartlead's `secret_key` and the full `webhook_url` — which is
 * our own endpoint WITH `?token=<SMARTLEAD_WEBHOOK_SECRET>` — in clear text.
 * Anyone able to read `smartlead_event` (a read-only analyst credential, an
 * MCP session, a dump) could forge webhooks. Both are dropped before the
 * INSERT, at any depth, and any `token=`/`api_key=` left inside a string value
 * is masked. The rest of the payload is kept as received.
 */
const SECRET_KEYS = new Set(["secret_key", "secretkey", "webhook_secret", "api_key", "apikey", "token", "access_token"]);
const SECRET_IN_URL = /([?&](?:token|api_key|apikey|secret|key|access_token)=)[^&#\s"']+/gi;

export function redactWebhookPayload<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return value.replace(SECRET_IN_URL, "$1[redacted]") as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactWebhookPayload(v, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? "[redacted]" : redactWebhookPayload(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
