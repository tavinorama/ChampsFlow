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

/** One probe answer's competitor-relevant facts: which engine produced it and
 *  whether the client's own brand was absent from that answer (displacement). */
export interface CompetitorProbe {
  provider: string;      // canonical engine id (e.g. "openai", "anthropic", "serp")
  text: string;          // the answer text to scan for competitor mentions
  clientAbsent: boolean; // true when the client brand was NOT mentioned in this answer
}

/** A competitor's benchmark row: overall counts plus a per-engine split. */
export interface CompetitorTally {
  name: string;
  mentions: number;      // probes where this competitor appeared
  displacement: number;  // of those, where the client was absent
  providers: Array<{ provider: string; mentions: number; displacement: number }>;
}

/**
 * Aggregate competitor mentions across probe answers into the Competitor Trust
 * Benchmark ("who AI recommends instead of you"). For each probe we detect which
 * competitors appeared and whether the client was absent (displacement), then
 * tally BOTH the overall counts AND a per-engine (provider) split — so the UI can
 * answer "which engine recommends them, not you". Deterministic, pure, no I/O.
 * Ranked most-displacing first (ties broken by most mentions), and each row's
 * providers[] is ranked the same way. The overall mentions/displacement equal the
 * pre-per-engine totals exactly, so the competitor_citation table + existing
 * readers are unaffected.
 */
export function tallyCompetitors(
  probes: CompetitorProbe[],
  competitorNames: string[]
): CompetitorTally[] {
  type Acc = {
    mentions: number;
    displacement: number;
    byProvider: Map<string, { mentions: number; displacement: number }>;
  };
  const tally = new Map<string, Acc>();

  for (const probe of probes) {
    const seen = detectCompetitors(probe.text, competitorNames);
    for (const cName of seen) {
      const t = tally.get(cName) ?? { mentions: 0, displacement: 0, byProvider: new Map() };
      t.mentions += 1;
      if (probe.clientAbsent) t.displacement += 1;
      const p = t.byProvider.get(probe.provider) ?? { mentions: 0, displacement: 0 };
      p.mentions += 1;
      if (probe.clientAbsent) p.displacement += 1;
      t.byProvider.set(probe.provider, p);
      tally.set(cName, t);
    }
  }

  const rank = (
    a: { displacement: number; mentions: number },
    b: { displacement: number; mentions: number }
  ) => b.displacement - a.displacement || b.mentions - a.mentions;

  const out: CompetitorTally[] = [];
  for (const [name, t] of tally) {
    const providers = Array.from(t.byProvider, ([provider, v]) => ({
      provider,
      mentions: v.mentions,
      displacement: v.displacement,
    })).sort(rank);
    out.push({ name, mentions: t.mentions, displacement: t.displacement, providers });
  }
  return out.sort(rank);
}
