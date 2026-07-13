/**
 * CRM patch validation/normalization — pure, side-effect-free so it can be unit
 * tested without a DB or HTTP context. The admin CRM upsert route
 * (PATCH /api/admin/crm) delegates all input handling here.
 *
 * Semantics of the returned `patch`:
 *   - `email` is always present and normalized (trimmed + lower-cased).
 *   - `stage` present only when the caller sent a (valid) stage.
 *   - `noteProvided` / `followUpProvided` distinguish "field omitted" (leave as
 *     is) from "field explicitly cleared" (set to null). This is what lets the
 *     SQL upsert COALESCE unchanged fields while still allowing a deliberate
 *     clear. Sending note:null or nextFollowUp:"" clears the value.
 */

export const CRM_STAGES = ["new", "contacted", "qualified", "customer", "lost"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NOTE_MAX = 2000;

export interface CrmPatch {
  email: string;
  stage?: CrmStage;
  note?: string | null;
  noteProvided: boolean;
  nextFollowUp?: string | null;
  followUpProvided: boolean;
}

export type CrmValidationResult =
  | { ok: true; patch: CrmPatch }
  | { ok: false; code: string; message: string };

/**
 * Validate and normalize a raw request body into a CrmPatch.
 * Never throws — returns a typed error result instead.
 */
export function normalizeCrmPatch(raw: unknown): CrmValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, code: "INVALID_BODY", message: "Body must be a JSON object." };
  }
  const body = raw as Record<string, unknown>;

  // email — required, normalized
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(rawEmail)) {
    return { ok: false, code: "INVALID_EMAIL", message: "A valid email is required." };
  }

  const patch: CrmPatch = {
    email: rawEmail,
    noteProvided: false,
    followUpProvided: false,
  };

  // stage — optional; when present must be a known stage
  if (body.stage !== undefined) {
    if (typeof body.stage !== "string" || !(CRM_STAGES as readonly string[]).includes(body.stage)) {
      return {
        ok: false,
        code: "INVALID_STAGE",
        message: `stage must be one of: ${CRM_STAGES.join(", ")}.`,
      };
    }
    patch.stage = body.stage as CrmStage;
  }

  // note — optional; null or "" clears it; long notes are truncated, not rejected
  if (body.note !== undefined) {
    patch.noteProvided = true;
    if (body.note === null || body.note === "") {
      patch.note = null;
    } else if (typeof body.note === "string") {
      patch.note = body.note.slice(0, NOTE_MAX);
    } else {
      return { ok: false, code: "INVALID_NOTE", message: "note must be a string or null." };
    }
  }

  // nextFollowUp — optional; null or "" clears it; otherwise must parse to a date
  if (body.nextFollowUp !== undefined) {
    patch.followUpProvided = true;
    if (body.nextFollowUp === null || body.nextFollowUp === "") {
      patch.nextFollowUp = null;
    } else if (typeof body.nextFollowUp === "string") {
      const t = Date.parse(body.nextFollowUp);
      if (Number.isNaN(t)) {
        return { ok: false, code: "INVALID_DATE", message: "nextFollowUp must be an ISO date or null." };
      }
      patch.nextFollowUp = new Date(t).toISOString();
    } else {
      return { ok: false, code: "INVALID_DATE", message: "nextFollowUp must be an ISO date string or null." };
    }
  }

  // At least one mutable field must be present, else there is nothing to do.
  if (patch.stage === undefined && !patch.noteProvided && !patch.followUpProvided) {
    return { ok: false, code: "NO_FIELDS", message: "Provide at least one of: stage, note, nextFollowUp." };
  }

  return { ok: true, patch };
}
