/**
 * Google OAuth state management for Attribution v1 (#86).
 *
 * Mirrors oauth-state.ts pattern (same Redis TTL, same 256-bit entropy,
 * same pipeline get+del for single-use semantics) but uses a different
 * key prefix and a different payload shape (no PKCE code_verifier,
 * adds kind + brandId for GA4/GSC routing).
 *
 * Architecture refs:
 *  - §6 OAuth (CSRF state protection)
 *  - Attribution v1 capability spec (#86)
 */

import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Redis client (lazy-initialized)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set"
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_TTL_SECONDS = 600; // 10 minutes
const GOOGLE_STATE_KEY_PREFIX = "google:oauth:state:";

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

export interface GoogleOAuthStatePayload {
  userId: string;
  tenantId: string;
  brandId: string | null;
  kind: "ga4" | "gsc";
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random state token and store its payload in Redis.
 * Returns the opaque state string to include in the Google OAuth redirect URL.
 */
export async function createGoogleOAuthState(
  payload: Omit<GoogleOAuthStatePayload, "createdAt">
): Promise<string> {
  const state = randomBytes(32).toString("hex"); // 256-bit entropy
  const key = `${GOOGLE_STATE_KEY_PREFIX}${state}`;

  const stored: GoogleOAuthStatePayload = {
    ...payload,
    createdAt: Date.now(),
  };

  const redis = getRedis();
  await redis.set(key, JSON.stringify(stored), { ex: STATE_TTL_SECONDS });

  logger.info("google_oauth_state_created", {
    kind: payload.kind,
    tenantId: payload.tenantId,
    // No userId logged — PII minimisation
  });

  return state;
}

/**
 * Validate and consume a Google OAuth state token.
 * Returns the stored payload if valid; throws if invalid, expired, or already consumed.
 * Tokens are single-use (deleted on retrieval — atomic pipeline).
 */
export async function consumeGoogleOAuthState(
  state: string
): Promise<GoogleOAuthStatePayload> {
  if (!state || typeof state !== "string" || state.length !== 64) {
    throw new GoogleOAuthStateError("INVALID_STATE_FORMAT");
  }

  const key = `${GOOGLE_STATE_KEY_PREFIX}${state}`;
  const redis = getRedis();

  // Atomic: get + delete to prevent replay attacks
  const [[, raw], [, deleted]] = (await redis
    .pipeline()
    .get(key)
    .del(key)
    .exec()) as [[null, string | null], [null, number]];

  if (!raw) {
    logger.warn("google_oauth_state_not_found_or_expired", { state: "[REDACTED]" });
    throw new GoogleOAuthStateError("STATE_NOT_FOUND_OR_EXPIRED");
  }

  if (deleted === 0) {
    logger.warn("google_oauth_state_already_consumed", {});
    throw new GoogleOAuthStateError("STATE_ALREADY_CONSUMED");
  }

  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(raw) as GoogleOAuthStatePayload;
  } catch {
    throw new GoogleOAuthStateError("STATE_PAYLOAD_INVALID");
  }

  logger.info("google_oauth_state_consumed", {
    kind: payload.kind,
    tenantId: payload.tenantId,
  });

  return payload;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class GoogleOAuthStateError extends Error {
  constructor(public readonly code: string) {
    super(`Google OAuth state error: ${code}`);
    this.name = "GoogleOAuthStateError";
  }
}
