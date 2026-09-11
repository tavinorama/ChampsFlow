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

/**
 * The stages that existed before the design-partner funnel. Kept as their own
 * list because the founder's admin UI, the CHECK constraint shipped in
 * 20260713000002 and every stored row already speak exactly these.
 */
export const CRM_BASE_STAGES = ["new", "contacted", "qualified", "customer", "lost"] as const;

/**
 * The 19-day design-partner funnel (founder, 2026-09-11):
 *   contatado -> conversa marcada -> conversa feita -> proposta -> pago
 *
 * `contacted` is REUSED for the first step rather than duplicated — a contact
 * is a contact, and two words for it would split every count in the weekly
 * report. The four new ones are additive: no existing row changes meaning.
 *
 * These require migration 20260911000001. Until it runs, the CHECK constraint
 * refuses them and upsertCrmContact throws CrmStageUnsupportedError with the
 * nominal action — the funnel is OFF and says so, rather than 500-ing.
 */
export const CRM_DESIGN_PARTNER_STAGES = ["call_booked", "call_done", "proposal", "paid"] as const;

export const CRM_STAGES = [...CRM_BASE_STAGES, ...CRM_DESIGN_PARTNER_STAGES] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

/** True when this stage needs migration 20260911000001 to be stored. */
export function stageNeedsMigration(stage: string): boolean {
  return (CRM_DESIGN_PARTNER_STAGES as readonly string[]).includes(stage);
}

/**
 * Where a contact came from. An allowlist, not free text: the weekly report
 * groups by it, and a typo would silently create a second, empty funnel.
 */
export const CRM_SOURCES = ["design-partner", "cold", "inbound", "referral", "other"] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NOTE_MAX = 2000;
/** One appended dossier line. Long enough for a pack path plus an outcome. */
const APPEND_MAX = 400;

export interface CrmPatch {
  email: string;
  stage?: CrmStage;
  note?: string | null;
  noteProvided: boolean;
  nextFollowUp?: string | null;
  followUpProvided: boolean;
  /** Origin track. Present only when the caller sent a (valid) source. */
  source?: CrmSource;
  /**
   * A dossier line to APPEND to the note, newest last, rather than replacing
   * it. The note is the contact's file (see lib/dossier.ts, which already reads
   * `[tag]`-prefixed lines): overwriting it to record a conversation would
   * delete the history of the previous ones.
   */
  appendNote?: string;
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

  // source — optional; when present must be a known track
  if (body.source !== undefined && body.source !== null) {
    if (typeof body.source !== "string" || !(CRM_SOURCES as readonly string[]).includes(body.source)) {
      return {
        ok: false,
        code: "INVALID_SOURCE",
        message: `source must be one of: ${CRM_SOURCES.join(", ")}.`,
      };
    }
    patch.source = body.source as CrmSource;
  }

  // appendNote — optional; appended to the note, never replacing it
  if (body.appendNote !== undefined && body.appendNote !== null) {
    if (typeof body.appendNote !== "string") {
      return { ok: false, code: "INVALID_APPEND", message: "appendNote must be a string." };
    }
    const line = body.appendNote.replace(/\s+/g, " ").trim().slice(0, APPEND_MAX);
    if (line === "") {
      return { ok: false, code: "INVALID_APPEND", message: "appendNote cannot be blank." };
    }
    // Replacing and appending the same field in one call is ambiguous, and the
    // ambiguity would be resolved silently in whichever order the SQL ran.
    if (patch.noteProvided) {
      return {
        ok: false,
        code: "NOTE_CONFLICT",
        message: "Send note (replace) or appendNote (add a line), not both.",
      };
    }
    patch.appendNote = line;
  }

  // At least one mutable field must be present, else there is nothing to do.
  if (
    patch.stage === undefined &&
    !patch.noteProvided &&
    !patch.followUpProvided &&
    patch.source === undefined &&
    patch.appendNote === undefined
  ) {
    return {
      ok: false,
      code: "NO_FIELDS",
      message: "Provide at least one of: stage, note, appendNote, nextFollowUp, source.",
    };
  }

  return { ok: true, patch };
}
