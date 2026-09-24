import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { citationRateLine, pairsMeasuredLine, VISIBILITY_INDEX_EXPLAINER, VISIBILITY_INDEX_WEIGHTS } from "./visibility-headline";

describe("the Visibility headline says what it is", () => {
  it("the real 14/09 audit: 52 on the index, named in 15 of 102 answers", () => {
    expect(citationRateLine({ rate: 0.1471, low: 0.0912, high: 0.2285, n: 102 })).toBe(
      "Named in 15 of 102 answers (14.7%). With this many answers the true share sits between 9.1% and 22.9%."
    );
  });

  it("B3 — the two grains have two names: answers (repetitions) and question × engine pairs", () => {
    // 21/09: 130 answers, 65 pairs, 12 and 6 named. Both used to be "checks".
    expect(citationRateLine({ rate: 0.0923, low: 0.0536, high: 0.1544, n: 130 })).toContain("Named in 12 of 130 answers");
    expect(pairsMeasuredLine(65, 6)).toBe("65 question × engine pairs measured — named in 6 of them.");
    expect(pairsMeasuredLine(65, null)).toBe("65 question × engine pairs measured.");
    expect(pairsMeasuredLine(0, 0)).toBeNull();
    expect(pairsMeasuredLine(null, 3)).toBeNull();
    const page = readFileSync(join(__dirname, "../app/dashboard-v3/page.tsx"), "utf8");
    expect(page).not.toContain("Measured over ${confidence.checks} checks");
    expect(page).toContain("pairsMeasuredLine(confidence.checks, confidence.citations)");
  });

  it("nothing measured → no sentence (never 'named in 0 of 0')", () => {
    expect(citationRateLine(null)).toBeNull();
    expect(citationRateLine({ rate: 0, low: 0, high: 0, n: 0 })).toBeNull();
    expect(citationRateLine({ rate: NaN, low: 0, high: 0, n: 10 })).toBeNull();
  });

  it("the weights shown to the customer are the weights scoring.ts uses", () => {
    const scoring = readFileSync(join(__dirname, "../../../../packages/llm/src/scoring.ts"), "utf8");
    expect(scoring).toContain("inputs.ai.citationRate * 0.5");
    expect(scoring).toContain("inputs.ai.avgPositionScore * 0.3");
    expect(scoring).toContain("inputs.ai.sentimentScore * 0.2");
    expect(VISIBILITY_INDEX_WEIGHTS).toEqual({ citationRate: 0.5, positionWhenNamed: 0.3, sentiment: 0.2 });
    expect(VISIBILITY_INDEX_EXPLAINER).toContain("does not mean you were named in 52% of answers");
  });

  it("the dashboard never prints the rate's interval beside the index again", () => {
    const page = readFileSync(join(__dirname, "../app/dashboard-v3/page.tsx"), "utf8");
    expect(page).not.toMatch(/out of 100[\s\S]{0,160}±/);
    expect(page).not.toContain("How often AI names you");
    expect(page).toContain("citationRateLine(citationCI)");
  });
});
