/**
 * rejection-language.ts — what the customer is told about a discarded
 * citation, and what stays in the engine room (P1-07).
 *
 * WHAT WENT WRONG (founder's dashboard, 2026-09-11)
 * ---------------------------------------------------------------------------
 * The "Refused to count" panel printed the verifier's own working notes:
 *
 *   WRONG OFFSET - characters 811-818 are 'services' not 'Ozvor's'
 *   (offsets recomputed from text_exact)
 *
 * That is a message one of our passes writes to the other. It names a field of
 * our JSON contract, a character range of a buffer the customer never sees, and
 * a step of our pipeline. RELATORIO §6: "Remover raw verifier errors/provider
 * leakage da UI. Debug fica em admin/observability com trace ID."
 *
 * THE SPLIT
 * ---------------------------------------------------------------------------
 * - Customer: a sentence in their language plus a count. Nothing is hidden —
 *   the same rejection is reported, in words that say what it means for them.
 * - Admin: the raw reason, verbatim, at
 *   GET /api/admin/audits/:id/extraction, keyed by the audit id (the trace id).
 *   The information is MOVED, never deleted.
 *
 * `sanitizeExtractionForClient` is an ALLOWLIST, not a filter: a future field
 * added to the worker's telemetry does not reach the client until someone adds
 * it here on purpose. That is the only construction that keeps holding after
 * we stop looking at it.
 */

/** The classes a customer is told apart. Ids are stable; sentences are copy. */
export type RejectionClass =
  | "not_in_answer"
  | "quote_mismatch"
  | "different_company"
  | "not_a_recommendation"
  | "unconfirmed";

/** Customer-facing sentence per class. Short, plain, no jargon, no ids. */
export const REJECTION_SENTENCE: Readonly<Record<RejectionClass, string>> = {
  not_in_answer:
    "The quote was not in the engine's answer at all, so we did not count it.",
  quote_mismatch:
    "The citation did not match the text of the answer, so we discarded it.",
  different_company:
    "It named a different company with a similar name, not you.",
  not_a_recommendation:
    "You were named, but the answer did not recommend you.",
  unconfirmed:
    "Our second reader could not confirm it, so we left it out.",
};

/**
 * Raw verifier line → customer class. Order matters: the first match wins, and
 * "not in the answer at all" is a stronger statement than "did not match".
 */
export function classifyRejection(reason: string | null | undefined): RejectionClass {
  const r = typeof reason === "string" ? reason.toLowerCase() : "";
  if (!r) return "unconfirmed";
  if (/hallucinat|not present|not (?:appear|found)|does not appear|absent/.test(r)) {
    return "not_in_answer";
  }
  if (/offset|mismatch|does not match|not what sits|different characters/.test(r)) {
    return "quote_mismatch";
  }
  if (/homonym|different (?:organisation|organization|company|entity)|another company|unrelated/.test(r)) {
    return "different_company";
  }
  if (/negation|advises against|does not fit|not recommend|criticis|criticiz/.test(r)) {
    return "not_a_recommendation";
  }
  return "unconfirmed";
}

/** One line of the customer-facing panel. */
export interface ClientRejection {
  /** Stable class id — for keys and tests, never rendered raw. */
  code: RejectionClass;
  /** The sentence shown to the customer. */
  reason: string;
  /**
   * How many citations were discarded for this reason, or null when the audit
   * predates the per-class tally. Null is NEVER rendered as zero.
   */
  count: number | null;
}

/** The customer-safe shape of the two-pass extraction telemetry. */
export interface ClientExtraction {
  mode: string;
  verified_count: number;
  rejected_count: number;
  by_kind: Record<string, number> | null;
  probes_adjusted: number | null;
  /** Plain sentences with counts. Never a verifier line. */
  rejections: ClientRejection[];
  /**
   * True when `count` covers every rejection in the run; false when the audit
   * only stored a sample, in which case the counts are omitted rather than
   * guessed.
   */
  rejections_itemised: boolean;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Turns the worker's raw `extraction` block into the only shape the client is
 * allowed to see. Unknown input → null (the panel then renders nothing, which
 * is the honest state for an audit that never ran the two-pass extraction).
 */
export function sanitizeExtractionForClient(raw: unknown): ClientExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const verified = num(e["verified_count"]) ?? 0;
  const rejected = num(e["rejected_count"]) ?? 0;

  // by_kind keys come from MentionKind — a closed vocabulary we author.
  let byKind: Record<string, number> | null = null;
  const rawKinds = e["by_kind"];
  if (rawKinds && typeof rawKinds === "object") {
    byKind = {};
    for (const [k, v] of Object.entries(rawKinds as Record<string, unknown>)) {
      const n = num(v);
      if (n !== null && /^[a-z_]+$/.test(k)) byKind[k] = n;
    }
  }

  // Preferred source: the full per-class tally the worker now writes.
  const tally = e["rejection_classes"];
  const rejections: ClientRejection[] = [];
  let itemised = false;
  if (tally && typeof tally === "object") {
    itemised = true;
    for (const [code, v] of Object.entries(tally as Record<string, unknown>)) {
      const n = num(v);
      if (!isRejectionClass(code) || n === null || n <= 0) continue;
      rejections.push({ code, reason: REJECTION_SENTENCE[code], count: n });
    }
  } else {
    // Older audits stored up to three raw samples and no tally. Report WHICH
    // reasons occurred, without inventing counts the sample cannot support.
    const samples = Array.isArray(e["sample_rejections"]) ? e["sample_rejections"] : [];
    const seen = new Set<RejectionClass>();
    for (const s of samples) {
      const reason =
        s && typeof s === "object" ? (s as Record<string, unknown>)["reason"] : null;
      const code = classifyRejection(typeof reason === "string" ? reason : null);
      if (seen.has(code)) continue;
      seen.add(code);
      rejections.push({ code, reason: REJECTION_SENTENCE[code], count: null });
    }
  }

  rejections.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.code.localeCompare(b.code));

  return {
    mode: typeof e["mode"] === "string" && /^[a-z_()+ ]+$/i.test(e["mode"] as string)
      ? (e["mode"] as string)
      : "two_pass",
    verified_count: verified,
    rejected_count: rejected,
    by_kind: byKind,
    probes_adjusted: num(e["probes_adjusted"]),
    rejections,
    rejections_itemised: itemised,
  };
}

function isRejectionClass(v: string): v is RejectionClass {
  return Object.prototype.hasOwnProperty.call(REJECTION_SENTENCE, v);
}

/**
 * The guard the test uses, and anything else that wants to assert the split:
 * does this string carry internal vocabulary? Kept next to the sanitizer so
 * the two cannot drift apart.
 */
export const INTERNAL_VOCABULARY: readonly RegExp[] = [
  /\boffsets?\b/i,
  /text_exact/i,
  /\bprovider\b/i,
  /\bcharacters?\s+\d+\s*[-–]\s*\d+/i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /\bat\s+\w+[.\w]*\s*\(.*:\d+:\d+\)/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
  /\bverifier\b/i,
  /\bextractor\b/i,
  /\bHALLUCINATION\b|\bWRONG OFFSET\b|\bHOMONYM\b|\bNEGATION\b/,
];

export function leaksInternalVocabulary(value: string): boolean {
  return INTERNAL_VOCABULARY.some((re) => re.test(value));
}
