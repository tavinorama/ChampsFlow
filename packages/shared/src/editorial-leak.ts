/**
 * editorial-leak.ts — P0-04. Block internal editorial scaffolding from leaving
 * the building.
 *
 * A public LinkedIn post shipped with its own working notes still attached:
 * a "Claim-basis (nota interna)" line, a reference to the research file, an
 * `owner:` field, and the instruction to put the link in the first comment.
 * Those markers come from the drafting template, not from the writer, so the
 * fix is a machine check on the way out rather than a reminder to be careful.
 *
 * Design notes:
 *
 *  - Pure and dependency-free so both the API (approval) and the worker
 *    (publish) can run the identical check. A validator that only lives in the
 *    UI is a validator that a scheduled job walks straight past.
 *  - Fail-CLOSED, and matches are reported with their position so the caller can
 *    show the human exactly which characters are the problem. Silently stripping
 *    the markers would be worse: it hides that the draft came out of the
 *    generator contaminated, and "nada degrada calado" is a house rule.
 *  - Deliberately conservative about false positives on ordinary prose. Every
 *    pattern is anchored to a shape that does not occur in normal marketing
 *    copy — a label at the head of a line, a tracker reference, an all-caps
 *    marker — because a validator that cries wolf gets switched off.
 */

export type EditorialLeakSeverity = "block";

export interface EditorialLeakPattern {
  /** Stable id, used in logs and audit entries. */
  id: string;
  /** Plain-language description of what leaked, shown to the approver. */
  label: string;
  pattern: RegExp;
}

export interface EditorialLeakMatch {
  id: string;
  label: string;
  /** The offending text, capped so a log line cannot carry a whole draft. */
  excerpt: string;
  index: number;
}

export interface EditorialLeakResult {
  ok: boolean;
  matches: EditorialLeakMatch[];
}

const MAX_EXCERPT = 120;

/**
 * The blocklist required by P0-04. The report specifies:
 *   claim-basis | nota interna | owner: | TODO | PR # | internal only |
 *   link no 1º comentário
 *
 * Each is implemented below with the narrowest anchor that still catches the
 * real incident.
 */
export const EDITORIAL_LEAK_PATTERNS: readonly EditorialLeakPattern[] = [
  {
    id: "claim_basis",
    label: "Claim-basis note from the drafting template",
    // "claim-basis", "claim basis", "Claim-basis (nota interna)".
    pattern: /claim[\s-]?basis/i,
  },
  {
    id: "internal_note_pt",
    label: "Portuguese internal-note marker (“nota interna”)",
    pattern: /nota\s+interna/i,
  },
  {
    id: "internal_only",
    label: "“Internal only” marker",
    pattern: /internal[\s-]only/i,
  },
  {
    id: "owner_field",
    label: "Owner field from the content tracker",
    // Anchored to line start so "the owner: a small bakery" mid-sentence is not
    // flagged, while a template line "Owner: Otavio" is.
    pattern: /^[\s>*\-|]*owner\s*:/im,
  },
  {
    id: "todo",
    label: "Unresolved TODO",
    // All-caps only, as a word. Lower-case "todo" is a Spanish/Portuguese word
    // ("todo o mundo") and flagging it would be a false positive factory.
    pattern: /\bTODO\b/,
  },
  {
    id: "pr_reference",
    label: "Pull-request reference",
    // "PR #285", "PR#285". Requires the digits so "our PR # of impressions"
    // style prose does not trip it.
    pattern: /\bPR\s*#\s*\d+/i,
  },
  {
    id: "first_comment_instruction",
    label: "“Link in the first comment” production instruction",
    // The incident's exact shape, in PT and EN, with the ordinal written either
    // way. This is an instruction TO the publisher; it is not post copy.
    pattern: /link\s+(?:no|na)\s+1[oºª]?\s*coment[áa]rio|link\s+in\s+(?:the\s+)?(?:1st|first)\s+comment/i,
  },
] as const;

function excerptAround(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + matchLength + 40);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return slice.length > MAX_EXCERPT ? `${slice.slice(0, MAX_EXCERPT)}…` : slice;
}

/**
 * Check one piece of outbound copy.
 *
 * Returns every marker found, not just the first, so an approver fixes the
 * draft in one pass instead of playing whack-a-mole through repeated rejections.
 */
export function checkEditorialLeaks(text: string | null | undefined): EditorialLeakResult {
  if (!text) return { ok: true, matches: [] };
  const matches: EditorialLeakMatch[] = [];
  for (const p of EDITORIAL_LEAK_PATTERNS) {
    const m = p.pattern.exec(text);
    if (m) {
      matches.push({
        id: p.id,
        label: p.label,
        excerpt: excerptAround(text, m.index, m[0].length),
        index: m.index,
      });
    }
  }
  return { ok: matches.length === 0, matches };
}

/**
 * One-line summary for a log or an audit_log entry. Carries the marker ids and
 * short excerpts — never the whole draft body.
 */
export function describeEditorialLeaks(result: EditorialLeakResult): string {
  return result.matches.map((m) => `${m.id} (“${m.excerpt}”)`).join("; ");
}
