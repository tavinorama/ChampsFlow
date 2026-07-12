/**
 * client-ip.test.ts — locks the X-Forwarded-For rate-limit-bypass fix.
 *
 * The bug (pre-launch security audit): six copies of clientIp() used
 * `x-forwarded-for.split(",")[0]` — the FIRST hop, which a client can forge
 * (`X-Forwarded-For: <random>`) because proxies APPEND. That gave a fresh
 * rate-limit bucket per request, defeating the free-test budget guard, lead
 * spam limits, and checkout spam limits. The fix: cf-connecting-ip → the LAST
 * XFF hop (our proxy's) → x-real-ip.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clientIp, clientIpOrUnknown, canonicalizeIp } from "../../apps/api/src/lib/client-ip";

function carrier(headers: Record<string, string | undefined>) {
  return { req: { header: (n: string) => headers[n.toLowerCase()] } };
}

const ENV_KEYS = ["TRUST_CF_CONNECTING_IP", "TRUSTED_PROXY_HOPS", "NODE_ENV"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("clientIp — explicit trusted-edge policy", () => {
  it("trusts cf-connecting-ip ONLY when configured (origin-locked edge)", () => {
    process.env.TRUST_CF_CONNECTING_IP = "true";
    expect(
      clientIp(carrier({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))
    ).toBe("203.0.113.7");

    // Not trusted → cf header is ignored, falls through to the trusted XFF hop.
    process.env.TRUST_CF_CONNECTING_IP = "false";
    expect(
      clientIp(carrier({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))
    ).toBe("9.9.9.9");
  });

  it("SPOOFING: the client-forgeable first XFF hop is never used", () => {
    process.env.TRUST_CF_CONNECTING_IP = "false";
    process.env.TRUSTED_PROXY_HOPS = "1";
    // Attacker prepends 6.6.6.6; our edge appends the real 9.9.9.9 on the right.
    expect(clientIp(carrier({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(carrier({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(carrier({ "x-forwarded-for": "6.6.6.6 ,  9.9.9.9 " }))).toBe("9.9.9.9");
  });

  it("PROXY CHAIN: TRUSTED_PROXY_HOPS picks the entry N from the right", () => {
    process.env.TRUST_CF_CONNECTING_IP = "false";
    process.env.TRUSTED_PROXY_HOPS = "2";
    // Two trusted proxies append on the right; a client-forged value sits on the
    // left. XFF = [forged, client, edge1] → client is length-2 = index 1.
    expect(clientIp(carrier({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    // Too few hops for the configured trust → don't fall back to the forgeable left.
    expect(clientIp(carrier({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
  });

  it("MALFORMED: non-IP header values are rejected, not bucketed", () => {
    process.env.TRUST_CF_CONNECTING_IP = "true";
    expect(clientIp(carrier({ "cf-connecting-ip": "not-an-ip" }))).toBeNull();
    expect(clientIp(carrier({ "x-forwarded-for": "garbage, also-garbage" }))).toBeNull();
    expect(clientIp(carrier({ "x-real-ip": "999.999.999.999" }))).toBeNull();
    expect(clientIp(carrier({ "cf-connecting-ip": "1.2.3.4; DROP TABLE" }))).toBeNull();
  });

  it("CANONICAL IPv6: lower-cases + strips brackets/zone/port", () => {
    expect(canonicalizeIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(canonicalizeIp("[2001:DB8::1]")).toBe("2001:db8::1");
    expect(canonicalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(canonicalizeIp("203.0.113.7:5678")).toBe("203.0.113.7"); // strip v4 port
    expect(canonicalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(canonicalizeIp("nonsense")).toBeNull();
    process.env.TRUST_CF_CONNECTING_IP = "true";
    expect(clientIp(carrier({ "cf-connecting-ip": "2001:DB8::AB" }))).toBe("2001:db8::ab");
  });

  it("falls back to x-real-ip, then null", () => {
    process.env.TRUST_CF_CONNECTING_IP = "false";
    expect(clientIp(carrier({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(carrier({}))).toBeNull();
    expect(clientIp(carrier({ "x-forwarded-for": "" }))).toBeNull();
  });

  it("clientIpOrUnknown returns a stable bucket key when nothing is present", () => {
    expect(clientIpOrUnknown(carrier({}))).toBe("unknown");
    process.env.TRUST_CF_CONNECTING_IP = "true";
    expect(clientIpOrUnknown(carrier({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("defaults to trusting cf-connecting-ip in production only", () => {
    delete process.env.TRUST_CF_CONNECTING_IP;
    process.env.NODE_ENV = "production";
    expect(clientIp(carrier({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    process.env.NODE_ENV = "development";
    expect(clientIp(carrier({ "cf-connecting-ip": "203.0.113.7" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Repo-wide regression guard (Hermes audit, PR #258, finding #5): no source
// file may resurrect the vulnerable first-hop idiom
// `header("x-forwarded-for")...split(",")[0]`. Everything must go through
// clientIp() (which takes the LAST hop). This walks the real source tree so a
// future copy-paste re-opening the hole fails CI.
// ---------------------------------------------------------------------------
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}

describe("no route resurrects the first-hop X-Forwarded-For idiom", () => {
  it("apps/api + apps/web contain zero `forwarded-for...split(\",\")[0]`", () => {
    const roots = [
      join(__dirname, "../../apps/api/src"),
      join(__dirname, "../../apps/web/src"),
    ];
    // Whitespace-insensitive: catches the pattern across line breaks too.
    const vulnerable = /forwarded-for"\)(\?\.|\.)?split\(","\)\[0\]/i;
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of collectSourceFiles(root)) {
        const stripped = readFileSync(file, "utf8").replace(/\s+/g, "");
        if (vulnerable.test(stripped)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only client-ip.ts extracts the client IP header in apps/api (Hermes #258: no local parsers)", () => {
    // Every route must go through clientIp(); a stray header("x-forwarded-for")
    // or header("cf-connecting-ip") anywhere else is a drift back to per-route
    // parsing with no trust policy.
    const directRead = /header\(\s*["'](?:x-forwarded-for|cf-connecting-ip)["']\s*\)/i;
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(__dirname, "../../apps/api/src"))) {
      if (file.endsWith("lib/client-ip.ts")) continue; // the ONE allowed place
      if (directRead.test(readFileSync(file, "utf8"))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
