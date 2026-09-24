/**
 * content-facts.test.ts — the content cells write from true material, and
 * invented people are vetoed.
 *
 * Measured 19/09 on the Postiz calendar of 14–20/09: ~14 of 58 scheduled pieces
 * opened with a made-up owner, a shop and a closing hour; at least 5 told
 * first-person stories about clients, neighbours and friends that do not exist.
 * The prompts asked for "a real scene" and supplied none.
 */
import { describe, it, expect } from "vitest";
import { CONTENT_FACTS, factsBlock } from "../../apps/api/src/lib/content-facts";
import { buildPrompt, ANTI_GENERIC_RULE, ANGLE_SOURCES_RULE, NO_INVENTED_PEOPLE_RULE } from "../../apps/api/src/lib/graph-prompts";
import { shapeOnlyText } from "../../packages/shared/src/graph-metric-containment";

describe("[__facts__] — true, dated, sourced material", () => {
  it("every fact says where to check it, carries a lesson, names no customer and expires", () => {
    expect(CONTENT_FACTS.length).toBeGreaterThanOrEqual(5);
    for (const f of CONTENT_FACTS) {
      expect(f.source.length, f.id).toBeGreaterThan(20);
      expect(f.lesson.length, f.id).toBeGreaterThan(20);
      expect(f.until, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.fact, f.id).not.toMatch(/\b(our|a|my) (client|customer)\b/i);
    }
  });

  it("an expired fact leaves the block; when all expire the block is ABSENT, never a placeholder", () => {
    const facts = [{ id: "old", fact: "f", source: "s", lesson: "l", asOf: "2026-08-01", counts: "c", until: "2026-09-01" }];
    expect(factsBlock(new Date("2026-09-20T00:00:00Z"), facts)).toBeNull();
    const live = factsBlock(new Date("2026-09-20T00:00:00Z"));
    expect(live).toContain("UNICA fonte permitida de cena");
    expect(live).toContain("[impressions-2bn-was-27]");
    expect(factsBlock(new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });
});

describe("P17 — a fact is a dated snapshot, never today's state", () => {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  it("every fact carries the date it was read, no later than its expiry, and names what it counts", () => {
    for (const f of CONTENT_FACTS) {
      expect(f.asOf, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.asOf <= f.until, f.id).toBe(true);
      expect(f.counts.trim().length, f.id).toBeGreaterThan(10);
    }
  });

  it("the fact TEXT says its own date, so a piece that copies it cannot sound like today", () => {
    for (const f of CONTENT_FACTS) {
      const year = f.asOf.slice(0, 4);
      const month = MONTHS[Number(f.asOf.slice(5, 7)) - 1]!;
      expect(f.fact, f.id).toContain(year);
      expect(f.fact, f.id).toContain(month);
      expect(f.fact, f.id).not.toMatch(/\b(right now|currently|so far|to date|as of today)\b/i);
    }
  });

  it("the block renders the read date and the unit, and forbids retelling a fact as the present", () => {
    const block = factsBlock(new Date("2026-09-22T09:00:00Z"))!;
    expect(block).toContain("Cada fato e uma FOTO com data");
    expect(block).toContain("NUNCA conte um fato como o estado de hoje");
    for (const f of CONTENT_FACTS) {
      expect(block).toContain(`[${f.id}] (lido em ${f.asOf}`);
      expect(block).toContain(`(conta: ${f.counts})`);
    }
  });

  it("the cold-email fact no longer says every reply was a no — by 21/09 one said yes", () => {
    const f = CONTENT_FACTS.find((x) => x.id.startsWith("cold-483"))!;
    expect(f.id).toBe("cold-483-first-three-days");
    expect(f.fact).toContain("17 to 19 September 2026");
    expect(f.fact).toContain("by 21 September, 684 people had been emailed and 9 had replied");
    expect(f.fact).toContain("emailed 483 people");
    expect(f.fact).not.toContain("483 cold emails");
  });

  it("the index fact names its unit: answers collected, not checks of buyers", () => {
    const f = CONTENT_FACTS.find((x) => x.id === "score-52-was-15-of-102")!;
    expect(f.fact).toContain("15 of the 102 answers collected that day");
    expect(f.counts).toContain("not questions and not buyers");
  });
});

describe("the prompts no longer manufacture the same post", () => {
  const SIGNALS = ["x-signal", "linkedin-signal", "instagram-signal", "tiktok-signal", "youtube-signal"];

  it("no signal prompt carries the fixed five-theme list; every one names where an angle may come from", () => {
    for (const slug of SIGNALS) {
      const p = buildPrompt("task", { prompt: slug }, []) ?? "";
      expect(p, slug).not.toContain("o fim do SEO como era");
      expect(p, slug).not.toContain("marcas sumindo das respostas de IA");
      expect(p, slug).toContain(ANGLE_SOURCES_RULE);
      expect(p, slug).toContain("SEM FONTE HOJE");
      expect(p, slug).toContain("PERGUNTA direta ao leitor");
    }
  });

  it("drafts forbid invented people, and the critic vetoes them by name", () => {
    const draft = buildPrompt("task", { prompt: "linkedin-draft", style: "story" }, []) ?? "";
    expect(draft).toContain(NO_INVENTED_PEOPLE_RULE);
    expect(draft).toContain("so de [__facts__] ou [__proof__]");
    expect(draft).not.toContain("uma cena real no comeco, a licao no fim");
    expect(ANTI_GENERIC_RULE).toContain("'VETO: inventado'");
    expect(ANTI_GENERIC_RULE).toContain("'VETO: sem fonte'");
  });
});

describe("shapeOnlyText — the recent block keeps the shape and loses every figure", () => {
  it("removes the figures that G03 quarantined, keeps the words", () => {
    const out = shapeOnlyText("Yesterday our page hit 2.08 billion impressions. 94% of owners, $49, 15 of 102 checks. Ask me how.");
    expect(out).not.toMatch(/\d/);
    expect(out).toContain("Yesterday our page hit");
    expect(out).toContain("Ask me how.");
  });
});
