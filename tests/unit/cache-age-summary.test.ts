import { describe, it, expect } from "vitest";
import { cacheAgeSummary } from "../../apps/worker/src/jobs/audit-run";

describe("cacheAgeSummary (B6, D16)", () => {
  it("oldest and newest stamps across live and cached answers; unstamped cached ones are counted", () => {
    const s = cacheAgeSummary([
      { fromCache: true, fetchedAt: "2026-09-21T18:24:10Z" },
      { fromCache: false, fetchedAt: "2026-09-21T18:46:50Z" },
      { fromCache: true },
    ]);
    expect(s).toEqual({ oldestFetchedAt: "2026-09-21T18:24:10Z", newestFetchedAt: "2026-09-21T18:46:50Z", reusedWithoutStamp: 1 });
  });
  it("no stamps at all → nulls, never a guessed date", () => {
    expect(cacheAgeSummary([{ fromCache: true }])).toEqual({ oldestFetchedAt: null, newestFetchedAt: null, reusedWithoutStamp: 1 });
    expect(cacheAgeSummary([])).toEqual({ oldestFetchedAt: null, newestFetchedAt: null, reusedWithoutStamp: 0 });
  });
});
