/**
 * competitive-claims.test.ts — P0-05.
 *
 * The comparison pages asserted competitor pricing and capability with no
 * source, no date and no owner, so a checked fact and a nine-month-old
 * impression looked identical to a reader. The registry gives every claim its
 * provenance and, crucially, COMPUTES staleness instead of trusting a
 * hand-maintained label.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  effectiveClaimStatus,
  publishableClaims,
  isComparisonFrozen,
  frozenCompetitors,
  describeClaimStatus,
  type CompetitiveClaim,
} from "../../packages/shared/src/competitive-claims";
import { COMPETITIVE_CLAIMS } from "../../apps/web/src/app/(marketing)/vs/_claims";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const NOW = new Date("2026-09-03T00:00:00Z");

function claim(over: Partial<CompetitiveClaim> = {}): CompetitiveClaim {
  return {
    id: "c1",
    competitor: "acme",
    claim: "Entry tier is $99/mo.",
    type: "fact",
    sourceUrl: "https://acme.example/pricing",
    checkedAt: "2026-08-01",
    nextReviewAt: "2026-11-01",
    owner: "otavio",
    confidence: "high",
    status: "current",
    ...over,
  };
}

describe("P0-05 — claim status is computed, not declared", () => {
  it("a fully sourced, in-date claim is current", () => {
    expect(effectiveClaimStatus(claim(), NOW)).toBe("current");
  });

  it("goes stale on its own once the review date passes", () => {
    // The whole point: nobody has to remember. The same claim, declared
    // 'current', expires by the calendar.
    expect(effectiveClaimStatus(claim({ nextReviewAt: "2026-09-02" }), NOW)).toBe("stale");
    expect(effectiveClaimStatus(claim({ nextReviewAt: "2026-09-03" }), NOW)).toBe("stale");
  });

  it("is stale without an official source, whatever the label says", () => {
    expect(effectiveClaimStatus(claim({ sourceUrl: null, status: "current" }), NOW)).toBe("stale");
  });

  it("is stale when it was written down but never verified", () => {
    // "We wrote it once" is not a check.
    expect(effectiveClaimStatus(claim({ checkedAt: null }), NOW)).toBe("stale");
  });

  it("is stale when no review date was ever set", () => {
    expect(effectiveClaimStatus(claim({ nextReviewAt: null }), NOW)).toBe("stale");
    expect(effectiveClaimStatus(claim({ nextReviewAt: "not-a-date" }), NOW)).toBe("stale");
  });

  it("blocked always wins, even on a perfect claim", () => {
    expect(effectiveClaimStatus(claim({ status: "blocked" }), NOW)).toBe("blocked");
  });

  it("a declared status can never promote a claim", () => {
    // status: "current" must not rescue a claim with nothing behind it.
    expect(
      effectiveClaimStatus(
        claim({ sourceUrl: null, checkedAt: null, nextReviewAt: null, status: "current" }),
        NOW
      )
    ).toBe("stale");
  });

  it("explains itself for a human", () => {
    expect(describeClaimStatus(claim({ sourceUrl: null }), NOW)).toBe("stale: no official source");
    expect(describeClaimStatus(claim({ checkedAt: null }), NOW)).toContain("never verified");
    expect(describeClaimStatus(claim({ nextReviewAt: "2026-01-01" }), NOW)).toContain("review was due");
    expect(describeClaimStatus(claim({ status: "blocked", note: "legal hold" }), NOW)).toBe("blocked: legal hold");
  });
});

describe("P0-05 — the freeze", () => {
  it("freezes a competitor when ANY claim is unpublishable", () => {
    // Not "when all of them are". A page that quietly drops its unverified rows
    // still reads as a complete comparison, and a comparison missing the rows
    // where we lose is the dishonesty the registry exists to prevent.
    const claims = [
      claim({ id: "a", competitor: "acme" }),
      claim({ id: "b", competitor: "acme", checkedAt: null }),
    ];
    expect(isComparisonFrozen(claims, "acme", NOW)).toBe(true);
    expect(publishableClaims(claims, NOW).map((c) => c.id)).toEqual(["a"]);
  });

  it("does not freeze when every claim holds up", () => {
    expect(isComparisonFrozen([claim({ competitor: "acme" })], "acme", NOW)).toBe(false);
  });

  it("freezes a competitor nobody has registered a claim for", () => {
    // Silence in the registry means nobody vouched for anything.
    expect(isComparisonFrozen([], "unknown", NOW)).toBe(true);
  });

  it("thaws by itself once the claims are re-verified", () => {
    // No switch to flip here: correcting _claims.ts is the whole action.
    const fixed = [claim({ competitor: "acme", checkedAt: "2026-09-01", nextReviewAt: "2026-12-01" })];
    expect(isComparisonFrozen(fixed, "acme", NOW)).toBe(false);
  });
});

describe("P0-05 — the live registry freezes the four the audit named", () => {
  it("Ahrefs, Semrush, Otterly and Profound are all frozen today", () => {
    const named = ["ahrefs-brand-radar", "semrush-ai", "otterly", "profound"];
    expect(frozenCompetitors(COMPETITIVE_CLAIMS, named)).toEqual([...named].sort());
  });

  it("nothing in the registry is publishable yet, and that is accurate", () => {
    // Nobody in this change opened a competitor's pricing page. Marking these
    // 'current' would be inventing the very kind of fact P0-05 is about.
    expect(publishableClaims(COMPETITIVE_CLAIMS)).toEqual([]);
  });

  it("no claim carries a source or a check date it did not earn", () => {
    for (const c of COMPETITIVE_CLAIMS) {
      expect(c.sourceUrl, `${c.id} must not claim a source`).toBeNull();
      expect(c.checkedAt, `${c.id} must not claim a check date`).toBeNull();
      expect(c.note, `${c.id} must say what is missing`).toBeTruthy();
    }
  });

  it("every competitor with a comparison page is registered", () => {
    // A page with no registry entry freezes, but it should not get there by
    // accident — the registry has to keep up with _data.ts.
    const data = read("apps/web/src/app/(marketing)/vs/_data.ts");
    const slugs = [...data.matchAll(/^\s{4}slug: "([a-z0-9-]+)"/gm)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThan(0);
    const registered = new Set(COMPETITIVE_CLAIMS.map((c) => c.competitor));
    for (const s of slugs) expect(registered.has(s!), `${s} has no registry entry`).toBe(true);
  });
});

describe("P0-05 — the freeze reaches every surface", () => {
  it("the detail page withholds the comparison and noindexes it", () => {
    const src = read("apps/web/src/app/(marketing)/vs/[competitor]/page.tsx");
    expect(src).toContain("isComparisonFrozen(COMPETITIVE_CLAIMS, c.slug)");
    expect(src).toContain("<FrozenComparison");
    expect(src).toContain("robots: { index: false, follow: true }");
    // The URL must survive so inbound links do not 404.
    expect(src).not.toMatch(/if \(frozen\) notFound\(\)/);
  });

  it("the hub pages stop restating the frozen thesis", () => {
    for (const p of [
      "apps/web/src/app/(marketing)/compare/page.tsx",
      "apps/web/src/app/(marketing)/vs/page.tsx",
    ]) {
      const src = read(p);
      expect(src, `${p} must consult the registry`).toContain("isComparisonFrozen(COMPETITIVE_CLAIMS, c.slug)");
    }
  });
});
