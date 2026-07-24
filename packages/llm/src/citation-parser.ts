/**
 * citation-parser.ts — Deterministic citation extraction from LLM/SERP response text
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 (inference path — citation parser step)
 *  - docs/03-architecture.md §4.2 citation_check entity (cited, citation_rank, sentiment)
 *  - docs/03-architecture.md §7 Data Flows Cat 4 — "citation parser extracts cited,
 *    citation_rank, sentiment; aggregate metrics written; raw response text discarded"
 *  - docs/03-architecture.md §4.3 — "Named-individual snippets NEVER written to DB"
 *
 * Privacy (hard rule 7, data minimisation):
 *  - This parser extracts ONLY: mentioned (bool), position (int|null), sources (URL[])
 *  - The raw response text MUST be discarded by the caller after parsing
 *  - Named individuals found in snippets are NEVER extracted or returned
 *
 * Deterministic — no randomness, no I/O. Pure function.
 */

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface CitationParseResult {
  /** Whether the brand name was mentioned in the response */
  mentioned: boolean;
  /**
   * 1-based position of the first mention.
   * Defined as: (sentence index of first mention) + 1.
   * null if not mentioned.
   *
   * Stored in citation_check.citation_rank (architecture §4.2).
   */
  position: number | null;
  /**
   * URLs found in the response text (https?://... patterns).
   * Matches inline citation URLs from Perplexity, SERP AIO, etc.
   * Empty array when no URLs are present.
   *
   * The caller (adapter) may augment this with provider-level citation metadata.
   */
  sources: string[];
}

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

const URL_PATTERN = /https?:\/\/[^\s\])['">,;]+/g;

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(URL_PATTERN), (m) =>
    // Strip trailing sentence punctuation that the pattern over-captures
    // (e.g. "...visit https://site.com." → "https://site.com").
    m[0].replace(/[.,!?:]+$/, "")
  );
}

// ---------------------------------------------------------------------------
// Sentence splitter — simple heuristic, deterministic
// ---------------------------------------------------------------------------

/**
 * Split text into sentences on ". ", "? ", "! " and end-of-string.
 * Handles abbreviations poorly but is deterministic and sufficient for
 * computing citation position from LLM response paragraphs.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// No-knowledge disclaimers — NOT citations
// ---------------------------------------------------------------------------

/**
 * Sentences where the model disclaims knowledge of the subject. A brand token
 * inside one of these is the opposite of being cited, so it must not count.
 * Deliberately CONSERVATIVE: only unambiguous "I don't know it" phrasings.
 * A hedged-but-real mention ("I don't have pricing details for X, but X is a
 * solid tool") loses only that sentence — later genuine mentions still count.
 */
const NO_KNOWLEDGE_PATTERN = new RegExp(
  [
    // "don't/do not/doesn't/didn't have (any|specific|much|detailed|reliable|verified) information/details/data/knowledge"
    "\\b(?:do(?:es)?\\s*n[o']t|did\\s*n[o']t|don't|doesn't|didn't)\\s+have\\s+(?:any\\s+|specific\\s+|much\\s+|detailed\\s+|reliable\\s+|verified\\s+)*(?:information|details|data|knowledge)\\b",
    // "no (specific/reliable/verified) information/details/data about/on/regarding"
    "\\bno\\s+(?:specific\\s+|reliable\\s+|verified\\s+)*(?:information|details|data)\\s+(?:about|on|regarding|available)\\b",
    // "not familiar with" / "not aware of" / "unfamiliar with" / "haven't heard of"
    "\\b(?:not\\s+familiar\\s+with|not\\s+aware\\s+of|unfamiliar\\s+with|haven'?t\\s+heard\\s+of)\\b",
    // "couldn't/can't/cannot/could not/unable to find|locate|verify|confirm"
    "\\b(?:couldn'?t|can'?t|cannot|could\\s+not|unable\\s+to)\\s+(?:find|locate|verify|confirm)\\b",
    // "does not appear in my (training) data / to exist" · "no results for"
    "\\bdoes\\s+not\\s+appear\\s+(?:in\\s+my|to\\s+exist)\\b",
    "\\bno\\s+results\\s+for\\b",
    // "as of my knowledge cutoff ... (no|not) ..." style disclaimers
    "\\bknowledge\\s+cutoff\\b[^.?!]*\\b(?:no|not|never)\\b",
  ].join("|"),
  "i"
);

// ---------------------------------------------------------------------------
// Core parse function
// ---------------------------------------------------------------------------

/**
 * parseCitation — extract citation metrics from a raw LLM/SERP response.
 *
 * @param raw        Raw response text from the provider (processed in memory only)
 * @param brandName  The brand name to look for
 * @returns          CitationParseResult — only aggregate metrics, no PII
 *
 * Design notes:
 *  - Case-insensitive match on brand name
 *  - Position = 1-based index of the sentence containing the first brand mention
 *  - Sources = all https?:// URLs found anywhere in the response
 *  - Named individuals: this parser makes no attempt to extract them (by design)
 */
export function parseCitation(raw: string, brandName: string): CitationParseResult {
  if (!raw || raw.trim().length === 0) {
    return { mentioned: false, position: null, sources: [] };
  }

  if (!brandName || brandName.trim().length === 0) {
    return { mentioned: false, position: null, sources: extractUrls(raw) };
  }

  const sentences = splitSentences(raw);
  // Match the brand ONLY as a whole token, never as a substring of a longer word.
  // Without this, a brand like "Flow" falsely matches "workflow"/"cashflow" and a
  // short/common brand name gets counted as "cited" everywhere — inflating the
  // score with data that isn't real. Unicode-aware so accented names still match.
  const escaped = brandName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let brandPattern: RegExp;
  try {
    brandPattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  } catch {
    // Fallback for runtimes without lookbehind / \p{} support.
    brandPattern = new RegExp(`\\b${escaped}\\b`, "i");
  }

  let firstMentionPosition: number | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (sentence !== undefined && brandPattern.test(sentence)) {
      // Honesty guard: a sentence where the model says it DOESN'T know the
      // brand ("I don't have specific information about Ozvor") contains the
      // brand token but is the opposite of a citation. Counting it inflated
      // the Visibility score with data that isn't real (observed live: an
      // engine disclaiming knowledge was displayed as "Cited · #1"). Skip the
      // disclaimer sentence and keep scanning — a genuine mention later in
      // the same answer still counts.
      if (NO_KNOWLEDGE_PATTERN.test(sentence)) continue;
      firstMentionPosition = i + 1; // 1-based
      break;
    }
  }

  return {
    mentioned: firstMentionPosition !== null,
    position: firstMentionPosition,
    sources: extractUrls(raw),
  };
}
