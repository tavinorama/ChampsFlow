/**
 * Unit tests — attribution.ts validation helpers (Fix 2 + Fix 3)
 *
 * Tests:
 *  ga4PropertyId validation (isValidGa4PropertyId):
 *   1. Accepts bare numeric ID
 *   2. Accepts "properties/<digits>" format
 *   3. Rejects path-traversal ("../secret")
 *   4. Rejects slash in unexpected position ("123/evil")
 *   5. Rejects non-numeric suffix ("properties/abc")
 *   6. Rejects empty string
 *   7. Rejects with leading slash
 *   8. Rejects non-numeric chars ("%2F" encoded slash)
 *
 *  gscSiteUrl validation (isValidGscSiteUrl):
 *   9.  Accepts https URL with path
 *   10. Accepts http URL with path
 *   11. Accepts sc-domain: format
 *   12. Rejects bare http (no path after /)
 *   13. Rejects string starting with "http" but not http:// or https://
 *   14. Rejects private IPv4 — 10.x.x.x
 *   15. Rejects private IPv4 — 192.168.x.x
 *   16. Rejects private IPv4 — 172.16.x.x through 172.31.x.x
 *   17. Rejects link-local — 169.254.x.x
 *   18. Rejects loopback — 127.0.0.1
 *   19. Rejects sc-domain: with private IP
 *   20. Rejects value longer than 2000 chars
 *   21. Rejects sc-domain: with slash in hostname
 *   22. Accepts public IPv4 URL (edge case — 8.8.8.8 is a public address)
 *
 *  fetchGA4OrganicSessions ga4PropertyId validation (Fix 2 — google-oauth.ts):
 *   23. Throws on path-traversal property ID before any network call
 *   24. Does NOT throw on valid bare numeric ID (calls fetch)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { isValidGa4PropertyId, isValidGscSiteUrl } from "../../../apps/api/src/routes/attribution";
import { fetchGA4OrganicSessions } from "../../../apps/api/src/lib/google-oauth";

// ---------------------------------------------------------------------------
// ga4PropertyId validation
// ---------------------------------------------------------------------------

describe("isValidGa4PropertyId()", () => {
  it("accepts bare numeric ID", () => {
    expect(isValidGa4PropertyId("123456789")).toBe(true);
  });

  it("accepts 'properties/<digits>' format", () => {
    expect(isValidGa4PropertyId("properties/123456789")).toBe(true);
  });

  it("rejects path-traversal '../secret'", () => {
    expect(isValidGa4PropertyId("../secret")).toBe(false);
  });

  it("rejects slash in unexpected position '123/evil'", () => {
    expect(isValidGa4PropertyId("123/evil")).toBe(false);
  });

  it("rejects non-numeric suffix 'properties/abc'", () => {
    expect(isValidGa4PropertyId("properties/abc")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidGa4PropertyId("")).toBe(false);
  });

  it("rejects leading slash '/123456789'", () => {
    expect(isValidGa4PropertyId("/123456789")).toBe(false);
  });

  it("rejects URL-encoded slash '%2F123'", () => {
    expect(isValidGa4PropertyId("%2F123")).toBe(false);
  });

  it("rejects 'properties/../admin'", () => {
    expect(isValidGa4PropertyId("properties/../admin")).toBe(false);
  });

  it("rejects alpha-only string", () => {
    expect(isValidGa4PropertyId("myProperty")).toBe(false);
  });

  it("accepts single digit '0'", () => {
    expect(isValidGa4PropertyId("0")).toBe(true);
  });

  it("rejects 'properties/' with no digits", () => {
    expect(isValidGa4PropertyId("properties/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gscSiteUrl validation
// ---------------------------------------------------------------------------

describe("isValidGscSiteUrl()", () => {
  it("accepts https URL with path", () => {
    expect(isValidGscSiteUrl("https://example.com/")).toBe(true);
  });

  it("accepts https URL with deep path", () => {
    expect(isValidGscSiteUrl("https://www.mybrand.com/blog/")).toBe(true);
  });

  it("accepts http URL with path", () => {
    expect(isValidGscSiteUrl("http://example.com/")).toBe(true);
  });

  it("accepts sc-domain: format", () => {
    expect(isValidGscSiteUrl("sc-domain:example.com")).toBe(true);
  });

  it("accepts sc-domain: with subdomain", () => {
    expect(isValidGscSiteUrl("sc-domain:www.example.com")).toBe(true);
  });

  it("rejects bare 'http' without proper scheme", () => {
    expect(isValidGscSiteUrl("http example.com")).toBe(false);
  });

  it("rejects ftp:// scheme", () => {
    expect(isValidGscSiteUrl("ftp://example.com/")).toBe(false);
  });

  it("rejects private IPv4 10.x.x.x", () => {
    expect(isValidGscSiteUrl("https://10.0.0.1/")).toBe(false);
  });

  it("rejects private IPv4 192.168.x.x", () => {
    expect(isValidGscSiteUrl("https://192.168.1.1/")).toBe(false);
  });

  it("rejects private IPv4 172.16.x.x", () => {
    expect(isValidGscSiteUrl("https://172.16.0.1/")).toBe(false);
  });

  it("rejects private IPv4 172.31.x.x", () => {
    expect(isValidGscSiteUrl("https://172.31.255.255/")).toBe(false);
  });

  it("rejects link-local 169.254.x.x (cloud metadata)", () => {
    expect(isValidGscSiteUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("rejects loopback 127.0.0.1", () => {
    expect(isValidGscSiteUrl("https://127.0.0.1/")).toBe(false);
  });

  it("rejects sc-domain: with private IP", () => {
    expect(isValidGscSiteUrl("sc-domain:10.0.0.1")).toBe(false);
  });

  it("rejects value longer than 2000 chars", () => {
    const long = "https://example.com/" + "a".repeat(1990);
    expect(long.length).toBeGreaterThan(2000);
    expect(isValidGscSiteUrl(long)).toBe(false);
  });

  it("accepts value exactly 2000 chars", () => {
    // Build exactly 2000 chars
    const base = "https://example.com/";
    const pad = "a".repeat(2000 - base.length);
    const val = base + pad;
    expect(val.length).toBe(2000);
    expect(isValidGscSiteUrl(val)).toBe(true);
  });

  it("rejects sc-domain: with slash in hostname", () => {
    expect(isValidGscSiteUrl("sc-domain:example.com/path")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidGscSiteUrl("")).toBe(false);
  });

  it("rejects sc-domain: with empty hostname", () => {
    expect(isValidGscSiteUrl("sc-domain:")).toBe(false);
  });

  it("rejects any bare IP address including public ones (spec requirement)", () => {
    // The spec requires: "Must NOT be a bare IP address (no IPv4 pattern)"
    // This applies to all IPs, including public ones like 8.8.8.8.
    // GSC site URLs must use registered domain names.
    expect(isValidGscSiteUrl("https://8.8.8.8/")).toBe(false);
  });

  it("rejects non-HTTP non-sc-domain scheme", () => {
    expect(isValidGscSiteUrl("javascript:alert(1)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchGA4OrganicSessions — ga4PropertyId validation (Fix 2, google-oauth.ts)
// ---------------------------------------------------------------------------

describe("fetchGA4OrganicSessions() — ga4PropertyId validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws immediately on path-traversal property ID (no network call)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      fetchGA4OrganicSessions("fake-token", "../admin")
    ).rejects.toThrow("invalid_ga4_property_id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws immediately on 'properties/../../etc' path-traversal", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      fetchGA4OrganicSessions("fake-token", "properties/../../etc")
    ).rejects.toThrow("invalid_ga4_property_id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws immediately on non-numeric property ID 'properties/abc'", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      fetchGA4OrganicSessions("fake-token", "properties/abc")
    ).rejects.toThrow("invalid_ga4_property_id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls fetch when property ID is valid bare numeric", async () => {
    // Mock fetch to avoid real network — return minimal GA4 response
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: [] }), { status: 200 })
    );
    const result = await fetchGA4OrganicSessions("fake-token", "123456789");
    expect(result).toEqual([]);
  });

  it("calls fetch when property ID is valid 'properties/<digits>'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: [] }), { status: 200 })
    );
    const result = await fetchGA4OrganicSessions("fake-token", "properties/987654321");
    expect(result).toEqual([]);
  });
});
