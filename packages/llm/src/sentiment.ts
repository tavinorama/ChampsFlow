/**
 * sentiment.ts — Ozvor · AI-vector sentiment classifier
 *
 * Removes the last baseline in the AI sub-score (`sentimentScore`). Operates on
 * the probe answer text we already collect: for each probe where the brand is
 * mentioned, it reads a context window around each mention and classifies how
 * the brand is PORTRAYED (positive / neutral / negative) using a weighted,
 * GEO-relevant lexicon with simple negation handling.
 *
 * It scores perception, not factual claims — and it never injects competitor
 * names anywhere (GEO-A2 N/A here: input is the model's own answer text).
 *
 * Deterministic — no randomness, no I/O. Pure functions. Mirrors the
 * scoring.ts contract: sentimentScore = (pos*1.0 + neu*0.5 + neg*0.0) / total,
 * defaulting to 0.5 (neutral) when no brand mention is found.
 */

export interface SentimentResult {
  /** True when at least one brand mention was found and classified. */
  analyzed: boolean;
  /** 0–1 perception score; 0.5 neutral default when nothing classified. */
  sentimentScore: number;
  /** Count of mentions classified as positive / neutral / negative. */
  positive: number;
  neutral: number;
  negative: number;
  /** Total brand mentions that were classified. */
  mentionsClassified: number;
  /** Human-readable transparency notes (capped). */
  findings: string[];
}

export interface SentimentProbeInput {
  /** The model's full answer text for the probe. */
  text: string;
  /** Whether the brand was detected as mentioned in this probe. */
  mentioned: boolean;
}

// Weighted perception lexicon. Phrases (with spaces) are matched before single
// words. Weights reflect how strongly a term signals brand standing.
const POSITIVE: Record<string, number> = {
  "market leader": 2, "industry standard": 2, "award-winning": 2, "highly recommended": 2,
  "well-known": 1.5, "user-friendly": 1.5, "best in class": 2, "go-to": 1.5,
  best: 1.5, leading: 1.5, top: 1.2, trusted: 1.5, recommended: 1.5, excellent: 1.5,
  reliable: 1.2, popular: 1.2, powerful: 1.1, robust: 1.1, comprehensive: 1.1,
  innovative: 1.2, strong: 1, great: 1.2, good: 0.8, preferred: 1.3, reputable: 1.4,
  established: 1, secure: 1, scalable: 1, intuitive: 1.1, affordable: 1, quality: 1,
  premium: 0.9, advanced: 0.9, seamless: 1, efficient: 1, effective: 1, proven: 1.2,
  versatile: 1, favorite: 1.3, favourite: 1.3, popularity: 1,
};

const NEGATIVE: Record<string, number> = {
  "steep learning curve": 2, "hard to use": 2, "not recommended": 2.5,
  "lacks": 1.5, "lacking": 1.5, "falls short": 2,
  expensive: 1.2, overpriced: 1.6, complex: 1, complicated: 1.2, difficult: 1.2,
  limited: 1.2, poor: 1.6, outdated: 1.5, slow: 1.2, buggy: 1.6, unreliable: 1.8,
  weak: 1.3, confusing: 1.3, downside: 1.2, drawback: 1.2, con: 0.8, issue: 1,
  problem: 1, concern: 0.9, criticism: 1.2, disappointing: 1.6, frustrating: 1.5,
  mediocre: 1.6, basic: 0.8, restrictive: 1.2, clunky: 1.5, pricey: 1.2,
};

const NEGATORS = new Set(["not", "no", "never", "isn't", "isnt", "aren't", "arent", "without", "lacks", "lacking", "hardly"]);

// ±N characters of context around a brand mention to evaluate.
const WINDOW = 140;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score a single context window. Returns net polarity (positive minus negative). */
function scoreWindow(window: string): { net: number; pos: number; neg: number } {
  const lower = ` ${window.toLowerCase()} `;
  const tokens = lower.split(/[^a-z']+/).filter(Boolean);
  let pos = 0;
  let neg = 0;

  // Multi-word phrases first.
  for (const [phrase, w] of Object.entries(POSITIVE)) {
    if (phrase.includes(" ") && lower.includes(` ${phrase} `)) pos += w;
  }
  for (const [phrase, w] of Object.entries(NEGATIVE)) {
    if (phrase.includes(" ") && lower.includes(` ${phrase} `)) neg += w;
  }

  // Single tokens with simple preceding-negation flip.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const negated = i > 0 && NEGATORS.has(tokens[i - 1] ?? "");
    // Single-word tokens can only match single-word lexicon keys (phrase keys
    // contain spaces and are handled above), so a direct lookup is safe.
    if (POSITIVE[tok] !== undefined) {
      const w = POSITIVE[tok] ?? 0;
      if (negated) neg += w; else pos += w;
    } else if (NEGATIVE[tok] !== undefined) {
      const w = NEGATIVE[tok] ?? 0;
      if (negated) pos += w; else neg += w;
    }
  }
  return { net: pos - neg, pos, neg };
}

/**
 * analyzeSentiment — classify brand perception across probe answers.
 *
 * For each probe where the brand is mentioned, extract every mention's context
 * window, sum window polarity, and classify the probe:
 *   net >  0.5 → positive
 *   net < -0.5 → negative
 *   else       → neutral
 *
 * sentimentScore = (positive*1 + neutral*0.5 + negative*0) / classified.
 * Returns analyzed=false + 0.5 when no mention is found (honest baseline).
 */
export function analyzeSentiment(
  probes: SentimentProbeInput[],
  brandName: string
): SentimentResult {
  const name = brandName.trim();
  const findings: string[] = [];
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  if (name.length > 0) {
    const re = new RegExp(escapeRegex(name), "gi");
    for (const probe of probes) {
      if (!probe.mentioned || !probe.text) continue;
      const text = probe.text;
      let netSum = 0;
      let hadWindow = false;
      let match: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((match = re.exec(text)) !== null) {
        hadWindow = true;
        const start = Math.max(0, match.index - WINDOW);
        const end = Math.min(text.length, match.index + name.length + WINDOW);
        const { net } = scoreWindow(text.slice(start, end));
        netSum += net;
        if (re.lastIndex === match.index) re.lastIndex++; // avoid zero-width loop
      }
      if (!hadWindow) continue;
      if (netSum > 0.5) positive++;
      else if (netSum < -0.5) negative++;
      else neutral++;
    }
  }

  const classified = positive + neutral + negative;
  if (classified === 0) {
    return {
      analyzed: false,
      sentimentScore: 0.5,
      positive: 0,
      neutral: 0,
      negative: 0,
      mentionsClassified: 0,
      findings: ["No brand mention found in answer text — neutral 0.5 baseline applied."],
    };
  }

  const sentimentScore = (positive * 1 + neutral * 0.5 + negative * 0) / classified;

  if (positive > 0) findings.push(`Portrayed positively in ${positive} of ${classified} answers.`);
  if (neutral > 0) findings.push(`Mentioned neutrally (factual, no clear stance) in ${neutral} of ${classified}.`);
  if (negative > 0) findings.push(`⚠ Portrayed negatively in ${negative} of ${classified} answers — review how AI frames the brand.`);

  return {
    analyzed: true,
    sentimentScore,
    positive,
    neutral,
    negative,
    mentionsClassified: classified,
    findings,
  };
}
