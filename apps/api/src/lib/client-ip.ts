/**
 * client-ip.ts — the ONE place that extracts a client IP for rate limiting.
 *
 * Prefer `cf-connecting-ip` (set by Cloudflare from the real TCP connection).
 * This is only trustworthy while the origin (Railway) refuses direct,
 * non-Cloudflare traffic — otherwise a client could reach the origin and set
 * the header itself. That network rule is a deploy-time guarantee (Cloudflare
 * Authenticated Origin Pulls / origin firewall), tracked in the launch
 * checklist; this helper assumes it holds. Fall back to the LAST
 * `x-forwarded-for` hop (the entry our own proxy appended), NEVER the first: a
 * client can send
 * `X-Forwarded-For: <random>` and, because most proxies APPEND rather than
 * replace, `split(",")[0]` would return that forged value — a fresh rate-limit
 * bucket per request, defeating every per-IP limit (free-test budget, lead
 * spam, checkout spam). Finally `x-real-ip`.
 *
 * This used to be copy-pasted six times with drift (security review 2026-06 +
 * pre-launch audit). Centralized here so a future edit can't re-open the hole.
 */

export interface HeaderCarrier {
  req: { header: (name: string) => string | undefined };
}

/** Real client IP, or null when no trustworthy header is present. */
export function clientIp(c: HeaderCarrier): string | null {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const lastForwardedHop = c.req.header("x-forwarded-for")?.split(",").pop()?.trim();
  if (lastForwardedHop) return lastForwardedHop;
  const realIp = c.req.header("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

/** Real client IP, or the literal "unknown" — for callers that need a string
 *  bucket key rather than null. */
export function clientIpOrUnknown(c: HeaderCarrier): string {
  return clientIp(c) ?? "unknown";
}
