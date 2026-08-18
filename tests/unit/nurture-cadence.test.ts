/**
 * nurture-cadence.test.ts — pins the founder rule (17/08/2026):
 *   every nurture sequence is aggressive: 0d, +1d, +2d, +2d.
 *
 * Also pins:
 *   - the catalog copy rules on every new email (no em-dash, English,
 *     first-person CTA, unsubscribe footer rendered)
 *   - the suppression map (a purchase kills the lower rungs)
 *   - the chain kit_to_growth → kit_to_dfy
 */
import { describe, it, expect } from "vitest";
import {
  ALL_NURTURE_SEQUENCES,
  FOUNDER_CADENCE_DAYS,
  FOUNDER_CADENCE_MS,
  NURTURE_CHAIN,
  NURTURE_SEQUENCES,
  NURTURE_SUPPRESS_ON_CONVERSION,
  isSequenceCheckViolation,
  nurtureNextStepDelayMs,
  nurtureTotalSteps,
} from "../../packages/shared/src/nurture-cadence";
import {
  NURTURE_CATALOG,
  isCatalogSequence,
  renderNurtureCatalogEmail,
  type CatalogSequence,
} from "../../packages/shared/src/emails/nurture-catalog";

const DAY = 24 * 60 * 60 * 1000;

describe("founder cadence rule: 0d, +1d, +2d, +2d for EVERY sequence", () => {
  it("the rule itself is 0/1/2/2 days", () => {
    expect(FOUNDER_CADENCE_DAYS).toEqual([0, 1, 2, 2]);
    expect(FOUNDER_CADENCE_MS).toEqual([0, DAY, 2 * DAY, 2 * DAY]);
  });

  it("no sequence has more steps than the rule covers", () => {
    for (const seq of ALL_NURTURE_SEQUENCES) {
      expect(NURTURE_SEQUENCES[seq].steps).toBeLessThanOrEqual(FOUNDER_CADENCE_DAYS.length);
      expect(NURTURE_SEQUENCES[seq].steps).toBeGreaterThanOrEqual(2);
    }
  });

  it("step 1 goes out at enrollment (0d) in every sequence", () => {
    for (const seq of ALL_NURTURE_SEQUENCES) {
      expect(NURTURE_SEQUENCES[seq].enrollDelayMs, seq).toBe(0);
    }
  });

  it("every sequence's inter-step delays equal the prefix of the rule", () => {
    for (const seq of ALL_NURTURE_SEQUENCES) {
      const steps = nurtureTotalSteps(seq);
      const expected = FOUNDER_CADENCE_MS.slice(1, steps);
      expect(NURTURE_SEQUENCES[seq].nextStepDelayMs, seq).toEqual(expected);
      for (let sent = 0; sent < steps - 1; sent++) {
        expect(nurtureNextStepDelayMs(seq, sent), `${seq} after step ${sent}`).toBe(expected[sent]);
      }
    }
  });

  it("explicit table (documents the decision)", () => {
    expect(NURTURE_SEQUENCES.free_to_kit.nextStepDelayMs).toEqual([DAY, 2 * DAY, 2 * DAY]);
    expect(NURTURE_SEQUENCES.kit_to_growth.nextStepDelayMs).toEqual([DAY, 2 * DAY]);
    expect(NURTURE_SEQUENCES.kit_to_dfy.nextStepDelayMs).toEqual([DAY, 2 * DAY]);
    expect(NURTURE_SEQUENCES.credit_pack_bought.nextStepDelayMs).toEqual([DAY]);
    expect(NURTURE_SEQUENCES.ai_audit_bought.nextStepDelayMs).toEqual([DAY, 2 * DAY]);
    expect(NURTURE_SEQUENCES.pages_bought.nextStepDelayMs).toEqual([DAY]);
    expect(NURTURE_SEQUENCES.book_to_dfy.nextStepDelayMs).toEqual([DAY]);
    expect(NURTURE_SEQUENCES.subscriber_onboarding.nextStepDelayMs).toEqual([DAY, 2 * DAY]);
    // PR #479's sequence, pre-registered so it inherits the rule on merge (its PR ships +4d).
    expect(NURTURE_SEQUENCES.ai_audit_to_full.steps).toBe(2);
    expect(NURTURE_SEQUENCES.ai_audit_to_full.nextStepDelayMs).toEqual([DAY]);
  });

  it("out-of-range cursor falls back to the last rule value, never 0", () => {
    expect(nurtureNextStepDelayMs("free_to_kit", 99)).toBe(2 * DAY);
  });
});

describe("catalog: every step exists and copy rules hold", () => {
  const catalogSequences = Object.keys(NURTURE_CATALOG) as CatalogSequence[];

  it("catalog covers exactly the sequences the cadence marks as catalog-driven", () => {
    for (const seq of ALL_NURTURE_SEQUENCES) {
      const inCatalog = catalogSequences.includes(seq as CatalogSequence);
      expect(isCatalogSequence(seq), seq).toBe(inCatalog);
    }
    expect(catalogSequences.sort()).toEqual(
      ["ai_audit_bought", "book_to_dfy", "credit_pack_bought", "pages_bought", "subscriber_onboarding"].sort()
    );
  });

  it("step count in the catalog equals the cadence step count", () => {
    for (const seq of catalogSequences) {
      expect(NURTURE_CATALOG[seq].length, seq).toBe(nurtureTotalSteps(seq));
    }
  });

  it("no em-dash anywhere in the new email copy (subject, body, CTA, rendered text + html)", () => {
    for (const seq of catalogSequences) {
      NURTURE_CATALOG[seq].forEach((step, i) => {
        const strings = [
          step.subject,
          step.kicker,
          step.headline,
          ...step.paragraphs,
          ...(step.bullets ?? []),
          step.cta.label,
          step.aside?.text ?? "",
          step.aside?.linkLabel ?? "",
        ];
        for (const s of strings) {
          expect(s, `${seq}#${i + 1}: "${s}"`).not.toContain("—");
        }
        const rendered = renderNurtureCatalogEmail(seq, i, {
          to: "x@example.com",
          brand: "Acme",
          unsubscribeUrl: "https://ozvor.com/api/nurture/unsubscribe?token=t",
        });
        expect(rendered.text, `${seq}#${i + 1} text`).not.toContain("—");
        expect(rendered.html, `${seq}#${i + 1} html`).not.toContain("—");
        expect(rendered.subject).not.toContain("—");
      });
    }
  });

  it("every CTA is first person (I will / I want) and every step links somewhere on ozvor.com", () => {
    for (const seq of catalogSequences) {
      for (const step of NURTURE_CATALOG[seq]) {
        expect(step.cta.label, `${seq}: ${step.cta.label}`).toMatch(/^I (will|want)/);
        expect(step.cta.path.startsWith("/")).toBe(true);
      }
    }
  });

  it("every sentence is 12 words or fewer (copy standard)", () => {
    for (const seq of catalogSequences) {
      for (const step of NURTURE_CATALOG[seq]) {
        const text = [...step.paragraphs, ...(step.bullets ?? []), step.aside?.text ?? ""].join(" ");
        const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
        for (const sentence of sentences) {
          const words = sentence.split(/\s+/).filter(Boolean).length;
          expect(words, `${seq}: "${sentence}"`).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("rendered email carries the one-click unsubscribe link and the brand", () => {
    const r = renderNurtureCatalogEmail("credit_pack_bought", 0, {
      to: "x@example.com",
      brand: "Acme Co",
      unsubscribeUrl: "https://ozvor.com/api/nurture/unsubscribe?token=abc",
    });
    expect(r.text).toContain("Unsubscribe: https://ozvor.com/api/nurture/unsubscribe?token=abc");
    expect(r.html).toContain('href="https://ozvor.com/api/nurture/unsubscribe?token=abc"');
    expect(r.text).toContain("Acme Co");
    expect(r.html).toContain("Acme Co");
    expect(r.text).not.toContain("{brand}");
  });

  it("ai_audit_bought step 3 links /book; step 2 sells OrganicPosts", () => {
    expect(NURTURE_CATALOG.ai_audit_bought[2]!.cta.path).toBe("/book");
    expect(NURTURE_CATALOG.ai_audit_bought[1]!.paragraphs.join(" ")).toContain("OrganicPosts");
  });

  it("unknown step throws (worker logs + retries, never sends the wrong email)", () => {
    expect(() =>
      renderNurtureCatalogEmail("pages_bought", 5, { to: "a@b.c", brand: "X", unsubscribeUrl: "u" })
    ).toThrow(/Unknown nurture step/);
  });
});

describe("suppression map: a purchase kills the lower rungs", () => {
  it("kit kills free_to_kit only", () => {
    expect(NURTURE_SUPPRESS_ON_CONVERSION.kit).toEqual(["free_to_kit"]);
  });
  it("subscription kills every pre-subscription rung", () => {
    expect(NURTURE_SUPPRESS_ON_CONVERSION.subscription).toEqual(
      expect.arrayContaining(["free_to_kit", "kit_to_growth", "kit_to_dfy"])
    );
    expect(NURTURE_SUPPRESS_ON_CONVERSION.subscription).not.toContain("subscriber_onboarding");
  });
  it("organicposts kills everything smaller (including ai_audit_bought and book_to_dfy)", () => {
    const set = NURTURE_SUPPRESS_ON_CONVERSION.organicposts;
    for (const seq of ALL_NURTURE_SEQUENCES) expect(set, seq).toContain(seq);
  });
  it("no map ever suppresses a sequence that does not exist", () => {
    for (const list of Object.values(NURTURE_SUPPRESS_ON_CONVERSION)) {
      for (const seq of list) expect(ALL_NURTURE_SEQUENCES).toContain(seq);
    }
  });
});

describe("chain + constraint helper", () => {
  it("kit_to_growth chains into kit_to_dfy and nothing else chains", () => {
    expect(NURTURE_CHAIN).toEqual({ kit_to_growth: "kit_to_dfy" });
  });
  it("isSequenceCheckViolation recognizes SQLSTATE 23514 and the constraint name", () => {
    expect(isSequenceCheckViolation({ code: "23514" })).toBe(true);
    expect(
      isSequenceCheckViolation(
        new Error('new row violates check constraint "nurture_enrollment_sequence_check"')
      )
    ).toBe(true);
    expect(isSequenceCheckViolation(new Error("connection refused"))).toBe(false);
    expect(isSequenceCheckViolation(null)).toBe(false);
  });
});
