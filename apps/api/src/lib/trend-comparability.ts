/**
 * trend-comparability.ts — Visibility Loop v2 (Phase 2): honest trends.
 *
 * The bug this closes: audits with DIFFERENT engine panels were drawn on the
 * same trend line. 31/08 the founder's brand ran without Claude (4 engines,
 * 42 checks) between 5-engine runs of 49-55 checks — the chart showed
 * 41 → 34 → 41 and read as "you lost ground", when in fact the ruler changed.
 *
 * A score is a rate over the probes that ran; a smaller panel is a DIFFERENT
 * measurement, not a lower one. So the trend only connects runs measured the
 * same way:
 *
 *   - the brand's PINNED panel = the engine set of its most recent
 *     full-coverage run (coverage.comparable !== false);
 *   - a run is in-trend iff its own coverage is full, its engine set equals
 *     the pinned set, and its check count sits within ±25% of the median
 *     check count of pinned-panel runs (the "check count band");
 *   - every excluded run carries a human reason ("partial — not comparable",
 *     "different engine panel", "check count outside band") — stored facts,
 *     shown in the UI, never silently dropped.
 *
 * Pure module: no I/O. The score/audit-history endpoints feed it rows read
 * from geo_score/geo_audit; tests exercise it directly.
 */

export interface TrendRunMeta {
  /** Identity of the run (audit id; may be null on very old rows). */
  auditId: string | null;
  /** ISO timestamp, any order — the module does not depend on sort order. */
  recordedAt: string;
  /** Engines that actually answered (DB names). Null when unknown (legacy). */
  providers: string[] | null;
  /** Total probes/checks in the run. Null when unknown (legacy). */
  checks: number | null;
  /** coverage.comparable as written by the worker. Null = predates the flag. */
  comparableFlag: boolean | null;
}

export interface TrendMark {
  auditId: string | null;
  /** Draw this run on the trend line / use it in deltas? */
  inTrend: boolean;
  /** Human reason when excluded (EN — product UI language). Null when in trend. */
  reason: string | null;
}

export interface TrendComparability {
  marks: TrendMark[];
  /** The pinned engine panel (sorted). Empty when nothing full ever ran. */
  pinnedPanel: string[];
  /** Median check count of pinned-panel runs (band centre). Null if unknown. */
  bandCenter: number | null;
  excluded: number;
}

/** Band half-width: a run whose check count strays more than this fraction
 *  from the pinned median is a different measurement. */
export const CHECK_BAND_FRACTION = 0.25;

/** Below this many checks a citation rate is statistically shaky — the UI
 *  shows a stability note instead of pretending precision. */
export const SMALL_SAMPLE_CHECKS = 30;

const signature = (providers: string[] | null): string | null =>
  providers && providers.length > 0 ? [...providers].sort().join("|") : null;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/**
 * Mark every run in a brand's history as in-trend or excluded-with-reason.
 * `runs` may come in any order; recency is decided by `recordedAt`.
 */
export function markComparableTrend(runs: TrendRunMeta[]): TrendComparability {
  const byNewest = [...runs].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );

  // Pin the panel: the newest run that was itself full-coverage and knows its
  // engine set. Legacy rows (no providers) can never pin.
  const pinRun = byNewest.find((r) => r.comparableFlag !== false && signature(r.providers) !== null);
  const pinnedSig = pinRun ? signature(pinRun.providers) : null;
  const pinnedPanel = pinRun && pinRun.providers ? [...pinRun.providers].sort() : [];

  const pinnedChecks = byNewest
    .filter((r) => r.comparableFlag !== false && signature(r.providers) === pinnedSig)
    .map((r) => r.checks)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const bandCenter = median(pinnedChecks);

  const marks: TrendMark[] = runs.map((r) => {
    if (r.comparableFlag === false) {
      return {
        auditId: r.auditId,
        inTrend: false,
        reason: "Partial — not comparable: one or more engines did not answer this run.",
      };
    }
    const sig = signature(r.providers);
    if (pinnedSig !== null && sig !== null && sig !== pinnedSig) {
      return {
        auditId: r.auditId,
        inTrend: false,
        reason: `Different engine panel (${(r.providers ?? []).join(", ")}) than the one this brand's trend is pinned to.`,
      };
    }
    if (
      bandCenter !== null &&
      typeof r.checks === "number" &&
      r.checks > 0 &&
      Math.abs(r.checks - bandCenter) > bandCenter * CHECK_BAND_FRACTION
    ) {
      return {
        auditId: r.auditId,
        inTrend: false,
        reason: `Check count outside the comparable band (${r.checks} vs ~${Math.round(bandCenter)}).`,
      };
    }
    // Legacy rows (no coverage, no providers) stay in-trend: they predate the
    // instrumentation and excluding them would erase real history. The flag
    // only ever removes runs we KNOW were measured differently.
    return { auditId: r.auditId, inTrend: true, reason: null };
  });

  return {
    marks,
    pinnedPanel,
    bandCenter,
    excluded: marks.filter((m) => !m.inTrend).length,
  };
}

/** Confidence descriptor for one run (shown next to the headline score). */
export interface RunConfidence {
  checks: number | null;
  citations: number | null;
  /** Present when the sample is too small to read moves as real. */
  stabilityNote: string | null;
}

export function runConfidence(checks: number | null, citations: number | null): RunConfidence {
  const stabilityNote =
    typeof checks === "number" && checks > 0 && checks < SMALL_SAMPLE_CHECKS
      ? `Based on ${checks} checks — small day-to-day moves are within noise at this sample size.`
      : null;
  return { checks, citations, stabilityNote };
}
