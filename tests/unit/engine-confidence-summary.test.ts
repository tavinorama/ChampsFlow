/**
 * engine-confidence-summary.test.ts — B4 (Codex D23, 23/09).
 * The production case: a five-engine audit whose confidence line said
 * "All 3 engines passed" because two engines came back with no status and
 * were dropped.
 */
import { describe, it, expect } from "vitest";
import { summarizeEngineConfidence } from "../../apps/web/src/lib/engine-confidence-summary";

const H = (engine: string, status: string | null) => ({ engine, status, checked_at: status ? "2026-09-21T03:30:00Z" : null });

describe("summarizeEngineConfidence", () => {
  it("two engines without a battery are said and counted — never 'All 3 engines passed'", () => {
    const s = summarizeEngineConfidence([H("openai", "healthy"), H("anthropic", "healthy"), H("perplexity", "healthy"), H("gemini", null), H("serp", null)]);
    expect(s.kind).toBe("partial");
    expect((s as { text: string }).text).toBe(
      "3 of 5 engines passed their control checks on the day of this audit; Gemini and Google AI Overviews were not checked that day."
    );
    expect((s as { text: string }).text).not.toContain("All 3");
  });
  it("'All N' only when every engine was checked and healthy", () => {
    const s = summarizeEngineConfidence(["openai", "anthropic", "perplexity", "gemini", "serp"].map((e) => H(e, "healthy")));
    expect(s).toEqual({ kind: "all_good", text: "All 5 engines passed their control checks on the day of this audit." });
  });
  it("a shaky engine is named, and unchecked ones are still mentioned", () => {
    const s = summarizeEngineConfidence([H("anthropic", "failing"), H("openai", "healthy"), H("serp", null)]);
    expect(s.kind).toBe("shaky");
    expect((s as { text: string }).text).toContain("Claude was unstable on the day of this audit");
    expect((s as { text: string }).text).toContain("Google AI Overviews was not checked that day");
  });
  it("nothing checked at all → silent (a row of 'not checked' for every engine is noise)", () => {
    expect(summarizeEngineConfidence([H("openai", null), H("serp", null)])).toEqual({ kind: "silent" });
    expect(summarizeEngineConfidence([])).toEqual({ kind: "silent" });
    expect(summarizeEngineConfidence(null)).toEqual({ kind: "silent" });
  });
  it("uses the route's label when present", () => {
    const s = summarizeEngineConfidence([{ engine: "serp", label: "Google AI Overviews", status: "degraded" }]);
    expect((s as { text: string }).text).toContain("Google AI Overviews was unstable");
  });
});
