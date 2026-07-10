/**
 * Unit tests for landing-v2-logic.ts pure helpers.
 * No snapshot tests. Only pure functions tested here (same convention as
 * components/marketing/WaitlistForm.test.ts).
 */

import { describe, it, expect } from "vitest";
import {
  REAL_SCORE,
  ringOffset,
  subScoreWidthPct,
  heroLoopPct,
  nextHeroTick,
  heroGrowth,
  aiAnswerSim,
  AI_ANSWER_TOKENS,
  AI_ANSWER_CITATION_INDEX,
  kitSim,
  KIT_PAGES,
} from "./landing-v2-logic";

describe("REAL_SCORE", () => {
  it("matches the 2026-07-10 self-audit snapshot", () => {
    expect(REAL_SCORE.overall).toBe(73);
    expect(REAL_SCORE.visibility).toBe(54);
    expect(REAL_SCORE.citationReadiness).toBe(82);
    expect(REAL_SCORE.execution).toBe(0);
  });
});

describe("ringOffset", () => {
  it("is full circumference at score 0", () => {
    expect(ringOffset(0)).toBe(339);
  });

  it("is ~91.6 at score 73 (the real overall score)", () => {
    expect(ringOffset(73)).toBeCloseTo(339 * (1 - 73 / 100), 5);
  });

  it("clamps above 100", () => {
    expect(ringOffset(150)).toBe(0);
  });

  it("clamps below 0", () => {
    expect(ringOffset(-10)).toBe(339);
  });
});

describe("subScoreWidthPct", () => {
  it("is 0 while score is 0 regardless of target", () => {
    expect(subScoreWidthPct(82, 0)).toBe(0);
  });

  it("reaches the full target once score reaches REAL_SCORE.overall", () => {
    expect(subScoreWidthPct(82, REAL_SCORE.overall)).toBe(82);
    expect(subScoreWidthPct(54, REAL_SCORE.overall)).toBe(54);
  });

  it("Execution always renders 0%, at any point in the animation — honesty rule", () => {
    expect(subScoreWidthPct(0, 0)).toBe(0);
    expect(subScoreWidthPct(0, 40)).toBe(0);
    expect(subScoreWidthPct(0, REAL_SCORE.overall)).toBe(0);
  });

  it("is proportional mid-animation", () => {
    // At score=36.5 (half of 73), an 82-target bar should be ~half filled.
    expect(subScoreWidthPct(82, 36.5)).toBe(41);
  });
});

describe("heroLoopPct", () => {
  it("is ~5% on the very first tick", () => {
    expect(heroLoopPct(0, 0)).toBe(5); // round(1/21*100)
  });

  it("is 100% on the final tick of the final scene", () => {
    expect(heroLoopPct(2, 6)).toBe(100); // round(21/21*100)
  });

  it("is continuous across a scene boundary", () => {
    // last tick of scene 0 (tick 6) then first tick of scene 1 (tick 0)
    const before = heroLoopPct(0, 6);
    const after = heroLoopPct(1, 0);
    expect(after).toBeGreaterThan(before);
  });
});

describe("nextHeroTick", () => {
  it("increments tick within a scene", () => {
    expect(nextHeroTick(0, 0)).toEqual({ scene: 0, tick: 1 });
    expect(nextHeroTick(1, 5)).toEqual({ scene: 1, tick: 6 });
  });

  it("advances to the next scene after 7 ticks (0-6)", () => {
    expect(nextHeroTick(0, 6)).toEqual({ scene: 1, tick: 0 });
  });

  it("wraps from the last scene (2) back to scene 0", () => {
    expect(nextHeroTick(2, 6)).toEqual({ scene: 0, tick: 0 });
  });
});

describe("heroGrowth", () => {
  it("is inert (week 1, no progress) outside scene 1", () => {
    const g0 = heroGrowth(0, 6);
    expect(g0.growWeek).toBe("WEEK 1");
    const yourBrand0 = g0.competitors.find((c) => c.name === "yourbrand.com")!;
    expect(yourBrand0.bar).toBe("22%");

    const g2 = heroGrowth(2, 6);
    expect(g2.growWeek).toBe("WEEK 1");
  });

  it("progresses week + your-brand bar within scene 1", () => {
    const start = heroGrowth(1, 0);
    expect(start.growWeek).toBe("WEEK 1");
    const end = heroGrowth(1, 5);
    expect(end.growWeek).toBe("WEEK 8");
    const yourBrandEnd = end.competitors.find((c) => c.name === "yourbrand.com")!;
    expect(yourBrandEnd.bar).toBe("78%");
  });

  it("swaps the honesty-pass growNote copy at the p=0.5 midpoint", () => {
    expect(heroGrowth(1, 0).growNote).toBe("You're being skipped — but watch what the fixes do.");
    expect(heroGrowth(1, 5).growNote).toBe("Every fix you ship is tracked here.");
  });

  it("never uses gold for any competitor bar (brand rule: gold is OrganicPosts-only)", () => {
    const g = heroGrowth(1, 3);
    for (const c of g.competitors) {
      expect(c.barColor.toLowerCase()).not.toContain("e6a93f");
    }
  });
});

describe("aiAnswerSim", () => {
  it("idle state shows the fully-cited finished answer", () => {
    const s = aiAnswerSim(false, 0);
    expect(s.idle).toBe(true);
    expect(s.revealedCount).toBe(AI_ANSWER_TOKENS.length);
    expect(s.cited).toBe(true);
    expect(s.badge).toBe("CITED ✓");
  });

  it("reveals nothing at tick 0 while playing", () => {
    const s = aiAnswerSim(true, 0);
    expect(s.revealedCount).toBe(0);
    expect(s.cited).toBe(false);
    expect(s.badge).toBe("ANSWERING…");
    expect(s.caption).toBe("Someone asks AI for recommendations…");
  });

  it("flips to cited once the citation token is revealed", () => {
    const before = aiAnswerSim(true, 3); // revealedCount = 6, index 7 not yet shown
    expect(before.revealedCount).toBe(6);
    expect(before.cited).toBe(false);

    const after = aiAnswerSim(true, 4); // revealedCount = 8 > citation index 7
    expect(after.revealedCount).toBe(8);
    expect(after.cited).toBe(true);
    expect(after.badge).toBe("CITED ✓");
  });

  it("settles on the final caption once streaming passes tick 6", () => {
    const s = aiAnswerSim(true, 7);
    expect(s.caption).toBe("There you are. Cited.");
  });

  it("reveals the full answer by tick 8", () => {
    const s = aiAnswerSim(true, 8);
    expect(s.revealedCount).toBe(AI_ANSWER_TOKENS.length);
  });

  it("citation index points at the yourbrand.com token", () => {
    expect(AI_ANSWER_TOKENS[AI_ANSWER_CITATION_INDEX]).toBe("yourbrand.com");
  });
});

describe("kitSim", () => {
  it("idle state shows all 3 pages live and 6 citations", () => {
    const s = kitSim(false, 0);
    expect(s.idle).toBe(true);
    expect(s.pages.every((p) => p.live)).toBe(true);
    expect(s.cites).toBe(6);
    expect(s.kitStatus).toBe("3 PAGES · READY TO PUBLISH");
  });

  it("flips one page LIVE every 2 ticks while playing", () => {
    expect(kitSim(true, 0).pages.map((p) => p.live)).toEqual([false, false, false]);
    expect(kitSim(true, 2).pages.map((p) => p.live)).toEqual([true, false, false]);
    expect(kitSim(true, 4).pages.map((p) => p.live)).toEqual([true, true, false]);
    expect(kitSim(true, 6).pages.map((p) => p.live)).toEqual([true, true, true]);
  });

  it("citations climb from 3 to 6 after publishing completes", () => {
    expect(kitSim(true, 3).cites).toBe(3);
    expect(kitSim(true, 6).cites).toBe(3);
    expect(kitSim(true, 7).cites).toBe(4);
    expect(kitSim(true, 9).cites).toBe(6);
  });

  it("final status + caption use the honesty-pass copy, not the original claims", () => {
    const done = kitSim(true, 7);
    expect(done.kitStatus).toBe("DONE — PAGES LIVE");
    expect(done.kitCaption).toBe("Publish, get re-crawled, become quotable.");
    expect(done.kitResult).toBe("AI can now quote your FAQ.");
  });

  it("covers exactly the 3 promised pages", () => {
    expect(KIT_PAGES.map((p) => p.slug)).toEqual(["faq", "compare", "schema"]);
  });
});
