/**
 * client-ip.ts — the ONE place that extracts a client IP for rate limiting,
 * behind an EXPLICIT trusted-edge policy (Hermes #258).
 *
 * Trust boundary (not "just take a header"):
 *   1. `cf-connecting-ip` is trusted ONLY when the origin refuses direct,
 *      non-Cloudflare traffic — declared via `TRUST_CF_CONNECTING_IP`
 *      (default: true in production, false elsewhere, so a local/dev box can't
 *      be fooled by a spoofed header). Cloudflare sets it from the real TCP
 *      connection; the origin-lock is a deploy-time guarantee (Cloudflare
 *      Authenticated Origin Pulls / origin firewall), tracked in the launch
 *      checklist.
 *   2. Otherwise `x-forwarded-for` is read with an explicit trusted-proxy hop
 *      count (`TRUSTED_PROXY_HOPS`, default 1 = our own edge): the client IP is
 *      the entry that many hops from the RIGHT — the address our outermost
 *      trusted proxy observed. NEVER the left/first entry, which the client can
 *      forge (`X-Forwarded-For: <random>`) to mint a fresh rate-limit bucket per
 *      request and defeat every per-IP limit.
 *   3. Finally `x-real-ip`.
 *
 * Every candidate is validated as a real IPv4/IPv6 (`net.isIP`) and canonicalized
 * (brackets/zone/port stripped, IPv6 lower-cased) so one client maps to one
 * stable bucket key and garbage headers are rejected rather than bucketed.
 *
 * This used to be copy-pasted six times with drift; centralized here so a future
 * edit can't re-open the hole.
 */

import net from "node:net";

export interface HeaderCarrier {
  req: { header: (name: string) => string | undefined };
}

function trustCfConnectingIp(): boolean {
  const v = process.env.TRUST_CF_CONNECTING_IP;
  if (v != null && v.trim() !== "") return /^(1|true|yes|on)$/i.test(v.trim());
  return process.env.NODE_ENV === "production";
}

function trustedProxyHops(): number {
  const n = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Validate + canonicalize an IP candidate. Returns a canonical IPv4/IPv6 string
 * or null when the value isn't a real IP. Exported for unit testing.
 */
export function canonicalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^\[/, "").replace(/\]$/, ""); // [::1] → ::1
  const zone = s.indexOf("%"); // fe80::1%eth0 → fe80::1
  if (zone !== -1) s = s.slice(0, zone);
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s); // 1.2.3.4:5678 → 1.2.3.4
  if (v4WithPort) s = v4WithPort[1]!;
  const kind = net.isIP(s);
  if (kind === 0) return null;
  return kind === 6 ? s.toLowerCase() : s;
}

/** Real client IP, or null when no trustworthy header yields a valid IP. */
export function clientIp(c: HeaderCarrier): string | null {
  if (trustCfConnectingIp()) {
    const cf = canonicalizeIp(c.req.header("cf-connecting-ip"));
    if (cf) return cf;
  }

  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter((h) => h.length > 0);
    const idx = hops.length - trustedProxyHops();
    const candidate = idx >= 0 ? hops[idx] : undefined; // never the forgeable left
    const ip = canonicalizeIp(candidate);
    if (ip) return ip;
  }

  return canonicalizeIp(c.req.header("x-real-ip"));
}

/** Real client IP, or the literal "unknown" — for callers that need a string
 *  bucket key rather than null. */
export function clientIpOrUnknown(c: HeaderCarrier): string {
  return clientIp(c) ?? "unknown";
}
