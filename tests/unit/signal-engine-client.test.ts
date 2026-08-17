/**
 * Signal Engine client — the door to reddit-signal-infrastructure.
 * Pins: bearer sent (never logged), fail-open on http/timeout/bad json,
 * list normalization, and the [__signals__] block that is honest when empty.
 */
import { describe, it, expect } from "vitest";
import { signalEngine, listOf, signalsBlock } from "../../packages/llm/src/signal-engine";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init)) as unknown as typeof fetch;
}

describe("signalEngine client", () => {
  it("GETs with the bearer and parses JSON", async () => {
    let seenAuth = "";
    const se = signalEngine({
      baseUrl: "https://se.example/",
      apiKey: "k-123",
      fetchImpl: fakeFetch((url, init) => {
        seenAuth = String((init?.headers as Record<string, string>)["Authorization"]);
        expect(url).toBe("https://se.example/me/opportunities?country=BR");
        return new Response(JSON.stringify({ items: [{ keyword: "dentist austin", action: "publish_own_community" }] }), { status: 200 });
      }),
    });
    const r = await se.opportunities("BR");
    expect(seenAuth).toBe("Bearer k-123");
    expect(r.ok).toBe(true);
    if (r.ok) expect(listOf(r.data, "items", "opportunities")).toHaveLength(1);
  });

  it("fails OPEN on http error, bad json and timeout — never throws", async () => {
    const http500 = signalEngine({ baseUrl: "https://se", apiKey: "k", fetchImpl: fakeFetch(() => new Response("x", { status: 500 })) });
    expect(await http500.me()).toMatchObject({ ok: false, reason: "http_500" });
    const badJson = signalEngine({ baseUrl: "https://se", apiKey: "k", fetchImpl: fakeFetch(() => new Response("<html>", { status: 200 })) });
    expect(await badJson.me()).toMatchObject({ ok: false, reason: "invalid_json" });
    const slow = signalEngine({
      baseUrl: "https://se", apiKey: "k", timeoutMs: 20,
      fetchImpl: fakeFetch((_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))),
    });
    expect(await slow.me()).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("listOf normalizes array / {items} / {opportunities}", () => {
    expect(listOf([1, 2], "items")).toEqual([1, 2]);
    expect(listOf({ items: [3] }, "items", "opportunities")).toEqual([3]);
    expect(listOf({ opportunities: [4] }, "items", "opportunities")).toEqual([4]);
    expect(listOf({ nope: 1 }, "items")).toEqual([]);
  });

  it("signalsBlock: honest when empty, evidence-first when not, bounded", () => {
    expect(signalsBlock([])).toContain("SEM DADO");
    const block = signalsBlock(
      Array.from({ length: 10 }, (_, i) => ({ keyword: `kw${i}`, action: "comment_on_ranking_thread", reddit_url: `https://reddit.com/r/x/${i}`, karma_needed: 50 })),
      { max: 3, fetchedAt: "2026-08-17T10:00:00Z" }
    );
    expect(block).toContain('kw="kw0"');
    expect(block).toContain("url=https://reddit.com/r/x/0");
    expect(block).toContain("(+7 outras)");
    expect(block).not.toContain("kw3");
  });
});
