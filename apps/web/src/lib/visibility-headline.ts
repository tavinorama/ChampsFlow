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
 * "Named in 12 of 130 answers (9.2%). With this many answers the true share
 * sits between 5.4% and 15.4%." Null when there is nothing measured: no
 * sentence is better than a sentence about zero answers.
 *
 * B3 (Codex D15, 23/09): the unit is ANSWERS — one per repetition of a
 * question on an engine (130 on 21/09). The dashboard also counts question ×
 * engine PAIRS (65 that day). Both used to be called "checks", so 12/130 and
 * 6/65 sat side by side under one word. Each grain now has its own name:
 * answers here, pairs in the footnote (see pairsMeasuredLine).
 */
export function citationRateLine(ci: CitationInterval | null | undefined): string | null {
  if (!ci || !Number.isFinite(ci.n) || ci.n <= 0 || !Number.isFinite(ci.rate)) return null;
  const named = Math.round(ci.rate * ci.n);
  const head = `Named in ${named} of ${ci.n} answers (${pct(ci.rate)}).`;
  if (!Number.isFinite(ci.low) || !Number.isFinite(ci.high)) return head;
  return `${head} With this many answers the true share sits between ${pct(ci.low)} and ${pct(ci.high)}.`;
}

/**
 * The footnote's grain: question × engine PAIRS (each engine asked each
 * question, repeats collapsed). "65 question × engine pairs measured — named
 * in 6 of them." Null when nothing was measured.
 */
export function pairsMeasuredLine(checks: number | null | undefined, citations: number | null | undefined): string | null {
  if (!Number.isFinite(checks as number) || (checks as number) <= 0) return null;
  const head = `${checks} question × engine pairs measured`;
  return Number.isFinite(citations as number) ? `${head} — named in ${citations} of them.` : `${head}.`;
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
  /** `answers` = repetitions (one answer per run), the same grain as citationRateLine. */
  discovery: { named: number; answers: number; questions: number };
  branded: { named: number; answers: number; questions: number };
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
    discovery: { named: 0, answers: 0, questions: 0 },
    branded: { named: 0, answers: 0, questions: 0 },
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
    side.answers += o.n;
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
        ? `When the question does not say your name: named in ${d.named} of ${d.answers} answers (${q(d.questions)}, each asked more than once per engine).`
        : null,
    branded:
      b.questions > 0
        ? `When the question already says your name: named in ${b.named} of ${b.answers} answers (${q(b.questions)}). That is recognition, not discovery.`
        : null,
    note:
      split.unplaced > 0
        ? `${q(split.unplaced)} with no stored text ${split.unplaced === 1 ? "is" : "are"} left out of both lines.`
        : null,
  };
}

// ---------------------------------------------------------------------------
// B6 (Codex D16, 23/09) — how old the evidence is.
//
// On 21/09 all 65 question × engine pairs were served from the probe cache
// (answers fetched 22 minutes earlier by a run that failed verification) and
// nothing on screen said so. A cached answer is a real answer; it is just not
// a fresh one, and a client re-testing an intervention must be told which.
// ---------------------------------------------------------------------------

export interface SamplingCache {
  enabled?: boolean;
  hits?: number | null;
  misses?: number | null;
  oldestFetchedAt?: string | null;
  newestFetchedAt?: string | null;
  reusedWithoutStamp?: number | null;
}

const stamp = (iso: string): string => iso.slice(0, 16).replace("T", " ") + " UTC";

export function cacheOriginLine(cache: SamplingCache | null | undefined): string | null {
  if (!cache) return null;
  const hits = typeof cache.hits === "number" ? cache.hits : 0;
  const misses = typeof cache.misses === "number" ? cache.misses : 0;
  const total = hits + misses;
  if (total <= 0) return null;
  if (hits === 0) {
    return cache.newestFetchedAt
      ? `All ${total} pairs were asked live at ${stamp(cache.newestFetchedAt)}.`
      : `All ${total} pairs were asked live for this audit.`;
  }
  const when =
    cache.oldestFetchedAt && cache.newestFetchedAt
      ? cache.oldestFetchedAt === cache.newestFetchedAt || cache.oldestFetchedAt.slice(0, 16) === cache.newestFetchedAt.slice(0, 16)
        ? `fetched at ${stamp(cache.oldestFetchedAt)}`
        : `fetched between ${stamp(cache.oldestFetchedAt)} and ${stamp(cache.newestFetchedAt)}`
      : "fetched at an unrecorded time";
  const rest = misses > 0 ? ` The other ${misses} were asked live for this audit.` : "";
  return `${hits} of ${total} pairs reused answers ${when} (cached up to 24 h).${rest}`;
}
