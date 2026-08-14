/**
 * AI Audit Stack engine — the product's moat (rules/weights), proven pure.
 *
 * The engine turns a questionnaire + tool catalog into the founder's 9-section
 * deck. These tests pin the properties that keep the recommendation HONEST and
 * the deck's numbers CORRECT:
 *  - a recommendation is always anchored in a matched pain (never invented);
 *  - the Impact–Effort matrix places tools by impact × setup effort;
 *  - Financial Impact = weeklyHours × 4.33 × rate − monthly tool cost;
 *  - already-owned tools are excluded; over-budget tools are demoted not hidden;
 *  - no match → honest-empty, not padding.
 */

import { describe, it, expect } from "vitest";
import {
  buildAuditReport,
  buildEntryResult,
  quadrantOf,
  scoreTool,
} from "../../apps/api/src/lib/ai-audit/engine";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import type { QuestionnaireAnswers, Tool } from "../../apps/api/src/lib/ai-audit/types";

const answers = (over: Partial<QuestionnaireAnswers> = {}): QuestionnaireAnswers => ({
  businessType: "agency",
  primaryFocus: "marketing",
  pains: ["content-volume", "repetitive-tasks"],
  hourlyRateUsd: 50,
  ...over,
});

describe("the seed catalog is well-formed", () => {
  it("every tool has non-negative numbers and at least one pain", () => {
    for (const t of SEED_CATALOG) {
      expect(t.monthlyCostUsd, t.id).toBeGreaterThanOrEqual(0);
      expect(t.hoursSavedWeekly, t.id).toBeGreaterThanOrEqual(0);
      expect(t.pains.length, t.id).toBeGreaterThan(0);
    }
  });
  it("tool ids are unique", () => {
    const ids = SEED_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("quadrantOf — the deck's 2×2", () => {
  const t = (impact: Tool["impact"], setupEffort: Tool["setupEffort"]): Tool => ({
    id: "x", name: "X", url: "", category: "ops", niches: [], pains: ["p"],
    monthlyCostUsd: 0, setupEffort, impact, hoursSavedWeekly: 1, oneLiner: "",
  });
  it("high impact + low effort = quick-win; high+high = major; low+low = fill-in; low+high = ignore", () => {
    expect(quadrantOf(t("high", "low"))).toBe("quick-win");
    expect(quadrantOf(t("high", "high"))).toBe("major-project");
    expect(quadrantOf(t("low", "low"))).toBe("fill-in");
    expect(quadrantOf(t("low", "high"))).toBe("ignore");
    // medium counts as high-impact / low-effort for the matrix
    expect(quadrantOf(t("medium", "medium"))).toBe("quick-win");
  });
});

describe("scoreTool — anchored in matched pains", () => {
  it("a tool matching none of the client's pains scores 0 and matches nothing", () => {
    const tool = SEED_CATALOG.find((x) => x.id === "hex")!; // data-analysis only
    const s = scoreTool(tool, answers({ pains: ["meeting-notes"] }));
    expect(s.matchedPains).toEqual([]);
    expect(s.score).toBeLessThanOrEqual(0 + 6); // no pain anchor; only intrinsic weights
  });
  it("more matched pains and niche/focus fit score higher", () => {
    const jasper = SEED_CATALOG.find((x) => x.id === "jasper")!; // marketing, agency niche
    const generic = SEED_CATALOG.find((x) => x.id === "chatgpt")!;
    const a = answers({ pains: ["content-volume", "seo-visibility"] });
    expect(scoreTool(jasper, a).score).toBeGreaterThan(scoreTool(generic, a).score);
  });
});

describe("buildAuditReport — the whole deck", () => {
  it("every recommended tool is anchored in at least one matched pain", () => {
    const r = buildAuditReport(answers(), SEED_CATALOG);
    expect(r.recommendedSolutions.length).toBeGreaterThan(0);
    for (const s of r.recommendedSolutions) {
      expect(s.matchedPains.length, s.tool.id).toBeGreaterThan(0);
    }
  });

  it("recommended solutions are capped at 6 and never include the 'ignore' cell", () => {
    const r = buildAuditReport(answers({ pains: SEED_CATALOG.flatMap((t) => t.pains) }), SEED_CATALOG);
    expect(r.recommendedSolutions.length).toBeLessThanOrEqual(6);
    const ignore = new Set(r.matrix.ignore.map((s) => s.tool.id));
    for (const s of r.recommendedSolutions) expect(ignore.has(s.tool.id)).toBe(false);
  });

  it("Financial Impact computes ROI from the recommended stack", () => {
    const r = buildAuditReport(answers(), SEED_CATALOG);
    const cost = r.recommendedSolutions.reduce((s, x) => s + x.tool.monthlyCostUsd, 0);
    const hours = r.recommendedSolutions.reduce((s, x) => s + x.tool.hoursSavedWeekly, 0);
    expect(r.financialImpact.totalMonthlyToolCostUsd).toBeCloseTo(cost, 2);
    expect(r.financialImpact.weeklyTimeReturnedHours).toBeCloseTo(hours, 2);
    expect(r.financialImpact.monthlyNetRoiUsd).toBeCloseTo(hours * 4.33 * 50 - cost, 2);
  });

  it("the 4-day plan is quick wins only, at most 4, numbered 1..n", () => {
    const r = buildAuditReport(answers({ pains: SEED_CATALOG.flatMap((t) => t.pains) }), SEED_CATALOG);
    expect(r.fourDayPlan.length).toBeLessThanOrEqual(4);
    const quickWinIds = new Set(r.quickWins.map((s) => s.tool.id));
    r.fourDayPlan.forEach((step, i) => {
      expect(step.day).toBe(i + 1);
      expect(quickWinIds.has(step.tool.id)).toBe(true);
    });
  });

  it("already-owned tools are excluded from recommendations", () => {
    const r = buildAuditReport(answers({ toolsInUse: ["chatgpt", "claude"] }), SEED_CATALOG);
    const ids = r.recommendedSolutions.map((s) => s.tool.id);
    expect(ids).not.toContain("chatgpt");
    expect(ids).not.toContain("claude");
  });

  it("over-budget tools are demoted (flagged) but not hidden", () => {
    // Intercom Fin ($99) addresses support-load; with a $30 cap it must still
    // appear (matched) but flagged overBudget and ranked below cheaper matches.
    const r = buildAuditReport(
      answers({ businessType: "saas", primaryFocus: "support", pains: ["customer-support-load"], maxMonthlyBudgetUsd: 30 }),
      SEED_CATALOG
    );
    const fin = [...r.recommendedSolutions, ...r.matrix["major-project"]].find((s) => s.tool.id === "intercom-fin");
    expect(fin, "intercom-fin should still surface").toBeTruthy();
    expect(fin!.overBudget).toBe(true);
  });

  it("no pain match anywhere → honest-empty, no padding", () => {
    const r = buildAuditReport(answers({ pains: ["a-pain-no-tool-has"] }), SEED_CATALOG);
    expect(r.empty).toBe(true);
    expect(r.recommendedSolutions).toEqual([]);
    expect(r.topPick).toBeNull();
    expect(r.topPickReason.toLowerCase()).toContain("human review");
  });

  it("the low-ticket entry picks ONE niche tool, never a household-name giant", () => {
    const e = buildEntryResult(answers(), SEED_CATALOG);
    expect(e.empty).toBe(false);
    expect(e.pick).not.toBeNull();
    // ChatGPT/Claude are marked isGeneric — the entry must not surface them.
    expect(e.pick!.tool.isGeneric).not.toBe(true);
    expect(["chatgpt", "claude"]).not.toContain(e.pick!.tool.id);
    // The upsell hook: it counts everything the full audit would rank, and
    // withholds all-but-one.
    expect(e.totalMatched).toBeGreaterThan(1);
    expect(e.withheldCount).toBe(e.totalMatched - 1);
  });

  it("the entry prefers a tool whose niche matches the client's business type", () => {
    // An agency should get an agency-niche tool, not a generic-niche one.
    const e = buildEntryResult(answers({ businessType: "agency", primaryFocus: "marketing" }), SEED_CATALOG);
    expect(e.pick!.tool.niches).toContain("agency");
  });

  it("the entry is honest-empty (never a giant) when no niche tool matches", () => {
    // Only content-volume, and among matches the sole non-giant niche fit... if
    // we strip niches, it still must not return a giant.
    const e = buildEntryResult(answers({ pains: ["a-pain-no-tool-has"] }), SEED_CATALOG);
    expect(e.empty).toBe(true);
    expect(e.pick).toBeNull();
    expect(e.reason.toLowerCase()).toContain("full audit");
  });

  it("no client-facing string contains an em-dash (brand copy rule, 14/08)", () => {
    // Founder rule: zero em-dash (travessao) in ANY copy. Pin it on the strings
    // the engine generates, plus every seed one-liner, so copy can't regress.
    const report = buildAuditReport(answers({ pains: SEED_CATALOG.flatMap((t) => t.pains) }), SEED_CATALOG);
    const entry = buildEntryResult(answers(), SEED_CATALOG);
    const strings = [
      report.painSummary, report.outcomeSummary, report.topPickReason,
      ...report.fourDayPlan.map((s) => s.action),
      entry.reason,
      ...SEED_CATALOG.map((t) => t.oneLiner),
    ];
    for (const s of strings) {
      expect(s, `em-dash found in: "${s}"`).not.toContain("—");
    }
  });

  it("a real agency/marketing intake produces a coherent, ordered deck", () => {
    const r = buildAuditReport(answers(), SEED_CATALOG);
    expect(r.empty).toBe(false);
    expect(r.topPick).not.toBeNull();
    // hours reclaimed headline equals the quick wins' hours
    const qwHours = r.quickWins.reduce((s, x) => s + x.tool.hoursSavedWeekly, 0);
    expect(r.hoursReclaimedWeekly).toBeCloseTo(qwHours, 2);
    // recommendations are in non-increasing score order
    const scores = r.recommendedSolutions.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
