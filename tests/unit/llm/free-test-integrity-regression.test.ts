import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../packages/llm/src/providers/gateway", () => ({ runProbes: vi.fn() }));
import { runProbes } from "../../../packages/llm/src/providers/gateway";
import { runInvisibilityTest } from "../../../packages/llm/src/invisibility-test";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("free-test evidence boundary", () => {
  it("does not turn an absent AIO sentinel into a brand or competitor citation", async () => {
    vi.stubEnv("SERP_API_KEY", "unit-test-placeholder");
    vi.mocked(runProbes).mockResolvedValue({ responses: [{ provider: "serp", absent: true,
      rawText: 'Google AI Overview for "Acme vs Rival" — no AI Overview block returned in this snapshot.',
      mentioned: false, position: null, sources: [] }], blockedProviders: [], failedProviders: [] });
    const result = await runInvisibilityTest("Acme", "Rival", "CRM");
    expect(result.brandEngineCount).toBe(0);
    expect(result.competitorEngineCount).toBe(0);
    expect(result.breakdown.ai.citationRate).toBe(0);
  });
  it("F-A (14/09): a partially collected panel is published WITH the failed engine labelled not-measured — never a 502, never a miss", async () => {
    const onUsage = vi.fn();
    vi.stubEnv("SERP_API_KEY", "unit-test-placeholder");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    vi.mocked(runProbes).mockResolvedValue({
      responses: [{ provider: "openai", rawText: "Acme is the option I would pick.", mentioned: true, position: 1, sources: [] }],
      blockedProviders: [],
      failedProviders: [{ provider: "serp", error: "collection_failed: empty AI Overview shell" }],
    });
    const result = await runInvisibilityTest("Acme", null, "CRM", "US", null, { onUsage });
    expect(onUsage).toHaveBeenCalledOnce();
    expect(result.notMeasured).toEqual(["serp"]);
    expect(result.engines.map((e) => e.engine)).not.toContain("serp");
    expect(result.totalEngines).toBe(1); // the failed engine is in NO denominator
    expect(result.breakdown.ai.note).toContain("Not measured this run (collection failed): serp");
  });

  it("when NO engine answered there is nothing to publish: collection_failed, usage still reported first", async () => {
    const onUsage = vi.fn();
    vi.mocked(runProbes).mockResolvedValue({ responses: [], blockedProviders: [],
      failedProviders: [{ provider: "serp", error: "collection_failed" }] });
    await expect(runInvisibilityTest("Acme", null, "CRM", "US", null, { onUsage })).rejects.toThrow(/collection_failed/);
    expect(onUsage).toHaveBeenCalledOnce();
  });
});
