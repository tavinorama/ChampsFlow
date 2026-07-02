/**
 * OAuth PKCE state management for C4 OAuth Connect flows.
 *
 * The `state` parameter prevents CSRF in OAuth flows (arch §6 auth model).
 * This module generates, stores (in Upstash Redis with 10-min TTL), and
 * validates state tokens for LinkedIn and Instagram OAuth flows.
 *
 * Architecture refs:
 *  - §6 OAuth social accounts (PKCE flow)
 *  - §4 social_accounts table
 *
 * auth-agent hard rule #9: "OAuth state parameter: always validate to prevent
 * CSRF in auth flows."
 */

import { randomBytes } from "crypto";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Redis client (lazy-initialized from env)
// ---------------------------------------------------------------------------

function getRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// State token lifecycle
// ---------------------------------------------------------------------------

const STATE_TTL_SECONDS = 600; // 10 minutes — matches OAuth standard recommendation
const STATE_KEY_PREFIX = "oauth:state:";

export interface OAuthStatePayload {
  userId: string;
  tenantId: string;
  platform: "linkedin" | "instagram" | "facebook";
  redirectUri: string;
  codeVerifier: string; // PKCE code_verifier (stored server-side)
  createdAt: number;
}

/**
 * Generate a cryptographically random state token and store its payload in Redis.
 * Returns the opaque state string to include in the OAuth redirect URL.
 */
export async function createOAuthState(
  payload: Omit<OAuthStatePayload, "createdAt">
): Promise<string> {
  const state = randomBytes(32).toString("hex"); // 256-bit entropy
  const key = `${STATE_KEY_PREFIX}${state}`;

  const stored: OAuthStatePayload = {
    ...payload,
    createdAt: Date.now(),
  };

  const redis = getRedis();
  await redis.set(key, JSON.stringify(stored), { ex: STATE_TTL_SECONDS });

  logger.info("oauth_state_created", {
    platform: payload.platform,
    tenantId: payload.tenantId,
    userId: payload.userId,
  });

  return state;
}

/**
 * Validate and consume an OAuth state token.
 * Returns the stored payload if valid; throws if invalid, expired, or already consumed.
 * State tokens are single-use (deleted on retrieval).
 */
export async function consumeOAuthState(
  state: string
): Promise<OAuthStatePayload> {
  if (!state || typeof state !== "string" || state.length !== 64) {
    throw new OAuthStateError("INVALID_STATE_FORMAT");
  }

  const key = `${STATE_KEY_PREFIX}${state}`;
  const redis = getRedis();

  // Atomic: get + delete in a pipeline to prevent replay attacks
  const [[, raw], [, deleted]] = await redis.pipeline()
    .get(key)
    .del(key)
    .exec() as [[null, string | null], [null, number]];

  if (!raw) {
    logger.warn("oauth_state_not_found_or_expired", { state: "[REDACTED]" });
    throw new OAuthStateError("STATE_NOT_FOUND_OR_EXPIRED");
  }

  // deleted is the number of keys deleted; if 0 the key was already gone
  // (this is a defense against very tight race conditions)
  if (deleted === 0) {
    logger.warn("oauth_state_already_consumed", {});
    throw new OAuthStateError("STATE_ALREADY_CONSUMED");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(raw) as OAuthStatePayload;
  } catch {
    throw new OAuthStateError("STATE_PAYLOAD_INVALID");
  }

  logger.info("oauth_state_consumed", {
    platform: payload.platform,
    tenantId: payload.tenantId,
    userId: payload.userId,
  });

  return payload;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------
export class OAuthStateError extends Error {
  constructor(public readonly code: string) {
    super(`OAuth state error: ${code}`);
    this.name = "OAuthStateError";
  }
}
