/**
 * delivery-canary.test.ts — audit P0-09, the Ozvor canary tenant.
 *
 * The behaviour under test is the one sentence the audit ends the item with:
 * "alerta que torna System Health amarelo/vermelho" (RELATORIO:643). So every
 * canary failure must produce a non-green status and a sentence a human can
 * act on — and a check that could not run must never come back as a pass.
 */

import { describe, it, expect } from "vitest";
import {
  CANARY_VERSION,
  OZVOR_GOLDEN_PROMPTS,
  assertGoldenSetComplete,
  canaryPromptKey,
  evaluateCanary,
  type CanaryObservation,
  type CanaryPromptObservation,
} from "../../packages/llm/src/delivery-canary";
import { deliveryColor } from "../../packages/llm/src/delivery-health";

const READ_AT = "2026-09-04T10:00:00.000Z";

const allPromptsGood = (): CanaryPromptObservation[] =>
  OZVOR_GOLDEN_PROMPTS.map((g) => ({
    goldenId: g.id,
    present: true,
    category: g.expectedCategory,
    relevance: g.expectedRelevance,
  }));

const passing = (over: Partial<CanaryObservation> = {}): CanaryObservation => ({
  connected: true,
  auditId: "audit-1",
  auditAgeHours: 6,
  prompts: allPromptsGood(),
  gaps: { total: 10, withAction: 10 },
  entityFalsePositives: 0,
  draft: { ageHours: 4, succeeded: true },
  verify: { claimed: 4, verified: 3 },
  ...over,
});

const statusOf = (o: CanaryObservation, id: string) =>
  evaluateCanary(o, READ_AT).checks.find((c) => c.id === id)?.status;

describe("golden set", () => {
  it("is versioned and complete", () => {
    expect(assertGoldenSetComplete()).toEqual([]);
    expect(CANARY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("every golden prompt declares category, relevance, market and language", () => {
    for (const g of OZVOR_GOLDEN_PROMPTS) {
      expect(g.expectedCategory).toBeTruthy();
      expect(g.expectedRelevance).toBeGreaterThan(0);
      expect(g.market).toBeTruthy();
      expect(g.language).toBeTruthy();
    }
  });

  it("matching is punctuation- and case-insensitive", () => {
    expect(canaryPromptKey("What is GEO, exactly?")).toBe(canaryPromptKey("what is geo exactly"));
  });
});

describe("the happy canary", () => {
  it("passes green when the whole loop ran on our own tenant", () => {
    const r = evaluateCanary(passing(), READ_AT);
    expect(r.status).toBe("healthy");
    expect(r.reasons).toEqual([]);
    expect(r.version).toBe(CANARY_VERSION);
    expect(r.auditId).toBe("audit-1");
  });
});

describe("each canary failure changes the colour", () => {
  it("a stale loop fails — the daily canary is not running", () => {
    const r = evaluateCanary(passing({ auditAgeHours: 100 }), READ_AT);
    expect(r.status).toBe("failing");
    expect(r.reasons.join(" ")).toContain("daily loop is not running");
  });

  it("missing golden prompts are named, not summarised away", () => {
    const prompts = allPromptsGood().map((p, i) => (i < 2 ? { ...p, present: false } : p));
    const r = evaluateCanary(passing({ prompts }), READ_AT);
    expect(r.status).not.toBe("healthy");
    expect(r.reasons.join(" ")).toContain("gp-01");
  });

  it("a prompt classified into the wrong category is caught", () => {
    const prompts = allPromptsGood().map((p) => ({ ...p, category: "informational" }));
    // The golden set is mixed, so forcing one category breaks the match.
    expect(statusOf(passing({ prompts }), "expected_category")).not.toBe("healthy");
  });

  it("low relevance does not pass", () => {
    const prompts = allPromptsGood().map((p) => ({ ...p, relevance: 0.1 }));
    expect(statusOf(passing({ prompts }), "expected_relevance")).toBe("failing");
  });

  it("gaps without actions break minimum action coverage", () => {
    const r = evaluateCanary(passing({ gaps: { total: 10, withAction: 4 } }), READ_AT);
    expect(r.status).toBe("failing");
    expect(r.reasons.join(" ")).toContain("4/10");
  });

  it("a single entity false positive is failing — zero is the only passing number", () => {
    const r = evaluateCanary(passing({ entityFalsePositives: 1 }), READ_AT);
    expect(r.status).toBe("failing");
    expect(deliveryColor(r.status)).toBe("red");
  });

  it("a failed draft fails the draft canary", () => {
    expect(statusOf(passing({ draft: { ageHours: 1, succeeded: false } }), "draft_canary")).toBe("failing");
  });

  it("an old but successful draft is amber, not red", () => {
    expect(statusOf(passing({ draft: { ageHours: 100, succeeded: true } }), "draft_canary")).toBe("degraded");
  });

  it("claims with zero verifications fail the verify canary", () => {
    const r = evaluateCanary(passing({ verify: { claimed: 5, verified: 0 } }), READ_AT);
    expect(r.status).toBe("failing");
    expect(r.reasons.join(" ")).toContain("verification path is not running");
  });
});

describe("unknown is never a pass", () => {
  it("an unconfigured canary brand reports not_connected on every check", () => {
    const r = evaluateCanary(
      { connected: false, auditId: null, auditAgeHours: null, prompts: [], gaps: null, entityFalsePositives: null, draft: null, verify: null },
      READ_AT
    );
    expect(r.status).toBe("not_connected");
    expect(r.checks.every((c) => c.status === "not_connected")).toBe(true);
    expect(deliveryColor(r.status)).toBe("amber");
    expect(r.reasons.join(" ")).toContain("OZVOR_OWN_BRAND_ID");
  });

  it("unscored relevance is not_measured — it does not silently pass", () => {
    const prompts = allPromptsGood().map((p) => ({ ...p, relevance: null }));
    const r = evaluateCanary(passing({ prompts }), READ_AT);
    expect(statusOf(passing({ prompts }), "expected_relevance")).toBe("not_measured");
    expect(r.status).not.toBe("healthy");
  });

  it("uncategorised prompts are not_measured, not a category match", () => {
    const prompts = allPromptsGood().map((p) => ({ ...p, category: null }));
    expect(statusOf(passing({ prompts }), "expected_category")).toBe("not_measured");
  });

  it("no negative-control battery means hallucination is unmeasured, not clean", () => {
    expect(statusOf(passing({ entityFalsePositives: null }), "entity_false_positive")).toBe("not_measured");
  });

  it("nothing claimed is insufficient_evidence, not a verified pass", () => {
    expect(statusOf(passing({ verify: { claimed: 0, verified: 0 } }), "verify_canary")).toBe(
      "insufficient_evidence"
    );
  });

  it("no gaps at all proves nothing about coverage", () => {
    expect(statusOf(passing({ gaps: { total: 0, withAction: 0 } }), "action_coverage")).toBe(
      "insufficient_evidence"
    );
  });
});
