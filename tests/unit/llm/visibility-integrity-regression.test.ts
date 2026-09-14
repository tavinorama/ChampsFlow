import { afterEach, describe, expect, it, vi } from "vitest";
import { SerpProbeAdapter } from "../../../packages/llm/src/providers/serp";
import { getCachedProbe, setCachedProbe, probeCacheKey } from "../../../packages/llm/src/probe-cache";
import { assertBrandVerificationComplete, countsAsCitation } from "../../../packages/llm/src/extraction";
import type { ExtractionResult, VerifiedMention } from "../../../packages/llm/src/extraction";
import { isAuditFailurePermanent } from "../../../packages/shared/src/audit-queue";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const identity = { tenantId: "t1", brandId: "b1", brandName: "Acme", market: "US", surface: "web" };
const query = { brandName: "Acme", queryText: "Is Acme better than Rival?", queryHash: "q" };

describe("evaluated aggregate identity", () => {
  it("isolates each brand, tenant, market and surface, and preserves absence", async () => {
    const map = new Map<string, string>();
    const store = { get: async (k: string) => map.get(k) ?? null,
      set: async (k: string, v: string) => { map.set(k, v); } };
    await setCachedProbe(store, { provider: "serp", queryHash: "q", rawText: "sentinel", mentioned: false,
      position: null, sources: [], absent: true, runs: 2, mentionRate: 0 }, "2.2", identity);
    expect((await getCachedProbe(store, "q", "serp", "2.2", identity))?.absent).toBe(true);
    for (const key of Object.keys(identity) as Array<keyof typeof identity>) {
      expect(await getCachedProbe(store, "q", "serp", "2.2", { ...identity, [key]: "other" })).toBeNull();
    }
    // A payload transplanted under another valid key cannot cross identities.
    const other = { ...identity, brandName: "Rival" };
    map.set(probeCacheKey("q", "serp", "2.2", other), [...map.values()][0]!);
    expect(await getCachedProbe(store, "q", "serp", "2.2", other)).toBeNull();
  });
});

describe("SERP source contract (mocked fetch, no paid calls)", () => {
  function response(items: unknown, status = 20000) {
    vi.stubEnv("SERP_API_KEY", "unit-test-placeholder");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () =>
      ({ status_code: 20000, tasks: [{ status_code: status, result: [{ items }] }] }) }));
  }
  it("genuine absence never parses a question containing either brand", async () => {
    response([]);
    const r = await new SerpProbeAdapter().probe(query);
    expect(r.absent).toBe(true);
    expect(r.mentioned).toBe(false);
  });
  it.each([
    ["empty shell", [{ type: "ai_overview", items: [] }], 20000],
    ["malformed result", undefined, 20000],
    ["vendor failure inside HTTP 200", [], 40102],
  ])("%s is collection failure, never a negative observation", async (_name, items, status) => {
    response(items, status as number);
    await expect(new SerpProbeAdapter().probe(query)).rejects.toThrow(/collection_failed/);
  });
  it("parses real overview text", async () => {
    response([{ type: "ai_overview", text: "Acme is our recommended option." }]);
    const r = await new SerpProbeAdapter().probe(query);
    expect(r.absent).toBe(false);
    expect(r.mentioned).toBe(true);
  });
});

describe("unknown verification cannot enter the paid scoring path", () => {
  it.each(["UNVERIFIED", "UNVERIFIED_CAP"] as const)("%s is pending, not citation or rejection", (verdict) => {
    const mention = { verdict, kind_confirmed: "direct_recommendation" } as VerifiedMention;
    expect(countsAsCitation(mention)).toBe(false);
    const result = { extraction_mode: "two_pass", brand_verification_pending: true } as ExtractionResult;
    expect(() => assertBrandVerificationComplete([result])).toThrow(/citation_verification_pending/);
    expect(isAuditFailurePermanent("citation_verification_pending")).toBe(true);
  });
  it("completed verification passes", () => {
    expect(() => assertBrandVerificationComplete([{ extraction_mode: "two_pass", brand_verification_pending: false } as ExtractionResult])).not.toThrow();
  });
});
