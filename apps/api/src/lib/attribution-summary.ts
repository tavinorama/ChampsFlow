/**
 * Attribution correlation summary — pure function, no DB/fetch.
 *
 * Computes a plain-language correlation string from:
 *  - scoreTrend: 90-day Ozvor AI Visibility Score time series
 *  - ga4Series:  GA4 organic sessions + users (may be null)
 *  - gscSeries:  GSC clicks + impressions (may be null)
 *
 * Rules:
 *  1. Require at least 14 days of overlapping data → else null.
 *  2. Score change = first→last over the overlap window.
 *  3. Metric % change: first-4-weeks vs last-4-weeks (or first/last half if <8w).
 *     If first4 = 0 → null (can't compute %).
 *  4. Plain-language summary string based on direction of score vs metric.
 *  5. NEVER fabricate. Insufficient data → null.
 *  6. Cap string length at 200 chars.
 *  7. Prefer GSC clicks over GA4 sessions when both available.
 *
 * Brand naming: always "Visibility" (Ozvor AI Visibility Score).
 * Never "TrustIndex" in output strings.
 */

export interface ScorePoint {
  recorded_at: string; // ISO date string
  score_overall: number | null;
}

export interface MetricPoint {
  date: string; // YYYY-MM-DD
  sessions?: number;
  users?: number;
  clicks?: number;
  impressions?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(iso: string): string {
  // Normalize to YYYY-MM-DD (handles both ISO datetime and date-only strings)
  return iso.slice(0, 10);
}

function buildOverlapWindow(
  scoreTrend: ScorePoint[],
  metricSeries: MetricPoint[]
): { scores: Array<{ date: string; score: number }>; metrics: MetricPoint[] } | null {
  // Extract valid score points (non-null score)
  const validScores = scoreTrend
    .filter((p) => p.score_overall !== null)
    .map((p) => ({ date: toDateStr(p.recorded_at), score: p.score_overall as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (validScores.length === 0 || metricSeries.length === 0) return null;

  // Find overlap date range
  const scoreDates = new Set(validScores.map((p) => p.date));
  const metricDates = new Set(metricSeries.map((p) => p.date));

  const overlappingDates = [...scoreDates].filter((d) => metricDates.has(d)).sort();

  if (overlappingDates.length < 14) return null;

  const windowStart = overlappingDates[0]!;
  const windowEnd = overlappingDates[overlappingDates.length - 1]!;

  const scores = validScores.filter(
    (p) => p.date >= windowStart && p.date <= windowEnd
  );
  const metrics = metricSeries
    .filter((p) => p.date >= windowStart && p.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (scores.length < 2 || metrics.length < 14) return null;

  return { scores, metrics };
}

function computeMetricChange(
  metrics: MetricPoint[],
  field: "clicks" | "sessions"
): { first4: number; last4: number; pctChange: number } | null {
  const values = metrics.map((p) => (p[field] as number | undefined) ?? 0);

  const half = Math.floor(values.length / 2);
  const sliceSize = values.length >= 56 ? 28 : half; // 4 weeks if >= 56 pts, else half

  const first4Sum = values.slice(0, sliceSize).reduce((a, b) => a + b, 0);
  const last4Sum = values.slice(-sliceSize).reduce((a, b) => a + b, 0);

  if (first4Sum === 0) return null;

  const pctChange = Math.round(((last4Sum - first4Sum) / first4Sum) * 100);
  return { first4: first4Sum, last4: last4Sum, pctChange };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a plain-language correlation summary from the provided data.
 * Returns null when data is insufficient or cannot compute a meaningful summary.
 * Cap output at 200 characters.
 */
export function computeAttributionSummary(
  scoreTrend: ScorePoint[],
  ga4Series: MetricPoint[] | null,
  gscSeries: MetricPoint[] | null
): string | null {
  // Must have at least one metric series
  if (!ga4Series && !gscSeries) return null;

  // Prefer GSC (clicks) over GA4 (sessions) per spec rule 7
  const preferredSeries = gscSeries ?? ga4Series;
  const metricLabel: "clicks" | "sessions" = gscSeries ? "clicks" : "sessions";

  if (!preferredSeries || preferredSeries.length === 0) return null;

  const overlap = buildOverlapWindow(scoreTrend, preferredSeries);
  if (!overlap) return null;

  const { scores, metrics } = overlap;

  const firstScore = scores[0]!.score;
  const lastScore = scores[scores.length - 1]!.score;
  const scoreChange = lastScore - firstScore;

  const metricChange = computeMetricChange(metrics, metricLabel);
  if (!metricChange) return null;

  const { pctChange } = metricChange;
  const weeks = Math.floor(metrics.length / 7);

  const scoreA = Math.round(firstScore);
  const scoreB = Math.round(lastScore);
  const absPct = Math.abs(pctChange);

  let summary: string;

  const THRESHOLD = 3; // points — below this the score is "unchanged"

  if (Math.abs(scoreChange) < THRESHOLD) {
    // Score held steady
    const direction = pctChange >= 0 ? "rose" : "fell";
    summary = `Visibility held steady at ~${scoreA} while organic ${metricLabel} ${direction} ${absPct}%`;
  } else if (scoreChange > 0 && pctChange >= 0) {
    // Both up
    summary = `Organic ${metricLabel} rose ${absPct}% over the ${weeks} weeks your Visibility climbed from ${scoreA}→${scoreB}`;
  } else if (scoreChange > 0 && pctChange < 0) {
    // Score up, metric down
    summary = `Your Visibility climbed from ${scoreA}→${scoreB} but organic ${metricLabel} dipped ${absPct}% — there may be a lag or other factors at play`;
  } else if (scoreChange < 0 && pctChange < 0) {
    // Both down
    summary = `Your Visibility slipped from ${scoreA}→${scoreB} and organic ${metricLabel} also fell ${absPct}%`;
  } else {
    // Score down, metric up
    summary = `Organic ${metricLabel} rose ${absPct}% even as Visibility slipped from ${scoreA}→${scoreB} — the gain may predate recent changes`;
  }

  // Cap at 200 chars
  if (summary.length > 200) {
    summary = summary.slice(0, 197) + "...";
  }

  return summary;
}
