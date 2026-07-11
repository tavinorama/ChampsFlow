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
import { describe, it, expect } from "vitest";
import { clientIp, clientIpOrUnknown } from "../../apps/api/src/lib/client-ip";

function carrier(headers: Record<string, string | undefined>) {
  return { req: { header: (n: string) => headers[n.toLowerCase()] } };
}

describe("clientIp — anti-spoofing header resolution", () => {
  it("prefers cf-connecting-ip (Cloudflare, unspoofable) over everything", () => {
    expect(
      clientIp(carrier({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))
    ).toBe("203.0.113.7");
  });

  it("uses the LAST x-forwarded-for hop, NOT the client-forgeable first", () => {
    // Attacker sends "X-Forwarded-For: 6.6.6.6"; our proxy appends the real IP.
    // The real client IP is the LAST entry — a fixed bucket, not the forged one.
    expect(clientIp(carrier({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("9.9.9.9");
    // A single-hop header (no proxy chain) still yields that one IP.
    expect(clientIp(carrier({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
    // Whitespace around hops is trimmed.
    expect(clientIp(carrier({ "x-forwarded-for": "6.6.6.6 ,  9.9.9.9 " }))).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIp(carrier({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(carrier({}))).toBeNull();
    expect(clientIp(carrier({ "x-forwarded-for": "" }))).toBeNull();
  });

  it("clientIpOrUnknown returns a stable bucket key when nothing is present", () => {
    expect(clientIpOrUnknown(carrier({}))).toBe("unknown");
    expect(clientIpOrUnknown(carrier({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});
