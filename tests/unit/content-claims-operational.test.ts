/**
 * content-claims-operational.test.ts — D6 (Codex N06, 28/09).
 *
 * The first case is the piece observed in the scheduler, word for word. It
 * must not reach the founder's approval box, let alone the page.
 */
import { describe, it, expect } from "vitest";
import { validateContentClaims, describeClaimProblems } from "../../apps/api/src/lib/content-claims";
import { CONTENT_FACTS, liveFacts } from "../../apps/api/src/lib/content-facts";

const facts = liveFacts(new Date("2026-09-29T08:00:00Z"));
const codes = (text: string) => validateContentClaims(text, facts).problems.map((p) => p.code).sort();

const N06 =
  "As of late September 2026, we had 1,818 leads loaded. Segmented, ready, sitting in draft. Zero sending days. Not one email went out.";

describe("the piece of 28/09 is refused, for three independent reasons", () => {
  it("1,818 is in no fact; 'not one email went out' is said by no fact; 'as of late September' has nothing behind it", () => {
    const check = validateContentClaims(N06, facts);
    expect(check.ok).toBe(false);
    expect(codes(N06)).toEqual(["as_of_without_fact", "operational_number_without_fact", "operational_zero_without_fact"]);
    expect(describeClaimProblems(check)).toContain("1818");
  });
  it("each reason alone is enough", () => {
    expect(codes("We had 1,818 leads loaded and ready.")).toEqual(["operational_number_without_fact"]);
    expect(codes("Our campaign is built. Zero sending days so far.")).toContain("operational_zero_without_fact");
    expect(codes("We loaded our leads. Not one email went out.")).toContain("operational_zero_without_fact");
  });
});

describe("what the facts DO say passes", () => {
  it("the cold e-mail fact, told in the first person with its own numbers", () => {
    const text =
      "In the first three days of our cold campaign we emailed 483 people. Three replied, and all three said no. By 21 September we had emailed 684. One said yes, check my business.";
    expect(validateContentClaims(text, facts)).toEqual({ ok: true, problems: [] });
  });
  it("a dated claim backed by a fact read in that month", () => {
    const text = "As of September 2026 we had emailed 684 people in our cold campaign. Nine replied.";
    expect(codes(text)).toEqual([]);
  });
  it("dates and years are not claims", () => {
    expect(codes("Between 17 and 19 September 2026 we emailed 483 people.")).toEqual([]);
  });
});

describe("it stays out of what is not our operation", () => {
  it("numbers about the reader, the market or the product are not judged here", () => {
    expect(codes("Your customers ask 10 questions. We ask all 5 engines the same ones.")).toEqual([]);
    expect(codes("Most small businesses send 3 emails a week and get no reply.")).toEqual([]);
    expect(codes("We check what ChatGPT says about you. It takes 2 minutes.")).toEqual([]);
  });
  it("a zero that is not about our sending is left alone", () => {
    expect(codes("We asked five engines. Not one named the business.")).toEqual([]);
  });
});

describe("the facts carry what the gate needs", () => {
  it("every measured Ozvor fact has key numbers or states a rule", () => {
    for (const f of CONTENT_FACTS.filter((x) => x.owner === "ozvor" && x.evidenceType === "measured")) {
      expect(f.keyNumbers.length, f.id).toBeGreaterThan(0);
      expect(f.asOf, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
