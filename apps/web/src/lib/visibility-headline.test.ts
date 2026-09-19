import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { citationRateLine, VISIBILITY_INDEX_EXPLAINER, VISIBILITY_INDEX_WEIGHTS } from "./visibility-headline";

describe("the Visibility headline says what it is", () => {
  it("the real 14/09 audit: 52 on the index, named in 15 of 102 checks", () => {
    expect(citationRateLine({ rate: 0.1471, low: 0.0912, high: 0.2285, n: 102 })).toBe(
      "Named in 15 of 102 checks (14.7%). With this many checks the true share sits between 9.1% and 22.9%."
    );
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
