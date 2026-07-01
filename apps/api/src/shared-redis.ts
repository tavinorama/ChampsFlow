/**
 * shared-redis.ts — one Redis client for the API's caches + rate-limiters,
 * backed by Railway Redis (REDIS_URL) via ioredis.
 *
 * Why: the deployment provides Railway Redis (redis:// protocol, ioredis), NOT
 * the Upstash REST API. Modules that reached for `@upstash/redis` therefore
 * failed at runtime ("UPSTASH_REDIS_REST_URL must be set") and fell back to
 * fail-open / fail-safe. This client speaks to the Railway Redis that already
 * exists, and exposes the small Upstash-compatible surface those call sites use
 * (get / set{ex,nx} / incr / expire / del) so they migrate without change.
 *
 * Lifecycle: lazy singleton. `getSharedRedis()` throws when REDIS_URL is unset
 * (callers wrap in try/catch and fail open); `tryGetSharedRedis()` returns null
 * instead (for optional caches like the founder-offer status).
 */

import IORedis from "ioredis";

export class SharedRedis {
  constructor(private readonly client: IORedis) {}

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async get<T = string>(key: string): Promise<T | null> {
    return (await this.client.get(key)) as unknown as T | null;
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Upstash-compatible set. Returns "OK" on success, or null when a NX/XX
   * condition is not met (used by the webhook idempotency check).
   */
  async set(
    key: string,
    value: string,
    opts?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<"OK" | null> {
    if (!opts || (opts.ex == null && opts.px == null && !opts.nx && !opts.xx)) {
      return (await this.client.set(key, value)) as "OK" | null;
    }
    const args: (string | number)[] = [];
    if (opts.ex != null) args.push("EX", opts.ex);
    if (opts.px != null) args.push("PX", opts.px);
    if (opts.nx) args.push("NX");
    if (opts.xx) args.push("XX");
    const setFn = this.client.set.bind(this.client) as unknown as (
      ...a: (string | number)[]
    ) => Promise<"OK" | null>;
    return setFn(key, value, ...args);
  }
}

let _shared: SharedRedis | null = null;

function build(): SharedRedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL must be set for the shared Redis client");
  }
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    // Don't crash the process on a transient Redis blip; callers fail open.
    enableOfflineQueue: true,
  });
  // Swallow connection errors — rate-limiters/caches degrade gracefully.
  client.on("error", () => {});
  _shared = new SharedRedis(client);
  return _shared;
}

/** Throws when REDIS_URL is unset (callers should try/catch + fail open). */
export function getSharedRedis(): SharedRedis {
  return _shared ?? build();
}

/** Returns null instead of throwing when REDIS_URL is unset (optional caches). */
export function tryGetSharedRedis(): SharedRedis | null {
  if (_shared) return _shared;
  try {
    return build();
  } catch {
    return null;
  }
}
