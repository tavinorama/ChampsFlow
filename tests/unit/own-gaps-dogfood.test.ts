/**
 * own-gaps-dogfood.test.ts — Visibility Loop v2 Phase 4.
 *
 * Our own brand's open Do Next cards feed the content machine as [__gaps__],
 * pattern-copying [__signals__]. What must hold: never invent (empty list is
 * an explicit SEM DADO line, not an empty block), highest priority first, the
 * artifact is wired into the runner's marketing path, and the briefing prompts
 * actually tell the model what the block is.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ownGapsBlock, type OwnGap } from "../../packages/llm/src/visibility-loop";
import { GAPS_ARTIFACT, SIGNALS_ARTIFACT } from "../../apps/api/src/lib/graph-runner";

const gap = (over: Partial<OwnGap>): OwnGap => ({
  vector: "ai",
  gap: 'Not cited for "What is the best GEO Saas in 2026?"',
  action: "Create or optimize a page that directly answers it.",
  priority: 100,
  evidence: null,
  metric: 'Cited for "What is the best GEO Saas in 2026?"',
  ...over,
});

const repoFile = (rel: string) =>
  readFileSync(path.join(__dirname, "..", "..", rel), "utf8");

describe("ownGapsBlock", () => {
  it("renders real gaps with priority, vector and the concrete action", () => {
    const block = ownGapsBlock([gap({})], { brand: "Ozvor" });
    expect(block).toContain("NOSSOS GAPS DE VISIBILIDADE REAIS");
    expect(block).toContain("prioridade=100");
    expect(block).toContain("vetor=ai");
    expect(block).toContain("What is the best GEO Saas in 2026?");
    expect(block).toContain("Ozvor");
  });

  it("says SEM DADO explicitly on an empty list — never an empty block to fill with invention", () => {
    const block = ownGapsBlock([]);
    expect(block).toContain("SEM DADO");
    expect(block).toContain("Nao invente");
  });

  it("orders by priority, highest first, and caps the list", () => {
    const gaps = Array.from({ length: 9 }, (_, i) =>
      gap({ gap: `gap ${i}`, priority: i * 10 })
    );
    const block = ownGapsBlock(gaps, { max: 3 });
    const lines = block.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("prioridade=80");
    expect(lines[2]).toContain("prioridade=60");
    expect(block).toContain("(+6 outros gaps abertos)");
  });

  it("is deterministic for the same rows", () => {
    const gaps = [gap({ gap: "a", priority: 50 }), gap({ gap: "b", priority: 50 })];
    expect(ownGapsBlock(gaps)).toBe(ownGapsBlock([...gaps].reverse()));
  });
});

describe("dogfood wiring", () => {
  it("declares a [__gaps__] artifact alongside [__signals__]", () => {
    expect(GAPS_ARTIFACT).toBe("__gaps__");
    expect(SIGNALS_ARTIFACT).toBe("__signals__");
  });

  it("the runner injects it on the same marketing path as the signals block", () => {
    const runner = repoFile("apps/api/src/lib/graph-runner.ts");
    expect(runner).toContain("substrate.ownVisibilityGaps");
    expect(runner).toContain("upstream.unshift([GAPS_ARTIFACT, gaps])");
    // fail-open like its sibling: guarded and non-throwing
    const ix = runner.indexOf("substrate.ownVisibilityGaps");
    expect(runner.slice(ix, ix + 400)).toContain("catch");
  });

  it("the worker reads OPEN cards of the newest plan and fails open when unconfigured", () => {
    const tick = repoFile("apps/worker/src/jobs/graph-tick.ts");
    expect(tick).toContain("async ownVisibilityGaps()");
    expect(tick).toContain("OZVOR_OWN_BRAND_ID");
    expect(tick).toContain("if (!OWN_BRAND_ID) return null;");
    expect(tick).toContain("t.status IN ('proposed', 'accepted')");
  });

  it("the briefing prompts tell the model what [__gaps__] is", () => {
    const prompts = repoFile("apps/api/src/lib/graph-prompts.ts");
    const hits = prompts.split("[__gaps__]").length - 1;
    expect(hits).toBeGreaterThanOrEqual(6); // every cell that sees [__signals__]
    expect(prompts).toContain("move o NOSSO score");
  });
});
