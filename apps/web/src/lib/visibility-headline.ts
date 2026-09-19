/**
 * visibility-headline.ts — what the big number on the dashboard is, in words
 * that cannot be misread.
 *
 * 19/09 (audit C03): the hero showed the Visibility INDEX (52) with "± 9" and
 * the title "How often AI names you". The ±9 was the Wilson half-width of a
 * different quantity (the citation RATE, 14.7% over 102 checks), and the title
 * described that rate, not the index. A customer read "52" as "named in about
 * half the answers" when the measured share was about one answer in seven.
 *
 * The index stays (it is what packages/llm/src/scoring.ts computes, weights
 * below). The rate is shown next to it with its own numerator, denominator and
 * interval, and the interval is never printed beside the index.
 */

export const VISIBILITY_INDEX_WEIGHTS = { citationRate: 0.5, positionWhenNamed: 0.3, sentiment: 0.2 } as const;

export const VISIBILITY_INDEX_TITLE = "AI Visibility index";

export const VISIBILITY_INDEX_EXPLAINER =
  "An index, not a share of answers. Half of it is how often the engines named you, " +
  "30% is how high you appear when they do, 20% is the tone. " +
  "So a 52 does not mean you were named in 52% of answers: the measured share is the line above.";

export interface CitationInterval {
  rate: number;
  low: number;
  high: number;
  n: number;
}

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

/**
 * "Named in 15 of 102 checks (14.7%). With this many checks the true share sits
 * between 9.1% and 22.9%." Null when there is nothing measured: no sentence is
 * better than a sentence about zero checks.
 */
export function citationRateLine(ci: CitationInterval | null | undefined): string | null {
  if (!ci || !Number.isFinite(ci.n) || ci.n <= 0 || !Number.isFinite(ci.rate)) return null;
  const named = Math.round(ci.rate * ci.n);
  const head = `Named in ${named} of ${ci.n} checks (${pct(ci.rate)}).`;
  if (!Number.isFinite(ci.low) || !Number.isFinite(ci.high)) return head;
  return `${head} With this many checks the true share sits between ${pct(ci.low)} and ${pct(ci.high)}.`;
}
