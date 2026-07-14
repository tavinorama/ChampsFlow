/**
 * memory-rate-limit.ts — a bounded, in-process sliding-window limiter used
 * ONLY as a fallback when the distributed (Redis) limiter is unavailable
 * (Hermes #261: cost-bearing endpoints must fail *bounded*, not fail-open).
 *
 * Why this exists:
 *   Endpoints that call a paid API (e.g. /api/chat → LLM) protect themselves
 *   with a Redis sliding-window limiter. When Redis blips, the historical
 *   behaviour was "fail-open" — drop the cap entirely and serve every request.
 *   For a surface with NO monthly-budget backstop (unlike the free test), a
 *   Redis outage then becomes an unbounded provider-cost vector. This limiter
 *   is the fallback: while Redis is down, requests are still capped, just by a
 *   per-process best-effort counter instead of the shared one.
 *
 * Deliberate limitations (documented, not bugs):
 *   - PER-PROCESS: each API instance keeps its own counters, so with N
 *     instances the effective ceiling is up to N × limit. That is fine — this
 *     is a degraded backstop during an infra outage, not the primary limiter.
 *   - MEMORY-BOUNDED: the key store is capped (MAX_KEYS). Under pressure the
 *     oldest/expired keys are pruned so a flood of distinct keys can never grow
 *     memory without bound. (Keys are derived from clientIp(), which is no
 *     longer client-forgeable after #258.)
 *   - Not persistent: counters reset on process restart. Acceptable for a
 *     transient-outage fallback.
 */

/** Max distinct keys held at once — caps worst-case memory. */
const MAX_KEYS = 10_000;

/** key → ascending list of hit timestamps (ms) within the active window. */
const store = new Map<string, number[]>();

/**
 * Keep the store within MAX_KEYS. First drop keys whose most recent hit is
 * older than `windowMs` (all their timestamps are guaranteed expired). If a
 * flood of still-active keys keeps us over the cap, evict the oldest-inserted
 * keys (Map preserves insertion order) until within bound — a HARD guarantee,
 * not best-effort. Evicting a live key just resets that IP's degraded-mode
 * counter, which is acceptable for an outage backstop.
 */
function enforceKeyBound(now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  for (const [key, hits] of store) {
    const last = hits[hits.length - 1];
    if (last === undefined || last <= cutoff) store.delete(key);
  }
  if (store.size <= MAX_KEYS) return;
  let toEvict = store.size - MAX_KEYS;
  for (const key of store.keys()) {
    store.delete(key);
    if (--toEvict <= 0) break;
  }
}

/**
 * Record a hit for `key` and report whether it is within `limit` over the
 * trailing `windowMs`. Sliding window: expired hits are discarded on each call.
 *
 * @param now injectable clock (defaults to Date.now) — lets tests advance time
 *   deterministically without touching the real clock.
 * @returns true when the hit is allowed (count ≤ limit), false when it exceeds.
 */
export function memoryRateLimitAllow(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  try {
    const cutoff = now - windowMs;
    const prev = store.get(key);
    const recent = prev ? prev.filter((t) => t > cutoff) : [];
    recent.push(now);
    store.set(key, recent);

    // Bound memory: once we exceed the cap, prune + evict. Runs rarely (only
    // past the threshold) so it is not on the hot path per request.
    if (store.size > MAX_KEYS) enforceKeyBound(now, windowMs);

    return recent.length <= limit;
  } catch {
    // The limiter must NEVER crash the request it is protecting. If anything
    // unexpected throws, deny (fail-closed): we are already in the degraded,
    // Redis-down path, so a broken fallback must not silently become fail-open
    // on a cost-bearing endpoint. Denying sheds load; it never leaks cost.
    return false;
  }
}

/** Test-only: wipe all counters so cases don't leak state into each other. */
export function __resetMemoryRateLimit(): void {
  store.clear();
}

/** Test-only: current number of tracked keys (to assert the MAX_KEYS bound). */
export function __memoryRateLimitSize(): number {
  return store.size;
}
