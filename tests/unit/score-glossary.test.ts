/**
 * score-glossary.test.ts — B8 (Codex D17, 23/09). One definition per score,
 * and the marketing pages may not drift back to the old ones.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCORE_GLOSSARY, RETIRED_SCORE_PHRASES, THREE_PARTS_LINE } from "../../packages/shared/src/score-glossary";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const PUBLIC_SURFACES = [
  "apps/web/src/app/(marketing)/faq/page.tsx",
  "apps/web/src/app/(marketing)/landing-v2-logic.ts",
  "apps/web/src/app/(marketing)/learn/page.tsx",
  "apps/web/src/app/(marketing)/how-it-works/page.tsx",
  "apps/web/src/app/(marketing)/how-we-measure/page.tsx",
  "apps/web/src/components/OzvorScorecard.tsx",
  "apps/web/src/components/VerifiedExecutionNote.tsx",
  "apps/web/src/lib/visibility-headline.ts",
];

describe("the glossary agrees with the code", () => {
  it("index weights are scoring.ts's weights, and the index is called an index", () => {
    const scoring = read("packages/llm/src/scoring.ts");
    expect(scoring).toContain("inputs.ai.citationRate * 0.5");
    expect(scoring).toContain("inputs.ai.avgPositionScore * 0.3");
    expect(scoring).toContain("inputs.ai.sentimentScore * 0.2");
    expect(SCORE_GLOSSARY.index.long).toContain("Half of it is how often");
    expect(SCORE_GLOSSARY.index.long).toContain("30% is how high");
    expect(SCORE_GLOSSARY.index.long).toContain("20% is the tone");
    expect(SCORE_GLOSSARY.index.short).toContain("not a share of answers");
  });
  it("Verified Execution is what plan-task-state.ts computes: re-checked fixes, never a checkbox or authority", () => {
    expect(SCORE_GLOSSARY.verifiedExecution.long).toContain("re-checked");
    expect(SCORE_GLOSSARY.verifiedExecution.long).toContain("Not a checkbox");
    expect(SCORE_GLOSSARY.verifiedExecution.long).toContain("not your authority");
    expect(THREE_PARTS_LINE).toContain("Verified Execution (fixes from your plan that a later audit re-checked and found live)");
  });
});

describe("no public surface uses a retired definition", () => {
  for (const file of PUBLIC_SURFACES) {
    it(file, () => {
      const src = read(file);
      for (const re of RETIRED_SCORE_PHRASES) expect(src, `${file} still says ${re}`).not.toMatch(re);
    });
  }
  it("the FAQ, landing FAQ, learn and how-it-works pages read the glossary instead of restating it", () => {
    for (const f of PUBLIC_SURFACES.slice(0, 4)) expect(read(f)).toContain("SCORE_GLOSSARY");
  });
});
