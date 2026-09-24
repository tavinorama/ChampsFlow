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
  CLOSED_UNATTRIBUTED_PREFIX,
  wasExecuted,
  REGRESSED_PREFIX,
  RETIRED_OFF_PANEL_PREFIX,
  DEFERRED_PREFIX,
  fixLegacyRateMetric,
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

  it("flips an EXECUTED card to VERIFIED with 'Worked — verified' attribution when the query flipped to cited", () => {
    // P0-02: `verified` (not `done`) — and this is the only code path in the
    // product that can produce it. C02 (19/09): it also takes EXECUTION. A
    // published card whose gap is now closed is verified.
    const build = buildLoopCandidates([probe({ cited: true, rank: 1 })]);
    const { rows, stats } = reconcileLoopTasks([prevTask({ status: "published" })], build, dateISO);
    const flipped = rows.find((r) => r.gap === gapForUncited("best crm for smbs"));
    expect(flipped?.status).toBe("verified");
    expect(flipped?.evidence).toContain(`${VERIFIED_PREFIX}${dateISO}`);
    expect(flipped?.evidence).toContain("now cited on openai");
    expect(stats.verified).toBe(1);
    expect(stats.closedWithoutExecution).toBe(0);
  });

  describe("C02 — a citation that shows up is not work that was done", () => {
    const closed = () => buildLoopCandidates([probe({ cited: true, rank: 1 })]);
    const gap = gapForUncited("best crm for smbs");

    for (const status of ["proposed", "accepted", "drafting", "review", "blocked"]) {
      it(`a '${status}' card nobody executed is NEVER verified when the gap closes on its own`, () => {
        const { rows, stats } = reconcileLoopTasks([prevTask({ status })], closed(), dateISO);
        const card = rows.find((r) => r.gap === gap);
        expect(card?.status).toBe("expired");
        expect(card?.evidence).toContain(`${CLOSED_UNATTRIBUTED_PREFIX}${dateISO}`);
        expect(card?.evidence).toContain("claims no credit");
        expect(card?.evidence).not.toContain("Worked");
        expect(stats.verified).toBe(0);
        expect(stats.closedWithoutExecution).toBe(1);
      });
    }

    it("an artifact URL is execution: the card is verified, and the URL survives into the new plan", () => {
      const { rows, stats } = reconcileLoopTasks(
        [prevTask({ status: "accepted", artifact_url: "https://example.com/new-faq" })], closed(), dateISO);
      const card = rows.find((r) => r.gap === gap);
      expect(card?.status).toBe("verified");
      expect(card?.artifact_url).toBe("https://example.com/new-faq");
      expect(stats.verified).toBe(1);
    });

    it("wasExecuted: intent is not execution", () => {
      expect(wasExecuted({ status: "accepted" })).toBe(false);
      expect(wasExecuted({ status: "review", artifact_url: "  " })).toBe(false);
      expect(wasExecuted({ status: "cited" })).toBe(true);
      expect(wasExecuted({ status: "manual_done_pending_verification" })).toBe(true);
    });

    it("the gap comes back on a card that closed on its own: a fresh proposal, not a 'regression' of a win we never had", () => {
      const first = reconcileLoopTasks([prevTask({ status: "proposed" })], closed(), dateISO);
      const back = reconcileLoopTasks(first.rows, buildLoopCandidates([probe({ cited: false })]), "2026-10-01");
      const cards = back.rows.filter((r) => r.gap === gap);
      expect(cards).toHaveLength(1);
      expect(cards[0]?.status).toBe("proposed");
      expect(back.stats.regressed).toBe(0);
      expect(back.stats.created).toBe(1);
    });

    it("still closed at the next audit: it stays in the done column as expired, takes no open slot", () => {
      const first = reconcileLoopTasks([prevTask({ status: "proposed" })], closed(), dateISO);
      const again = reconcileLoopTasks(first.rows, closed(), "2026-10-01");
      expect(again.rows.find((r) => r.gap === gap)?.status).toBe("expired");
      expect(again.stats.verified).toBe(0);
    });
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

describe("P05 — a card about a question the audit no longer asks leaves the open list", () => {
  const SAAS = [
    "Best Saas for SMBs on a budget",
    "How to choose a Saas vendor",
    "Most trusted Saas companies",
    "Pros and cons of leading Saas options",
    "Saas alternatives worth considering",
    "Top Saas providers in 2026",
    "Which Saas do experts recommend?",
    "What is the best Saas for small businesses?",
    "Saas pricing compared",
    "Saas for agencies",
    "Saas for local services",
    "Saas onboarding time",
  ];
  const stale = SAAS.map((q) => prevTask({ gap: gapForUncited(q), action: `old action for ${q}` }));
  const panelProbes = [probe({ queryText: "which tools track ai search visibility" })];

  it("the production case: 12 stale cards used to fill every slot and keep the new finding out", () => {
    expect(stale.length).toBe(LOOP_OPEN_CAP);
    const build = buildLoopCandidates(panelProbes);
    expect([...build.probedQueries!]).toEqual(["which tools track ai search visibility"]);
    const { rows, stats } = reconcileLoopTasks(stale, build, "2026-09-21");

    expect(stats.retiredOffPanel).toBe(12);
    expect(stats.created).toBe(1);
    expect(stats.queueBlocked).toBe(false);
    const open = rows.filter((r) => r.status === "proposed");
    expect(open.map((r) => r.gap)).toEqual([gapForUncited("which tools track ai search visibility")]);
  });

  it("nothing is deleted: the retired card is kept as expired, with the reason, the date and its old evidence", () => {
    const { rows } = reconcileLoopTasks([stale[0]!], buildLoopCandidates(panelProbes), "2026-09-21");
    const retired = rows.find((r) => r.gap === gapForUncited(SAAS[0]!))!;
    expect(retired.status).toBe("expired");
    expect(retired.evidence).toContain(`${RETIRED_OFF_PANEL_PREFIX}2026-09-21`);
    expect(retired.evidence).toContain("Nothing was executed on this card");
    expect(retired.evidence).toContain("old evidence");
  });

  it("work that was done is never retired, even when we stopped asking the question", () => {
    const done = [
      prevTask({ gap: gapForUncited(SAAS[0]!), status: "published", artifact_url: "https://ozvor.com/x" }),
      prevTask({ gap: gapForUncited(SAAS[1]!), status: "manual_done_pending_verification" }),
    ];
    const { rows, stats } = reconcileLoopTasks(done, buildLoopCandidates(panelProbes), "2026-09-21");
    expect(stats.retiredOffPanel).toBe(0);
    expect(rows.find((r) => r.gap === gapForUncited(SAAS[0]!))?.status).toBe("published");
    expect(rows.find((r) => r.gap === gapForUncited(SAAS[1]!))?.status).toBe("manual_done_pending_verification");
  });

  it("a question still in the panel is never retired, and a card that is not about a question is left alone", () => {
    const prev = [
      prevTask({ gap: gapForUncited("which tools track ai search visibility") }),
      prevTask({ gap: gapForSource("g2.com") }),
      prevTask({ gap: "Your brand is cited in fewer than half of the buyer prompts we tested.", status: "legacy_self_reported" }),
    ];
    const { stats } = reconcileLoopTasks(prev, buildLoopCandidates(panelProbes), "2026-09-21");
    expect(stats.retiredOffPanel).toBe(0);
  });

  it("an audit that asked nothing (or a hand-built result with no panel) retires nothing", () => {
    expect(reconcileLoopTasks(stale, buildLoopCandidates([]), "2026-09-21").stats.retiredOffPanel).toBe(0);
    expect(reconcileLoopTasks(stale, { candidates: [], resolved: new Map() }, "2026-09-21").stats.retiredOffPanel).toBe(0);
  });

  it("if the question comes back and is still lost, it is proposed again as a fresh card", () => {
    const first = reconcileLoopTasks([stale[0]!], buildLoopCandidates(panelProbes), "2026-09-21");
    const retired = first.rows.find((r) => r.gap === gapForUncited(SAAS[0]!))!;
    const back = buildLoopCandidates([probe({ queryText: SAAS[0]! })]);
    const second = reconcileLoopTasks([retired as unknown as PrevTask], back, "2026-09-28");
    const again = second.rows.filter((r) => r.gap === gapForUncited(SAAS[0]!));
    expect(again.length).toBe(1);
    expect(again[0]!.status).toBe("proposed");
    expect(again[0]!.evidence).not.toContain(RETIRED_OFF_PANEL_PREFIX);
  });
});

describe("P05 — the legacy card no longer prints the index as a rate", () => {
  it("drops the stale 'current: 52%' from a carried legacy metric, and touches nothing else", () => {
    expect(fixLegacyRateMetric("Citation rate across buyer prompts (current: 52% → target: >50%)")).toBe(
      "Share of buyer prompts that name you (current: see this audit → target: >50%)"
    );
    expect(fixLegacyRateMetric("old metric")).toBe("old metric");
    expect(fixLegacyRateMetric(null)).toBeNull();
  });

  it("a carried legacy card comes out with the corrected metric", () => {
    const legacy = prevTask({
      gap: "Your brand is cited in fewer than half of the buyer prompts we tested.",
      status: "legacy_self_reported",
      metric: "Citation rate across buyer prompts (current: 52% → target: >50%)",
    });
    const { rows } = reconcileLoopTasks([legacy], buildLoopCandidates([probe({})]), "2026-09-21");
    expect(rows.find((r) => r.gap === legacy.gap)?.metric).not.toContain("52%");
  });
});

describe("B6 (D16) — an executed card is verified only by answers fetched after the work", () => {
  const Q = "best crm for smbs";
  const published = (changedAt: string) =>
    prevTask({ gap: gapForUncited(Q), status: "published", artifact_url: "https://acme.com/crm", state_changed_at: changedAt });
  const citedProbe = (fetchedAt: string | null) => probe({ queryText: Q, cited: true, rank: 1, fetchedAt });

  it("answers fetched BEFORE the artifact: not verified, carried with the reason, slot kept", () => {
    const build = buildLoopCandidates([citedProbe("2026-09-21T18:24:00Z")]);
    expect(build.observedAt?.get(gapForUncited(Q))).toBe("2026-09-21T18:24:00Z");
    const { rows, stats } = reconcileLoopTasks([published("2026-09-22T10:00:00Z")], build, "2026-09-23");
    const row = rows.find((r) => r.gap === gapForUncited(Q))!;
    expect(row.status).toBe("published");
    expect(row.evidence).toContain(`${DEFERRED_PREFIX}2026-09-23`);
    expect(row.evidence).toContain("before this card's work of 2026-09-22T10:00Z");
    expect(stats.verified).toBe(0);
    expect(stats.verificationDeferred).toBe(1);
  });

  it("answers fetched AFTER the artifact: verified, as before", () => {
    const build = buildLoopCandidates([citedProbe("2026-09-28T06:05:00Z")]);
    const { rows, stats } = reconcileLoopTasks([published("2026-09-22T10:00:00Z")], build, "2026-09-28");
    expect(rows.find((r) => r.gap === gapForUncited(Q))!.status).toBe("verified");
    expect(stats.verified).toBe(1);
    expect(stats.verificationDeferred).toBe(0);
  });

  it("an answer with no stamp is unknown, not fresh: defers and says so", () => {
    const build = buildLoopCandidates([citedProbe("2026-09-28T06:05:00Z"), { ...citedProbe(null), provider: "anthropic" }]);
    expect(build.observedAt?.get(gapForUncited(Q))).toBeNull();
    const { rows, stats } = reconcileLoopTasks([published("2026-09-22T10:00:00Z")], build, "2026-09-28");
    expect(rows.find((r) => r.gap === gapForUncited(Q))!.evidence).toContain("unknown time");
    expect(stats.verificationDeferred).toBe(1);
  });

  it("a card with no state_changed_at (pre-lifecycle) keeps the old behaviour", () => {
    const build = buildLoopCandidates([citedProbe("2026-09-21T18:24:00Z")]);
    const t = prevTask({ gap: gapForUncited(Q), status: "published", artifact_url: "https://acme.com/crm" });
    const { stats } = reconcileLoopTasks([t], build, "2026-09-23");
    expect(stats.verified).toBe(1);
  });

  it("a deferred card is not re-prefixed on the next deferral", () => {
    const build = buildLoopCandidates([citedProbe("2026-09-21T18:24:00Z")]);
    const first = reconcileLoopTasks([published("2026-09-22T10:00:00Z")], build, "2026-09-23").rows[0]!;
    const second = reconcileLoopTasks([{ ...(first as unknown as PrevTask), state_changed_at: "2026-09-22T10:00:00Z" }], build, "2026-09-24").rows[0]!;
    expect(second.evidence!.split(DEFERRED_PREFIX).length - 1).toBe(1);
  });
});
