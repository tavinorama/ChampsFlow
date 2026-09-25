/**
 * serp-market.test.ts — C09 / P08 (25/09).
 *
 * The SERP probe sent `language_code: "en"` and a UK/US location for every
 * brand. The market is an explicit input now, decided once and recorded with
 * the audit. These tests pin the table, the priority (market → locale →
 * region default), that nothing is guessed, and that the adapter sends what
 * was decided.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { serpMarketFor, describeSerpMarket } from "../../../packages/llm/src/serp-market";
import { SerpProbeAdapter } from "../../../packages/llm/src/providers/serp";

describe("serpMarketFor — market → locale → region default, never a guess", () => {
  it("a Brazilian brand is asked in Portuguese, in Brazil", () => {
    expect(serpMarketFor({ region: "EU", market: "BR" })).toMatchObject({ country: "BR", language_code: "pt", location_code: 2076, basis: "brand_market" });
  });
  it("a locale alone decides both language and country; a market plus a locale keeps the locale's language", () => {
    expect(serpMarketFor({ region: "US", locale: "pt-BR" })).toMatchObject({ country: "BR", language_code: "pt", basis: "brand_locale" });
    expect(serpMarketFor({ region: "US", market: "US", locale: "es" })).toMatchObject({ country: "US", language_code: "es", location_code: 2840, basis: "brand_market" });
  });
  it("no market → the region default it always was, and the record says so", () => {
    expect(serpMarketFor({ region: "EU" })).toMatchObject({ country: "GB", language_code: "en", location_code: 2826, basis: "region_default" });
    expect(serpMarketFor({ region: "US" })).toMatchObject({ country: "US", location_code: 2840, basis: "region_default" });
  });
  it("an unknown market is not invented: region default with a distinct basis", () => {
    expect(serpMarketFor({ region: "US", market: "Mars" })).toMatchObject({ country: "US", basis: "unknown_market_region_default" });
    expect(describeSerpMarket(serpMarketFor({ region: "US", market: "Mars" }))).toContain("not recognised");
  });
  it("aliases and case are tolerated", () => {
    expect(serpMarketFor({ region: "US", market: "uk" }).country).toBe("GB");
    expect(serpMarketFor({ region: "US", market: "Brasil" }).country).toBe("BR");
  });
});

describe("SerpProbeAdapter sends the decided market", () => {
  const env = process.env;
  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  async function bodySentFor(opts: Parameters<SerpProbeAdapter["probe"]>[1]) {
    process.env = { ...env, SERP_API_KEY: "dGVzdDp0ZXN0" };
    let sent: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body)[0];
      return { ok: true, status: 200, json: async () => ({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] }) };
    }));
    const adapter = new SerpProbeAdapter();
    await adapter.probe({ queryText: "best dentist in curitiba", queryHash: "h1", brandName: "X", competitors: [] } as never, opts).catch(() => undefined);
    return sent as { language_code: string; location_code: number };
  }

  it("with a decided market: pt / Brazil", async () => {
    const body = await bodySentFor({ region: "EU", serpMarket: serpMarketFor({ region: "EU", market: "BR" }) });
    expect(body).toMatchObject({ language_code: "pt", location_code: 2076 });
  });
  it("without one: the region default, unchanged from before", async () => {
    expect(await bodySentFor({ region: "EU" })).toMatchObject({ language_code: "en", location_code: 2826 });
    expect(await bodySentFor({ region: "US" })).toMatchObject({ language_code: "en", location_code: 2840 });
  });
});
