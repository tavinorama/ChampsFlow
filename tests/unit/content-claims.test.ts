/**
 * content-claims.test.ts — B5 (Codex D10, D11, D12 — 23/09).
 * The four negative fixtures are the exact distortions observed in Postiz on
 * 23/09 (evidence/ui-observations.json). Each must be refused by code.
 */
import { describe, it, expect } from "vitest";
import { validateContentClaims, describeClaimProblems } from "../../apps/api/src/lib/content-claims";
import { CONTENT_FACTS, liveFacts, factsBlock } from "../../apps/api/src/lib/content-facts";

const FACTS = liveFacts(new Date("2026-09-24T09:00:00Z"));
const codes = (t: string) => validateContentClaims(t, FACTS).problems.map((p) => p.code);

describe("the facts library carries the evidence type CODE needs", () => {
  it("every fact says what it is, whose it is, and which numbers identify it", () => {
    for (const f of CONTENT_FACTS) {
      expect(["measured", "did", "scenario", "third_party"]).toContain(f.evidenceType);
      expect(["ozvor", "third_party"]).toContain(f.owner);
      expect(Array.isArray(f.keyNumbers)).toBe(true);
    }
    expect(CONTENT_FACTS.find((f) => f.id === "two-tools-one-chore")?.evidenceType).toBe("scenario");
    expect(CONTENT_FACTS.find((f) => f.id === "ten-local-businesses-four-engines")?.causalClaimAllowed).toBe(false);
  });
  it("the block tells the model which facts are scenarios or have no cause, and that code refuses", () => {
    const block = factsBlock(new Date("2026-09-24T09:00:00Z"))!;
    expect(block).toContain("[two-tools-one-chore] (lido em 2026-09-19; CENARIO, no papel)");
    expect(block).toContain("[ten-local-businesses-four-engines] (lido em 2026-09-17; SEM-CAUSA)");
    expect(block).toContain("RECUSADO por codigo");
  });
});

describe("D11 — a scenario is never a result", () => {
  it("refuses '24 hours became 8, saved 16 hours a week'", () => {
    expect(codes("Our audit found 24 hours of chores. After we removed the overlap it saved 8 hours a week. Real savings.")).toContain("scenario_as_result");
  });
  it("refuses the numbers with no scenario word at all", () => {
    expect(codes("Two tools, one chore: 24 hours a week became 8.")).toContain("scenario_as_result");
  });
  it("accepts the same numbers told as what they are", () => {
    expect(codes("On paper, two tools for the same chore added up to 24 hours a week. Remove the overlap and it is 8. That is a worked example, not a client's time.")).toEqual([]);
  });
});

describe("D10 — someone else's story is never 'we'", () => {
  it("refuses 'Our ChatGPT bill: $500' when no Ozvor fact licenses that number", () => {
    const c = validateContentClaims("Our ChatGPT bill hit $500 before lunch. Read what we learned.", FACTS);
    expect(c.ok).toBe(false);
    expect(c.problems.map((p) => p.code)).toContain("third_party_as_ours");
  });
  it("refuses 'we spent real money on ChatGPT ads' — nobody at Ozvor did", () => {
    expect(codes("We spent real money on ChatGPT ads for a small business. Here is the honest truth.")).toContain("third_party_as_ours");
  });
  it("accepts the story attributed to its owner", () => {
    expect(codes("Out of the Box Advisors spent $500 on ChatGPT ads and wrote up what happened. The clicks rarely showed up anywhere they could see.")).toEqual([]);
  });
  it("accepts first person over an Ozvor-owned measured fact", () => {
    expect(codes("We tested our own cold email. 483 people in three days. Three replied, all three said no.")).toEqual([]);
  });
});

describe("D12 — an observed spread is never a cause", () => {
  it("refuses '15% vs 62% because of the description'", () => {
    expect(codes("Two businesses, same trade, same city: 15% vs 62% of answers named them. The reason is the description on their site.")).toContain("correlation_as_cause");
  });
  it("accepts the spread told as what we saw", () => {
    expect(codes("Two businesses, same trade, same city: 15% vs 62% of answers named them. We saw the gap. We have not tested what closes it.")).toEqual([]);
  });
});

describe("invented people are refused by code, not just asked not to", () => {
  it("the 14–20/09 phrases", () => {
    expect(codes("A client texted me at 7am: nobody found her on ChatGPT.")).toContain("invented_person");
    expect(codes("My neighbor runs a bakery and closes at 6.")).toContain("invented_person");
    expect(codes("Rosa was closing her bakery when she checked the AI answer.")).toContain("invented_person");
  });
  it("an observation, an opinion or a question pass", () => {
    expect(codes("Most local sites answer no question a buyer would ask. Check yours: ask ChatGPT who to hire in your town.")).toEqual([]);
  });
});

describe("the summary a failed step carries", () => {
  it("names the code, the fact and the tripping text", () => {
    const c = validateContentClaims("Two tools, one chore: 24 hours became 8. Real savings.", FACTS);
    const d = describeClaimProblems(c);
    expect(d).toContain("scenario_as_result[two-tools-one-chore]");
    expect(d).toContain("«");
  });
});
