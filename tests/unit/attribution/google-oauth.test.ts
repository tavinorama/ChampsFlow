/**
 * Unit tests — apps/api/src/lib/google-oauth.ts
 *
 * Tests:
 *  1. googleOAuthConfigured() returns false when env vars absent
 *  2. googleOAuthConfigured() returns true when all three set
 *  3. buildGoogleAuthUrl('ga4', state) includes analytics.readonly scope and state
 *  4. buildGoogleAuthUrl('gsc', state) includes webmasters.readonly scope
 *  5. buildGoogleAuthUrl includes access_type=offline and prompt=consent
 *  6. buildGoogleAuthUrl throws when env vars are not configured
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  googleOAuthConfigured,
  buildGoogleAuthUrl,
} from "../../../apps/api/src/lib/google-oauth";

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------

const TEST_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://api.example.com/api/google/callback",
};

function setGoogleEnv(): void {
  process.env["GOOGLE_OAUTH_CLIENT_ID"] = TEST_ENV.GOOGLE_OAUTH_CLIENT_ID;
  process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = TEST_ENV.GOOGLE_OAUTH_CLIENT_SECRET;
  process.env["GOOGLE_OAUTH_REDIRECT_URI"] = TEST_ENV.GOOGLE_OAUTH_REDIRECT_URI;
}

function clearGoogleEnv(): void {
  delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  delete process.env["GOOGLE_OAUTH_REDIRECT_URI"];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("googleOAuthConfigured()", () => {
  beforeEach(() => {
    clearGoogleEnv();
  });

  afterEach(() => {
    clearGoogleEnv();
  });

  it("returns false when all env vars absent", () => {
    expect(googleOAuthConfigured()).toBe(false);
  });

  it("returns false when only GOOGLE_OAUTH_CLIENT_ID is set", () => {
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "id";
    expect(googleOAuthConfigured()).toBe(false);
  });

  it("returns false when only two of three vars are set", () => {
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "id";
    process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = "secret";
    // Missing REDIRECT_URI
    expect(googleOAuthConfigured()).toBe(false);
  });

  it("returns true when all three env vars are set", () => {
    setGoogleEnv();
    expect(googleOAuthConfigured()).toBe(true);
  });
});

describe("buildGoogleAuthUrl()", () => {
  beforeEach(() => {
    setGoogleEnv();
  });

  afterEach(() => {
    clearGoogleEnv();
  });

  it("includes analytics.readonly scope for kind=ga4", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("analytics.readonly");
    expect(url).not.toContain("webmasters.readonly");
  });

  it("includes webmasters.readonly scope for kind=gsc", () => {
    const url = buildGoogleAuthUrl("gsc", "state123");
    expect(url).toContain("webmasters.readonly");
    expect(url).not.toContain("analytics.readonly");
  });

  it("includes the state parameter", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("state=state123");
  });

  it("includes access_type=offline", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("access_type=offline");
  });

  it("includes prompt=consent", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("prompt=consent");
  });

  it("includes openid and email in scope", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("openid");
    expect(url).toContain("email");
  });

  it("includes the client_id from env", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain("client_id=test-client-id");
  });

  it("includes the redirect_uri from env", () => {
    const url = buildGoogleAuthUrl("ga4", "state123");
    expect(url).toContain(encodeURIComponent("https://api.example.com/api/google/callback"));
  });

  it("throws when env vars are not configured", () => {
    clearGoogleEnv();
    expect(() => buildGoogleAuthUrl("ga4", "state123")).toThrow();
  });

  it("points to accounts.google.com", () => {
    const url = buildGoogleAuthUrl("gsc", "state456");
    expect(url.startsWith("https://accounts.google.com/o/oauth2")).toBe(true);
  });

  it("includes unique state for gsc kind", () => {
    const url = buildGoogleAuthUrl("gsc", "state456");
    expect(url).toContain("state=state456");
  });
});
