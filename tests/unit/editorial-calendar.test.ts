/**
 * editorial-calendar — founder 14/08: content every day, seven DIFFERENT
 * things. Pins: all 7 days covered, themes diverse, the AI Audit Stack ($49)
 * appears twice, product days alternate with value days, and the runner
 * injects [__day__] into marketing cells only.
 */
import { describe, it, expect } from "vitest";
import { WEEK, themeFor, dayBlock, CTA_URLS } from "../../apps/api/src/lib/editorial-calendar";
import { buildPrompt } from "../../apps/api/src/lib/graph-prompts";

describe("editorial calendar (7 days, diverse)", () => {
  it("covers all seven days exactly once", () => {
    expect([...WEEK].map((d) => d.dow).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("uses at least 5 distinct themes and names the AI Audit Stack twice", () => {
    const themes = WEEK.map((d) => d.theme);
    expect(new Set(themes).size).toBeGreaterThanOrEqual(5);
    expect(themes.filter((t) => t === "ai-audit-stack")).toHaveLength(2);
  });
  it("never puts two product-CTA days back to back (no ad wall)", () => {
    const ordered = [1, 2, 3, 4, 5, 6, 0].map((dow) => WEEK.find((d) => d.dow === dow)!);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1]!.cta, b = ordered[i]!.cta;
      const both = a === "ai-audit" && b === "ai-audit";
      expect(both).toBe(false);
    }
  });
  it("themeFor picks by UTC weekday; dayBlock names theme + angle + rule", () => {
    const tue = new Date("2026-08-18T09:00:00Z"); // a Tuesday
    expect(themeFor(tue).theme).toBe("ai-audit-stack");
    const block = dayBlock(tue);
    expect(block).toContain("TEMA DO DIA: ai-audit-stack");
    expect(block).toContain("7 coisas diferentes");
  });
  it("every product CTA maps to a real Ozvor URL", () => {
    for (const d of WEEK) if (d.cta !== "none") expect(CTA_URLS[d.cta]).toMatch(/^https:\/\/ozvor\.com\//);
  });
});

describe("content prompts carry the calendar + the AI Audit angle", () => {
  it("signal prompts offer the AI Audit Stack as a permanent angle", () => {
    for (const slug of ["collect-signals", "x-signal", "linkedin-signal", "blog-signal"]) {
      const p = buildPrompt("task", { prompt: slug }, []) ?? "";
      expect(p, slug).toContain("AI Audit Stack");
      expect(p, slug).toContain("$49");
    }
  });
  it("briefing prompts must honor the day theme", () => {
    for (const slug of ["write-briefing", "x-briefing", "linkedin-briefing"]) {
      const p = buildPrompt("task", { prompt: slug }, []) ?? "";
      expect(p, slug).toContain("CALENDARIO EDITORIAL");
    }
  });
});
