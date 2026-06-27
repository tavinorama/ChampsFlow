/**
 * Unit tests — token encryption round-trip for Attribution v1 (#86)
 *
 * Relies on packages/shared/src/crypto.ts (already unit-tested in crypto.test.ts).
 * This suite focuses on integration points relevant to Attribution:
 *  1. Round-trip encrypt/decrypt using OAUTH_TOKEN_KEY mock in test env
 *  2. Decryption fails gracefully with thrown error on corrupted blob
 *  3. googleOAuthConfigured() returns false in test env without Google env vars
 *  4. Token bytes differ each call (random IV per AES-GCM spec)
 *  5. Null refresh token handled correctly (not encrypted, stored as null)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptToken, decryptToken } from "../../../packages/shared/src/crypto";
import { googleOAuthConfigured } from "../../../apps/api/src/lib/google-oauth";

// OAUTH_TOKEN_KEY is set to "a".repeat(64) in tests/setup/vitest-setup.ts
// so the round-trip tests work without additional setup here.

describe("Token encryption round-trip (OAUTH_TOKEN_KEY from test setup)", () => {
  it("round-trip: encrypt a token string → decrypt → matches original", () => {
    const plaintext = "ya29.access-token-example-for-google-oauth";
    const { encrypted, keyVersion } = encryptToken(plaintext);

    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(keyVersion).toBe(1);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trip works for a long Google access token", () => {
    const longToken = "ya29." + "A".repeat(200);
    const { encrypted } = encryptToken(longToken);
    expect(decryptToken(encrypted)).toBe(longToken);
  });

  it("round-trip works for a refresh token", () => {
    const refreshToken = "1//04refresh-token-example-long-string";
    const { encrypted } = encryptToken(refreshToken);
    expect(decryptToken(encrypted)).toBe(refreshToken);
  });

  it("produces different ciphertexts each call (random IV)", () => {
    const token = "same-google-token";
    const { encrypted: e1 } = encryptToken(token);
    const { encrypted: e2 } = encryptToken(token);
    expect(e1.toString("hex")).not.toBe(e2.toString("hex"));
    // Both decrypt correctly
    expect(decryptToken(e1)).toBe(token);
    expect(decryptToken(e2)).toBe(token);
  });
});

describe("Decryption fails gracefully on corrupted blob", () => {
  it("throws on a blob that is too short", () => {
    const tooShort = Buffer.alloc(10);
    expect(() => decryptToken(tooShort)).toThrow();
  });

  it("throws when the auth tag is tampered (integrity violation)", () => {
    const { encrypted } = encryptToken("google-access-token");
    // Flip the last byte of the auth tag
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("throws when the ciphertext is tampered (integrity violation)", () => {
    const { encrypted } = encryptToken("google-refresh-token");
    // Flip a byte in the ciphertext body (after version[4]+IV[12], before authTag[16])
    if (encrypted.length > 33) {
      encrypted[32] ^= 0x01;
    }
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("throws when OAUTH_TOKEN_KEY is wrong length", () => {
    const saved = process.env["OAUTH_TOKEN_KEY"];
    process.env["OAUTH_TOKEN_KEY"] = "deadbeef"; // only 4 bytes
    expect(() => encryptToken("will-fail")).toThrow(/32 bytes/);
    process.env["OAUTH_TOKEN_KEY"] = saved;
  });
});

describe("googleOAuthConfigured() returns false in test env without Google vars", () => {
  // The test env (vitest-setup.ts) does NOT set GOOGLE_OAUTH_* vars,
  // so these checks pass without any additional setup/teardown.

  it("returns false when GOOGLE_OAUTH_CLIENT_ID is not set in test env", () => {
    // Save and clear
    const savedId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
    const savedSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
    const savedRedirect = process.env["GOOGLE_OAUTH_REDIRECT_URI"];

    delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
    delete process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
    delete process.env["GOOGLE_OAUTH_REDIRECT_URI"];

    expect(googleOAuthConfigured()).toBe(false);

    // Restore
    if (savedId) process.env["GOOGLE_OAUTH_CLIENT_ID"] = savedId;
    if (savedSecret) process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = savedSecret;
    if (savedRedirect) process.env["GOOGLE_OAUTH_REDIRECT_URI"] = savedRedirect;
  });

  it("OAUTH_TOKEN_KEY is set correctly in test env (32 bytes hex)", () => {
    const key = process.env["OAUTH_TOKEN_KEY"];
    expect(key).toBeDefined();
    expect(key!.length).toBe(64); // 32 bytes = 64 hex chars
  });
});

describe("Null refresh token handling", () => {
  it("encrypting a null refresh token should be handled by the caller (not called)", () => {
    // The attribution routes skip encryption when refreshToken is null and store null in DB.
    // This test documents the expected behaviour:
    // null → do not call encryptToken → store NULL BYTEA in google_connection.
    // We verify encryptToken throws on undefined/null rather than silently corrupting.
    expect(() => encryptToken(null as unknown as string)).toThrow();
  });

  it("encrypting an empty string does not throw (valid edge case)", () => {
    // Empty string is technically valid — ensure encrypt/decrypt round-trips it
    const { encrypted } = encryptToken("");
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe("");
  });
});
