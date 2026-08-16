/**
 * runVideoAbsenceCheck — the video ABSENCE watchdog (#169).
 *
 * The 10-14/08 outage: the legacy video job died silently AND the replacement
 * graph had no clock — four days of silence nobody was told about. These tests
 * pin the watchdog's contract: a succeeded publish inside the window means
 * quiet; no publish means an alarm whose diagnosis distinguishes "no run ever
 * started" (clock/executor dead) from "runs started but none published"
 * (stuck at approval / node failure / Postiz). Driven through a fake sql so
 * no database or Telegram is touched (telegram env absent → logged no-op).
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import { runVideoAbsenceCheck } from "../../apps/worker/src/jobs/graph-tick";

/**
 * Fake postgres tagged-template client: answers the watchdog's two queries in
 * order (publish count, then run count).
 */
function fakeSql(publishCount: number, runCount: number): postgres.Sql {
  let call = 0;
  const fn = (async () => {
    call += 1;
    return call === 1 ? [{ n: String(publishCount) }] : [{ n: String(runCount) }];
  }) as unknown as postgres.Sql;
  return fn;
}

describe("runVideoAbsenceCheck (#169)", () => {
  it("stays quiet when a publish succeeded inside the window", async () => {
    const res = await runVideoAbsenceCheck(fakeSql(1, 1));
    expect(res).toEqual({ published: 1, runsStarted: 1, alarmed: false });
  });

  it("alarms when nothing published and no run even started (dead clock)", async () => {
    const res = await runVideoAbsenceCheck(fakeSql(0, 0));
    expect(res.alarmed).toBe(true);
    expect(res.published).toBe(0);
    expect(res.runsStarted).toBe(0);
  });

  it("alarms when runs started but none reached a successful publish", async () => {
    const res = await runVideoAbsenceCheck(fakeSql(0, 2));
    expect(res.alarmed).toBe(true);
    expect(res.runsStarted).toBe(2);
  });
});

/**
 * computeLift — structural hole #2 of the 14/08 sweep. lift was a hardcoded
 * null since day one, so every verdict was absolute. Baseline = mean of prior
 * outcomes for the same metric; null stays honest on a first run.
 */
import { computeLift } from "../../apps/worker/src/jobs/graph-tick";

describe("computeLift (real lift, hole #2)", () => {
  it("300 vs baseline mean(100,200)=150 → +1.0", () => {
    expect(computeLift(300, 150)).toBe(1);
  });
  it("75 vs baseline 100 → -0.25", () => {
    expect(computeLift(75, 100)).toBe(-0.25);
  });
  it("no prior rows (baseline null) → null, never invented", () => {
    expect(computeLift(300, null)).toBeNull();
  });
  it("baseline 0 → null (division would lie)", () => {
    expect(computeLift(10, 0)).toBeNull();
  });
  it("missing value → null", () => {
    expect(computeLift(null, 100)).toBeNull();
  });
});
