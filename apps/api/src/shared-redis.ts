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

import IORedis, { type ChainableCommander } from "ioredis";

/**
 * Upstash-compatible pipeline over an ioredis pipeline. Buffers commands and,
 * on exec(), returns a FLAT array of results ([v0, v1, ...]) like Upstash —
 * NOT ioredis' [[err, v], ...] — so the sliding-window rate-limiters that read
 * `results[2]` keep working. Translates the Upstash zadd({score,member}) form
 * to ioredis' positional zadd(key, score, member).
 */
export class SharedPipeline {
  constructor(private readonly p: ChainableCommander) {}

  zremrangebyscore(key: string, min: number | string, max: number | string): this {
    this.p.zremrangebyscore(key, min, max);
    return this;
  }
  zadd(key: string, entry: { score: number; member: string }): this {
    this.p.zadd(key, entry.score, entry.member);
    return this;
  }
  zcard(key: string): this {
    this.p.zcard(key);
    return this;
  }
  incr(key: string): this {
    this.p.incr(key);
    return this;
  }
  expire(key: string, seconds: number): this {
    this.p.expire(key, seconds);
    return this;
  }
  get(key: string): this {
    this.p.get(key);
    return this;
  }
  set(key: string, value: string): this {
    this.p.set(key, value);
    return this;
  }

  del(key: string): this {
    this.p.del(key);
    return this;
  }

  ttl(key: string): this {
    this.p.ttl(key);
    return this;
  }

  async exec(): Promise<unknown[]> {
    const res = await this.p.exec(); // Array<[Error|null, unknown]> | null
    if (!res) return [];
    return res.map((pair) => pair[1]); // flatten to Upstash's [v, ...]
  }
}

export class SharedRedis {
  constructor(private readonly client: IORedis) {}

  /** Health probe — resolves "PONG" when the Railway Redis is reachable. */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  pipeline(): SharedPipeline {
    return new SharedPipeline(this.client.pipeline());
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async get<T = string>(key: string): Promise<T | null> {
    return (await this.client.get(key)) as unknown as T | null;
  }

  /**
   * Ownership-safe compare-and-delete (atomic, Lua): deletes `key` ONLY when
   * its current value equals `value`. Returns 1 when deleted, 0 otherwise.
   * Used to RELEASE short claim locks: a caller whose lock already expired
   * can never delete a newer owner's claim (the classic delete-after-expiry
   * race a plain DEL would allow).
   */
  async delIfEquals(key: string, value: string): Promise<number> {
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    return (await this.client.eval(script, 1, key, value)) as number;
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
