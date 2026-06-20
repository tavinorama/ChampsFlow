/**
 * site-crawl.test.ts — honest neutral-baseline behaviour when no domain is given
 * (the path that runs on every domainless audit). Network paths are covered by
 * the SSRF guard tests + e2e; here we lock the deterministic baseline contract.
 */
import { describe, it, expect } from "vitest";
import { crawlSite } from "../../../packages/llm/src/site-crawl";

describe("crawlSite — no domain → honest neutral baselines", () => {
  it("returns reachable=false with 0.5 baselines when domain is null", async () => {
    const r = await crawlSite(null);
    expect(r.reachable).toBe(false);
    expect(r.performance.schemaCoverage).toBe(0.5);
    expect(r.performance.aiCrawlerAccess).toBe(0.5);
    expect(r.performance.llmsTxtPresent).toBe(false);
    expect(r.brand.entityCompleteness).toBe(0.5);
    expect(r.brand.eeaSignal).toBe(0.5);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("treats empty/whitespace domain the same as null", async () => {
    const r = await crawlSite("   ");
    expect(r.reachable).toBe(false);
  });
});
