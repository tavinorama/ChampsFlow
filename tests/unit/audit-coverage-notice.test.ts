/**
 * D8d — customer-facing coverage notice: when an audit completes with a
 * partial panel or engines held back for drift, the owner gets ONE honest
 * email saying what was and was not measured. Pins the pure builder + the
 * "is a notice needed" rule.
 */
import { describe, it, expect } from "vitest";
import { buildAuditCoverageNotice, coverageNoticeNeeded } from "../../packages/shared/src/emails/audit-coverage-notice";

describe("coverageNoticeNeeded", () => {
  it("full, healthy panel → no email", () => {
    expect(coverageNoticeNeeded({ comparable: true, paused: [], missing: [] })).toBe(false);
  });
  it("not comparable, or anything paused/missing → email", () => {
    expect(coverageNoticeNeeded({ comparable: false, paused: [], missing: [] })).toBe(true);
    expect(coverageNoticeNeeded({ comparable: true, paused: ["gemini"], missing: [] })).toBe(true);
    expect(coverageNoticeNeeded({ comparable: true, paused: [], missing: ["perplexity"] })).toBe(true);
  });
});

describe("buildAuditCoverageNotice", () => {
  const base = {
    to: "owner@example.com",
    brandName: "Acme <Plumbing>",
    auditId: "a-1",
    answered: ["openai", "anthropic", "gemini"],
    missing: ["perplexity"],
    paused: ["dataforseo"],
    degraded: [],
    comparable: false,
  };

  it("names measured / not measured / held back engines with human labels, and says NOT comparable", () => {
    const m = buildAuditCoverageNotice(base);
    expect(m.subject).toContain("Acme <Plumbing>");
    expect(m.text).toContain("Measured: ChatGPT, Claude, Gemini.");
    expect(m.text).toContain("Not measured (the engine did not answer in time): Perplexity.");
    expect(m.text).toContain("Held back by us");
    expect(m.text).toContain("Google AI Overview");
    expect(m.text).toContain("NOT comparable");
    // HTML-escaped brand, no raw angle brackets from user data
    expect(m.html).toContain("Acme &lt;Plumbing&gt;");
    expect(m.html).not.toContain("<Plumbing>");
    expect(m.html).toContain("not comparable");
  });

  it("comparable run with only a paused engine → says the scored panel is comparable", () => {
    const m = buildAuditCoverageNotice({ ...base, missing: [], comparable: true });
    expect(m.text).toContain("complete and comparable");
    expect(m.text).not.toContain("Not measured");
  });

  it("no tracking pixels / external assets", () => {
    const m = buildAuditCoverageNotice(base);
    expect(m.html).not.toMatch(/<img/i);
    expect(m.html).not.toMatch(/https?:\/\/(?!ozvor\.com)/);
  });
});
