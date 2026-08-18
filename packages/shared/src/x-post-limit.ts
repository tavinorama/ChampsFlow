// =============================================================================
// @organic-posts/shared — X (Twitter) post length limit
// =============================================================================
//
// Why this file exists (prod failure 17/08 14:50): the sphere-x graph published
// an over-limit post; Postiz rejected it with
//   {"statusCode":400,"provider":"x","message":"post is too long, please fix it"}
// and the whole run (briefing → drafts → critics → approval → publish) was
// wasted. This module is the single source of truth for X's character limit so
// the adapt/finalize step can produce a compliant post BEFORE the founder ever
// approves it, and the publish port can refuse to send an over-limit post —
// never a silent send ("nada degrada calado").
//
// The default is the hard 280-char limit for a single standard post. We do NOT
// assume a premium/long-post allowance: the sphere-x drafts are explicitly
// briefed as "<=280 caracteres" per tweet (graph-prompts.ts x-draft), so 280 is
// the real budget the whole pipeline is written against.
//
// Threads: the sphere-x "mini-thread" style emits multiple tweets separated by a
// line that is exactly "---" (graph-prompts.ts x-draft / x-finalize). The limit
// applies PER TWEET, so every helper here operates per segment.
// -----------------------------------------------------------------------------

/** Hard character limit for a single standard X post. */
export const X_POST_LIMIT = 280;

/** The line, on its own, that separates tweets in a mini-thread. */
const THREAD_SEPARATOR = "---";

// A single-char ellipsis (U+2026). Counts as ONE character toward the limit, so
// truncation reserves exactly one slot for it.
const ELLIPSIS = "…";

/**
 * Split a finalized X artifact into its individual tweets. A single post yields
 * a one-element array; a mini-thread (segments separated by a line that is
 * exactly "---") yields one element per tweet. Empty segments are dropped and
 * each tweet is trimmed of surrounding whitespace.
 */
export function splitXSegments(text: string): string[] {
  return text
    .split(/\r?\n/)
    .reduce<string[]>(
      (segments, line) => {
        if (line.trim() === THREAD_SEPARATOR) {
          segments.push("");
        } else {
          segments[segments.length - 1] += (segments[segments.length - 1] ? "\n" : "") + line;
        }
        return segments;
      },
      [""]
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Character length as X counts it (by Unicode code point, so a surrogate-pair
 * emoji is one character, not two UTF-16 units). Used to keep truncation honest.
 */
function charLen(s: string): number {
  return [...s].length;
}

/**
 * True when every tweet in `text` is within `limit` characters. Works for both
 * a single post and a mini-thread (each segment is checked independently). An
 * empty/whitespace-only text has no tweets and is considered within limit
 * (there is nothing over-limit to send).
 */
export function xPostWithinLimit(text: string, limit: number = X_POST_LIMIT): boolean {
  return splitXSegments(text).every((seg) => charLen(seg) <= limit);
}

/**
 * Truncate a SINGLE post to `limit` characters on a word boundary. Appends an
 * ellipsis ONLY when the text was actually cut, and the result (ellipsis
 * included) is guaranteed to be <= limit. A post already within the limit is
 * returned untouched.
 */
export function truncateForX(text: string, limit: number = X_POST_LIMIT): string {
  const trimmed = text.trim();
  if (charLen(trimmed) <= limit) return trimmed;

  // Reserve one character for the ellipsis we are about to append.
  const budget = Math.max(0, limit - 1);
  // Slice by code point, not UTF-16 unit, so we never cut a surrogate pair.
  const sliced = [...trimmed].slice(0, budget).join("");

  // Cut back to the last word boundary so we never end mid-word. If there is no
  // whitespace in the budget window (one very long token), fall back to the hard
  // code-point slice rather than returning an empty string.
  const lastSpace = sliced.search(/\s\S*$/);
  const body = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).replace(/\s+$/, "");

  return `${body}${ELLIPSIS}`;
}

/**
 * Make a finalized X artifact publish-safe: truncate every tweet to `limit` on a
 * word boundary and re-join a mini-thread with its "---" separator. This is what
 * the adapt/finalize step applies so the approval message the founder sees is
 * already compliant. Idempotent — a compliant artifact comes back unchanged
 * (modulo whitespace trimming).
 */
export function adaptXForPublish(text: string, limit: number = X_POST_LIMIT): string {
  const segments = splitXSegments(text);
  if (segments.length === 0) return text.trim();
  return segments.map((seg) => truncateForX(seg, limit)).join(`\n${THREAD_SEPARATOR}\n`);
}
