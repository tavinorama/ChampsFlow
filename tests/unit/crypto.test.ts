/**
 * Unit tests — packages/shared/src/crypto.ts
 *
 * Verifies:
 *  - AES-256-GCM encrypt/decrypt round-trip
 *  - Key version embedded and extracted correctly (S-10)
 *  - Short blob throws, not silently corrupts
 *  - Wrong key version or corrupt auth tag throws
 *  - scrubTokens() returns null pair
 *  - getKeyVersionFromBlob() reads prefix correctly
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptToken, decryptToken, scrubTokens, getKeyVersionFromBlob } from "../../packages/shared/src/crypto";

// Set a test key before importing (32 bytes hex = 64 hex chars)
const TEST_KEY_HEX = "a".repeat(64); // 32 bytes of 0xaa

beforeAll(() => {
  process.env["OAUTH_TOKEN_KEY"] = TEST_KEY_HEX;
});

afterAll(() => {
  delete process.env["OAUTH_TOKEN_KEY"];
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a short token correctly", () => {
    const plaintext = "linkedin_access_token_abc123";
    const { encrypted, keyVersion } = encryptToken(plaintext);
    expect(keyVersion).toBe(1);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips a long Facebook page token", () => {
    const longToken = "EAADs" + "x".repeat(200);
    const { encrypted } = encryptToken(longToken);
    expect(decryptToken(encrypted)).toBe(longToken);
  });

  it("produces a Buffer (not a string)", () => {
    const { encrypted } = encryptToken("test");
    expect(Buffer.isBuffer(encrypted)).toBe(true);
  });

  it("produces different ciphertexts each call (random IV)", () => {
    const { encrypted: e1 } = encryptToken("same-token");
    const { encrypted: e2 } = encryptToken("same-token");
    // Different IVs → different ciphertexts
    expect(e1.toString("hex")).not.toBe(e2.toString("hex"));
    // But both decrypt to the same value
    expect(decryptToken(e1)).toBe("same-token");
    expect(decryptToken(e2)).toBe("same-token");
  });

  it("throws on a blob that is too short", () => {
    const shortBlob = Buffer.alloc(10); // less than 4+12+16 = 32 bytes minimum
    expect(() => decryptToken(shortBlob)).toThrow();
  });

  it("throws when auth tag is tampered", () => {
    const { encrypted } = encryptToken("tampered-token");
    // Flip the last byte (auth tag)
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("throws when ciphertext body is tampered", () => {
    const { encrypted } = encryptToken("tampered-body");
    // Flip a byte in the ciphertext (after version+IV, before auth tag)
    if (encrypted.length > 32 + 5) {
      encrypted[32] ^= 0x01;
    }
    expect(() => decryptToken(encrypted)).toThrow();
  });
});

describe("key version embedding (S-10)", () => {
  it("embeds key_version=1 as first 4 bytes (uint32BE)", () => {
    const { encrypted } = encryptToken("token");
    const version = encrypted.readUInt32BE(0);
    expect(version).toBe(1);
  });

  it("getKeyVersionFromBlob extracts version from valid blob", () => {
    const { encrypted } = encryptToken("token-v1");
    expect(getKeyVersionFromBlob(encrypted)).toBe(1);
  });

  it("getKeyVersionFromBlob returns null for blob shorter than 4 bytes", () => {
    expect(getKeyVersionFromBlob(Buffer.alloc(3))).toBeNull();
  });
});

describe("scrubTokens()", () => {
  it("returns null for both access and refresh token fields", () => {
    const result = scrubTokens();
    expect(result.accessTokenEnc).toBeNull();
    expect(result.refreshTokenEnc).toBeNull();
  });
});

describe("missing encryption key", () => {
  it("throws when OAUTH_TOKEN_KEY env var is not set", () => {
    const saved = process.env["OAUTH_TOKEN_KEY"];
    delete process.env["OAUTH_TOKEN_KEY"];
    expect(() => encryptToken("will-fail")).toThrow(/Missing encryption key/);
    process.env["OAUTH_TOKEN_KEY"] = saved;
  });

  it("throws when key is wrong length (not 32 bytes)", () => {
    const saved = process.env["OAUTH_TOKEN_KEY"];
    process.env["OAUTH_TOKEN_KEY"] = "deadbeef"; // only 4 bytes
    expect(() => encryptToken("will-fail")).toThrow(/32 bytes/);
    process.env["OAUTH_TOKEN_KEY"] = saved;
  });
});
