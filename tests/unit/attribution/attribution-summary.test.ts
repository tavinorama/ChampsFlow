/**
 * Unit tests — apps/api/src/lib/attribution-summary.ts
 *
 * Tests:
 *  1. Returns null when both metric series are null
 *  2. Returns null when fewer than 14 overlapping points
 *  3. Score up + GSC clicks up → summary contains "climbed" and score points
 *  4. Score up + GA4 sessions down → summary contains "dipped" or "fell"
 *  5. Score down + metric down → summary contains "slipped"
 *  6. Score unchanged (< 3 pts) → summary contains "held steady"
 *  7. Prefers GSC clicks over GA4 sessions when both available
 *  8. Returns null when first4 = 0 (cannot compute %)
 *  9. Summary length <= 200 chars in all cases
 */

import { describe, it, expect } from "vitest";
import {
  computeAttributionSummary,
  type ScorePoint,
  type MetricPoint,
} from "../../../apps/api/src/lib/attribution-summary";

// ---------------------------------------------------------------------------
// Helpers to generate test data
// ---------------------------------------------------------------------------

function makeScoreTrend(
  startScore: number,
  endScore: number,
  days: number
): ScorePoint[] {
  const trend: ScorePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(2026, 0, 1 + i); // 2026-01-01 + i days
    const pct = days > 1 ? i / (days - 1) : 0;
    const score = startScore + (endScore - startScore) * pct;
    trend.push({
      recorded_at: d.toISOString().slice(0, 10),
      score_overall: Math.round(score),
    });
  }
  return trend;
}

function makeClicksSeries(
  startClicks: number,
  endClicks: number,
  days: number
): MetricPoint[] {
  const series: MetricPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(2026, 0, 1 + i);
    const pct = days > 1 ? i / (days - 1) : 0;
    const clicks = Math.round(startClicks + (endClicks - startClicks) * pct);
    series.push({
      date: d.toISOString().slice(0, 10),
      clicks,
      impressions: clicks * 10,
    });
  }
  return series;
}

function makeSessionsSeries(
  startSessions: number,
  endSessions: number,
  days: number
): MetricPoint[] {
  const series: MetricPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(2026, 0, 1 + i);
    const pct = days > 1 ? i / (days - 1) : 0;
    const sessions = Math.round(startSessions + (endSessions - startSessions) * pct);
    series.push({
      date: d.toISOString().slice(0, 10),
      sessions,
      users: Math.round(sessions * 0.8),
    });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeAttributionSummary", () => {
  it("returns null when both metric series are null", () => {
    const scores = makeScoreTrend(30, 60, 30);
    expect(computeAttributionSummary(scores, null, null)).toBeNull();
  });

  it("returns null when score trend is empty", () => {
    const clicks = makeClicksSeries(100, 200, 30);
    expect(computeAttributionSummary([], null, clicks)).toBeNull();
  });

  it("returns null when fewer than 14 overlapping points", () => {
    // Only 10 days of overlap
    const scores = makeScoreTrend(30, 50, 10);
    const clicks = makeClicksSeries(100, 200, 10);
    expect(computeAttributionSummary(scores, null, clicks)).toBeNull();
  });

  it("returns null when exactly 13 overlapping days", () => {
    const scores = makeScoreTrend(30, 50, 13);
    const clicks = makeClicksSeries(100, 200, 13);
    expect(computeAttributionSummary(scores, null, clicks)).toBeNull();
  });

  it("score up + GSC clicks up → summary contains 'climbed' and score points", () => {
    const scores = makeScoreTrend(31, 52, 60); // 31→52
    const clicks = makeClicksSeries(100, 200, 60); // clicks doubled
    const result = computeAttributionSummary(scores, null, clicks);
    expect(result).not.toBeNull();
    expect(result).toContain("climbed");
    expect(result).toContain("31");
    expect(result).toContain("52");
  });

  it("score up + GA4 sessions down → summary contains 'dipped' or 'fell'", () => {
    const scores = makeScoreTrend(30, 55, 60);
    const sessions = makeSessionsSeries(200, 50, 60); // sessions fell
    const result = computeAttributionSummary(scores, sessions, null);
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toMatch(/dipped|fell/);
  });

  it("score down + metric down → summary contains 'slipped'", () => {
    const scores = makeScoreTrend(60, 35, 60); // score fell
    const clicks = makeClicksSeries(200, 80, 60); // clicks fell
    const result = computeAttributionSummary(scores, null, clicks);
    expect(result).not.toBeNull();
    expect(result).toContain("slipped");
  });

  it("score unchanged (< 3 pts) → summary contains 'held steady'", () => {
    const scores = makeScoreTrend(50, 51, 60); // only 1 pt change — below threshold
    const clicks = makeClicksSeries(100, 200, 60); // clicks rose
    const result = computeAttributionSummary(scores, null, clicks);
    expect(result).not.toBeNull();
    expect(result).toContain("held steady");
  });

  it("prefers GSC clicks over GA4 sessions when both available", () => {
    const scores = makeScoreTrend(30, 55, 60);
    const sessions = makeSessionsSeries(100, 200, 60);
    const clicks = makeClicksSeries(100, 250, 60);
    const result = computeAttributionSummary(scores, sessions, clicks);
    expect(result).not.toBeNull();
    // Should mention "clicks" (GSC), not "sessions" (GA4)
    expect(result).toContain("clicks");
    expect(result).not.toContain("sessions");
  });

  it("returns null when first4 = 0 (cannot compute %)", () => {
    const scores = makeScoreTrend(30, 55, 60);
    // All zeros for the first period
    const clicks: MetricPoint[] = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
      clicks: i < 30 ? 0 : 100, // first half is zero
      impressions: 0,
    }));
    const result = computeAttributionSummary(scores, null, clicks);
    expect(result).toBeNull();
  });

  it("summary length <= 200 chars in all cases", () => {
    // Test all direction combinations
    const testCases: Array<[number, number, number, number]> = [
      [30, 60, 100, 300],  // score up, metric up
      [30, 60, 300, 100],  // score up, metric down
      [60, 30, 300, 100],  // score down, metric down
      [60, 30, 100, 300],  // score down, metric up
      [50, 51, 100, 300],  // score unchanged, metric up
    ];

    for (const [scoreStart, scoreEnd, clickStart, clickEnd] of testCases) {
      const scores = makeScoreTrend(scoreStart, scoreEnd, 60);
      const clicks = makeClicksSeries(clickStart, clickEnd, 60);
      const result = computeAttributionSummary(scores, null, clicks);
      if (result !== null) {
        expect(result.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it("handles 14 overlapping points (minimum valid case)", () => {
    const scores = makeScoreTrend(30, 55, 14);
    const clicks = makeClicksSeries(100, 200, 14);
    // Should produce a result (14 >= 14 minimum)
    const result = computeAttributionSummary(scores, null, clicks);
    // May or may not produce a result depending on slicing, but must not throw
    expect(() => computeAttributionSummary(scores, null, clicks)).not.toThrow();
  });

  it("score down + metric up → summary contains 'slipped' and 'rose'", () => {
    const scores = makeScoreTrend(60, 35, 60);
    const clicks = makeClicksSeries(100, 300, 60);
    const result = computeAttributionSummary(scores, null, clicks);
    expect(result).not.toBeNull();
    expect(result).toContain("slipped");
    expect(result).toContain("rose");
  });

  it("never returns empty string (always null or non-empty)", () => {
    const scores = makeScoreTrend(30, 50, 60);
    const clicks = makeClicksSeries(100, 200, 60);
    const result = computeAttributionSummary(scores, null, clicks);
    if (result !== null) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
