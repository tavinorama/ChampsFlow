/**
 * sampling.test.ts — B1 sequential sampling protocol (mock runner).
 *
 * Verifies the approved protocol: lean 2-run base, escalation ONLY on
 * ambiguous intent×engine pairs ([0.25, 0.75] with n < 6), the GEO_MAX_GENS
 * fail-safe (log and stop escalating), and the B8 seed rule (cached probes
 * are frozen units — counted, never re-run, never escalated).
 */
import { describe, it, expect } from "vitest";
import {
  runProbesSequential,
  mergeProbeResponses,
  responseSuccesses,
} from "../../../packages/llm/src/sampling";
import type { SamplingQuery } from "../../../packages/llm/src/sampling";
import type {
  ProbeResponse,
  LLMProvider,
} from "../../../packages/llm/src/providers/types";
import type { RunProbesResult } from "../../../packages/llm/src/providers/gateway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function q(hash: string, intentId: string, formulationIx: number): SamplingQuery {
  return { queryHash: hash, queryText: `prompt ${hash}`, brandName: "Acme", intentId, formulationIx };
}

function makeResponse(
  provider: LLMProvider,
  queryHash: string,
  runs: number,
  mentions: number
): ProbeResponse {
  return {
    provider,
    queryHash,
    queryText: `prompt ${queryHash}`,
    runs,
    mentionRate: runs > 0 ? mentions / runs : 0,
    rawText: `answer for ${queryHash} on ${provider}`,
    mentioned: runs > 0 && mentions / runs >= 0.5,
    position: mentions > 0 ? 1 : null,
    sources: [`https://example.com/${queryHash}`],
  };
}

interface RunnerCall {
  hashes: string[];
  provider: LLMProvider;
  repeat: number;
}

/**
 * Mock runner: `mentionsFor(hash, provider, repeat, callIndex)` returns how
 * many of the `repeat` runs mentioned the brand. Records every call.
 */
function mockRunner(
  mentionsFor: (hash: string, provider: LLMProvider, repeat: number, call: number) => number
) {
  const calls: RunnerCall[] = [];
  const runner = async (
    queries: { queryHash: string }[],
    opts: { requestedProviders: LLMProvider[]; repeat?: number }
  ): Promise<RunProbesResult> => {
    const provider = opts.requestedProviders[0]!;
    const repeat = opts.repeat ?? 1;
    const call = calls.length;
    calls.push({ hashes: queries.map((x) => x.queryHash), provider, repeat });
    return {
      responses: queries.map((query) =>
        makeResponse(provider, query.queryHash, repeat, mentionsFor(query.queryHash, provider, repeat, call))
      ),
      blockedProviders: [],
      failedProviders: [],
    };
  };
  return { runner, calls };
}

const US = "US" as const;

// ---------------------------------------------------------------------------
// Base protocol — no escalation when the signal is clear
// ---------------------------------------------------------------------------

describe("runProbesSequential — base protocol", () => {
  it("runs baseRuns per formulation and does not escalate a clear signal", async () => {
    const { runner, calls } = mockRunner((_h, _p, repeat) => repeat); // always mentioned
    const queries = [q("h1", "local_best", 0), q("h2", "local_best", 1)];
    const result = await runProbesSequential(queries, {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      runner,
    });

    expect(calls).toHaveLength(1); // one base call, zero escalations
    expect(calls[0]).toMatchObject({ provider: "openai", repeat: 2 });
    expect(result.escalations).toEqual([]);
    expect(result.capReached).toBe(false);
    expect(result.generationsUsed).toBe(4); // 2 queries × 2 runs
    expect(result.responses).toHaveLength(2);

    const stat = result.intentStats.find((s) => s.intentId === "local_best" && s.provider === "openai");
    expect(stat).toMatchObject({ successes: 4, n: 4, formulations: 2, citationRate: 1 });
  });

  it("a clear ZERO signal (0/4) is not ambiguous and is not escalated", async () => {
    const { runner, calls } = mockRunner(() => 0);
    const result = await runProbesSequential([q("h1", "i", 0), q("h2", "i", 1)], {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      runner,
    });
    expect(calls).toHaveLength(1);
    expect(result.escalations).toEqual([]);
    expect(result.intentStats[0]).toMatchObject({ successes: 0, n: 4 });
  });

  it("escalate:false (mock mode) never escalates even when ambiguous", async () => {
    const { runner, calls } = mockRunner((_h, _p, repeat) => Math.floor(repeat / 2)); // 1/2 → 0.5
    const result = await runProbesSequential([q("h1", "i", 0), q("h2", "i", 1)], {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      escalate: false,
      runner,
    });
    expect(calls).toHaveLength(1);
    expect(result.escalations).toEqual([]);
    expect(result.intentStats[0]!.citationRate).toBe(0.5); // ambiguous, honestly reported
  });
});

// ---------------------------------------------------------------------------
// Sequential escalation — ambiguous pairs only
// ---------------------------------------------------------------------------

describe("runProbesSequential — escalation on ambiguity", () => {
  it("escalates an ambiguous intent×engine (0.5 @ n=4) with +1 run per formulation until n >= 6", async () => {
    // Base (repeat 2): 1/2 per formulation → intent 2/4 = 0.5 → AMBIGUOUS.
    // Escalation (repeat 1): mentioned → intent reaches 4/6; n=6 stops the loop.
    const { runner, calls } = mockRunner((_h, _p, repeat) => (repeat === 2 ? 1 : 1));
    const queries = [q("h1", "trust_review", 0), q("h2", "trust_review", 1)];
    const result = await runProbesSequential(queries, {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      runner,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ provider: "openai", repeat: 1 });
    expect(calls[1]!.hashes.sort()).toEqual(["h1", "h2"]);
    expect(result.escalations).toEqual([
      { intentId: "trust_review", provider: "openai", extraRuns: 2 },
    ]);
    expect(result.generationsUsed).toBe(6); // 4 base + 2 escalation

    const stat = result.intentStats[0]!;
    expect(stat).toMatchObject({ successes: 4, n: 6 });
    // Merged per-response aggregates carry the extra run.
    for (const resp of result.responses) {
      expect(resp.runs).toBe(3);
      expect(responseSuccesses(resp)).toBe(2);
    }
  });

  it("escalates ONLY the ambiguous pair — clear intents and engines are untouched", async () => {
    // openai: ambiguous (1/2 per formulation). serp: always mentioned (clear).
    const { runner, calls } = mockRunner((_h, p, repeat) => (p === "openai" && repeat === 2 ? 1 : repeat));
    const queries = [q("h1", "comparison", 0), q("h2", "comparison", 1)];
    const result = await runProbesSequential(queries, {
      region: US,
      requestedProviders: ["openai", "serp"],
      baseRuns: 2,
      runner,
    });

    // 2 base calls (one per provider) + exactly 1 escalation call (openai only).
    const escalationCalls = calls.slice(2);
    expect(escalationCalls).toHaveLength(1);
    expect(escalationCalls[0]!.provider).toBe("openai");
    expect(result.escalations).toEqual([
      { intentId: "comparison", provider: "openai", extraRuns: 2 },
    ]);
    const serpStat = result.intentStats.find((s) => s.provider === "serp");
    expect(serpStat).toMatchObject({ n: 4, successes: 4 }); // untouched
  });

  it("stops escalating at the GEO_MAX_GENS ceiling (fail-safe), keeping base data", async () => {
    const { runner, calls } = mockRunner((_h, _p, repeat) => Math.floor(repeat / 2));
    const queries = [q("h1", "i", 0), q("h2", "i", 1)];
    const result = await runProbesSequential(queries, {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      maxGenerations: 4, // base consumes exactly 4 → escalation (+2) must not run
      runner,
    });

    expect(calls).toHaveLength(1); // no escalation call went out
    expect(result.capReached).toBe(true);
    expect(result.escalations).toEqual([]);
    expect(result.generationsUsed).toBe(4);
    expect(result.intentStats[0]).toMatchObject({ n: 4, successes: 2 }); // base preserved
  });
});

// ---------------------------------------------------------------------------
// B8 seed (cache) interaction — frozen units
// ---------------------------------------------------------------------------

describe("runProbesSequential — cached seeds", () => {
  it("never re-runs a seeded pair and counts its runs in the aggregate", async () => {
    const seed = { ...makeResponse("openai", "h1", 2, 1), fromCache: true };
    const { runner, calls } = mockRunner((_h, _p, repeat) => repeat); // live always mentioned
    const queries = [q("h1", "i", 0), q("h2", "i", 1)];
    const result = await runProbesSequential(queries, {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      seedResponses: [seed],
      runner,
    });

    // Base call excludes the seeded h1.
    expect(calls[0]!.hashes).toEqual(["h2"]);
    // Seed runs count toward n: seed 1/2 + live 2/2 = 3/4 = 0.75 → ambiguous
    // (inclusive band) → escalation of the LIVE formulation only (+1 run).
    const escalationCalls = calls.slice(1);
    for (const call of escalationCalls) {
      expect(call.hashes).toEqual(["h2"]); // h1 is frozen — never escalated
    }
    expect(result.generationsUsed).toBe(2 + escalationCalls.length); // seed cost nothing
    const seedResp = result.responses.find((r) => r.queryHash === "h1");
    expect(seedResp?.fromCache).toBe(true);
    expect(seedResp?.runs).toBe(2); // untouched frozen unit
  });

  it("cannot escalate an intent whose formulations are ALL cached, even if ambiguous", async () => {
    const seeds = [
      { ...makeResponse("openai", "h1", 2, 1), fromCache: true }, // 1/2
      { ...makeResponse("openai", "h2", 2, 1), fromCache: true }, // 1/2 → 2/4 = 0.5 ambiguous
    ];
    const { runner, calls } = mockRunner(() => 0);
    const result = await runProbesSequential([q("h1", "i", 0), q("h2", "i", 1)], {
      region: US,
      requestedProviders: ["openai"],
      baseRuns: 2,
      seedResponses: seeds,
      runner,
    });
    expect(calls).toHaveLength(0); // nothing live to run, nothing to escalate
    expect(result.generationsUsed).toBe(0);
    expect(result.escalations).toEqual([]);
    expect(result.intentStats[0]).toMatchObject({ n: 4, successes: 2 });
  });

  it("drops a cached seed for a provider the routing gate blocks (EU × perplexity)", async () => {
    const seed = { ...makeResponse("perplexity", "h1", 2, 2), fromCache: true };
    const { runner } = mockRunner((_h, _p, repeat) => repeat);
    const result = await runProbesSequential([q("h1", "i", 0)], {
      region: "EU",
      requestedProviders: ["anthropic", "perplexity"],
      baseRuns: 2,
      seedResponses: [seed],
      runner,
    });
    expect(result.blockedProviders).toContain("perplexity");
    expect(result.responses.every((r) => r.provider !== "perplexity")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeProbeResponses
// ---------------------------------------------------------------------------

describe("mergeProbeResponses", () => {
  it("sums runs and mentions and recomputes the rate", () => {
    const merged = mergeProbeResponses(
      makeResponse("openai", "h1", 2, 1),
      makeResponse("openai", "h1", 1, 1)
    );
    expect(merged.runs).toBe(3);
    expect(merged.mentionRate).toBeCloseTo(2 / 3, 10);
    expect(merged.mentioned).toBe(true); // 0.667 >= 0.5
  });

  it("majority rule flips mentioned when added runs disagree", () => {
    const merged = mergeProbeResponses(
      makeResponse("openai", "h1", 2, 2), // 2/2
      makeResponse("openai", "h1", 3, 0) // 0/3 → 2/5 = 0.4
    );
    expect(merged.mentionRate).toBeCloseTo(0.4, 10);
    expect(merged.mentioned).toBe(false);
    expect(merged.position).toBeNull(); // not mentioned → no position
  });

  it("unions sources without duplicates", () => {
    const a = { ...makeResponse("openai", "h1", 1, 1), sources: ["https://a.com", "https://b.com"] };
    const b = { ...makeResponse("openai", "h1", 1, 1), sources: ["https://b.com", "https://c.com"] };
    expect(mergeProbeResponses(a, b).sources.sort()).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
  });
});
