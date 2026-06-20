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
  const brandPattern = new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  let firstMentionPosition: number | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (sentence !== undefined && brandPattern.test(sentence)) {
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
