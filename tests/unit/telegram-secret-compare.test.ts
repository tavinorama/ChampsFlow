/**
 * 10.B.8 — the Telegram webhook secret compare is constant-time
 * (secretsMatch: SHA-256 both sides → timingSafeEqual; equal-length buffers
 * by construction so no length oracle either).
 */
import { describe, it, expect } from "vitest";
import { secretsMatch } from "../../apps/api/src/routes/telegram";

describe("secretsMatch", () => {
  it("accepts the exact secret", () => {
    expect(secretsMatch("s3cret-token", "s3cret-token")).toBe(true);
  });
  it("rejects a wrong secret, a prefix, and an overlong guess", () => {
    expect(secretsMatch("wrong", "s3cret-token")).toBe(false);
    expect(secretsMatch("s3cret", "s3cret-token")).toBe(false);
    expect(secretsMatch("s3cret-token-extra", "s3cret-token")).toBe(false);
  });
  it("rejects the empty string without throwing (length mismatch is not an oracle)", () => {
    expect(secretsMatch("", "s3cret-token")).toBe(false);
  });
});
