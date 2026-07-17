/**
 * tests/unit/billing/retention-lock.test.ts — lock lifecycle (Hermes #358)
 *
 * Contract under test:
 *  - acquire claims with an ownership token; a concurrent second acquire is
 *    refused (null → route answers 409) while the first is active.
 *  - release deletes ONLY the caller's own token (compare-and-delete), so an
 *    expired claimer can never delete a newer owner's claim.
 *  - release happens after success AND after failure (route calls it in
 *    `finally`), immediately freeing the next legitimate request.
 *  - Redis unavailable → fail-open ("unlocked"); release is a safe no-op.
 */

import { describe, it, expect } from "vitest";
import {
  acquireRetentionLock,
  releaseRetentionLock,
} from "../../../apps/api/src/lib/retention-lock";
import type { SharedRedis } from "../../../apps/api/src/shared-redis";

// In-memory fake honoring the SharedRedis subset the lock uses (set NX + delIfEquals).
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK" as const;
    },
    async delIfEquals(key: string, value: string) {
      if (store.get(key) === value) { store.delete(key); return 1; }
      return 0;
    },
  } as unknown as SharedRedis & { store: Map<string, string> };
}

describe("retention lock lifecycle", () => {
  it("acquires with a token and blocks a concurrent second acquire (409 path)", async () => {
    const r = fakeRedis();
    const t1 = await acquireRetentionLock(r, "sub_1");
    expect(typeof t1).toBe("string");
    const t2 = await acquireRetentionLock(r, "sub_1");
    expect(t2).toBeNull(); // second concurrent request → route returns 409 in_progress
  });

  it("releases after completion, immediately freeing the next request (success AND failure paths share finally)", async () => {
    const r = fakeRedis();
    const t1 = await acquireRetentionLock(r, "sub_1");
    await releaseRetentionLock(r, "sub_1", t1 as string);
    expect(r.store.size).toBe(0); // no 60s wait
    const t2 = await acquireRetentionLock(r, "sub_1");
    expect(typeof t2).toBe("string"); // retry proceeds right away
  });

  it("release is ownership-safe: a stale token cannot delete a newer owner's claim", async () => {
    const r = fakeRedis();
    const stale = await acquireRetentionLock(r, "sub_1");
    r.store.delete("billing:retention:lock:sub_1"); // simulate TTL expiry of the stale claim
    const fresh = await acquireRetentionLock(r, "sub_1"); // new owner claims
    await releaseRetentionLock(r, "sub_1", stale as string); // late release from the expired claimer
    expect(r.store.get("billing:retention:lock:sub_1")).toBe(fresh); // newer claim survives
  });

  it("fails open when Redis is unavailable, and release is a safe no-op", async () => {
    const t = await acquireRetentionLock(null, "sub_1");
    expect(t).toBe("unlocked");
    await expect(releaseRetentionLock(null, "sub_1", t as "unlocked")).resolves.toBeUndefined();

    const broken = { async set() { throw new Error("redis down"); }, async delIfEquals() { throw new Error("redis down"); } } as unknown as SharedRedis;
    const t2 = await acquireRetentionLock(broken, "sub_1");
    expect(t2).toBe("unlocked"); // proceed without a claim
    await expect(releaseRetentionLock(broken, "sub_1", "some-token")).resolves.toBeUndefined(); // never throws
  });
});
