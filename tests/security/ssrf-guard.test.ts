/**
 * ssrf-guard.test.ts — SSRF protections for user-supplied crawl URLs.
 * Covers GEO-SEC-1 (private/metadata blocklist) + GEO-SEC-4 (protocol guard).
 */
import { describe, it, expect } from "vitest";
import { assertPublicUrl, guardedFetch } from "../../packages/llm/src/ssrf-guard";

async function isBlocked(url: string): Promise<boolean> {
  try {
    await assertPublicUrl(new URL(url));
    return false;
  } catch {
    return true;
  }
}

describe("assertPublicUrl — SSRF blocklist", () => {
  it.each([
    "http://localhost:3001/admin",
    "http://127.0.0.1:5432",
    "http://169.254.169.254/latest/meta-data/", // cloud instance metadata
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://100.64.0.1/", // CGNAT
    "http://[::1]:8080/", // IPv6 loopback
    "http://[fd00::1]/", // IPv6 ULA
    "http://[::ffff:127.0.0.1]/", // IPv4-mapped IPv6 loopback
    "http://[::ffff:10.0.0.1]/", // IPv4-mapped private
  ])("blocks internal/metadata target %s", async (url) => {
    expect(await isBlocked(url)).toBe(true);
  });

  it.each([
    "http://tia-pg:5432/", // bare container name
    "http://redis/",
    "http://foo.internal/",
    "http://service.local/",
  ])("blocks bare/internal hostname %s", async (url) => {
    expect(await isBlocked(url)).toBe(true);
  });

  it.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "gopher://example.com/",
  ])("blocks non-http(s) protocol %s", async (url) => {
    expect(await isBlocked(url)).toBe(true);
  });

  it.each([
    "http://[::ffff:8.8.8.8]/", // public IPv4-mapped
    "http://8.8.8.8/", // public IPv4 literal
  ])("allows a public IP literal %s", async (url) => {
    expect(await isBlocked(url)).toBe(false);
  });
});

describe("guardedFetch — refuses blocked targets before any network call", () => {
  it("throws on a private/metadata target (never performs the request)", async () => {
    await expect(
      guardedFetch("http://169.254.169.254/latest/meta-data/", { timeoutMs: 1000 })
    ).rejects.toThrow(/ssrf-guard/);
  });

  it("throws on loopback", async () => {
    await expect(guardedFetch("http://127.0.0.1:5432/", { timeoutMs: 1000 })).rejects.toThrow(/ssrf-guard/);
  });

  it("throws on a non-http(s) protocol", async () => {
    await expect(guardedFetch("file:///etc/passwd", { timeoutMs: 1000 })).rejects.toThrow(/ssrf-guard/);
  });

  it("throws on a bare container hostname", async () => {
    await expect(guardedFetch("http://tia-pg:5432/", { timeoutMs: 1000 })).rejects.toThrow(/ssrf-guard/);
  });
});
