/**
 * #152 — api_spend MEASURES instead of estimating.
 *
 * Covers:
 *  1. cost.ts — tokens × list price arithmetic, unknown model → null (never a
 *     guess), longest-prefix model matching, per-request + per-search fees.
 *  2. providers/types.ts — usageFromCounts (both counts or nothing) and
 *     mergeProbeUsage (sums), and that sampling.mergeProbeResponses carries
 *     the summed usage across rounds.
 *  3. api-spend.ts — recordSpend precedence (measured › rate › flat), the
 *     42703 legacy-schema fallback (wide INSERT fails once → legacy INSERT,
 *     warning logged ONCE per process), non-42703 errors reported without
 *     throwing, and est_cost_cents kept for comparison on measured rows.
 *  4. admin.ts — apiSpendBySource: bySource split, and the pre-migration
 *     (42703) degradation to a legacy-only total with legacySchema=true.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PROVIDER_PRICES,
  priceForModel,
  measuredCostCents,
} from "../../packages/llm/src/cost";
import { usageFromCounts, mergeProbeUsage } from "../../packages/llm/src/providers/types";
import { mergeProbeResponses } from "../../packages/llm/src/sampling";
import { recordSpend, _resetApiSpendStateForTests } from "../../packages/llm/src/api-spend";
import { logger } from "../../packages/shared/src/logger";
import { apiSpendBySource } from "../../apps/api/src/routes/admin";
import type { ProbeResponse } from "../../packages/llm/src/providers/types";

// ---------------------------------------------------------------------------
// 1. cost.ts
// ---------------------------------------------------------------------------

describe("cost.ts — measuredCostCents", () => {
  it("prices haiku 4.5 at $1/$5 per 1M: 1000 in + 200 out = 0.2¢", () => {
    // (1000 × 1 + 200 × 5) / 1e6 USD = 0.002 USD = 0.2¢
    expect(measuredCostCents({ model: "claude-haiku-4-5", inputTokens: 1000, outputTokens: 200 })).toBe(0.2);
  });

  it("prices gpt-4o-mini at $0.15/$0.60: 10k in + 1k out = 0.21¢", () => {
    expect(measuredCostCents({ model: "gpt-4o-mini", inputTokens: 10_000, outputTokens: 1_000 })).toBe(0.21);
  });

  it("returns null for an unknown model — the caller must fall back to the rate", () => {
    expect(measuredCostCents({ model: "some-new-model", inputTokens: 1000, outputTokens: 10 })).toBeNull();
    expect(measuredCostCents({ model: null, inputTokens: 1000, outputTokens: 10 })).toBeNull();
    expect(measuredCostCents({ model: "", inputTokens: 1000, outputTokens: 10 })).toBeNull();
  });

  it("returns null when either token count is missing — half a measurement is not a measurement", () => {
    expect(measuredCostCents({ model: "claude-haiku-4-5", inputTokens: 1000, outputTokens: null })).toBeNull();
    expect(measuredCostCents({ model: "claude-haiku-4-5", inputTokens: undefined, outputTokens: 5 })).toBeNull();
    expect(measuredCostCents({ model: "claude-haiku-4-5", inputTokens: -1, outputTokens: 5 })).toBeNull();
    expect(measuredCostCents({ model: "claude-haiku-4-5", inputTokens: NaN, outputTokens: 5 })).toBeNull();
  });

  it("zero tokens on a known model is a valid 0 (not null)", () => {
    expect(measuredCostCents({ model: "gemini-2.5-flash-lite", inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("matches dated snapshots by longest prefix", () => {
    expect(priceForModel("claude-haiku-4-5-20251001")).toEqual(PROVIDER_PRICES["claude-haiku-4-5"]);
    expect(priceForModel("CLAUDE-HAIKU-4-5")).toEqual(PROVIDER_PRICES["claude-haiku-4-5"]);
    // "gpt-4o-mini-2024-07-18" must resolve to gpt-4o-mini, not gpt-4o.
    expect(priceForModel("gpt-4o-mini-2024-07-18")).toEqual(PROVIDER_PRICES["gpt-4o-mini"]);
    expect(priceForModel("gpt-4o-2024-08-06")).toEqual(PROVIDER_PRICES["gpt-4o"]);
    expect(priceForModel("gemini-2.5-flash-lite")).toEqual(PROVIDER_PRICES["gemini-2.5-flash-lite"]);
    expect(priceForModel("unknown")).toBeNull();
  });

  it("adds sonar's per-request fee ($5/1k) per aggregated request", () => {
    // 100 in + 100 out at $1/$1 = 0.0002 USD = 0.02¢; + 2 requests × 0.5¢ = 1.02¢
    expect(
      measuredCostCents({ model: "sonar", inputTokens: 100, outputTokens: 100, requests: 2 })
    ).toBe(1.02);
  });

  it("adds anthropic's per-search fee ($10/1k) only for provider=anthropic", () => {
    const base = measuredCostCents({ model: "claude-haiku-4-5", inputTokens: 1000, outputTokens: 200 })!;
    const withSearch = measuredCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 1000,
      outputTokens: 200,
      provider: "anthropic",
      searchRequests: 3,
    })!;
    expect(withSearch).toBeCloseTo(base + 3, 4);
    // Unknown provider surcharge (openai) → tokens only, no guess.
    const openai = measuredCostCents({
      model: "gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 200,
      provider: "openai",
      searchRequests: 3,
    })!;
    expect(openai).toBe(measuredCostCents({ model: "gpt-4o-mini", inputTokens: 1000, outputTokens: 200 }));
  });

  it("every listed price has a positive input/output rate and an asOf date", () => {
    for (const [id, p] of Object.entries(PROVIDER_PRICES)) {
      expect(p.inputUsdPerM, id).toBeGreaterThan(0);
      expect(p.outputUsdPerM, id).toBeGreaterThan(0);
      expect(p.asOf, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. usage plumbing
// ---------------------------------------------------------------------------

describe("ProbeUsage — usageFromCounts / mergeProbeUsage / sampling merge", () => {
  it("usageFromCounts needs BOTH counts; floors; keeps searches only when > 0", () => {
    expect(usageFromCounts("m", 10.7, 2.2)).toEqual({ model: "m", inputTokens: 10, outputTokens: 2, requests: 1 });
    expect(usageFromCounts("m", 10, undefined)).toBeUndefined();
    expect(usageFromCounts("m", undefined, 10)).toBeUndefined();
    expect(usageFromCounts("m", -1, 10)).toBeUndefined();
    expect(usageFromCounts("m", 1, 1, 2)).toEqual({ model: "m", inputTokens: 1, outputTokens: 1, requests: 1, searchRequests: 2 });
    expect(usageFromCounts("m", 1, 1, 0)).toEqual({ model: "m", inputTokens: 1, outputTokens: 1, requests: 1 });
  });

  it("mergeProbeUsage sums tokens/requests/searches and passes through a lone side", () => {
    const a = { model: "m", inputTokens: 100, outputTokens: 10, requests: 1, searchRequests: 1 };
    const b = { model: "m", inputTokens: 50, outputTokens: 5, requests: 2 };
    expect(mergeProbeUsage(a, b)).toEqual({ model: "m", inputTokens: 150, outputTokens: 15, requests: 3, searchRequests: 1 });
    expect(mergeProbeUsage(undefined, b)).toEqual(b);
    expect(mergeProbeUsage(a, undefined)).toEqual(a);
    expect(mergeProbeUsage(undefined, undefined)).toBeUndefined();
  });

  it("mergeProbeResponses (sampling escalation) carries the SUMMED usage", () => {
    const base: ProbeResponse = {
      provider: "openai",
      queryHash: "h",
      rawText: "a",
      mentioned: true,
      position: 1,
      sources: [],
      runs: 2,
      mentionRate: 1,
      usage: { model: "gpt-4o-mini", inputTokens: 200, outputTokens: 20, requests: 2 },
    };
    const extra: ProbeResponse = {
      ...base,
      rawText: "b",
      runs: 1,
      mentionRate: 0,
      mentioned: false,
      position: null,
      usage: { model: "gpt-4o-mini", inputTokens: 100, outputTokens: 10, requests: 1 },
    };
    const merged = mergeProbeResponses(base, extra);
    expect(merged.runs).toBe(3);
    expect(merged.usage).toEqual({ model: "gpt-4o-mini", inputTokens: 300, outputTokens: 30, requests: 3 });
    // A cached seed (no usage) merged with a live round keeps the live usage.
    const cached: ProbeResponse = { ...base, usage: undefined, fromCache: true };
    expect(mergeProbeResponses(cached, extra).usage).toEqual(extra.usage);
  });
});

// ---------------------------------------------------------------------------
// 3. recordSpend
// ---------------------------------------------------------------------------

function pgError(code: string): Error & { code: string } {
  const e = new Error(`pg error ${code}`) as Error & { code: string };
  e.code = code;
  return e;
}

describe("recordSpend — measured › rate › flat, legacy-schema tolerant, never throws", () => {
  beforeEach(() => {
    _resetApiSpendStateForTests();
    vi.restoreAllMocks();
  });

  it("writes a measured row (wide INSERT) and keeps the rate estimate in est_cost_cents", async () => {
    const calls: Array<{ q: string; p: unknown[] }> = [];
    const exec = async (q: string, p: unknown[]) => {
      calls.push({ q, p });
      return undefined;
    };
    const r = await recordSpend(exec, {
      op: "audit",
      engine: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 1000,
      outputTokens: 200,
      estCents: 1.64,
      estSource: "rate",
      ref: "audit-1",
    });
    expect(r).toEqual({ ok: true, source: "measured", measuredCents: 0.2, estCents: 2, legacy: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.q).toContain("measured_cost_cents");
    // [op, est, engine, model, in, out, measured, source, ref]
    expect(calls[0]!.p).toEqual(["audit", 2, "anthropic", "claude-haiku-4-5", 1000, 200, 0.2, "measured", "audit-1"]);
  });

  it("falls back to 'rate' when the model is unknown / no tokens, and 'flat' when told so", async () => {
    const calls: unknown[][] = [];
    const exec = async (_q: string, p: unknown[]) => {
      calls.push(p);
      return undefined;
    };
    const rate = await recordSpend(exec, { op: "audit", engine: "serp", estCents: 0.4, ref: "a" });
    expect(rate.source).toBe("rate");
    expect(rate.measuredCents).toBeNull();
    const flat = await recordSpend(exec, { op: "pages_generate", estCents: 15, estSource: "flat" });
    expect(flat.source).toBe("flat");
    expect(calls[0]).toEqual(["audit", 0, "serp", null, null, null, null, "rate", "a"]);
    expect(calls[1]).toEqual(["pages_generate", 15, null, null, null, null, null, "flat", null]);
  });

  it("on 42703 (migration not applied) degrades to the legacy INSERT and warns ONCE", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const calls: Array<{ q: string; p: unknown[] }> = [];
    const exec = async (q: string, p: unknown[]) => {
      calls.push({ q, p });
      if (q.includes("measured_cost_cents")) throw pgError("42703");
      return undefined;
    };
    const first = await recordSpend(exec, {
      op: "audit",
      engine: "openai",
      model: "gpt-4o-mini",
      inputTokens: 10_000,
      outputTokens: 1_000,
      estCents: 0.41,
      ref: "audit-2",
    });
    expect(first).toEqual({ ok: true, source: "rate", measuredCents: null, estCents: 0, legacy: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.q).toBe("INSERT INTO api_spend (op, est_cost_cents) VALUES ($1, $2)");
    expect(calls[1]!.p).toEqual(["audit", 0]);

    await recordSpend(exec, { op: "audit", engine: "openai", estCents: 3 });
    const legacyWarnings = warn.mock.calls.filter((c) => c[0] === "api_spend_legacy_schema");
    expect(legacyWarnings).toHaveLength(1);
  });

  it("a non-42703 failure is logged and reported (ok=false) — never thrown", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const exec = async () => {
      throw pgError("57P01"); // admin_shutdown
    };
    const r = await recordSpend(exec, { op: "free_test", estCents: 18, estSource: "flat" });
    expect(r.ok).toBe(false);
    expect(r.legacy).toBe(false);
    expect(error).toHaveBeenCalledWith("api_spend_insert_failed", expect.objectContaining({ op: "free_test" }));
  });

  it("if even the legacy INSERT fails it still does not throw", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const exec = async (q: string) => {
      if (q.includes("measured_cost_cents")) throw pgError("42703");
      throw new Error("connection lost");
    };
    const r = await recordSpend(exec, { op: "audit", estCents: 1 });
    expect(r.ok).toBe(false);
    expect(r.legacy).toBe(true);
    expect(error).toHaveBeenCalledWith("api_spend_insert_failed", expect.objectContaining({ legacy: true }));
  });

  it("negative / NaN estimates are stored as 0, never rejected by the CHECK", async () => {
    const calls: unknown[][] = [];
    const exec = async (_q: string, p: unknown[]) => {
      calls.push(p);
      return undefined;
    };
    await recordSpend(exec, { op: "audit", estCents: -3 });
    await recordSpend(exec, { op: "audit", estCents: NaN });
    expect(calls[0]![1]).toBe(0);
    expect(calls[1]![1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. admin apiSpendBySource
// ---------------------------------------------------------------------------

describe("admin apiSpendBySource — measured share, pre-migration degradation", () => {
  it("splits this month's ledger by source and computes the measured share", async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          { source: "measured", cents: 30, rows: 12 },
          { source: "rate", cents: 60, rows: 6 },
          { source: null, cents: 10, rows: 3 },
        ],
      })),
    };
    const r = await apiSpendBySource(db as never);
    expect(r).toEqual({
      monthCents: 100,
      bySource: { measured: 30, rate: 60, flat: 0, legacy: 10 },
      rowsBySource: { measured: 12, rate: 6, flat: 0, legacy: 3 },
      measuredShare: 0.3,
      legacySchema: false,
    });
    expect(db.query.mock.calls[0]![0]).toContain("measured_cost_cents");
  });

  it("on 42703 falls back to est_cost_cents only and flags legacySchema", async () => {
    const db = {
      query: vi
        .fn()
        .mockRejectedValueOnce(pgError("42703"))
        .mockResolvedValueOnce({ rows: [{ cents: 156, rows: 9 }] }),
    };
    const r = await apiSpendBySource(db as never);
    expect(r).toEqual({
      monthCents: 156,
      bySource: { measured: 0, rate: 0, flat: 0, legacy: 156 },
      rowsBySource: { measured: 0, rate: 0, flat: 0, legacy: 9 },
      measuredShare: 0,
      legacySchema: true,
    });
  });

  it("returns null (not a throw) when the ledger is unreadable", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const db = { query: vi.fn().mockRejectedValue(pgError("57P01")) };
    expect(await apiSpendBySource(db as never)).toBeNull();
  });
});
