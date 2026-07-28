/**
 * wilson.ts — Wilson 95% score interval + intent×engine aggregation (B1).
 *
 * Why Wilson (not normal approximation): probe sample sizes are tiny (n = 4–6
 * runs per intent×engine). The Wilson interval stays inside [0,1], never
 * collapses to a zero-width interval at p̂ = 0 or 1, and is the standard
 * recommendation for small-n binomial confidence intervals.
 *
 * HONESTY RULE (approved product decision): the interval width is ALWAYS
 * communicated with the rate — "cited in 12% ± 9%" — never hidden. Downstream
 * consumers (breakdown JSON, scorecard) must carry low/high along with rate.
 *
 * Pure math — no I/O, no env, fully unit-tested with published known values.
 */

/** z for a 95% two-sided interval (97.5th percentile of the standard normal). */
const Z95 = 1.96;

export interface WilsonInterval {
  /** Observed success rate s/n (0 when n = 0). */
  rate: number;
  /** Lower bound of the 95% Wilson interval. */
  low: number;
  /** Upper bound of the 95% Wilson interval. */
  high: number;
  /** Sample size the interval was computed from. */
  n: number;
}

/**
 * wilson95 — 95% Wilson score interval for `successes` out of `n` trials.
 *
 * Edge cases (documented + tested):
 *  - n <= 0            → { rate: 0, low: 0, high: 1, n: 0 } (maximum uncertainty)
 *  - successes clamped to [0, n]; non-finite inputs treated as 0
 *  - s = 0             → low is exactly 0
 *  - s = n             → high is exactly 1
 */
export function wilson95(successes: number, n: number): WilsonInterval {
  const nn = Number.isFinite(n) ? Math.floor(n) : 0;
  if (nn <= 0) return { rate: 0, low: 0, high: 1, n: 0 };
  const s = Math.min(nn, Math.max(0, Number.isFinite(successes) ? successes : 0));

  const p = s / nn;
  const z2 = Z95 * Z95;
  const denom = 1 + z2 / nn;
  const center = (p + z2 / (2 * nn)) / denom;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / nn + z2 / (4 * nn * nn))) / denom;

  // Clamp for float safety; s=0 / s=n hit the exact bounds analytically anyway.
  const low = Math.max(0, center - half);
  const high = Math.min(1, center + half);
  return { rate: p, low, high, n: nn };
}

// ---------------------------------------------------------------------------
// Intent × engine aggregation
// ---------------------------------------------------------------------------

/** One (prompt formulation × engine) run tally to fold into an intent. */
export interface FormulationTally {
  /** Intent this formulation belongs to (null/undefined rows are skipped). */
  intentId?: string | null;
  /** Engine / provider id (caller decides canonical naming). */
  provider: string;
  /** Runs where the brand was mentioned (integer). */
  successes: number;
  /** Total runs for this formulation × engine. */
  runs: number;
}

/** Aggregated citation statistics for one intent × engine pair. */
export interface IntentEngineStat {
  intentId: string;
  provider: string;
  /** Total mentioned runs across all formulations of the intent. */
  successes: number;
  /** Total runs across all formulations of the intent. */
  n: number;
  /** Number of distinct formulations folded in. */
  formulations: number;
  citationRate: number;
  ciLow: number;
  ciHigh: number;
}

/**
 * aggregateIntentEngine — fold per-formulation run tallies into per
 * intent×engine citation rates with Wilson 95% intervals. Runs of the intent's
 * formulations are SUMMED (approved protocol: formulations are exchangeable
 * samples of the same buyer intent). Rows without an intentId are skipped —
 * legacy/unclassified prompts simply don't produce intent aggregates.
 * Deterministic order: intentId asc, then provider asc.
 */
export function aggregateIntentEngine(rows: FormulationTally[]): IntentEngineStat[] {
  const acc = new Map<string, { intentId: string; provider: string; s: number; n: number; f: number }>();
  for (const row of rows) {
    if (!row.intentId) continue;
    if (!Number.isFinite(row.runs) || row.runs <= 0) continue;
    const key = `${row.intentId}|${row.provider}`;
    const a = acc.get(key) ?? { intentId: row.intentId, provider: row.provider, s: 0, n: 0, f: 0 };
    a.s += Math.min(row.runs, Math.max(0, row.successes));
    a.n += row.runs;
    a.f += 1;
    acc.set(key, a);
  }
  const out: IntentEngineStat[] = [];
  for (const a of acc.values()) {
    const w = wilson95(a.s, a.n);
    out.push({
      intentId: a.intentId,
      provider: a.provider,
      successes: a.s,
      n: a.n,
      formulations: a.f,
      citationRate: w.rate,
      ciLow: w.low,
      ciHigh: w.high,
    });
  }
  return out.sort(
    (x, y) => x.intentId.localeCompare(y.intentId) || x.provider.localeCompare(y.provider)
  );
}
