/**
 * CRM upsert — shared by the founder admin route (PATCH /api/admin/crm) and the
 * Hermes operator route (PATCH /api/v1/operator/crm) so both write the contact
 * annotation identically. Input is a validated CrmPatch (see crm-validation.ts).
 *
 * This is deliberately an INTERNAL, reversible write: it only touches the
 * email-keyed crm_contact annotation (sales stage / note / next follow-up). It
 * never moves money and never sends email — those stay founder-only.
 *
 * Throws the raw Postgres error on failure; callers map SQLSTATE 42P01
 * (undefined_table) to a "migration pending" response.
 */

import type { PostgresClient } from "../routes/social-accounts";
import type { CrmPatch } from "./crm-validation";

export interface CrmContactRow {
  email: string;
  stage: string;
  note: string | null;
  next_follow_up: string | null;
  updated_at: string;
}

export async function upsertCrmContact(
  db: PostgresClient,
  patch: CrmPatch,
  updatedBy: string | null
): Promise<CrmContactRow | undefined> {
  const result = await db.query<CrmContactRow>(
    // COALESCE/CASE let an omitted field keep its stored value while an explicit
    // null/"" (noteProvided / followUpProvided) clears it.
    `INSERT INTO crm_contact (email, stage, note, next_follow_up, updated_by, updated_at)
     VALUES ($1, COALESCE($2, 'new'), $3, $4, $5, NOW())
     ON CONFLICT (email) DO UPDATE SET
       stage          = COALESCE($2, crm_contact.stage),
       note           = CASE WHEN $6 THEN $3 ELSE crm_contact.note END,
       next_follow_up = CASE WHEN $7 THEN $4 ELSE crm_contact.next_follow_up END,
       updated_by     = $5,
       updated_at     = NOW()
     RETURNING email, stage, note, next_follow_up, updated_at`,
    [
      patch.email,
      patch.stage ?? null,
      patch.noteProvided ? patch.note ?? null : null,
      patch.followUpProvided ? patch.nextFollowUp ?? null : null,
      updatedBy,
      patch.noteProvided,
      patch.followUpProvided,
    ]
  );
  return result.rows[0];
}
