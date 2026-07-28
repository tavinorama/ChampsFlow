/**
 * probe-cache.test.ts — B8 aggregated probe cache (hit / miss / bypass).
 *
 * The cache stores WHOLE aggregated multi-run probes keyed by
 * geoprobe:{query_hash}|{engine}|{methodology_version} with a 24h TTL, and is
 * fail-open: any store error reads as a miss / no-op. Individual generations
 * are never cached — only completed aggregates (enforced by the worker calling
 * setCachedProbe only after the sampling protocol finishes for a pair).
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  probeCacheEnabled,
  probeCacheKey,
  getCachedProbe,
  setCachedProbe,
  PROBE_CACHE_TTL_SECONDS,
} from "../../../packages/llm/src/probe-cache";
import type { ProbeCacheStore } from "../../../packages/llm/src/probe-cache";
import type { ProbeResponse } from "../../../packages/llm/src/providers/types";

class FakeStore implements ProbeCacheStore {
  entries = new Map<string, { value: string; ttl: number }>();
  async get(key: string): Promise<string | null> {
    return this.entries.get(key)?.value ?? null;
  }
  async set(key: string, value: string, _mode: "EX", ttlSeconds: number): Promise<unknown> {
    this.entries.set(key, { value, ttl: ttlSeconds });
    return "OK";
  }
}

function liveResponse(overrides: Partial<ProbeResponse> = {}): ProbeResponse {
  return {
    provider: "openai",
    queryHash: "abc123",
    queryText: "What is the best CRM for small businesses?",
    runs: 3,
    mentionRate: 2 / 3,
    rawText: "Acme is a solid choice for SMBs.",
    mentioned: true,
    position: 2,
    sources: ["https://example.com/review"],
    ...overrides,
  };
}

const V = "2.0";

describe("probeCacheKey", () => {
  it("follows the geoprobe:{hash}|{engine}|{version} contract", () => {
    expect(probeCacheKey("abc123", "openai", "2.0")).toBe("geoprobe:abc123|openai|2.0");
  });
});

describe("probeCacheEnabled (GEO_PROBE_CACHE)", () => {
  const original = process.env["GEO_PROBE_CACHE"];
  afterEach(() => {
    if (original === undefined) delete process.env["GEO_PROBE_CACHE"];
    else process.env["GEO_PROBE_CACHE"] = original;
  });

  it("defaults ON when the env var is unset", () => {
    delete process.env["GEO_PROBE_CACHE"];
    expect(probeCacheEnabled()).toBe(true);
  });

  it('"0" disables the cache', () => {
    process.env["GEO_PROBE_CACHE"] = "0";
    expect(probeCacheEnabled()).toBe(false);
  });

  it("any other value keeps it ON", () => {
    process.env["GEO_PROBE_CACHE"] = "1";
    expect(probeCacheEnabled()).toBe(true);
  });
});

describe("set → get roundtrip (hit)", () => {
  it("returns the aggregated probe with fromCache=true and a 24h TTL", async () => {
    const store = new FakeStore();
    const resp = liveResponse();
    await setCachedProbe(store, resp, V);

    const entry = store.entries.get(probeCacheKey("abc123", "openai", V));
    expect(entry).toBeDefined();
    expect(entry!.ttl).toBe(PROBE_CACHE_TTL_SECONDS);
    expect(PROBE_CACHE_TTL_SECONDS).toBe(86_400);

    const hit = await getCachedProbe(store, "abc123", "openai", V);
    expect(hit).not.toBeNull();
    expect(hit!.fromCache).toBe(true);
    expect(hit).toMatchObject({
      provider: "openai",
      queryHash: "abc123",
      runs: 3,
      mentionRate: 2 / 3,
      mentioned: true,
      position: 2,
      sources: ["https://example.com/review"],
    });
    expect(hit!.rawText).toBe(resp.rawText);
  });

  it("caps the stored snippet at 2000 chars", async () => {
    const store = new FakeStore();
    await setCachedProbe(store, liveResponse({ rawText: "x".repeat(5000) }), V);
    const hit = await getCachedProbe(store, "abc123", "openai", V);
    expect(hit!.rawText).toHaveLength(2000);
  });
});

describe("misses", () => {
  it("empty store → null", async () => {
    expect(await getCachedProbe(new FakeStore(), "abc123", "openai", V)).toBeNull();
  });

  it("methodology version is part of the key — a protocol bump invalidates old entries", async () => {
    const store = new FakeStore();
    await setCachedProbe(store, liveResponse(), "2.0");
    expect(await getCachedProbe(store, "abc123", "openai", "1.0")).toBeNull();
    expect(await getCachedProbe(store, "abc123", "openai", "2.0")).not.toBeNull();
  });

  it("corrupt JSON → null (never fabricated data)", async () => {
    const store = new FakeStore();
    store.entries.set(probeCacheKey("abc123", "openai", V), { value: "{not json", ttl: 1 });
    expect(await getCachedProbe(store, "abc123", "openai", V)).toBeNull();
  });

  it("entry whose payload contradicts the key (provider/hash mismatch) → null", async () => {
    const store = new FakeStore();
    await setCachedProbe(store, liveResponse(), V);
    const entry = store.entries.get(probeCacheKey("abc123", "openai", V))!;
    // Simulate a mis-keyed write: same key, payload claims another engine.
    store.entries.set(probeCacheKey("abc123", "serp", V), entry);
    expect(await getCachedProbe(store, "abc123", "serp", V)).toBeNull();
  });

  it("invalid runs / mentionRate in payload → null", async () => {
    const store = new FakeStore();
    const key = probeCacheKey("abc123", "openai", V);
    store.entries.set(key, {
      value: JSON.stringify({ v: 1, provider: "openai", queryHash: "abc123", runs: 0, mentionRate: 0.5 }),
      ttl: 1,
    });
    expect(await getCachedProbe(store, "abc123", "openai", V)).toBeNull();
    store.entries.set(key, {
      value: JSON.stringify({ v: 1, provider: "openai", queryHash: "abc123", runs: 3, mentionRate: 1.7 }),
      ttl: 1,
    });
    expect(await getCachedProbe(store, "abc123", "openai", V)).toBeNull();
  });
});

describe("write bypasses", () => {
  it("refuses to re-cache a result that itself came from the cache (no TTL renewal)", async () => {
    const store = new FakeStore();
    await setCachedProbe(store, liveResponse({ fromCache: true }), V);
    expect(store.entries.size).toBe(0);
  });

  it("refuses results without a queryHash or with zero runs", async () => {
    const store = new FakeStore();
    await setCachedProbe(store, liveResponse({ queryHash: undefined }), V);
    await setCachedProbe(store, liveResponse({ runs: 0 }), V);
    expect(store.entries.size).toBe(0);
  });
});

describe("fail-open on store errors", () => {
  const broken: ProbeCacheStore = {
    get: async () => {
      throw new Error("redis down");
    },
    set: async () => {
      throw new Error("redis down");
    },
  };

  it("get error reads as a miss", async () => {
    expect(await getCachedProbe(broken, "abc123", "openai", V)).toBeNull();
  });

  it("set error is swallowed", async () => {
    await expect(setCachedProbe(broken, liveResponse(), V)).resolves.toBeUndefined();
  });
});
