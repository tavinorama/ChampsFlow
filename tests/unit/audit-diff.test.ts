/**
 * audit-diff.test.ts — the point-by-point audit comparison must only ever
 * report REAL differences between two snapshots: citations gained/lost,
 * position/rate moves, prompts added/removed (never silently compared),
 * competitor shifts, off-site flips, trait moves, provider changes.
 */
import { describe, it, expect } from "vitest";
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
  createdAt: "2026-06-01T00:00:00Z",
  scores: { ai: 50, performance: 70, brand: 80, overall: 66 },
  probes: [],
  competitors: [],
  offsiteSources: [],
  contentTraits: {},
  providersUsed: ["openai"],
  ...over,
});

describe("compareAudits — scores", () => {
  it("computes signed deltas for all three vectors + overall", () => {
    const d = compareAudits(
      snap({ scores: { ai: 50, performance: 70, brand: 80, overall: 66 } }),
      snap({ auditId: "a2", createdAt: "2026-07-01T00:00:00Z", scores: { ai: 62, performance: 65, brand: 80, overall: 69 } })
    );
    expect(d.scores.ai.delta).toBe(12);
    expect(d.scores.performance.delta).toBe(-5);
    expect(d.scores.brand.delta).toBe(0);
    expect(d.scores.overall.delta).toBe(3);
  });

  it("overall delta is null when either side lacks overall (no invented numbers)", () => {
    const d = compareAudits(
      snap({ scores: { ai: 50, performance: 70, brand: 80, overall: null } }),
      snap({ auditId: "a2", scores: { ai: 50, performance: 70, brand: 80, overall: 70 } })
    );
    expect(d.scores.overall.delta).toBeNull();
  });
});

describe("compareAudits — citations point by point", () => {
  it("classifies gained, lost, position moves and unchanged correctly", () => {
    const from = snap({
      probes: [
        probe({ queryText: "q gained", cited: false }),
        probe({ queryText: "q lost", cited: true, rank: 2 }),
        probe({ queryText: "q moved", cited: true, rank: 3 }),
        probe({ queryText: "q same", cited: true, rank: 1 }),
      ],
    });
    const to = snap({
      auditId: "a2",
      createdAt: "2026-07-01T00:00:00Z",
      probes: [
        probe({ queryText: "q gained", cited: true, rank: 2 }),
        probe({ queryText: "q lost", cited: false }),
        probe({ queryText: "q moved", cited: true, rank: 1 }),
        probe({ queryText: "q same", cited: true, rank: 1 }),
      ],
    });
    const d = compareAudits(from, to);
    expect(d.citations.gained.map((c) => c.queryText)).toEqual(["q gained"]);
    expect(d.citations.lost.map((c) => c.queryText)).toEqual(["q lost"]);
    expect(d.citations.positionChanged.map((c) => c.queryText)).toEqual(["q moved"]);
    expect(d.citations.unchanged).toBe(1);
  });

  it("prompts present in only one audit are added/removed — NEVER force-compared", () => {
    const d = compareAudits(
      snap({ probes: [probe({ queryText: "old prompt", cited: true, rank: 1 })] }),
      snap({ auditId: "a2", probes: [probe({ queryText: "new prompt", cited: false })] })
    );
    expect(d.citations.promptsRemoved.map((p) => p.queryText)).toEqual(["old prompt"]);
    expect(d.citations.promptsAdded.map((p) => p.queryText)).toEqual(["new prompt"]);
    expect(d.citations.gained).toHaveLength(0);
    expect(d.citations.lost).toHaveLength(0);
  });

  it("same prompt on different providers is compared per provider", () => {
    const d = compareAudits(
      snap({ probes: [probe({ provider: "openai", cited: false }), probe({ provider: "gemini", cited: true, rank: 1 })] }),
      snap({ auditId: "a2", probes: [probe({ provider: "openai", cited: true, rank: 1 }), probe({ provider: "gemini", cited: true, rank: 1 })] })
    );
    expect(d.citations.gained).toHaveLength(1);
    expect(d.citations.gained[0]?.provider).toBe("openai");
    expect(d.citations.unchanged).toBe(1);
  });

  it("mention-rate moves ≥0.1 with unchanged rank are reported as rateChanged", () => {
    const d = compareAudits(
      snap({ probes: [probe({ cited: true, rank: 1, mentionRate: 0.33 })] }),
      snap({ auditId: "a2", probes: [probe({ cited: true, rank: 1, mentionRate: 1.0 })] })
    );
    expect(d.citations.rateChanged).toHaveLength(1);
    expect(d.citations.unchanged).toBe(0);
  });
});

describe("compareAudits — competitors, offsite, traits, providers", () => {
  it("reports competitor shifts incl. new and removed competitors", () => {
    const d = compareAudits(
      snap({ competitors: [{ name: "HubSpot", mentions: 4, displacement: 2 }, { name: "Zoho", mentions: 1, displacement: 0 }] }),
      snap({ auditId: "a2", competitors: [{ name: "HubSpot", mentions: 6, displacement: 1 }, { name: "Pipedrive", mentions: 2, displacement: 2 }] })
    );
    const byName = Object.fromEntries(d.competitors.changed.map((c) => [c.name, c]));
    expect(byName["HubSpot"]?.to?.mentions).toBe(6);
    expect(byName["Zoho"]?.to).toBeNull();       // removed
    expect(byName["Pipedrive"]?.from).toBeNull(); // new
  });

  it("offsite: only flips are reported; sources unmeasured in `from` make no claim", () => {
    const d = compareAudits(
      snap({ offsiteSources: [{ label: "Reddit", present: false }, { label: "Wikipedia", present: true }] }),
      snap({
        auditId: "a2",
        offsiteSources: [
          { label: "Reddit", present: true },     // gained
          { label: "Wikipedia", present: false }, // lost
          { label: "G2", present: true },         // not measured before → ignored
        ],
      })
    );
    expect(d.offsite.gained).toEqual(["Reddit"]);
    expect(d.offsite.lost).toEqual(["Wikipedia"]);
  });

  it("content traits: moves ≥0.05 reported with delta; one-sided traits carry null delta", () => {
    const d = compareAudits(
      snap({ contentTraits: { statistics: 0.2, faq: 0.5 } }),
      snap({ auditId: "a2", contentTraits: { statistics: 0.6, faq: 0.51, quotations: 0.4 } })
    );
    const byTrait = Object.fromEntries(d.contentTraits.changed.map((t) => [t.trait, t]));
    expect(byTrait["statistics"]?.delta).toBeCloseTo(0.4);
    expect(byTrait["faq"]).toBeUndefined(); // 0.01 move — below threshold
    expect(byTrait["quotations"]?.delta).toBeNull();
  });

  it("providers added/removed", () => {
    const d = compareAudits(
      snap({ providersUsed: ["openai", "google"] }),
      snap({ auditId: "a2", providersUsed: ["openai", "anthropic"] })
    );
    expect(d.providers.added).toEqual(["anthropic"]);
    expect(d.providers.removed).toEqual(["google"]);
  });
});
