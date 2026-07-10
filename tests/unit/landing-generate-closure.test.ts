/**
 * landing-generate-closure.test.ts — audit → rebuild loop CLOSURE (#208 PR-7).
 *
 * PR-4 already made the generator CONSUME a brand's open plan_task gaps
 * (auditGaps) and stamp landing_site_id on those rows. PR-7 closes the loop:
 * a card the generation run actually fed into the bundle should flip to
 * 'done', gain one evidence line, and link to whichever page materialized it
 * (FAQ-shaped gaps -> the faq page, everything else -> home) — never a
 * blanket close of every open card for the brand.
 *
 * closeConsumedGapCards is exercised here against a lightweight in-memory
 * mock of the postgres.js tagged-template `sql` client (same
 * mock-DB-by-behavior style as tests/unit/cost-control.test.ts's
 * makeRouteDb/makeCounterDb, adapted for tagged templates instead of
 * $1-style params) rather than the full processLandingGenerateJob pipeline
 * (crawl/testimonials/LLM/etc.) — the closure decision logic is isolated and
 * independently testable by construction.
 */
import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import {
  isFaqGap,
  buildClosureEvidenceLine,
  closeConsumedGapCards,
  type ConsumedGapCard,
} from "../../apps/worker/src/jobs/landing-generate";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("isFaqGap — routes a gap/action pair to the FAQ vs. home page", () => {
  it("detects the literal word FAQ", () => {
    expect(isFaqGap('needs FAQ page answering "best plumber austin"', "Add FAQ content")).toBe(true);
  });

  it("detects 'question' as a signal (same heuristic as strategy-generator.ts's toCalendarTopic)", () => {
    expect(isFaqGap("Little answer-shaped content for engines to extract", "Add question-style headings")).toBe(
      true
    );
  });

  it("is false for gaps with no FAQ/question signal", () => {
    expect(
      isFaqGap("Your brand isn't strongly resolved as a knowledge-graph entity", "Add Organization schema")
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isFaqGap("needs an faq section", "write it")).toBe(true);
  });
});

describe("buildClosureEvidenceLine — the one-line note appended on closure", () => {
  it("includes the ISO timestamp and the page label", () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    expect(buildClosureEvidenceLine("FAQ — Joe's Plumbing", now)).toBe(
      "Applied by Ozvor Pages generation on 2026-07-10T12:00:00.000Z: FAQ — Joe's Plumbing"
    );
  });
});

// ---------------------------------------------------------------------------
// closeConsumedGapCards — mock postgres.js tagged-template client
// ---------------------------------------------------------------------------

interface MockTaskState {
  status: string;
  evidence: string | null;
  landing_page_id: string | null;
  landing_site_id: string | null;
}

/**
 * Emulates the two UPDATE statements closeConsumedGapCards issues per card:
 *   1. an UNCONDITIONAL `SET landing_site_id = ...` (values: [siteId, cardId])
 *   2. a WHERE-guarded `SET landing_page_id/evidence/status ... WHERE status
 *      IN ('proposed','accepted') RETURNING id` (values: [pageId,
 *      evidenceLine, evidenceLine (repeated), cardId])
 * dispatched by matching literal SQL fragments from the tagged-template
 * strings — the same "guard on the row's own status" semantics as real
 * Postgres, so a re-run against the SAME state proves the real idempotency
 * contract (not caller bookkeeping).
 */
function makeMockSql(state: Record<string, MockTaskState>) {
  const calls: { text: string; values: unknown[] }[] = [];
  const fn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("¶");
    calls.push({ text, values });

    if (text.includes("SET landing_site_id")) {
      const [siteId, cardId] = values as [string, string];
      const row = state[cardId];
      if (row) row.landing_site_id = siteId;
      return [];
    }

    if (text.includes("status = 'done'")) {
      const [pageId, evidenceLine, , cardId] = values as [string | null, string, string, string];
      const row = state[cardId];
      if (!row || !(row.status === "proposed" || row.status === "accepted")) return [];
      row.status = "done";
      row.landing_page_id = pageId ?? row.landing_page_id;
      row.evidence = row.evidence ? `${row.evidence}\n${evidenceLine}` : evidenceLine;
      return [{ id: cardId }];
    }

    return [];
  }) as unknown as postgres.Sql;
  return { sql: fn, calls };
}

const SITE_ID = "11111111-1111-1111-1111-111111111111";
const FAQ_PAGE = { id: "22222222-2222-2222-2222-222222222222", title: "FAQ — Joe's Plumbing" };
const HOME_PAGE = { id: "33333333-3333-3333-3333-333333333333", title: "Joe's Plumbing" };

function pageMap() {
  return new Map([
    ["faq", FAQ_PAGE],
    ["home", HOME_PAGE],
  ]);
}

describe("closeConsumedGapCards", () => {
  it("closes a 'proposed' FAQ-shaped card: done + evidence + landing_page_id -> faq page", async () => {
    const cardId = "44444444-4444-4444-4444-444444444444";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "proposed", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [
      { id: cardId, gap: 'needs FAQ page answering "best plumber austin"', action: "Add FAQ content" },
    ];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closed).toBe(1);
    expect(state[cardId].status).toBe("done");
    expect(state[cardId].landing_page_id).toBe(FAQ_PAGE.id);
    expect(state[cardId].evidence).toContain("Applied by Ozvor Pages generation on");
    expect(state[cardId].evidence).toContain(FAQ_PAGE.title);
    expect(state[cardId].landing_site_id).toBe(SITE_ID);
  });

  it("closes an 'accepted' non-FAQ card to the home page", async () => {
    const cardId = "55555555-5555-5555-5555-555555555555";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "accepted", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [
      {
        id: cardId,
        gap: "Your brand isn't strongly resolved as a knowledge-graph entity",
        action: "Add Organization schema",
      },
    ];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closed).toBe(1);
    expect(state[cardId].status).toBe("done");
    expect(state[cardId].landing_page_id).toBe(HOME_PAGE.id);
  });

  it("never flips a 'rejected' card and never appends evidence to it", async () => {
    const cardId = "66666666-6666-6666-6666-666666666666";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "rejected", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [{ id: cardId, gap: "gap", action: "action" }];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closed).toBe(0);
    expect(state[cardId].status).toBe("rejected");
    expect(state[cardId].evidence).toBeNull();
    expect(state[cardId].landing_page_id).toBeNull();
    // landing_site_id is still stamped — unchanged PR-4 contract, independent of status.
    expect(state[cardId].landing_site_id).toBe(SITE_ID);
  });

  it("never flips an already-'done' card and never appends a second evidence line", async () => {
    const cardId = "77777777-7777-7777-7777-777777777777";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "done", evidence: "original evidence", landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [{ id: cardId, gap: "gap", action: "action" }];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closed).toBe(0);
    expect(state[cardId].evidence).toBe("original evidence");
  });

  it("no cards -> closes nothing, issues no queries", async () => {
    const { sql, calls } = makeMockSql({});

    const closed = await closeConsumedGapCards(sql, SITE_ID, [], pageMap());

    expect(closed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("idempotent: calling twice against the same state appends evidence exactly once", async () => {
    const cardId = "88888888-8888-8888-8888-888888888888";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "proposed", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [{ id: cardId, gap: "FAQ gap", action: "Add FAQ" }];

    const closedFirst = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());
    const evidenceAfterFirst = state[cardId].evidence;
    const closedSecond = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closedFirst).toBe(1);
    expect(closedSecond).toBe(0);
    expect(state[cardId].evidence).toBe(evidenceAfterFirst);
    expect((state[cardId].evidence?.match(/Applied by Ozvor Pages generation on/g) ?? []).length).toBe(1);
  });

  it("leaves landing_page_id null (determinable-only) when the target page type wasn't written this run", async () => {
    const cardId = "99999999-9999-9999-9999-999999999999";
    const state: Record<string, MockTaskState> = {
      [cardId]: { status: "proposed", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [{ id: cardId, gap: 'needs FAQ page answering "x"', action: "Add FAQ" }];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, new Map());

    expect(closed).toBe(1);
    expect(state[cardId].landing_page_id).toBeNull();
    expect(state[cardId].evidence).toContain("FAQ page");
  });

  it("closes only the consumed cards passed in — never a blanket close of unrelated ones", async () => {
    const consumedId = "aaaaaaaa-0000-0000-0000-000000000001";
    const otherId = "bbbbbbbb-0000-0000-0000-000000000002";
    const state: Record<string, MockTaskState> = {
      [consumedId]: { status: "proposed", evidence: null, landing_page_id: null, landing_site_id: null },
      [otherId]: { status: "proposed", evidence: null, landing_page_id: null, landing_site_id: null },
    };
    const { sql } = makeMockSql(state);
    const cards: ConsumedGapCard[] = [{ id: consumedId, gap: "gap", action: "action" }];

    const closed = await closeConsumedGapCards(sql, SITE_ID, cards, pageMap());

    expect(closed).toBe(1);
    expect(state[consumedId].status).toBe("done");
    expect(state[otherId].status).toBe("proposed"); // untouched — was never in the consumed set
  });
});
