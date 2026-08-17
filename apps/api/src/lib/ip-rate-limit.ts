/**
 * ip-rate-limit.ts — per-IP sliding-window limiter for PUBLIC endpoints.
 *
 * Same ZSET pipeline products.ts uses for the free test (zremrangebyscore →
 * zadd → zcard → expire), with the SAME degradation rule (#261): when Redis is
 * unset or errors, fall back to the bounded in-process limiter instead of
 * failing open. Keys carry a truncated IP only (GDPR minimisation: IPv4 last
 * octet zeroed, IPv6 /48).
 *
 * `IpRateLimiter` is a plain function so routes can take it as an injectable
 * dependency (tests pass a memory-only or always-deny limiter).
 */

import { tryGetSharedRedis } from "../shared-redis";
import { memoryRateLimitAllow } from "./memory-rate-limit";
import { logger } from "../../../../packages/shared/src/logger";

export type IpRateLimiter = (key: string, limit: number, windowMs: number) => Promise<boolean>;

/** IPv4 → zero last octet; IPv6 → first 3 groups (/48); anything else → "unknown". */
export function truncateIp(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.0`;
  const colons = ip.split(":");
  if (colons.length >= 4) return colons.slice(0, 3).join(":") + "::/48";
  return "unknown";
}

/** Redis ZSET limiter with memory fallback. Never throws. */
export const sharedIpRateLimiter: IpRateLimiter = async (key, limit, windowMs) => {
  const redis = tryGetSharedRedis();
  if (redis) {
    try {
      const now = Date.now();
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, now - windowMs);
      pipeline.zadd(key, { score: now, member: String(now) });
      pipeline.zcard(key);
      pipeline.expire(key, Math.ceil(windowMs / 1000));
      const results = await pipeline.exec();
      const count = Number(results[2]);
      if (Number.isFinite(count)) return count <= limit;
    } catch (err) {
      logger.warn("ip_rate_limit_redis_unavailable_fallback", {
        key_prefix: key.split(":")[0] ?? "",
        message: (err as Error).message?.slice(0, 120) ?? "",
        fallback: "memory",
      });
    }
  }
  return memoryRateLimitAllow(key, limit, windowMs);
};

/** Memory-only limiter (tests / explicit opt-out of Redis). */
export const memoryIpRateLimiter: IpRateLimiter = async (key, limit, windowMs) =>
  memoryRateLimitAllow(key, limit, windowMs);
