/**
 * visibility-loop.test.ts — Visibility Loop v2 Phase 1.
 *
 * The promise under test: every completed audit refreshes "Do Next"
 * deterministically from citation evidence — uncited queries (naming who wins
 * them), low-rank citations, and source domains the AI uses without the brand
 * — with stable keys (re-runs refresh, never duplicate), flip attribution
 * ("Worked — verified in the audit of <date>"), done stays done, rejected is
 * respected, and at most 12 open cards.
 */
import { describe, it, expect } from "vitest";
import {
  buildLoopCandidates,
  reconcileLoopTasks,
  gapForUncited,
  gapForLowRank,
  gapForSource,
  sourceDomain,
  isActionableSource,
  LOOP_OPEN_CAP,
  VERIFIED_PREFIX,
  REGRESSED_PREFIX,
  type LoopProbe,
  type PrevTask,
} from "../../packages/llm/src/visibility-loop";

const probe = (over: Partial<LoopProbe>): LoopProbe => ({
  provider: "openai",
  queryText: "best crm for smbs",
  cited: false,
  rank: null,
  sources: [],
  competitors: [],
  ...over,
});

const prevTask = (over: Partial<PrevTask>): PrevTask => ({
  vector: "ai",
  gap: gapForUncited("best crm for smbs"),
  action: "old action",
  effort: "medium",
  impact: "high",
  priority: 70,
  status: "proposed",
  evidence: "old evidence",
  metric: "old metric",
  owner: "you",
  ...over,
});

describe("sourceDomain", () => {
  it("extracts bare host, dropping www", () => {
    expect(sourceDomain("https://www.g2.com/products/x")).toBe("g2.com");
    expect(sourceDomain("https://reddit.com/r/crm")).toBe("reddit.com");
  });
  it("survives non-URL input without throwing", () => {
    expect(sourceDomain("g2.com/products")).toBe("g2.com");
    expect(sourceDomain("")).toBe("");
  });
});

describe("buildLoopCandidates — uncited queries", () => {
  it("emits a card naming the query, the winning competitor and the source domain", () => {
    const { candidates } = buildLoopCandidates([
      probe({
        provider: "openai",
        cited: false,
        competitors: ["HubSpot"],
        sources: ["https://www.g2.com/best-crm"],
      }),
      probe({ provider: "google", cited: false }),
    ]);
    const card = candidates.find((c) => c.gap === gapForUncited("best crm for smbs"));
    expect(card).toBeDefined();
    expect(card?.vector).toBe("ai");
    expect(card?.action).toContain('"best crm for smbs"');
    expect(card?.action).toContain("HubSpot");
    expect(card?.action).toContain("g2.com");
    expect(card?.impact).toBe("high"); // competitor cited where we are absent
    expect(card?.evidence).toContain("google");
    expect(card?.evidence).toContain("openai");
  });

  it("is deterministic: same evidence, same cards, same keys", () => {
    const probes = [
      probe({ competitors: ["HubSpot"], sources: ["https://g2.com/a"] }),
      probe({ provider: "google", queryText: "crm reviews", cited: true, rank: 5 }),
    ];
    const a = buildLoopCandidates(probes);
    const b = buildLoopCandidates(probes);
    expect(a.candidates).toEqual(b.candidates);
  });

  it("uncited on ANY engine keeps the uncited card open (partial fixes do not close it)", () => {
    const { candidates, resolved } = buildLoopCandidates([
      probe({ provider: "openai", cited: true, rank: 1 }),
      probe({ provider: "google", cited: false }),
    ]);
    expect(candidates.some((c) => c.gap === gapForUncited("best crm for smbs"))).toBe(true);
    expect(resolved.has(gapForUncited("best crm for smbs"))).toBe(false);
  });
});

describe("buildLoopCandidates — cited but low", () => {
  it("emits an improvement card when worst rank is below the fold", () => {
    const { candidates } = buildLoopCandidates([
      probe({ provider: "openai", cited: true, rank: 5 }),
      probe({ provider: "google", cited: true, rank: 2 }),
    ]);
    const card = candidates.find((c) => c.gap === gapForLowRank("best crm for smbs"));
    expect(card).toBeDefined();
    expect(card?.action).toContain("position 5");
  });

  it("resolves BOTH query gaps when cited everywhere at a good position", () => {
    const { candidates, resolved } = buildLoopCandidates([
      probe({ provider: "openai", cited: true, rank: 1 }),
      probe({ provider: "google", cited: true, rank: 2 }),
    ]);
    expect(candidates.filter((c) => c.gap.includes("best crm"))).toHaveLength(0);
    expect(resolved.get(gapForUncited("best crm for smbs"))).toContain("now cited on");
    expect(resolved.has(gapForLowRank("best crm for smbs"))).toBe(true);
  });
});

describe("isActionableSource — search plumbing is never a card", () => {
  it("rejects the redirect/search hosts that real Gemini + SERP runs return", () => {
    // Straight from the founder's 02/09 run (audit 28efdf4e): EVERY Gemini
    // source is a vertexaisearch redirect and the SERP engine returns
    // google.com/search. Without this guard the top "get present on" card the
    // customer sees is "get present on vertexaisearch.cloud.google.com".
    expect(isActionableSource("vertexaisearch.cloud.google.com")).toBe(false);
    expect(isActionableSource("google.com")).toBe(false);
    expect(isActionableSource("storage.googleusercontent.com")).toBe(false);
    expect(isActionableSource("bing.com")).toBe(false);
    expect(isActionableSource("")).toBe(false);
  });
  it("keeps real publications actionable", () => {
    expect(isActionableSource("g2.com")).toBe(true);
    expect(isActionableSource("reddit.com")).toBe(true);
    expect(isActionableSource("blog.google.dev")).toBe(true);
  });
  it("never emits a card for a redirect host, even when it is the only source", () => {
    const { candidates } = buildLoopCandidates([
      probe({ provider: "google", cited: false, sources: ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ"] }),
      probe({ provider: "dataforseo", cited: false, sources: ["https://www.google.com/search", "https://www.reddit.com/r/saas"] }),
    ]);
    expect(candidates.some((c) => c.gap.includes("vertexaisearch"))).toBe(false);
    expect(candidates.some((c) => c.gap === gapForSource("google.com"))).toBe(false);
    expect(candidates.some((c) => c.gap === gapForSource("reddit.com"))).toBe(true);
  });
});

describe("buildLoopCandidates — source presence", () => {
  it("emits get-present cards for domains AI uses on answers without the brand", () => {
    const { candidates } = buildLoopCandidates([
      probe({ cited: false, sources: ["https://www.capterra.com/x", "https://g2.com/y"] }),
      probe({ queryText: "top crm tools", cited: false, sources: ["https://g2.com/z"] }),
    ]);
    const g2 = candidates.find((c) => c.gap === gapForSource("g2.com"));
    expect(g2).toBeDefined();
    expect(g2?.vector).toBe("brand");
    expect(g2?.action).toContain("2 queries");
    expect(candidates.some((c) => c.gap === gapForSource("capterra.com"))).toBe(true);
  });

  it("never tells the brand to get present on its own domain", () => {
    const { candidates } = buildLoopCandidates(
      [probe({ cited: false, sources: ["https://www.acme.com/about", "https://g2.com/x"] })],
      { brandDomain: "acme.com" }
    );
    expect(candidates.some((c) => c.gap === gapForSource("acme.com"))).toBe(false);
    expect(candidates.some((c) => c.gap === gapForSource("g2.com"))).toBe(true);
  });

  it("resolves a source gap when the domain is still cited but the brand is now present", () => {
    const { resolved } = buildLoopCandidates([
      probe({ cited: true, rank: 1, sources: ["https://g2.com/x"] }),
    ]);
    expect(resolved.has(gapForSource("g2.com"))).toBe(true);
  });
});

describe("reconcileLoopTasks — the loop contract", () => {
  const dateISO = "2026-09-03";

  it("flips an open card to VERIFIED with 'Worked — verified' attribution when the query flipped to cited", () => {
    // P0-02: `verified` (not `done`) — and this is the only code path in the
    // product that can produce it. It is earned by the citation, not claimed.
    const build = buildLoopCandidates([probe({ cited: true, rank: 1 })]);
    const { rows, stats } = reconcileLoopTasks([prevTask({ status: "accepted" })], build, dateISO);
    const flipped = rows.find((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(flipped?.status).toBe("verified");
    expect(flipped?.evidence).toContain(`${VERIFIED_PREFIX}${dateISO}`);
    expect(flipped?.evidence).toContain("now cited on openai");
    expect(stats.verified).toBe(1);
  });

  it("a self-reported card is verified once — and only once — the audit finds the citation", () => {
    // The legacy 'done' rows (checkbox era) are claims. They stay eligible:
    // when the evidence finally arrives, the claim is upgraded to proof.
    const build = buildLoopCandidates([probe({ cited: true, rank: 1 })]);
    const { rows, stats } = reconcileLoopTasks(
      [prevTask({ status: "done", evidence: "I ticked the box" })],
      build,
      dateISO
    );
    const card = rows.find((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(card?.status).toBe("verified");
    expect(stats.verified).toBe(1);
  });

  it("refreshes an open card (new action/evidence/priority) instead of duplicating when the gap persists", () => {
    const build = buildLoopCandidates([probe({ cited: false, competitors: ["HubSpot"] })]);
    const { rows, stats } = reconcileLoopTasks([prevTask({ status: "accepted" })], build, dateISO);
    const matching = rows.filter((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(matching).toHaveLength(1); // upsert semantics: no duplicate
    expect(matching[0]?.status).toBe("accepted"); // status preserved
    expect(matching[0]?.action).toContain("HubSpot"); // content refreshed
    expect(stats.refreshed).toBe(1);
    expect(stats.created).toBe(0);
  });

  it("re-running with the same evidence is idempotent (same rows out)", () => {
    const build = buildLoopCandidates([probe({ cited: false })]);
    const first = reconcileLoopTasks([], build, dateISO);
    const second = reconcileLoopTasks(first.rows, build, dateISO);
    expect(second.rows).toEqual(first.rows);
  });

  it("a self-reported 'done' card that is still a gap goes BACK on the open list", () => {
    // Changed by P0-02, deliberately. The old contract was "done stays done",
    // which is how a brand with a failing audit showed Execution 100. A
    // checkbox tick is a claim; when the audit still sees the gap, the claim
    // does not survive it. Rejected still stays rejected — that one was the
    // client's decision, not a claim about the world.
    const build = buildLoopCandidates([probe({ cited: false })]);
    const { rows } = reconcileLoopTasks(
      [
        prevTask({ status: "done", evidence: "manually done" }),
        prevTask({ gap: gapForSource("g2.com"), status: "rejected", vector: "brand" }),
      ],
      build,
      dateISO
    );
    const card = rows.find((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(card?.status).toBe("legacy_self_reported");
    expect(card?.status).not.toBe("verified"); // a claim never becomes proof by ageing
    expect(rows.find((r) => r.gap === gapForSource("g2.com"))?.status).toBe("rejected");
    // and no second open copy of either gap appears
    expect(rows.filter((r) => r.gap === gapForUncited("best crm for smbs"))).toHaveLength(1);
  });

  it("REGRESSION re-opens a verified card when the gap comes back", () => {
    // Audit §17: "Regression reabre ação". The row is re-opened as `regressed`
    // with the reason attached — the previous verification is quoted, not erased.
    const build = buildLoopCandidates([probe({ cited: false })]);
    const { rows, stats } = reconcileLoopTasks(
      [
        prevTask({
          status: "verified",
          evidence: `${VERIFIED_PREFIX}2026-08-01: now cited on openai.`,
        }),
      ],
      build,
      dateISO
    );
    const card = rows.find((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(card?.status).toBe("regressed");
    expect(card?.evidence).toContain(REGRESSED_PREFIX);
    expect(card?.evidence).toContain("2026-08-01"); // history quoted, not lost
    expect(stats.regressed).toBe(1);
    expect(stats.verified).toBe(0);
  });

  it("a verified card the audit does NOT contradict stays verified", () => {
    const build = buildLoopCandidates([probe({ gap: undefined, cited: true, rank: 1 })]);
    const { rows, stats } = reconcileLoopTasks(
      [prevTask({ gap: gapForSource("g2.com"), status: "verified", vector: "brand" })],
      build,
      dateISO
    );
    expect(rows.find((r) => r.gap === gapForSource("g2.com"))?.status).toBe("verified");
    expect(stats.regressed).toBe(0);
  });

  it("carries open custom/stale cards unchanged — never silently dropped", () => {
    const build = buildLoopCandidates([probe({ cited: false })]);
    const custom = prevTask({ gap: "Ship the pricing page", action: "Ship it", status: "accepted" });
    const { rows, stats } = reconcileLoopTasks([custom], build, dateISO);
    const carried = rows.find((r) => r.gap === "Ship the pricing page");
    expect(carried?.status).toBe("accepted");
    expect(carried?.action).toBe("Ship it");
    expect(stats.carried).toBe(1);
  });

  it(`caps NEW open cards so the open list never exceeds ${LOOP_OPEN_CAP}`, () => {
    const probes: LoopProbe[] = Array.from({ length: 20 }, (_, i) =>
      probe({ queryText: `query number ${i}`, cited: false })
    );
    const build = buildLoopCandidates(probes);
    const { rows, stats } = reconcileLoopTasks([], build, dateISO);
    const open = rows.filter((r) => r.status === "proposed" || r.status === "accepted");
    expect(open.length).toBe(LOOP_OPEN_CAP);
    expect(stats.droppedByCap).toBeGreaterThan(0);
  });

  it("coerces legacy/invalid enum values so the INSERT never violates plan_task CHECKs", () => {
    const build = buildLoopCandidates([]);
    const { rows } = reconcileLoopTasks(
      [prevTask({ gap: "custom card", vector: "custom", effort: "weird", impact: "", owner: null, status: "accepted" })],
      build,
      dateISO
    );
    expect(rows[0]?.vector).toBe("ai");
    expect(rows[0]?.effort).toBe("medium");
    expect(rows[0]?.impact).toBe("medium");
    expect(rows[0]?.owner).toBe("you");
  });
});
