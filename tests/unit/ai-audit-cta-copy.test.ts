/**
 * SPRINT-9 — site-wide AI Audit Stack CTA copy guard.
 * Pure constants only; no rendering. Keeps house style locked:
 * canonical URL, price in the label, no em-dashes, short sentences.
 */

import { describe, it, expect } from "vitest";
import { AI_AUDIT_CTA, AI_AUDIT_URL } from "../../apps/web/src/components/marketing/ai-audit-cta-copy";

describe("AiAuditCta copy", () => {
  it("points at the canonical /ai-audit URL", () => {
    expect(AI_AUDIT_URL).toBe("/ai-audit");
  });

  it("names the $49 price in the audit label", () => {
    expect(AI_AUDIT_CTA.auditLabel).toContain("$49");
  });

  it("uses no em-dashes anywhere", () => {
    for (const v of Object.values(AI_AUDIT_CTA)) {
      expect(v).not.toContain("—");
    }
  });

  it("keeps every sentence at 12 words or fewer", () => {
    for (const v of Object.values(AI_AUDIT_CTA)) {
      for (const sentence of v.split(/[.?!]/)) {
        const words = sentence.trim().split(/\s+/).filter(Boolean);
        expect(words.length).toBeLessThanOrEqual(12);
      }
    }
  });
});
