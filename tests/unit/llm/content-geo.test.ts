/**
 * content-geo.test.ts — deterministic no-domain baseline (runs on every
 * domainless audit). Trait weights + analyzed=false contract.
 */
import { describe, it, expect } from "vitest";
import { analyzeContentGeo } from "../../../packages/llm/src/content-geo";

describe("analyzeContentGeo — no domain", () => {
  it("returns analyzed=false + 0.5 baseline + the five Princeton traits", async () => {
    const r = await analyzeContentGeo(null);
    expect(r.analyzed).toBe(false);
    expect(r.pagesAnalyzed).toBe(0);
    expect(r.contentScore).toBeGreaterThanOrEqual(0);
    expect(r.contentScore).toBeLessThanOrEqual(1);
    expect(Object.keys(r.traits).sort()).toEqual(
      ["answerShaped", "depth", "quotations", "sourcedClaims", "statistics"]
    );
  });
});
