/**
 * retention-lock.ts — single-flight claim for the retention save-offer
 * (POST /api/billing/retention-offer).
 *
 * Lifecycle contract (Hermes reviews #357/#358):
 *  - acquire: Redis SET NX with a 60s TTL, holding a random OWNERSHIP TOKEN.
 *  - release: atomic compare-and-delete (Lua) of the token, called in the
 *    route's `finally` on EVERY exit — applied, refused, or thrown — so a
 *    finished request never blocks the next one for the TTL, and a request
 *    whose claim already expired can never delete a newer owner's claim.
 *  - Fail-open: when Redis is unavailable the request proceeds "unlocked"
 *    (same posture as the billing rate limiter); the Stripe idempotency key
 *    in applyRetentionDiscount remains the second line of defense.
 */

import { randomUUID } from "crypto";
import type { SharedRedis } from "../shared-redis";
import { logger } from "../../../../packages/shared/src/logger";

export const RETENTION_LOCK_TTL_S = 60;

function lockKey(stripeSubscriptionId: string): string {
  return `billing:retention:lock:${stripeSubscriptionId}`;
}

/**
 * Try to claim the per-subscription lock.
 * Returns:
 *  - a token string  → claimed; pass it to releaseRetentionLock afterwards
 *  - null            → someone else holds the claim (caller answers 409)
 *  - "unlocked"      → Redis unavailable; proceed WITHOUT a claim (fail-open)
 */
export async function acquireRetentionLock(
  redis: SharedRedis | null,
  stripeSubscriptionId: string
): Promise<string | null | "unlocked"> {
  if (!redis) return "unlocked";
  const token = randomUUID();
  try {
    const claimed = await redis.set(lockKey(stripeSubscriptionId), token, {
      ex: RETENTION_LOCK_TTL_S,
      nx: true,
    });
    return claimed === null ? null : token;
  } catch (err) {
    logger.warn("billing_retention_lock_redis_failed", {
      message: (err as Error).message,
    });
    return "unlocked";
  }
}

/**
 * Release the claim. Ownership-safe (compare-and-delete): only deletes when
 * the key still holds OUR token. Never throws; no-op when unlocked/absent.
 */
export async function releaseRetentionLock(
  redis: SharedRedis | null,
  stripeSubscriptionId: string,
  token: string | "unlocked"
): Promise<void> {
  if (!redis || token === "unlocked") return;
  try {
    await redis.delIfEquals(lockKey(stripeSubscriptionId), token);
  } catch (err) {
    // Release is best-effort — the 60s TTL is the backstop.
    logger.warn("billing_retention_unlock_redis_failed", {
      message: (err as Error).message,
    });
  }
}
