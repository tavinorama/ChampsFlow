/**
 * download-token.ts — signed, expiring tokens for gated asset downloads.
 *
 * The premium bonus assets (GEO Visibility Guide, High-Citation Templates, LLM
 * Citation Tracker + methodology) and the paid Kit PDF must NOT be freely
 * downloadable from a public URL — they are exclusive to customers who receive
 * them by email / on their paid Kit page. Instead of static public files, they
 * are served by the API only when a valid signed token is presented
 * (S3-presigned-URL style): the link is unguessable and expires, so it works
 * only from the email/Kit page and cannot be shared as a plain public URL.
 *
 * Signing key: reuses OAUTH_TOKEN_KEY (hex, already required + validated by the
 * API config). HMAC-SHA256 over `${asset}.${exp}`. No secret is ever placed in
 * the token — only the asset id, the expiry, and the signature.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Assets that are gated (customer-only). Whitepaper + brand kit stay public. */
export const GATED_ASSETS = {
  "geo-guide": "The-GEO-Visibility-Guide.pdf",
  "citation-templates": "5-High-Citation-Post-Templates.pdf",
  "citation-tracker": "LLM-Citation-Tracker.xlsx",
  "citation-tracker-methodology": "LLM-Citation-Tracker-Methodology.pdf",
  "get-cited-kit": "The-Get-Cited-Kit.pdf",
} as const;

export type GatedAssetId = keyof typeof GATED_ASSETS;

export function isGatedAsset(id: string): id is GatedAssetId {
  return Object.prototype.hasOwnProperty.call(GATED_ASSETS, id);
}

/** Default token lifetime: 1 year (a paying customer keeps access). */
export const DEFAULT_DOWNLOAD_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const hex = process.env.OAUTH_TOKEN_KEY;
  if (!hex || hex.length < 32) {
    throw new Error("OAUTH_TOKEN_KEY is not set — cannot sign download tokens");
  }
  // OAUTH_TOKEN_KEY is a 64-hex (32-byte) key; use its raw bytes as the HMAC key.
  return Buffer.from(hex, "hex");
}

function computeSig(asset: string, exp: number): string {
  return createHmac("sha256", signingKey())
    .update(`${asset}.${exp}`)
    .digest("base64url");
}

export interface SignedDownload {
  asset: GatedAssetId;
  exp: number;
  sig: string;
}

/** Mint a signed download descriptor for a gated asset. */
export function signDownload(
  asset: GatedAssetId,
  ttlMs: number = DEFAULT_DOWNLOAD_TTL_MS,
  nowMs: number = Date.now()
): SignedDownload {
  const exp = nowMs + ttlMs;
  return { asset, exp, sig: computeSig(asset, exp) };
}

/** Build the relative download URL for a signed descriptor. */
export function downloadUrl(signed: SignedDownload, origin = ""): string {
  const q = new URLSearchParams({
    asset: signed.asset,
    exp: String(signed.exp),
    sig: signed.sig,
  });
  return `${origin}/api/download?${q.toString()}`;
}

/** Convenience: sign + build the URL in one step. */
export function signedDownloadUrl(
  asset: GatedAssetId,
  origin = "",
  ttlMs: number = DEFAULT_DOWNLOAD_TTL_MS,
  nowMs: number = Date.now()
): string {
  return downloadUrl(signDownload(asset, ttlMs, nowMs), origin);
}

export type VerifyResult =
  | { ok: true; filename: string }
  | { ok: false; reason: "unknown_asset" | "bad_signature" | "expired" };

/** Verify a presented token. Timing-safe signature comparison. */
export function verifyDownload(
  asset: string,
  exp: number,
  sig: string,
  nowMs: number = Date.now()
): VerifyResult {
  if (!isGatedAsset(asset)) return { ok: false, reason: "unknown_asset" };

  const expected = computeSig(asset, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!Number.isFinite(exp) || exp < nowMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, filename: GATED_ASSETS[asset] };
}
