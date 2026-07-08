/**
 * download-token unit tests — the signed, expiring token that gates the premium
 * assets (GEO Guide, templates, tracker + methodology, the Kit PDF).
 *
 * The whole point of gating is that a bare/guessed URL opens nothing and a
 * shared link stops working after it expires. These tests pin that contract:
 *   - a freshly-signed token verifies to the right file
 *   - a tampered signature or a changed expiry is rejected
 *   - an expired token is rejected
 *   - an unknown asset id is rejected
 *   - the built URL is self-verifying
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signDownload,
  verifyDownload,
  signedDownloadUrl,
  isGatedAsset,
  GATED_ASSETS,
  DEFAULT_DOWNLOAD_TTL_MS,
} from "../../packages/shared/src/download-token";

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env["OAUTH_TOKEN_KEY"];
  // 64-hex = 32-byte HMAC key.
  process.env["OAUTH_TOKEN_KEY"] = "b".repeat(64);
});

afterEach(() => {
  if (savedKey === undefined) delete process.env["OAUTH_TOKEN_KEY"];
  else process.env["OAUTH_TOKEN_KEY"] = savedKey;
});

const NOW = 1_700_000_000_000;

describe("download-token", () => {
  it("round-trips: a freshly signed token verifies to the right filename", () => {
    const s = signDownload("geo-guide", DEFAULT_DOWNLOAD_TTL_MS, NOW);
    expect(s.asset).toBe("geo-guide");
    expect(s.exp).toBe(NOW + DEFAULT_DOWNLOAD_TTL_MS);
    expect(verifyDownload(s.asset, s.exp, s.sig, NOW)).toEqual({
      ok: true,
      filename: GATED_ASSETS["geo-guide"],
    });
  });

  it("rejects a tampered signature (length mismatch)", () => {
    const s = signDownload("get-cited-kit", DEFAULT_DOWNLOAD_TTL_MS, NOW);
    expect(verifyDownload(s.asset, s.exp, s.sig + "x", NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects when the expiry is changed (the signature covers exp)", () => {
    const s = signDownload("citation-tracker", DEFAULT_DOWNLOAD_TTL_MS, NOW);
    // Same-length but wrong signature for the altered exp.
    expect(verifyDownload(s.asset, s.exp + 60_000, s.sig, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects an expired token", () => {
    const s = signDownload("citation-templates", 1000, NOW); // exp = NOW + 1s
    expect(verifyDownload(s.asset, s.exp, s.sig, NOW + 5000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects an unknown asset id", () => {
    expect(verifyDownload("not-a-real-asset", NOW + 1000, "whatever", NOW)).toEqual({
      ok: false,
      reason: "unknown_asset",
    });
  });

  it("signedDownloadUrl builds a self-verifying /api/download URL", () => {
    const url = signedDownloadUrl(
      "citation-tracker-methodology",
      "https://ozvor.com",
      DEFAULT_DOWNLOAD_TTL_MS,
      NOW
    );
    expect(url).toContain(
      "https://ozvor.com/api/download?asset=citation-tracker-methodology"
    );
    expect(url).toMatch(/exp=\d+/);
    expect(url).toMatch(/sig=[A-Za-z0-9_-]+/);

    const u = new URL(url);
    const v = verifyDownload(
      u.searchParams.get("asset")!,
      Number(u.searchParams.get("exp")),
      u.searchParams.get("sig")!,
      NOW
    );
    expect(v.ok).toBe(true);
  });

  it("isGatedAsset guards the known set", () => {
    expect(isGatedAsset("geo-guide")).toBe(true);
    expect(isGatedAsset("get-cited-kit")).toBe(true);
    expect(isGatedAsset("nope")).toBe(false);
  });

  it("throws when the signing key is absent", () => {
    delete process.env["OAUTH_TOKEN_KEY"];
    expect(() => signDownload("geo-guide", DEFAULT_DOWNLOAD_TTL_MS, NOW)).toThrow(
      /OAUTH_TOKEN_KEY/
    );
  });
});
