/**
 * audit-narrative.test.ts — Visibility Loop v2 Phase 3.
 *
 * The founder's complaint: the score moves and nobody can say why. Every line
 * here must be derived from the diff, name the engine and the query, and stay
 * silent about anything the data does not support.
 */
import { describe, it, expect } from "vitest";
import { buildAuditNarrative } from "../../apps/api/src/lib/audit-narrative";
import { compareAudits, type AuditSnapshot, type AuditProbe } from "../../apps/api/src/lib/audit-diff";

const probe = (over: Partial<AuditProbe>): AuditProbe => ({
  provider: "openai",
  queryText: "best crm for smbs",
  cited: false,
  rank: null,
  mentionRate: null,
  ...over,
});

const snap = (over: Partial<AuditSnapshot>): AuditSnapshot => ({
  auditId: "a1",
  createdAt: "2026-08-24T00:00:00Z",
  scores: { ai: 50, performance: 70, brand: 34, overall: 51 },
  probes: [],
  competitors: [],
  offsiteSources: [],
  contentTraits: {},
  providersUsed: ["openai", "anthropic"],
  ...over,
});

const narrate = (from: AuditSnapshot, to: AuditSnapshot) =>
  buildAuditNarrative(compareAudits(from, to));

describe("buildAuditNarrative — citations are the headline", () => {
  it("names the engine and the query when a citation is gained", () => {
    const n = narrate(
      snap({ probes: [probe({ cited: false })] }),
      snap({ auditId: "a2", probes: [probe({ cited: true, rank: 2 })] })
    );
    const line = n.lines.find((l) => l.text.includes("started citing"));
    expect(line?.tone).toBe("gain");
    expect(line?.text).toContain("ChatGPT");
    expect(line?.text).toContain("best crm for smbs");
    expect(line?.detail).toContain("position 2");
  });

  it("reports a lost citation as a loss, with the position it used to hold", () => {
    const n = narrate(
      snap({ probes: [probe({ cited: true, rank: 1 })] }),
      snap({ auditId: "a2", probes: [probe({ cited: false })] })
    );
    const line = n.lines.find((l) => l.text.includes("stopped citing"));
    expect(line?.tone).toBe("loss");
    expect(line?.detail).toContain("was position 1");
  });

  it("calls a rank improvement a gain and a slide a loss", () => {
    const up = narrate(
      snap({ probes: [probe({ cited: true, rank: 5 })] }),
      snap({ auditId: "a2", probes: [probe({ cited: true, rank: 2 })] })
    );
    expect(up.lines.find((l) => l.text.includes("moved you up"))?.tone).toBe("gain");
    const down = narrate(
      snap({ probes: [probe({ cited: true, rank: 1 })] }),
      snap({ auditId: "a2", probes: [probe({ cited: true, rank: 4 })] })
    );
    expect(down.lines.find((l) => l.text.includes("moved you down"))?.tone).toBe("loss");
  });
});

describe("buildAuditNarrative — competitors and sources", () => {
  it("flags a brand-new competitor entrant", () => {
    const n = narrate(
      snap({ competitors: [] }),
      snap({ auditId: "a2", competitors: [{ name: "HubSpot", mentions: 4, displacement: 3 }] })
    );
    const line = n.lines.find((l) => l.text.includes("New competitor"));
    expect(line?.tone).toBe("loss");
    expect(line?.detail).toContain("HubSpot");
  });

  it("reports sources the AI started and stopped leaning on", () => {
    const n = narrate(
      snap({ sourceDomains: ["g2.com", "capterra.com"] }),
      snap({ auditId: "a2", sourceDomains: ["g2.com", "reddit.com"] })
    );
    expect(n.lines.find((l) => l.text.includes("started leaning"))?.detail).toContain("reddit.com");
    expect(n.lines.find((l) => l.text.includes("stopped using"))?.detail).toContain("capterra.com");
  });

  it("says nothing about sources when either run has no source data (no invented loss)", () => {
    const n = narrate(
      snap({}),
      snap({ auditId: "a2", sourceDomains: ["g2.com"] })
    );
    expect(n.lines.some((l) => l.text.includes("leaning") || l.text.includes("stopped using"))).toBe(false);
  });
});

describe("buildAuditNarrative — honesty rules", () => {
  it("says plainly when nothing moved instead of rendering an empty box", () => {
    const same = { probes: [probe({ cited: true, rank: 1 })] };
    const n = narrate(snap(same), snap({ ...same, auditId: "a2" }));
    expect(n.nothingChanged).toBe(true);
    expect(n.lines).toHaveLength(1);
    expect(n.lines[0]?.text).toContain("Nothing moved");
    expect(n.headline).toContain("No change");
  });

  it("declares prompts that exist on only one side as NOT compared", () => {
    const n = narrate(
      snap({ probes: [probe({ queryText: "old question", cited: true, rank: 1 })] }),
      snap({ auditId: "a2", probes: [probe({ queryText: "new question", cited: true, rank: 1 })] })
    );
    const line = n.lines.find((l) => l.text.includes("question set changed"));
    expect(line?.detail).toContain("not compared");
  });

  it("puts the score last — it is the consequence, not the news", () => {
    const n = narrate(
      snap({ scores: { ai: 34, performance: 70, brand: 34, overall: 45 }, probes: [probe({ cited: false })] }),
      snap({ auditId: "a2", scores: { ai: 42, performance: 70, brand: 34, overall: 51 }, probes: [probe({ cited: true, rank: 1 })] })
    );
    const scoreIx = n.lines.findIndex((l) => l.text.includes("Visibility up"));
    const citeIx = n.lines.findIndex((l) => l.text.includes("started citing"));
    expect(citeIx).toBeGreaterThanOrEqual(0);
    expect(scoreIx).toBeGreaterThan(citeIx);
    expect(n.lines[scoreIx]?.detail).toBe("34 → 42");
  });
});
