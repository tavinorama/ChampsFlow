/**
 * AES-256-GCM field-level encryption for OAuth tokens.
 *
 * Security requirements:
 *  - S-10: key_version support for non-blocking quarterly rotation
 *  - Architecture §9 Encryption: "AES-256-GCM with an application-managed key
 *    stored in Railway secrets"
 *  - NEVER log plaintext tokens or keys
 *  - Key loaded from OAUTH_TOKEN_KEY env var (hex-encoded 32-byte key)
 *
 * Key format: hex-encoded 32 bytes (256 bits) stored in OAUTH_TOKEN_KEY.
 * Multiple key versions supported via OAUTH_TOKEN_KEY_<version> pattern.
 * Default key_version = 1.
 *
 * Output format (BYTEA-stored): Buffer containing:
 *   [4 bytes: key_version as uint32BE] [12 bytes: IV/nonce] [N bytes: ciphertext] [16 bytes: auth tag]
 *
 * The key_version prefix allows decryption to select the correct key during rotation.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

const CURRENT_KEY_VERSION = 1;
const IV_LENGTH = 12;         // 96-bit nonce for AES-GCM (NIST recommended)
const AUTH_TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_VERSION_BYTES = 4;  // uint32BE prefix in stored blob

function loadKey(version: number): Buffer {
  const envVar =
    version === 1
      ? "OAUTH_TOKEN_KEY"
      : `OAUTH_TOKEN_KEY_${version}`;

  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`Missing encryption key for version ${version} (env: ${envVar})`);
  }

  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `Encryption key version ${version} must be 32 bytes (256 bits) hex-encoded. Got ${key.length} bytes.`
    );
  }

  return key;
}

// ---------------------------------------------------------------------------
// Encrypt — returns a Buffer to store as BYTEA in Postgres
// ---------------------------------------------------------------------------

export interface EncryptResult {
  encrypted: Buffer;
  keyVersion: number;
}

export function encryptToken(plaintext: string): EncryptResult {
  const keyVersion = CURRENT_KEY_VERSION;
  const key = loadKey(keyVersion);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertextBuf = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Layout: [4B version][12B IV][ciphertext][16B tag]
  const versionBuf = Buffer.allocUnsafe(KEY_VERSION_BYTES);
  versionBuf.writeUInt32BE(keyVersion, 0);

  const encrypted = Buffer.concat([versionBuf, iv, ciphertextBuf, authTag]);

  return { encrypted, keyVersion };
}

// ---------------------------------------------------------------------------
// Decrypt — reads key_version from the blob prefix
// ---------------------------------------------------------------------------

export function decryptToken(blob: Buffer): string {
  if (blob.length < KEY_VERSION_BYTES + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted token blob is too short — likely corrupted.");
  }

  const keyVersion = blob.readUInt32BE(0);
  const iv = blob.subarray(KEY_VERSION_BYTES, KEY_VERSION_BYTES + IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(KEY_VERSION_BYTES + IV_LENGTH, blob.length - AUTH_TAG_LENGTH);

  const key = loadKey(keyVersion);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

// ---------------------------------------------------------------------------
// Scrub encrypted columns — overwrites BYTEA fields on disconnect
// Used by DELETE /api/social-accounts/:id to clear stored tokens.
// Returns null buffers appropriate for setting access_token_enc = NULL.
// ---------------------------------------------------------------------------

export function scrubTokens(): {
  accessTokenEnc: null;
  refreshTokenEnc: null;
} {
  return {
    accessTokenEnc: null,
    refreshTokenEnc: null,
  };
}

// ---------------------------------------------------------------------------
// Key version extraction — used by migration jobs to find rows needing re-encryption
// ---------------------------------------------------------------------------

export function getKeyVersionFromBlob(blob: Buffer): number | null {
  if (blob.length < KEY_VERSION_BYTES) return null;
  return blob.readUInt32BE(0);
}
