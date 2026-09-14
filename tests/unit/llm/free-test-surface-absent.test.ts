/**
 * free-test-surface-absent.test.ts — C10 (auditoria 11/09/2026).
 *
 * The SERP adapter refuses to parse its own sentinels ("no AI Overview block
 * returned…", "(no extractable text)") and flags `absent: true`. The free test
 * used to re-parse `rawText` with the legacy parser and undo that: the "no
 * block" sentinel ECHOES THE CUSTOMER'S QUESTION, so a brand name in the
 * question ("Is Ozvor a good choice?") read as a citation. Reproduced offline
 * by the audit; the one serp cited=true on record (20/07) was this.
 *
 * These tests FAIL on 3c9805f (aggregateEngineCells did not exist; the loop
 * called parseCitation on every rawText).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { aggregateEngineCells, isSurfaceAbsentText } from "../../../packages/llm/src/invisibility-test";
import { SerpProbeAdapter } from "../../../packages/llm/src/providers/serp";
import { ProviderError } from "../../../packages/llm/src/providers/types";

const live = () => true;

describe("C10 — a surface that was not there is not a citation miss, and never a citation", () => {
  it("the 'no AI Overview block' sentinel with the brand in the QUESTION never reads as cited", () => {
    const sentinel = `Google AI Overview for "Is Ozvor a good choice?" — no AI Overview block returned in this snapshot.`;
    const agg = aggregateEngineCells([{ provider: "serp", rawText: sentinel, mentioned: false, absent: true }], "Ozvor", null, live);
    const serp = agg.get("serp")!;
    expect(serp.citedCells).toBe(0);
    expect(serp.absentCells).toBe(1);
    expect(serp.totalCells).toBe(0);
  });

  it("defensive: the sentinel text alone (adapter forgot `absent`) is still recognised", () => {
    const sentinel = `Google AI Overview for "best Ozvor alternatives" — no AI Overview block returned in this snapshot.`;
    expect(isSurfaceAbsentText(sentinel)).toBe(true);
    const agg = aggregateEngineCells([{ provider: "serp", rawText: sentinel }], "Ozvor", null, live);
    expect(agg.get("serp")!.citedCells).toBe(0);
    expect(agg.get("serp")!.absentCells).toBe(1);
  });

  it("'(no extractable text)' (the async shell) is absent too", () => {
    const agg = aggregateEngineCells([{ provider: "serp", rawText: "Google AI Overview: (no extractable text)", absent: true }], "Ozvor", null, live);
    expect(agg.get("serp")!.absentCells).toBe(1);
    expect(agg.get("serp")!.totalCells).toBe(0);
  });

  it("a real overview that names the brand still counts, and the adapter's verdict wins over a text re-parse", () => {
    const agg = aggregateEngineCells(
      [
        { provider: "serp", rawText: "Google AI Overview: Ozvor is a strong choice for small teams.", mentioned: true, position: 1, absent: false },
        { provider: "serp", rawText: "Google AI Overview: Acme and Beta lead this category.", mentioned: false, absent: false },
      ],
      "Ozvor",
      "Acme",
      live
    );
    const serp = agg.get("serp")!;
    expect(serp.totalCells).toBe(2);
    expect(serp.citedCells).toBe(1);
    expect(serp.bestPosition).toBe(1);
    expect(serp.competitorCited).toBe(true);
    expect(serp.absentCells).toBe(0);
  });

  it("absent cells leave the citation denominator: 1 cited of 1 eligible, not 1 of 3", () => {
    const agg = aggregateEngineCells(
      [
        { provider: "serp", rawText: "Google AI Overview: Ozvor is recommended.", mentioned: true, position: 1 },
        { provider: "serp", rawText: `Google AI Overview for "Ozvor pricing" — no AI Overview block returned in this snapshot.`, absent: true },
        { provider: "serp", rawText: "Google AI Overview: (no extractable text)", absent: true },
      ],
      "Ozvor",
      null,
      live
    );
    const serp = agg.get("serp")!;
    expect(serp.totalCells).toBe(1);
    expect(serp.citedCells).toBe(1);
    expect(serp.absentCells).toBe(2);
  });
});

describe("C10 — a failed DataForSEO task is a COLLECTION failure, not a surface absence", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["SERP_API_KEY"];
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["SERP_API_KEY"];
    else process.env["SERP_API_KEY"] = originalKey;
  });

  function withFetch(body: unknown) {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  }

  it("HTTP 200 with task status_code != 20000 throws a retryable ProviderError (never absent:true)", async () => {
    process.env["SERP_API_KEY"] = "dGVzdDp0ZXN0"; // live path, fake credentials, fetch is mocked
    withFetch({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field", result: null }] });
    const adapter = new SerpProbeAdapter();
    await expect(adapter.probe({ queryText: "best CRM for plumbers", queryHash: "h", brandName: "Ozvor" }, { region: "US" })).rejects.toBeInstanceOf(ProviderError);
  });

  it("HTTP 200 with NO task at all is a collection failure too", async () => {
    process.env["SERP_API_KEY"] = "dGVzdDp0ZXN0";
    withFetch({ status_code: 20000, tasks: [] });
    const adapter = new SerpProbeAdapter();
    await expect(adapter.probe({ queryText: "best CRM for plumbers", queryHash: "h", brandName: "Ozvor" }, { region: "US" })).rejects.toBeInstanceOf(ProviderError);
  });

  it("task 20000 with no ai_overview item is a genuine surface absence (absent:true, not an error, not cited)", async () => {
    process.env["SERP_API_KEY"] = "dGVzdDp0ZXN0";
    withFetch({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [{ type: "organic", title: "x" }] }] }] });
    const adapter = new SerpProbeAdapter();
    const r = await adapter.probe({ queryText: "Is Ozvor a good choice?", queryHash: "h", brandName: "Ozvor" }, { region: "US" });
    expect(r.absent).toBe(true);
    expect(r.mentioned).toBe(false);
  });
});
