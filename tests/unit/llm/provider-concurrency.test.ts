/**
 * provider-concurrency.test.ts — the gateway stops refusing itself.
 *
 * 21/09: a pack for a real prospect went out saying "asked but no answer:
 * perplexity", and the weekly audit of the same morning logged 45 refusals,
 * all HTTP 429 `request_rate_limit_exceeded`. Not a credit problem: the daily
 * drift probe, one call at a time, was charged and answered healthy on every
 * one of those days. The fan-out opens one request per question per provider
 * at once, and the retries of a rejected burst land together again.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  withProviderSlot,
  concurrencyFor,
  resetProviderGates,
  PROVIDER_CONCURRENCY,
} from "../../../packages/llm/src/providers/gateway";

beforeEach(() => resetProviderGates());

/** Runs n tasks through the gate and records the high-water mark of concurrency. */
async function peak(provider: Parameters<typeof concurrencyFor>[0], n: number, body?: (i: number) => Promise<void>) {
  let active = 0;
  let high = 0;
  const task = async (i: number) => {
    active += 1;
    high = Math.max(high, active);
    try {
      await (body ? body(i) : new Promise((r) => setTimeout(r, 5)));
    } finally {
      active -= 1;
    }
  };
  const runs = Array.from({ length: n }, (_, i) => withProviderSlot(provider, () => task(i)));
  await Promise.allSettled(runs);
  return high;
}

describe("per-provider concurrency gate", () => {
  it("THE 21/09 CASE: ten questions do not open ten Perplexity requests at once", async () => {
    expect(PROVIDER_CONCURRENCY.perplexity).toBe(2);
    expect(await peak("perplexity", 10)).toBe(2);
  });

  it("the providers that tolerate bursts are not slowed to a crawl", async () => {
    expect(concurrencyFor("openai")).toBeGreaterThanOrEqual(8);
    expect(await peak("openai", 6)).toBe(6);
  });

  it("every task still runs — the gate spreads the work, it never drops any", async () => {
    const seen: number[] = [];
    await peak("perplexity", 7, async (i) => {
      seen.push(i);
      await new Promise((r) => setTimeout(r, 2));
    });
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("a failure gives its slot back: one refusal must not narrow the gate forever", async () => {
    await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        withProviderSlot("perplexity", async () => {
          throw new Error("HTTP 429");
        })
      )
    );
    // If a slot leaked, this would hang or run below the cap.
    expect(await peak("perplexity", 4)).toBe(2);
  });

  it("the gate is per provider: a slow Perplexity never blocks OpenAI", async () => {
    let openaiDone = false;
    const slow = Array.from({ length: 4 }, () =>
      withProviderSlot("perplexity", () => new Promise((r) => setTimeout(r, 40)))
    );
    await withProviderSlot("openai", async () => {
      openaiDone = true;
    });
    expect(openaiDone).toBe(true);
    await Promise.allSettled(slow);
  });
});
