/**
 * Operating cadence — the "what should I do now" brief that drives the Hermes
 * autonomous loop (Fase 3). Hermes reads this once per cycle and acts through the
 * safe write endpoints (PATCH /operator/crm, POST /operator/nurture/enroll):
 *
 *   sense (this brief)  →  decide  →  act (write endpoints)  →  report
 *
 * Everything here is READ-ONLY and cross-tenant. Shared by the founder /admin and
 * the operator API so both see the same worklist. No money, no email is triggered
 * here — the brief only surfaces work; acting on it stays inside the guardrails.
 */

import type { PostgresClient } from "../routes/social-accounts";

export interface CadenceContact {
  email: string;
  stage: string;
  note: string | null;
  next_follow_up: string | null;
  updated_at?: string;
}

export interface CadenceLead {
  email: string | null;
  brand: string;
  category: string | null;
  created_at: string;
}

export interface CadenceUpsell {
  email: string;
  brand: string;
  kit_paid_at: string | null;
}

export interface OperatingCadence {
  generated_hint: string;
  summary: {
    follow_ups_due: number;
    new_leads_to_triage: number;
    upsell_targets: number;
    stale_contacts: number;
  };
  follow_ups_due: CadenceContact[];
  new_leads_to_triage: CadenceLead[];
  upsell_targets: CadenceUpsell[];
  stale_contacts: CadenceContact[];
}

// crm_contact may not exist in older environments; treat "missing" as "no CRM
// data yet" instead of failing the whole brief.
async function safeCrmQuery<T>(db: PostgresClient, sql: string): Promise<T[]> {
  try {
    const { rows } = await db.query<T>(sql);
    return rows;
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return [];
    throw err;
  }
}

export async function fetchOperatingCadence(db: PostgresClient): Promise<OperatingCadence> {
  // 1. Follow-ups due — scheduled today or earlier.
  const followUpsDue = await safeCrmQuery<CadenceContact>(
    db,
    `SELECT email, stage, note, next_follow_up
       FROM crm_contact
      WHERE next_follow_up IS NOT NULL
        AND next_follow_up <= NOW()
        AND stage NOT IN ('customer', 'lost')
      ORDER BY next_follow_up ASC
      LIMIT 100`
  );

  // 2. New leads to triage — captured in the last 14 days with no CRM annotation
  //    yet (Hermes should give them a stage + first touch).
  const newLeads = await safeCrmQuery<CadenceLead>(
    db,
    `SELECT lc.email, lc.brand, lc.category, lc.created_at
       FROM lead_capture lc
       LEFT JOIN crm_contact cc ON lower(cc.email) = lower(lc.email)
      WHERE lc.email IS NOT NULL
        AND cc.email IS NULL
        AND lc.created_at >= NOW() - INTERVAL '14 days'
      ORDER BY lc.created_at DESC
      LIMIT 100`
  );

  // 3. Upsell targets — paid Kit buyers with no active subscription.
  const upsell = await safeCrmQuery<CadenceUpsell>(
    db,
    `SELECT ko.email, ko.brand, ko.paid_at AS kit_paid_at
       FROM kit_order ko
      WHERE ko.status IN ('paid', 'delivered')
        AND NOT EXISTS (
          SELECT 1
            FROM billing_subscriptions bs
            JOIN users u ON u.tenant_id = bs.tenant_id
           WHERE lower(u.email) = lower(ko.email)
             AND bs.status = 'active'
        )
      ORDER BY ko.paid_at DESC NULLS LAST
      LIMIT 100`
  );

  // 4. Stale contacts — engaged (contacted/qualified) but untouched for 14+ days
  //    with no upcoming follow-up. These slip through the cracks without a nudge.
  const stale = await safeCrmQuery<CadenceContact>(
    db,
    `SELECT email, stage, note, next_follow_up, updated_at
       FROM crm_contact
      WHERE stage IN ('contacted', 'qualified')
        AND updated_at < NOW() - INTERVAL '14 days'
        AND (next_follow_up IS NULL OR next_follow_up < NOW())
      ORDER BY updated_at ASC
      LIMIT 100`
  );

  return {
    generated_hint:
      "Read-only worklist. Act via PATCH /operator/crm (stage/note/follow-up) and " +
      "POST /operator/nurture/enroll (approved sequences only). Never money, never free-form email.",
    summary: {
      follow_ups_due: followUpsDue.length,
      new_leads_to_triage: newLeads.length,
      upsell_targets: upsell.length,
      stale_contacts: stale.length,
    },
    follow_ups_due: followUpsDue,
    new_leads_to_triage: newLeads,
    upsell_targets: upsell,
    stale_contacts: stale,
  };
}
