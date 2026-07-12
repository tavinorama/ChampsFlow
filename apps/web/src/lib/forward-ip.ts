/**
 * forward-ip.ts — the ONE place a Next proxy route builds the client-IP headers
 * it forwards to the internal Hono API for rate limiting.
 *
 * The API's clientIp() prefers `cf-connecting-ip` (Cloudflare sets it from the
 * real TCP connection). A Next route that forwarded ONLY `x-forwarded-for` left
 * the API with just the client-forgeable chain to reason about — an attacker
 * could prepend `X-Forwarded-For: <random>` and, since the proxy hop count is
 * fixed, mint a fresh rate-limit bucket per request. So we forward
 * `cf-connecting-ip` through and let the API trust that first; XFF/x-real-ip go
 * along only as a fallback.
 *
 * TRUST INVARIANT: `cf-connecting-ip` is only trustworthy while the origin
 * (Railway) refuses direct, non-Cloudflare traffic — otherwise a client could
 * hit the origin and set the header itself. That network rule is a deploy-time
 * guarantee (Cloudflare "Authenticated Origin Pulls" / firewall), documented in
 * the launch checklist; this helper assumes it holds.
 */
export function clientIpForwardHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) out["cf-connecting-ip"] = cf;
  const xff = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  if (xff) out["x-forwarded-for"] = xff;
  return out;
}
