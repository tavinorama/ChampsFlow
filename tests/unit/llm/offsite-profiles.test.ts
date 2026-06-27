/**
 * offsite-profiles.test.ts — capability #79: brand public profile URLs
 *
 * Group A: measureOffsiteSignal with provided URLs (mock mode — no SERP key)
 * Group B: pure unit — no network calls (assertPublicUrl with IP literals in blocked ranges)
 * Group C: profile URL validation logic — uses IP literals, no DNS
 */

import { describe, it, expect, beforeEach } from "vitest";
import { measureOffsiteSignal, OFFSITE_SOURCES } from "../../../packages/llm/src/offsite-signal";
import { assertPublicUrl } from "../../../packages/llm/src/ssrf-guard";

// ---------------------------------------------------------------------------
// Group A: offsite signal with provided URLs (mock mode)
// ---------------------------------------------------------------------------

describe("Group A: measureOffsiteSignal with provided profile URLs (mock mode)", () => {
  beforeEach(() => {
    // Ensure SERP_API_KEY is absent so we always exercise mock mode.
    delete process.env["SERP_API_KEY"];
  });

  it("marks linkedin as present=true and verified=true when a profile URL is provided", async () => {
    const result = await measureOffsiteSignal("Acme Corp", {
      linkedin: "https://linkedin.com/company/acme",
    });

    const linkedinSource = result.sources.find((s) => s.id === "linkedin");
    expect(linkedinSource).toBeDefined();
    expect(linkedinSource!.present).toBe(true);
    expect(linkedinSource!.verified).toBe(true);
    expect(linkedinSource!.providedUrl).toBe("https://linkedin.com/company/acme");
  });

  it("includes a finding mentioning LinkedIn when a linkedin profile URL is provided", async () => {
    const result = await measureOffsiteSignal("Acme Corp", {
      linkedin: "https://linkedin.com/company/acme",
    });

    const hasLinkedInFinding = result.findings.some((f) =>
      f.toLowerCase().includes("linkedin")
    );
    expect(hasLinkedInFinding).toBe(true);
  });

  it("returns all 7 sources in mock mode with no profileUrls provided (fallback unchanged)", async () => {
    const result = await measureOffsiteSignal("Some Brand");

    expect(result.sources).toHaveLength(OFFSITE_SOURCES.length);
    expect(result.sources).toHaveLength(7);
    expect(result.live).toBe(false);
  });

  it("treats all provided URLs as present in mock mode without penalising absent network", async () => {
    const result = await measureOffsiteSignal("Acme Corp", {
      linkedin: "https://linkedin.com/company/acme",
      reddit: "https://reddit.com/r/acme",
      wikipedia: "https://en.wikipedia.org/wiki/Acme_Corp",
    });

    const linkedin = result.sources.find((s) => s.id === "linkedin");
    const reddit = result.sources.find((s) => s.id === "reddit");
    const wikipedia = result.sources.find((s) => s.id === "wikipedia");

    expect(linkedin!.present).toBe(true);
    expect(reddit!.present).toBe(true);
    expect(wikipedia!.present).toBe(true);
  });

  it("still returns 7 sources total even when profile URLs are provided", async () => {
    const result = await measureOffsiteSignal("Acme Corp", {
      linkedin: "https://linkedin.com/company/acme",
    });
    expect(result.sources).toHaveLength(7);
  });

  it("offsiteScore is in [0, 1] range when profile URLs are provided", async () => {
    const result = await measureOffsiteSignal("Acme Corp", {
      linkedin: "https://linkedin.com/company/acme",
      g2: "https://g2.com/products/acme",
    });
    expect(result.offsiteScore).toBeGreaterThanOrEqual(0);
    expect(result.offsiteScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Group B: assertPublicUrl SSRF validation (pure unit — IP literals, no DNS)
// ---------------------------------------------------------------------------

describe("Group B: assertPublicUrl SSRF guard", () => {
  it("throws for private IPv4 range 192.168.x.x (RFC 1918)", async () => {
    await expect(
      assertPublicUrl(new URL("http://192.168.1.1/profile"))
    ).rejects.toThrow();
  });

  it("throws for link-local / cloud metadata endpoint 169.254.169.254", async () => {
    await expect(
      assertPublicUrl(new URL("http://169.254.169.254/metadata"))
    ).rejects.toThrow();
  });

  it("throws for non-http/https protocol (ftp)", async () => {
    // new URL() accepts ftp URLs, but assertPublicUrl must reject non-http/https.
    await expect(
      assertPublicUrl(new URL("ftp://example.com/profile"))
    ).rejects.toThrow(/blocked protocol/i);
  });

  it("throws for loopback 127.0.0.1", async () => {
    await expect(
      assertPublicUrl(new URL("http://127.0.0.1/profile"))
    ).rejects.toThrow();
  });

  it("throws for RFC 1918 10.0.0.0/8 range", async () => {
    await expect(
      assertPublicUrl(new URL("http://10.0.0.1/page"))
    ).rejects.toThrow();
  });

  it("throws for CGNAT range 100.64.0.0/10", async () => {
    await expect(
      assertPublicUrl(new URL("http://100.64.0.1/page"))
    ).rejects.toThrow();
  });

  it("throws for blocked hostname 'localhost'", async () => {
    await expect(
      assertPublicUrl(new URL("http://localhost/profile"))
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Group C: brand profile URL validation round-trip (integration-style)
// Tests the validation logic that the API handler applies to incoming URLs.
// Uses assertPublicUrl directly rather than spinning up a full Hono server.
// ---------------------------------------------------------------------------

describe("Group C: profile URL API validation logic", () => {
  it("accepts a known public IP (no DNS lookup) — 1.1.1.1 is not in any blocked range", async () => {
    // 1.1.1.1 (Cloudflare DNS) is a public IP: not RFC 1918, not loopback,
    // not link-local, not CGNAT, not multicast — assertPublicUrl must pass it.
    // Uses an IP literal so no DNS resolution occurs.
    await expect(
      assertPublicUrl(new URL("http://1.1.1.1/company/test"))
    ).resolves.toBeUndefined();
  });

  it("rejects an internal IP URL (10.0.0.1) — as the API handler would", async () => {
    await expect(
      assertPublicUrl(new URL("http://10.0.0.1/page"))
    ).rejects.toThrow();
  });

  it("rejects a javascript: URL — assertPublicUrl blocks non-http/https protocols", async () => {
    // new URL("javascript:alert(1)") is parseable in Node.js but assertPublicUrl
    // rejects non-http/https protocols. This mirrors the API handler's SSRF check.
    await expect(
      assertPublicUrl(new URL("javascript:alert(1)"))
    ).rejects.toThrow(/blocked protocol/i);
  });

  it("rejects an empty string — new URL('') throws", () => {
    expect(() => new URL("")).toThrow();
  });

  it("rejects a data: URI — assertPublicUrl blocks non-http/https protocols", async () => {
    // data: URIs don't have a hostname; new URL() will parse them but
    // assertPublicUrl must reject on protocol check.
    await expect(
      assertPublicUrl(new URL("data:text/html,<script>alert(1)</script>"))
    ).rejects.toThrow(/blocked protocol/i);
  });

  it("accepts a known public IP (no DNS lookup) — second public IP path (8.8.8.8)", async () => {
    // 8.8.8.8 (Google DNS) is also a public IP. Replaces the former trustpilot.com
    // DNS-dependent test. IP literal — no DNS resolution occurs.
    await expect(
      assertPublicUrl(new URL("http://8.8.8.8/review/example.com"))
    ).resolves.toBeUndefined();
  });
});
