/**
 * intent-label.ts — the label of a question is the question (P1-07).
 *
 * WHAT WENT WRONG (seen on the founder's dashboard, 2026-09-11)
 * ---------------------------------------------------------------------------
 * "Which question you lose" listed `uv_174dd80f-fc21-4622-b2b3-79d03f0cb4a8`
 * as the title of every row. Prompt Universe v2 (#588) gives each prompt its
 * own intent id — `uv_<audit_prompt.id>` — and the panel had only ever known
 * how to render the six legacy intent keys, so it fell through to its "render
 * the raw key so somebody notices" branch. Somebody noticed; the customer did,
 * and a customer cannot act on a uuid.
 *
 * THE RULE, and it has no exceptions
 * ---------------------------------------------------------------------------
 * The label is the QUESTION TEXT. When the text is not available (the prompt
 * row is gone), the row says so in words — never an id, never a blank, never a
 * silently dropped row: the rate was really measured and hiding it would be a
 * different lie from the one we are fixing.
 *
 * Pure module, no I/O: the API resolves the text from `audit_prompt` and the
 * worker stamps it into new breakdowns; this decides what is rendered.
 */

/** Shown when the question text cannot be recovered. Never an id. */
export const ARCHIVED_QUESTION_LABEL = "Archived question";

/**
 * Buyer-facing names for the six legacy portfolio intents (pre-universe
 * audits, where one intent pools two formulations and there is no single
 * question text to show).
 */
export const LEGACY_INTENT_LABEL: Readonly<Record<string, string>> = {
  brand_direct: "When they ask about you by name",
  category_discovery: "When they ask who does this",
  comparison: "When they compare you to someone",
  problem_solution: "When they describe the problem",
  local_intent: "When they ask for someone nearby",
  best_of: "When they ask for the best",
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Does this string read like something the machine made up for itself?
 * Conservative on purpose: a real question has spaces and usually a question
 * mark, an internal id has none.
 */
export function looksLikeInternalId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length === 0) return false;
  if (UUID_RE.test(v)) return true;
  if (/^uv_/i.test(v)) return true;
  if (/^custom_\d+$/i.test(v)) return true;
  if (/^[0-9a-f]{16,}$/i.test(v)) return true; // sha/hash id
  // No whitespace at all and not a known legacy key → an identifier, not prose.
  return !/\s/.test(v) && !(v in LEGACY_INTENT_LABEL);
}

export interface LabelledIntent {
  /** The internal intent id: `uv_<prompt id>`, `custom_3`, or a legacy key. */
  intent: string;
  /** The question text, when the API or worker could resolve it. */
  label?: string | null;
}

/**
 * The one function every surface must use to title an intent row.
 * Order: resolved question text → legacy buyer-facing name → "Archived
 * question". A uuid can never come out of here.
 */
export function resolveIntentLabel(row: LabelledIntent): string {
  const text = typeof row.label === "string" ? row.label.trim() : "";
  if (text.length > 0 && !looksLikeInternalId(text)) return text;

  const legacy = LEGACY_INTENT_LABEL[row.intent];
  if (legacy) return legacy;

  // A key we do not recognise. It is an id of some shape — say what it is
  // instead of showing it.
  return ARCHIVED_QUESTION_LABEL;
}
