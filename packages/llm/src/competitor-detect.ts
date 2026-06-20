/**
 * competitor-detect.ts — deterministic competitor mention detection.
 *
 * Given a probe answer's raw text and a list of competitor names, returns which
 * competitors were mentioned. Pure function, no I/O, case-insensitive,
 * word-boundary aware to avoid substring false positives ("Sap" in "SAP" vs
 * "sapling"). Competitor names are public brand strings, not PII.
 *
 * Used by the worker to build the Competitor Trust Benchmark ("who AI
 * recommends instead of you"): for each probe answer we record which
 * competitors appeared and whether the client's brand was absent (displacement).
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Return the subset of `competitors` mentioned in `raw`.
 * Word-boundary match, case-insensitive. Empty input → [].
 */
export function detectCompetitors(raw: string, competitors: string[]): string[] {
  if (!raw || raw.trim().length === 0 || competitors.length === 0) return [];
  const found: string[] = [];
  for (const name of competitors) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    // \b doesn't work well around non-word chars in some brand names, so we use
    // a lookaround that treats start/end or non-alphanumeric as boundaries.
    const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(trimmed)}([^A-Za-z0-9]|$)`, "i");
    if (re.test(raw)) found.push(trimmed);
  }
  return found;
}
