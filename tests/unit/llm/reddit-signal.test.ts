/**
 * reddit-signal.test.ts — Reddit deep-dive (C5).
 * No SERP_API_KEY in the test env → deterministic mock path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { analyzeRedditPresence, subredditFromUrl } from "../../../packages/llm/src/reddit-signal";

describe("subredditFromUrl", () => {
  it("extracts a subreddit from a Reddit thread URL", () => {
    expect(subredditFromUrl("https://www.reddit.com/r/smallbusiness/comments/abc/t/")).toBe("r/smallbusiness");
  });
  it("returns null for non-Reddit or malformed URLs", () => {
    expect(subredditFromUrl("https://example.com/foo")).toBeNull();
    expect(subredditFromUrl("https://www.reddit.com/user/someone")).toBeNull();
  });
});

describe("analyzeRedditPresence (mock mode)", () => {
  beforeEach(() => {
    delete process.env["SERP_API_KEY"];
  });

  it("is deterministic for a given brand", async () => {
    const a = await analyzeRedditPresence("Acme CRM");
    const b = await analyzeRedditPresence("Acme CRM");
    expect(a).toEqual(b);
  });

  it("returns a 0–1 redditScore and live=false without a SERP key", async () => {
    const r = await analyzeRedditPresence("Stripe");
    expect(r.live).toBe(false);
    expect(r.redditScore).toBeGreaterThanOrEqual(0);
    expect(r.redditScore).toBeLessThanOrEqual(1);
  });

  it("derives subreddits and thread count consistently", async () => {
    const r = await analyzeRedditPresence("Notion");
    expect(r.threadCount).toBeGreaterThan(0);
    expect(r.subreddits.length).toBeGreaterThan(0);
    expect(r.subreddits.every((s) => s.startsWith("r/"))).toBe(true);
    expect(r.subreddits.length).toBeLessThanOrEqual(r.threadCount);
  });

  it("classifies snippet sentiment into pos/neu/neg buckets", async () => {
    const r = await analyzeRedditPresence("Linear");
    const total = r.sentiment.positive + r.sentiment.neutral + r.sentiment.negative;
    expect(total).toBe(r.threadCount);
    expect(r.sentiment.score).toBeGreaterThanOrEqual(0);
    expect(r.sentiment.score).toBeLessThanOrEqual(1);
  });
});
