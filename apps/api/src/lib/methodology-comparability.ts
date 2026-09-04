/**
 * methodology-comparability.ts — P0-06: the trend never lies about its ruler.
 *
 * THE REAL BUG, FROM PRODUCTION DATA (read 2026-09-03, brand
 * e74fcbc1-a988-4b5d-b054-87329dc881c0):
 *
 *   30/06        method 1.0   2 engines (perplexity, dataforseo)   Brand 90
 *   29/07 09:58  method 1.0   1 engine  (dataforseo)               Brand 19
 *   29/07 14:11  method 2.1   5 engines                            Brand 24
 *   31/08        method 2.1   4 engines (no anthropic)             —
 *
 * The dashboard drew "71 -> 48" across those points as one falling line. A
 * meaningful part of that fall is not the market moving: it is the ruler
 * changing. Three different things can change the ruler, and the report
 * (section 4, "Correcao do score") names the badge for each:
 *
 *   Comparable           same method, same prompt set, same engine panel
 *   Method changed       methodology_version differs
 *   Prompt set changed   prompt_set_version or prompt_set_hash differs
 *   Engine changed       the set of engines that answered differs
 *
 * plus a fifth state the report implies and the data forces:
 *
 *   Unknown              one of the two runs does not record what it used.
 *                        Legacy rows predate the instrumentation. Missing data
 *                        becomes "unknown", NEVER "same" — an unlabelled point
 *                        is exactly how the founder's trend lied in the first
 *                        place.
 *
 * RELATIONSHIP TO trend-comparability.ts (Visibility Loop v2, PR #582)
 * --------------------------------------------------------------------
 * That module answers a different question and this one does NOT re-implement
 * it. markComparableTrend() decides, per run, whether a run belongs on the
 * brand's trend at all, by pinning the brand's engine PANEL and a check-count
 * band. This module decides, per TRANSITION between two consecutive runs,
 * which of the four badges to show and where the line must break.
 *
 * They compose: pass markComparableTrend()'s marks into `panelMarks` and any
 * run it excluded is dropped from the trend here too, carrying its reason
 * verbatim. Nothing is recomputed and nothing is contradicted. When #582 is
 * not present (or the caller has no panel marks), this module still breaks the
 * line on an engine-set change, because that is the founder's 31/08 case and
 * it must not wait on another PR to be told the truth.
 *
 * Pure module: no I/O, no clock.
 */

export type ComparabilityBadge =
  | "comparable"
  | "method_changed"
  | "prompt_set_changed"
  | "engine_changed"
  | "unknown";

/** English label shown in the product UI. */
export const BADGE_LABEL: Readonly<Record<ComparabilityBadge, string>> = Object.freeze({
  comparable: "Comparable",
  method_changed: "Method changed",
  prompt_set_changed: "Prompt set changed",
  engine_changed: "Engine changed",
  unknown: "Not comparable — unknown method",
});

export interface RunMethodMeta {
  auditId: string | null;
  /** ISO timestamp. Any order — this module sorts. */
  recordedAt: string;
  /** geo_audit.methodology_version. Null on rows predating the column. */
  methodologyVersion: string | null;
  /** geo_audit.prompt_set_version. Null until the run recorded one. */
  promptSetVersion: string | null;
  /** geo_audit.prompt_set_hash. Null until the run recorded one. */
  promptSetHash: string | null;
  /** Engines that actually answered. Null when unknown (legacy). */
  engineSet: string[] | null;
}

export interface RunBadge {
  auditId: string | null;
  recordedAt: string;
  badge: ComparabilityBadge;
  /**
   * Every reason the ruler differs, not just the one the badge names. A run can
   * change method AND engines at once — 29/07 14:11 did exactly that — and
   * hiding the second reason behind the first is how the next investigation
   * gets lost.
   */
  reasons: string[];
  /** True only when this run is measured the same way as the previous one. */
  comparableWithPrevious: boolean;
  previousAuditId: string | null;
  /**
   * Index of the contiguous run of same-ruler measurements this run belongs
   * to. The chart draws ONE line per segment and never joins two.
   */
  segmentIndex: number;
  /** Set when an upstream panel mark (PR #582) excluded this run entirely. */
  excludedFromTrend: boolean;
  excludedReason: string | null;
}

export interface ComparabilityResult {
  /** Newest last — same order the chart plots. */
  badges: RunBadge[];
  /** Audit ids grouped into same-ruler segments, oldest segment first. */
  segments: Array<Array<string | null>>;
  /** How many ruler changes the history contains. */
  breaks: number;
}

/** The shape markComparableTrend() (PR #582) returns per run. */
export interface PanelMark {
  auditId: string | null;
  inTrend: boolean;
  reason: string | null;
}

export interface ComparabilityOptions {
  /**
   * Marks from trend-comparability.markComparableTrend(). Optional. When given,
   * a run marked out-of-trend there is excluded here with the same reason —
   * this module defers to it rather than second-guessing the panel pinning.
   */
  panelMarks?: readonly PanelMark[] | null;
}

const sameEngineSet = (a: string[] | null, b: string[] | null): boolean | null => {
  if (a === null || b === null) return null; // unknown, not "same"
  if (a.length !== b.length) return false;
  const sa = [...a].map((s) => s.toLowerCase()).sort();
  const sb = [...b].map((s) => s.toLowerCase()).sort();
  return sa.every((x, i) => x === sb[i]);
};

const enginesLabel = (xs: string[] | null): string =>
  xs === null || xs.length === 0 ? "unknown" : [...xs].sort().join(", ");

/**
 * Classify one transition. Exported because the audit detail view labels a
 * single "vs. previous run" comparison without needing the whole history.
 *
 * Precedence when several things changed at once: method > prompt set >
 * engine. The badge names the deepest change; `reasons` lists them all.
 */
export function compareRuns(
  previous: RunMethodMeta,
  current: RunMethodMeta
): { badge: ComparabilityBadge; reasons: string[] } {
  const reasons: string[] = [];
  let badge: ComparabilityBadge = "comparable";

  // --- unknowns first: absence of a fact is never evidence of sameness ------
  const unknowns: string[] = [];
  if (previous.methodologyVersion === null || current.methodologyVersion === null) {
    unknowns.push("methodology version");
  }
  if (
    previous.promptSetVersion === null ||
    current.promptSetVersion === null ||
    previous.promptSetHash === null ||
    current.promptSetHash === null
  ) {
    unknowns.push("prompt set");
  }
  if (previous.engineSet === null || current.engineSet === null) {
    unknowns.push("engine panel");
  }

  // --- engine panel ---------------------------------------------------------
  const engineSame = sameEngineSet(previous.engineSet, current.engineSet);
  if (engineSame === false) {
    badge = "engine_changed";
    reasons.push(
      `Engine panel changed: ${enginesLabel(previous.engineSet)} -> ${enginesLabel(current.engineSet)}. A score is a rate over the probes that ran, so a different panel is a different measurement, not a lower one.`
    );
  }

  // --- prompt set -----------------------------------------------------------
  if (
    previous.promptSetVersion !== null &&
    current.promptSetVersion !== null &&
    previous.promptSetVersion !== current.promptSetVersion
  ) {
    badge = "prompt_set_changed";
    reasons.push(
      `Prompt universe version changed: ${previous.promptSetVersion} -> ${current.promptSetVersion}. Different questions produce a different score by construction.`
    );
  } else if (
    previous.promptSetHash !== null &&
    current.promptSetHash !== null &&
    previous.promptSetHash !== current.promptSetHash
  ) {
    badge = "prompt_set_changed";
    reasons.push(
      "Prompt set changed: the same universe version was composed from a different set of questions."
    );
  }

  // --- methodology ----------------------------------------------------------
  if (
    previous.methodologyVersion !== null &&
    current.methodologyVersion !== null &&
    previous.methodologyVersion !== current.methodologyVersion
  ) {
    badge = "method_changed";
    reasons.push(
      `Measurement method changed: ${previous.methodologyVersion} -> ${current.methodologyVersion}. Scores from different methodology versions are not comparable — this point starts a new baseline.`
    );
  }

  // --- unknown wins over "comparable", never over a known change ------------
  if (badge === "comparable" && unknowns.length > 0) {
    badge = "unknown";
    reasons.push(
      `Cannot prove comparability: ${unknowns.join(", ")} not recorded for one of these runs. Unknown is not the same as unchanged.`
    );
  } else if (unknowns.length > 0) {
    reasons.push(`Also unrecorded on one of these runs: ${unknowns.join(", ")}.`);
  }

  return { badge, reasons };
}

/**
 * Badge a brand's whole audit history and cut it into same-ruler segments.
 *
 * The first (oldest) retained run has no predecessor: it opens segment 0 and
 * is labelled "comparable" with an empty reason list — it is the baseline, not
 * a claim about anything before it.
 */
export function classifyMethodologyBreaks(
  runs: readonly RunMethodMeta[],
  opts: ComparabilityOptions = {}
): ComparabilityResult {
  const panelByAudit = new Map<string, PanelMark>();
  for (const m of opts.panelMarks ?? []) {
    if (m.auditId) panelByAudit.set(m.auditId, m);
  }

  const ordered = [...runs].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  const badges: RunBadge[] = [];
  const segments: Array<Array<string | null>> = [];
  let segmentIndex = -1;
  let previous: RunMethodMeta | null = null;
  let breaks = 0;

  for (const run of ordered) {
    const panel = run.auditId ? panelByAudit.get(run.auditId) : undefined;

    // Deferred to PR #582's panel pinning: excluded runs are shown, labelled,
    // and kept OUT of the segments — never silently dropped, never joined.
    if (panel && panel.inTrend === false) {
      badges.push({
        auditId: run.auditId,
        recordedAt: run.recordedAt,
        badge: "engine_changed",
        reasons: [panel.reason ?? "Excluded from the comparable trend."],
        comparableWithPrevious: false,
        previousAuditId: previous?.auditId ?? null,
        segmentIndex: -1,
        excludedFromTrend: true,
        excludedReason: panel.reason ?? "Excluded from the comparable trend.",
      });
      continue;
    }

    if (previous === null) {
      segmentIndex += 1;
      segments.push([run.auditId]);
      badges.push({
        auditId: run.auditId,
        recordedAt: run.recordedAt,
        badge: "comparable",
        reasons: [],
        comparableWithPrevious: false,
        previousAuditId: null,
        segmentIndex,
        excludedFromTrend: false,
        excludedReason: null,
      });
      previous = run;
      continue;
    }

    const { badge, reasons } = compareRuns(previous, run);
    const comparable = badge === "comparable";
    if (!comparable) {
      breaks += 1;
      segmentIndex += 1;
      segments.push([run.auditId]);
    } else {
      segments[segmentIndex]?.push(run.auditId);
    }

    badges.push({
      auditId: run.auditId,
      recordedAt: run.recordedAt,
      badge,
      reasons,
      comparableWithPrevious: comparable,
      previousAuditId: previous.auditId,
      segmentIndex,
      excludedFromTrend: false,
      excludedReason: null,
    });
    previous = run;
  }

  return { badges, segments, breaks };
}

/**
 * The two runs a "what changed" narrative may legitimately compare: the newest
 * retained run and the newest earlier run measured the SAME way.
 *
 * Returns null when there is no comparable predecessor — in which case the
 * product must say "first run on this method", not invent a delta. A delta
 * across a ruler change is the number that started this whole investigation.
 */
export function latestComparablePair(
  result: ComparabilityResult
): { current: RunBadge; previous: RunBadge } | null {
  const inTrend = result.badges.filter((b) => !b.excludedFromTrend);
  const current = inTrend[inTrend.length - 1];
  if (!current) return null;
  for (let i = inTrend.length - 2; i >= 0; i -= 1) {
    const candidate = inTrend[i];
    if (candidate && candidate.segmentIndex === current.segmentIndex) {
      return { current, previous: candidate };
    }
  }
  return null;
}
