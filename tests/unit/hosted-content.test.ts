/**
 * hosted-content.test.ts — P0-08, the pure half.
 *
 * Pins the arithmetic and the strings the customer actually reads: what a
 * hosted draft costs, how many are left, what an empty wallet says, how the
 * idempotency key is composed, how the retry is spaced, and what the
 * fact-check blocks.
 *
 * Each assertion here is one the code fails without the change: before P0-08
 * none of these functions existed, and the behaviour they describe was a 402
 * telling an SMB to go get an API key.
 */
import { describe, it, expect } from "vitest";
import {
  creditsForHostedDraft,
  draftsRemaining,
  describeDraftsLeft,
  hostedDraftAllowance,
  draftGenerationKey,
  hostedDraftRetryDelayMs,
  isDraftFailurePermanent,
  HOSTED_DRAFT_RETRY_BASE_DELAY_MS,
  USD_PER_HOSTED_DRAFT,
} from "../../packages/shared/src/hosted-content";
import { usdPerCredit } from "../../packages/shared/src/credits";
import { factCheckDraft, renderEvidencePack, type DraftEvidence } from "../../packages/shared/src/content-fact-check";
import type { CompetitiveClaim } from "../../packages/shared/src/competitive-claims";

describe("what a hosted draft costs", () => {
  it("DERIVES its credit price from usdPerCredit — it is not a literal", () => {
    // The whole point of the credit unit is that a price restated as a literal
    // drifts from its source (the 2026-08-05 disease). If someone hardcodes a
    // number here, this fails.
    expect(creditsForHostedDraft()).toBe(Math.ceil(USD_PER_HOSTED_DRAFT / usdPerCredit()));
  });

  it("rounds UP, so the house never loses a fraction of a credit per draft", () => {
    expect(creditsForHostedDraft()).toBeGreaterThanOrEqual(USD_PER_HOSTED_DRAFT / usdPerCredit());
    expect(Number.isInteger(creditsForHostedDraft())).toBe(true);
  });
});

describe("the meter the customer reads", () => {
  it("counts DRAFTS, not credits and never tokens", () => {
    const cost = creditsForHostedDraft();
    expect(draftsRemaining(cost * 5)).toBe(5);
    // A partial draft is not a draft.
    expect(draftsRemaining(cost * 5 + cost - 1)).toBe(5);
  });

  it("an absent balance is NULL, never zero", () => {
    // House rule, and the difference matters: 0 means "you are out of credits,
    // buy more"; null means "we could not read it", and telling a paying
    // customer they are broke because a query failed is the exact class of
    // quiet lie this codebase keeps paying for.
    expect(draftsRemaining(null)).toBeNull();
    expect(draftsRemaining(undefined)).toBeNull();
    expect(draftsRemaining(Number.NaN)).toBeNull();
    expect(draftsRemaining(0)).toBe(0);
  });

  it("says '1 draft', not '1 drafts'", () => {
    expect(describeDraftsLeft(1)).toBe("You have 1 draft left this month.");
    expect(describeDraftsLeft(2)).toContain("2 drafts");
  });

  it("never mentions tokens, credits-per-prompt-audit, or any internal unit", () => {
    const texts = [
      describeDraftsLeft(41),
      describeDraftsLeft(0),
      hostedDraftAllowance({ balance: 0 }).message,
      hostedDraftAllowance({ balance: 0 }).offer,
      hostedDraftAllowance({ balance: null }).message,
    ];
    for (const t of texts) {
      expect(t.toLowerCase()).not.toContain("token");
      expect(t.toLowerCase()).not.toContain("prompt-audit");
      expect(t.toLowerCase()).not.toContain("api key");
    }
  });
});

describe("the block, when there is one", () => {
  it("an empty wallet gets an honest sentence AND a way out — not a raw error", () => {
    const a = hostedDraftAllowance({ balance: 0 });
    expect(a.canGenerate).toBe(false);
    expect(a.block).toBe("insufficient_credits");
    // "Nothing was charged" is the reassurance; the offer is the exit.
    expect(a.message).toContain("Nothing was charged");
    expect(a.offer).toMatch(/pack/i);
    expect(a.offer).toMatch(/plan/i);
  });

  it("an unreadable balance refuses WITHOUT claiming the customer is out of credits", () => {
    const a = hostedDraftAllowance({ balance: null });
    expect(a.canGenerate).toBe(false);
    expect(a.block).toBe("balance_unknown");
    expect(a.remaining).toBeNull();
    expect(a.message).not.toMatch(/out of credits/i);
  });

  it("a balance that covers exactly one draft is allowed", () => {
    const a = hostedDraftAllowance({ balance: creditsForHostedDraft() });
    expect(a.canGenerate).toBe(true);
    expect(a.remaining).toBe(1);
  });
});

describe("idempotency key", () => {
  it("is composed of auditId + actionId + artifactType + version, exactly", () => {
    const k = draftGenerationKey({ auditId: "a1", actionId: "t1", artifactType: "blog", version: 2 });
    expect(k).toBe("audit:a1|action:t1|artifact:blog|v:2");
  });

  it("changes when ANY of the four segments changes", () => {
    const base = { auditId: "a1", actionId: "t1", artifactType: "blog", version: 1 };
    const keys = new Set([
      draftGenerationKey(base),
      draftGenerationKey({ ...base, auditId: "a2" }),
      draftGenerationKey({ ...base, actionId: "t2" }),
      draftGenerationKey({ ...base, artifactType: "faq" }),
      draftGenerationKey({ ...base, version: 2 }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("spells out a missing segment rather than dropping it", () => {
    // Otherwise a draft with no audit and one with an empty-string audit id
    // collide, and the second silently returns the first.
    const noAudit = draftGenerationKey({ auditId: null, actionId: "t1", artifactType: "blog", version: 1 });
    const emptyAudit = draftGenerationKey({ auditId: "", actionId: "t1", artifactType: "blog", version: 1 });
    expect(noAudit).not.toBe(emptyAudit);
    expect(noAudit).toContain("audit:none");
  });

  it("is stable across calls — the same inputs always give the same key", () => {
    const id = { auditId: "a1", actionId: null, artifactType: "linkedin", version: 1 };
    expect(draftGenerationKey(id)).toBe(draftGenerationKey(id));
  });
});

describe("retry spacing", () => {
  it("backs off exponentially and starts immediately", () => {
    expect(hostedDraftRetryDelayMs(1)).toBe(0);
    expect(hostedDraftRetryDelayMs(2)).toBe(HOSTED_DRAFT_RETRY_BASE_DELAY_MS);
    expect(hostedDraftRetryDelayMs(3)).toBe(HOSTED_DRAFT_RETRY_BASE_DELAY_MS * 2);
  });

  it("refuses to retry a REFUSAL — re-asking spends money to fail identically", () => {
    expect(isDraftFailurePermanent("fact_check_failed")).toBe(true);
    expect(isDraftFailurePermanent("insufficient_credits")).toBe(true);
    expect(isDraftFailurePermanent("ledger_not_ready")).toBe(true);
    // A provider that returned nothing MIGHT return something next time.
    expect(isDraftFailurePermanent("provider_no_draft")).toBe(false);
    expect(isDraftFailurePermanent(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fact-check
// ---------------------------------------------------------------------------

const LONG_BODY = "A genuinely useful answer about choosing a CRM. ".repeat(12);

const evidence: DraftEvidence[] = [
  { id: "gap", statement: "The brand is absent for 'best CRM for small law firms'.", source: "audit gap" },
];

function check(over: Partial<Parameters<typeof factCheckDraft>[0]> = {}) {
  return factCheckDraft({
    title: "How to choose a CRM",
    body: LONG_BODY,
    evidence,
    competitorNames: [],
    claims: [],
    ...over,
  });
}

describe("fact-check, before review", () => {
  it("passes a grounded, clean draft", () => {
    const r = check();
    expect(r.ok).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.evidenceCount).toBe(1);
  });

  it("BLOCKS a draft carrying internal scaffolding — reusing the P0-04 registry", () => {
    const r = check({ body: `${LONG_BODY}\n\nowner: hermes\nTODO: add the numbers` });
    expect(r.ok).toBe(false);
    expect(r.blocking.map((f) => f.code)).toContain("editorial_leak");
  });

  it("BLOCKS naming a competitor nobody has vouched for — reusing the P0-05 registry", () => {
    const r = check({
      body: `${LONG_BODY} Unlike Salesforce, we keep it simple.`,
      competitorNames: ["Salesforce"],
    });
    expect(r.ok).toBe(false);
    expect(r.blocking.map((f) => f.code)).toContain("unverified_competitor_claim");
  });

  it("ALLOWS naming a competitor when a CURRENT claim vouches for them", () => {
    const vouched: CompetitiveClaim = {
      id: "c1",
      competitor: "Salesforce",
      claim: "Salesforce Starter is $25/user/month.",
      type: "fact",
      sourceUrl: "https://www.salesforce.com/pricing/",
      checkedAt: "2026-09-01",
      nextReviewAt: "2099-01-01",
      owner: "otavio",
      confidence: "high",
      status: "current",
    };
    const r = check({
      body: `${LONG_BODY} Unlike Salesforce, we keep it simple.`,
      competitorNames: ["Salesforce"],
      claims: [vouched],
    });
    expect(r.ok).toBe(true);
  });

  it("still BLOCKS when the vouching claim has gone stale — staleness is computed", () => {
    const stale: CompetitiveClaim = {
      id: "c1",
      competitor: "Salesforce",
      claim: "Salesforce Starter is $25/user/month.",
      type: "fact",
      sourceUrl: "https://www.salesforce.com/pricing/",
      checkedAt: "2025-01-01",
      nextReviewAt: "2025-04-01", // review was due long ago
      owner: "otavio",
      confidence: "high",
      status: "current", // declared current; the computation ignores that
    };
    const r = check({
      body: `${LONG_BODY} Unlike Salesforce, we keep it simple.`,
      competitorNames: ["Salesforce"],
      claims: [stale],
    });
    expect(r.ok).toBe(false);
  });

  it("does not fire on a competitor name that merely appears inside another word", () => {
    const r = check({ body: `${LONG_BODY} We discuss forcefully.`, competitorNames: ["Force"] });
    expect(r.ok).toBe(true);
  });

  it("survives a competitor name containing regex metacharacters", () => {
    // "C++" compiles into an invalid regex unescaped — a customer-supplied
    // name must never be able to throw inside a fact-check.
    expect(() => check({ body: LONG_BODY, competitorNames: ["C++ (Pro)"] })).not.toThrow();
  });

  it("BLOCKS an empty or stub artifact — that is not something to charge for", () => {
    expect(check({ body: "" }).ok).toBe(false);
    expect(check({ body: "Too short." }).ok).toBe(false);
    expect(check({ body: "" }).blocking.map((f) => f.code)).toContain("empty_artifact");
  });

  it("WARNS, not blocks, on a placeholder — the model was told to write one", () => {
    const r = check({ body: `${LONG_BODY} [PLACEHOLDER: your 2026 revenue]` });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((f) => f.code)).toContain("placeholder_artifact");
  });

  it("WARNS when a draft stands on no evidence at all", () => {
    const r = check({ evidence: [] });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((f) => f.code)).toContain("ungrounded");
  });
});

describe("evidence pack in the prompt", () => {
  it("numbers the evidence and forbids anything beyond it", () => {
    const rendered = renderEvidencePack(evidence);
    expect(rendered).toContain("[E1]");
    expect(rendered).toContain(evidence[0]!.statement);
    expect(rendered).toMatch(/only brand-specific facts you may assert/i);
    expect(rendered).toMatch(/Do not name a competitor/i);
  });

  it("renders nothing at all when there is no evidence", () => {
    expect(renderEvidencePack([])).toBe("");
  });
});
