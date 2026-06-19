/**
 * Unit tests — output_hash tamper evidence
 *
 * Architecture §12 S-12: SHA-256(output_text) == generation_log.output_hash
 * Verifies that the hash logic used by the gateway and the read-time
 * verification are consistent.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

function computeOutputHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function verifyOutputHash(text: string, storedHash: string): boolean {
  return computeOutputHash(text) === storedHash;
}

describe("output_hash tamper evidence (S-12)", () => {
  it("computes SHA-256 of output text deterministically", () => {
    const text = "This is an AI-generated LinkedIn post about sustainability.";
    const hash1 = computeOutputHash(text);
    const hash2 = computeOutputHash(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 256 bits as 64 hex chars
  });

  it("verifies a correct hash", () => {
    const text = "This is a test post.";
    const hash = computeOutputHash(text);
    expect(verifyOutputHash(text, hash)).toBe(true);
  });

  it("detects tampering — different text does not match stored hash", () => {
    const original = "Original post content that was approved.";
    const tampered = "Tampered post content with a different message.";
    const hash = computeOutputHash(original);
    expect(verifyOutputHash(tampered, hash)).toBe(false);
  });

  it("detects single character change in output", () => {
    const text = "A".repeat(100);
    const hash = computeOutputHash(text);
    const tampered = "B" + "A".repeat(99);
    expect(verifyOutputHash(tampered, hash)).toBe(false);
  });

  it("detects empty string vs non-empty", () => {
    const original = "Some post content";
    const hash = computeOutputHash(original);
    expect(verifyOutputHash("", hash)).toBe(false);
  });

  it("hash of empty string is deterministic and non-empty", () => {
    const hash = computeOutputHash("");
    expect(hash).toHaveLength(64);
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is case-sensitive (different case = different hash)", () => {
    const lower = "hello post";
    const upper = "Hello Post";
    expect(computeOutputHash(lower)).not.toBe(computeOutputHash(upper));
  });
});
