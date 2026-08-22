/**
 * SPHERE_MAX_DAILY_APPROVALS — the founder-load safety valve (17/08).
 *
 * With X, LinkedIn, IG, TikTok, YT and the daily video all gated by a human,
 * one day is ~6 approvals. startBrainRuns counts today's STARTED gated
 * marketing runs and, past the cap, skips further gated marketing starts —
 * out loud (log + Telegram note), never as a hard rule: read-only cells (blog,
 * PPC) and the CEO brains are never counted and never skipped. Driven through
 * a fake sql that answers by query shape; no DB, no Telegram (env absent →
 * logged no-op).
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import {
  startBrainRuns,
  maxDailyApprovals,
  isGatedMarketingGraph,
  gatedMarketingSlugs,
  DEFAULT_MAX_DAILY_APPROVALS,
} from "../../apps/worker/src/jobs/graph-tick";

/**
 * Fake postgres tagged-template client. Routes on the SQL text:
 *  - COUNT(*) over gated graphs today → `gatedToday`
 *  - recent look-back per graph      → [] (never recently started)
 *  - INSERT                          → a fresh id
 */
function fakeSql(gatedToday: number) {
  const inserted: string[] = [];
  let seq = 0;
  const fn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("COUNT(*)")) return [{ n: String(gatedToday) }];
    if (text.includes("INSERT INTO ops.agent_run")) {
      inserted.push(String(values[0]));
      return [{ id: `run-${++seq}-00000000` }];
    }
    return []; // recent look-back: nothing recent
  }) as unknown as postgres.Sql;
  return { sql: fn, inserted };
}

describe("maxDailyApprovals (env parsing)", () => {
  it("defaults to 6, honors an integer, disables on 0, ignores garbage", () => {
    expect(DEFAULT_MAX_DAILY_APPROVALS).toBe(6);
    expect(maxDailyApprovals({})).toBe(6);
    expect(maxDailyApprovals({ SPHERE_MAX_DAILY_APPROVALS: "3" })).toBe(3);
    expect(maxDailyApprovals({ SPHERE_MAX_DAILY_APPROVALS: "0" })).toBe(0);
    expect(maxDailyApprovals({ SPHERE_MAX_DAILY_APPROVALS: "abc" })).toBe(6);
    expect(maxDailyApprovals({ SPHERE_MAX_DAILY_APPROVALS: "-2" })).toBe(6);
  });
});

describe("what the valve counts", () => {
  it("gated marketing = marketing-owned AND has an approval node; brains and read-only cells do not count", () => {
    // B5 (22/08): sphere-instagram/tiktok/youtube viraram report-only (sem
    // approval) porque o canal exige mídia — logo NÃO contam mais na válvula.
    for (const slug of ["sphere-x", "sphere-linkedin", "daily-video", "content-experiment"]) {
      expect(isGatedMarketingGraph(slug), slug).toBe(true);
    }
    for (const slug of ["sphere-blog", "sphere-ppc", "daily-watchdog", "daily-dream", "weekly-product", "weekly-discovery", "ghost"]) {
      expect(isGatedMarketingGraph(slug), slug).toBe(false);
    }
    // As três células de vídeo curto NÃO têm portão desde o B5 — o teto de 6
    // deixou de ser apertado (4 gated hoje: x, linkedin, video, experiment).
    for (const slug of ["sphere-instagram", "sphere-tiktok", "sphere-youtube"]) {
      expect(gatedMarketingSlugs(), slug).not.toContain(slug);
    }
    expect(gatedMarketingSlugs().length).toBeLessThanOrEqual(6);
  });
});

describe("startBrainRuns respects the valve", () => {
  it("under the cap: gated marketing cells start normally", async () => {
    const { sql, inserted } = fakeSql(2);
    const res = await startBrainRuns(sql, ["sphere-x"], 20, "test", { hermesToken: "t", maxDailyApprovals: 6 });
    expect(res.started).toHaveLength(1);
    expect(res.capped).toEqual([]);
    expect(inserted).toEqual(["sphere-x"]);
  });

  it("at/over the cap: gated marketing cells are SKIPPED and reported as capped — a valve, not a failure", async () => {
    const { sql, inserted } = fakeSql(6);
    const res = await startBrainRuns(sql, ["sphere-linkedin"], 20, "test", { hermesToken: "t", maxDailyApprovals: 6 });
    expect(res.started).toEqual([]);
    expect(res.capped).toEqual(["sphere-linkedin"]);
    expect(inserted).toEqual([]);
  });

  it("the cap counts starts made in the SAME call — the Nth start closes the valve for the (N+1)th", async () => {
    const { sql, inserted } = fakeSql(5);
    const res = await startBrainRuns(sql, ["sphere-x", "sphere-linkedin"], 20, "test", { hermesToken: "t", maxDailyApprovals: 6 });
    expect(inserted).toEqual(["sphere-x"]);
    expect(res.capped).toEqual(["sphere-linkedin"]);
  });

  it("read-only cells and brains never hit the valve, even past the cap", async () => {
    const { sql, inserted } = fakeSql(99);
    const res = await startBrainRuns(sql, ["sphere-ppc", "sphere-blog", "daily-watchdog"], 20, "test", { hermesToken: "t", maxDailyApprovals: 6 });
    expect(res.capped).toEqual([]);
    expect(inserted).toEqual(["sphere-ppc", "sphere-blog", "daily-watchdog"]);
  });

  it("cap 0 disables the valve entirely", async () => {
    const { sql, inserted } = fakeSql(99);
    const res = await startBrainRuns(sql, ["sphere-x"], 20, "test", { hermesToken: "t", maxDailyApprovals: 0 });
    expect(res.capped).toEqual([]);
    expect(inserted).toEqual(["sphere-x"]);
  });

  it("no executor token: nothing starts, nothing is capped (the older gate still wins)", async () => {
    const { sql, inserted } = fakeSql(0);
    const res = await startBrainRuns(sql, ["sphere-x"], 20, "test", { hermesToken: "", maxDailyApprovals: 6 });
    expect(res.skipped).toEqual(["sphere-x"]);
    expect(res.capped).toEqual([]);
    expect(inserted).toEqual([]);
  });
});
