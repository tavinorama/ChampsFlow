/**
 * ssrf-guard.ts — SSRF-hardened fetch for user-supplied URLs.
 *
 * Gate 3→4 security conditions (docs/compliance/gate-log.md, 2026-06-10):
 *  - GEO-SEC-1: user-supplied brand domains flow into the site crawler with no
 *    hostname/IP validation. Block private ranges, loopback, link-local
 *    (cloud instance metadata 169.254.169.254), CGNAT, multicast/reserved,
 *    bare container names, and *.local/*.internal hostnames.
 *  - GEO-SEC-4: `redirect: "follow"` allowed DNS-rebinding via redirect hops.
 *    Redirects are now followed MANUALLY (max 5) and every hop is re-validated
 *    through the same blocklist.
 *
 * DNS is resolved and checked immediately before each request, which shrinks
 * (but cannot fully eliminate) the resolve→connect TOCTOU window; full pinning
 * would require a custom undici Agent and is out of scope for Gate 5→6.
 *
 * Only http/https are permitted. Crawls public sites only.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

/** Forbidden hostname patterns — checked before any DNS resolution. */
function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  // Bare single-label names (container/service names like "tia-pg", "redis").
  if (!h.includes(".") && isIP(h) === 0) return true;
  return false;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

/** Private / reserved / link-local IPv4 ranges (RFC 1918, 6890 et al.). */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // RFC 1918
  ["100.64.0.0", 10],    // CGNAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local + cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],    // RFC 1918
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.168.0.0", 16],   // RFC 1918
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved + broadcast
];

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits));
  }
  if (family === 6) {
    const h = ip.toLowerCase();
    // IPv4-mapped, decimal form (::ffff:a.b.c.d) — re-check the embedded IPv4.
    const mappedDec = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedDec && mappedDec[1]) return isBlockedIp(mappedDec[1]);
    // IPv4-mapped, hex form (::ffff:7f00:1 — how Node normalises ::ffff:127.0.0.1).
    const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex && mappedHex[1] && mappedHex[2]) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const v4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
      return isBlockedIp(v4);
    }
    if (h === "::" || h === "::1") return true;            // unspecified / loopback
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // link-local fe80::/10
    if (h.startsWith("2001:db8")) return true;             // documentation
    return false;
  }
  return true; // not a parseable IP → refuse
}

/**
 * Validate that a URL is safe to fetch: http(s) only, no forbidden hostname,
 * and EVERY resolved address is public. Throws on violation.
 */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`ssrf-guard: blocked protocol ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (isForbiddenHostname(host)) {
    throw new Error(`ssrf-guard: blocked hostname ${host}`);
  }
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) throw new Error(`ssrf-guard: blocked IP ${host}`);
    return;
  }
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0) throw new Error(`ssrf-guard: ${host} did not resolve`);
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new Error(`ssrf-guard: ${host} resolves to blocked address ${a.address}`);
    }
  }
}

export interface GuardedFetchOptions {
  timeoutMs: number;
  headers?: Record<string, string>;
}

/**
 * Fetch a user-supplied URL with SSRF protections:
 * validates the URL (and every redirect hop) via assertPublicUrl, follows at
 * most MAX_REDIRECTS redirects manually, and aborts after timeoutMs total.
 * Throws on blocked targets; network errors propagate to the caller's catch.
 */
export async function guardedFetch(rawUrl: string, opts: GuardedFetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let current = new URL(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current);
      const res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: opts.headers,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return res;
        await res.body?.cancel().catch(() => {});
        current = new URL(loc, current); // relative redirects resolved against current
        continue;
      }
      return res;
    }
    throw new Error(`ssrf-guard: too many redirects (> ${MAX_REDIRECTS})`);
  } finally {
    clearTimeout(timer);
  }
}
