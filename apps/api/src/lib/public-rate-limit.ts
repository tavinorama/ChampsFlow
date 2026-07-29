/**
 * public-rate-limit.ts — one sliding-window limiter for public endpoints.
 *
 * Why this file exists: the same twenty lines of Redis pipeline were written
 * by hand in ccpa.ts, chat.ts, dsr.ts, landing-public.ts, products.ts and
 * social-accounts.ts. Every new public route then depended on someone
 * remembering to write them again — and five routes did not get them
 * (/api/download, /api/nurture/unsubscribe, /api/account/bootstrap,
 * /api/showcase/geo, /api/reports/:token). A protection that relies on memory
 * is not a protection.
 *
 * Behaviour, deliberately:
 *  - Redis first (shared across API instances), falling back to the bounded
 *    in-process limiter when Redis is unavailable. Never fail-open: a Redis
 *    outage must not turn a capped surface into an uncapped one.
 *  - Keyed on truncated IP. clientIp() reads cf-connecting-ip or the LAST
 *    X-Forwarded-For hop, so it is not client-forgeable (#258); truncation
 *    keeps us inside GDPR/CCPA data minimisation.
 *  - Returns a Response to send, or null to continue. The caller stays
 *    readable: `const limited = await publicRateLimit(...); if (limited) return limited;`
 */

import type { Context } from "hono";
import { getSharedRedis } from "../shared-redis";
import { clientIp } from "./client-ip";
import { truncateIp } from "../routes/dpa";
import { memoryRateLimitAllow } from "./memory-rate-limit";
import { logger } from "../../../../packages/shared/src/logger";

export interface PublicRateLimitOptions {
  /** Short bucket name, becomes the Redis key prefix. e.g. "download". */
  bucket: string;
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Override the identity being limited. Defaults to the truncated client IP.
   * Pass a token or an id when the abuse you care about is per-resource rather
   * than per-caller — a token being brute-forced from many IPs, for instance.
   */
  identity?: string;
  /** Shown to the caller. Keep it plain; this reaches real people. */
  message?: string;
}

/**
 * Returns a 429 Response when the caller is over the limit, or null to
 * continue. Never throws: a limiter that can break the route it protects is
 * worse than no limiter.
 */
export async function publicRateLimit(
  ctx: Context,
  { bucket, limit, windowMs, identity, message }: PublicRateLimitOptions
): Promise<Response | null> {
  const who = identity ?? truncateIp(clientIp(ctx) ?? "") ?? "unknown";
  const key = `rl:${bucket}:${who || "unknown"}`;

  let allowed: boolean;
  try {
    const redis = getSharedRedis();
    const now = Date.now();
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` });
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(windowMs / 1000));
    const results = await pipeline.exec();
    allowed = (results[2] as number) <= limit;
  } catch (err) {
    // Redis blipped. Fall back to the per-process limiter rather than letting
    // everything through.
    logger.warn("public_rate_limit_redis_fallback", {
      bucket,
      message: (err as Error).message?.slice(0, 120),
    });
    allowed = memoryRateLimitAllow(key, limit, windowMs);
  }

  if (allowed) return null;

  ctx.status(429);
  ctx.header("Retry-After", String(Math.ceil(windowMs / 1000)));
  return ctx.json({
    error: message ?? "Too many requests. Please try again shortly.",
    code: "RATE_LIMITED",
    retry_after: Math.ceil(windowMs / 1000),
  });
}
