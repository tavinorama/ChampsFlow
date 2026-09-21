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

// ---------------------------------------------------------------------------
// P07 (21/09) — discovery and recognition are different facts.
//
// On 21/09 our own audit read "named in 6 of 65". All 6 came from the 2
// questions that already say "Ozvor"; the 11 that do not say it were 0 of 55.
// A single mixed share hides the only number a buyer cares about: are you named
// when the person asking has never heard of you?
//
// A question is "branded" when its text contains the brand name. That is a text
// rule, not an intent classifier: it is checked, cheap, and it cannot call a
// question branded by mistake. A row with no question text cannot be placed on
// either side, so it is left out and counted — never guessed.
// ---------------------------------------------------------------------------

export interface HeadlineIntentRow {
  label?: string | null;
  overall: { n: number; citationRate: number } | null;
}

export interface DiscoverySplit {
  discovery: { named: number; checks: number; questions: number };
  branded: { named: number; checks: number; questions: number };
  /** Rows with measurements but no question text: not placed on either side. */
  unplaced: number;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function splitByBrandMention(
  intents: readonly HeadlineIntentRow[] | null | undefined,
  brandName: string | null | undefined
): DiscoverySplit | null {
  const name = (brandName ?? "").trim();
  if (!name || !intents || intents.length === 0) return null;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}([^\\p{L}\\p{N}]|$)`, "iu");
  const out: DiscoverySplit = {
    discovery: { named: 0, checks: 0, questions: 0 },
    branded: { named: 0, checks: 0, questions: 0 },
    unplaced: 0,
  };
  for (const row of intents) {
    const o = row.overall;
    if (!o || !Number.isFinite(o.n) || o.n <= 0 || !Number.isFinite(o.citationRate)) continue;
    const text = (row.label ?? "").trim();
    if (!text) {
      out.unplaced += 1;
      continue;
    }
    const side = re.test(text) ? out.branded : out.discovery;
    side.named += Math.round(o.citationRate * o.n);
    side.checks += o.n;
    side.questions += 1;
  }
  return out.discovery.questions + out.branded.questions === 0 ? null : out;
}

/**
 * The first thing the hero says. Discovery first, because it is the number that
 * sells or does not sell; recognition second, labelled as what it is.
 */
export function discoveryLines(split: DiscoverySplit | null): { discovery: string | null; branded: string | null; note: string | null } {
  if (!split) return { discovery: null, branded: null, note: null };
  const q = (n: number): string => `${n} ${n === 1 ? "question" : "questions"}`;
  const d = split.discovery;
  const b = split.branded;
  return {
    discovery:
      d.questions > 0
        ? `When the question does not say your name: named in ${d.named} of ${d.checks} checks (${q(d.questions)}).`
        : null,
    branded:
      b.questions > 0
        ? `When the question already says your name: named in ${b.named} of ${b.checks} checks (${q(b.questions)}). That is recognition, not discovery.`
        : null,
    note:
      split.unplaced > 0
        ? `${q(split.unplaced)} with no stored text ${split.unplaced === 1 ? "is" : "are"} left out of both lines.`
        : null,
  };
}
