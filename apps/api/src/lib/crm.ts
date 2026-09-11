/**
 * CRM upsert — shared by the founder admin route (PATCH /api/admin/crm) and the
 * Hermes operator route (PATCH /api/v1/operator/crm) so both write the contact
 * annotation identically. Input is a validated CrmPatch (see crm-validation.ts).
 *
 * This is deliberately an INTERNAL, reversible write: it only touches the
 * email-keyed crm_contact annotation (sales stage / note / next follow-up /
 * source). It never moves money and never sends email — those stay founder-only.
 *
 * SCHEMA TOLERANCE (2026-09-11, design-partner funnel)
 * ---------------------------------------------------------------------------
 * Two things arrive with migration 20260911000001: the `source` column, and a
 * widened stage CHECK that accepts call_booked / call_done / proposal / paid.
 * Code merges before a founder-gated migration runs, and "mergeado nao e
 * producao" — so this writer does not pretend:
 *
 *   - `source` column absent (42703) -> retry WITHOUT it, log
 *     `crm_source_column_absent` once per process, and report
 *     `sourceRecorded: false` so the caller can say the field was dropped.
 *     The stage/note/follow-up write still lands; losing the row entirely
 *     would be worse than losing one label.
 *
 *   - a funnel stage refused by the CHECK (23514) -> throw
 *     CrmStageUnsupportedError. This one must NOT degrade: silently storing
 *     'qualified' where the founder said 'proposal' would put a wrong number
 *     in the weekly report, and a wrong number is worse than an error.
 *
 * Throws the raw Postgres error on any other failure; callers log it and
 * surface an internal error.
 */

import { logger } from "../../../../packages/shared/src/logger";
import type { PostgresClient } from "../routes/social-accounts";
import { stageNeedsMigration, type CrmPatch } from "./crm-validation";

/** The migration that turns the design-partner funnel on. */
export const CRM_FUNNEL_MIGRATION = "20260911000001_crm_design_partner";

export interface CrmContactRow {
  email: string;
  stage: string;
  note: string | null;
  next_follow_up: string | null;
  source?: string | null;
  updated_at: string;
}

export interface CrmUpsertResult {
  contact: CrmContactRow | undefined;
  /** False when the `source` column is not there yet and the label was dropped. */
  sourceRecorded: boolean;
  /** Set when something was silently unavailable. Surfaced to the caller. */
  degraded: string | null;
}

/** Thrown when a design-partner stage is refused because the migration is pending. */
export class CrmStageUnsupportedError extends Error {
  readonly code = "CRM_STAGE_MIGRATION_PENDING";
  readonly stage: string;
  readonly migration = CRM_FUNNEL_MIGRATION;
  constructor(stage: string) {
    super(
      `Stage '${stage}' needs migration ${CRM_FUNNEL_MIGRATION}, which has not been applied. ` +
        `The design-partner funnel is OFF until the founder runs it. Nothing was written.`
    );
    this.name = "CrmStageUnsupportedError";
    this.stage = stage;
  }
}

let sourceColumnLogged = false;

/** Test seam: reset the once-per-process log flag. */
export function _resetCrmStateForTests(): void {
  sourceColumnLogged = false;
}

const UNDEFINED_COLUMN = "42703";
const CHECK_VIOLATION = "23514";

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

/**
 * The dossier line, as lib/dossier.ts already reads notes: one line, newest
 * last, prefixed with a tag and dated. Appending keeps the file of the contact
 * intact instead of overwriting the last conversation with this one.
 */
export function dossierLine(text: string, at: Date = new Date()): string {
  return `[design-partner] ${at.toISOString().slice(0, 10)} ${text}`;
}

const RETURNING_WITH_SOURCE =
  "RETURNING email, stage, note, next_follow_up, source, updated_at";
const RETURNING_LEGACY = "RETURNING email, stage, note, next_follow_up, updated_at";

/**
 * Build the upsert.
 *
 * `withSource` toggles the column migration 20260911000001 adds, so one SQL
 * shape serves both schemas. `append` switches the note from replace to append.
 *
 * Every placeholder the string names MUST be supplied, and no more: Postgres
 * rejects a bind whose parameter count does not match the statement. So the
 * two variants have DIFFERENT parameter lists, and `paramsFor` mirrors this
 * function exactly — the pair is tested together.
 *
 * The append form uses CONCAT_WS with NULLIF so a new (or blank) note does not
 * gain a leading newline, and the first line of a contact's file is the line.
 */
export function buildCrmUpsertSql(withSource: boolean, append: boolean): string {
  if (append) {
    // $1 email · $2 stage · $3 line · $4 followUp · $5 updatedBy
    // $6 followUpProvided · $7 source (only with source)
    return `INSERT INTO crm_contact (email, stage, note, next_follow_up, updated_by${withSource ? ", source" : ""}, updated_at)
     VALUES ($1, COALESCE($2, 'new'), $3, $4, $5${withSource ? ", $7" : ""}, NOW())
     ON CONFLICT (email) DO UPDATE SET
       stage          = COALESCE($2, crm_contact.stage),
       note           = CONCAT_WS(E'\\n', NULLIF(crm_contact.note, ''), $3),
       next_follow_up = CASE WHEN $6 THEN $4 ELSE crm_contact.next_follow_up END,
       ${withSource ? "source         = COALESCE($7, crm_contact.source)," : ""}
       updated_by     = $5,
       updated_at     = NOW()
     ${withSource ? RETURNING_WITH_SOURCE : RETURNING_LEGACY}`;
  }
  // $1 email · $2 stage · $3 note · $4 followUp · $5 updatedBy
  // $6 noteProvided · $7 followUpProvided · $8 source (only with source)
  return `INSERT INTO crm_contact (email, stage, note, next_follow_up, updated_by${withSource ? ", source" : ""}, updated_at)
     VALUES ($1, COALESCE($2, 'new'), $3, $4, $5${withSource ? ", $8" : ""}, NOW())
     ON CONFLICT (email) DO UPDATE SET
       stage          = COALESCE($2, crm_contact.stage),
       note           = CASE WHEN $6 THEN $3 ELSE crm_contact.note END,
       next_follow_up = CASE WHEN $7 THEN $4 ELSE crm_contact.next_follow_up END,
       ${withSource ? "source         = COALESCE($8, crm_contact.source)," : ""}
       updated_by     = $5,
       updated_at     = NOW()
     ${withSource ? RETURNING_WITH_SOURCE : RETURNING_LEGACY}`;
}

/** Mirrors buildSql's placeholder list exactly. Changing one without the other
 *  is a bind-count error at runtime, which is why they are tested as a pair. */
export function paramsFor(
  patch: CrmPatch,
  updatedBy: string | null,
  withSource: boolean,
  now: Date = new Date()
): unknown[] {
  const followUp = patch.followUpProvided ? (patch.nextFollowUp ?? null) : null;
  if (patch.appendNote !== undefined) {
    const params: unknown[] = [
      patch.email,
      patch.stage ?? null,
      dossierLine(patch.appendNote, now),
      followUp,
      updatedBy,
      patch.followUpProvided,
    ];
    if (withSource) params.push(patch.source ?? null);
    return params;
  }
  const params: unknown[] = [
    patch.email,
    patch.stage ?? null,
    patch.noteProvided ? (patch.note ?? null) : null,
    followUp,
    updatedBy,
    patch.noteProvided,
    patch.followUpProvided,
  ];
  if (withSource) params.push(patch.source ?? null);
  return params;
}

export async function upsertCrmContact(
  db: PostgresClient,
  patch: CrmPatch,
  updatedBy: string | null
): Promise<CrmUpsertResult> {
  const append = patch.appendNote !== undefined;

  async function run(withSource: boolean): Promise<CrmContactRow | undefined> {
    const result = await db.query<CrmContactRow>(
      buildCrmUpsertSql(withSource, append),
      paramsFor(patch, updatedBy, withSource)
    );
    return result.rows[0];
  }

  try {
    const contact = await run(true);
    return { contact, sourceRecorded: patch.source !== undefined, degraded: null };
  } catch (err) {
    // A funnel stage the CHECK refuses: the migration is pending. Do NOT store
    // a different stage — a wrong number in the weekly report is worse than an
    // error the founder can act on.
    if (pgCode(err) === CHECK_VIOLATION && patch.stage && stageNeedsMigration(patch.stage)) {
      throw new CrmStageUnsupportedError(patch.stage);
    }
    if (pgCode(err) !== UNDEFINED_COLUMN) throw err;

    if (!sourceColumnLogged) {
      sourceColumnLogged = true;
      logger.warn("crm_source_column_absent", {
        migration: CRM_FUNNEL_MIGRATION,
        effect: "contact source is NOT being recorded; stage/note/follow-up still are",
      });
    }
    try {
      const contact = await run(false);
      return {
        contact,
        sourceRecorded: false,
        degraded:
          patch.source !== undefined
            ? `source was not stored: migration ${CRM_FUNNEL_MIGRATION} is pending.`
            : null,
      };
    } catch (retryErr) {
      if (pgCode(retryErr) === CHECK_VIOLATION && patch.stage && stageNeedsMigration(patch.stage)) {
        throw new CrmStageUnsupportedError(patch.stage);
      }
      throw retryErr;
    }
  }
}
