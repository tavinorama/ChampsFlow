/**
 * design-partner-funnel.ts — the 19-day canal B funnel, rolled up for the
 * weekly report (founder, 2026-09-11).
 *
 * THE FUNNEL
 * ---------------------------------------------------------------------------
 *   contatado -> conversa marcada -> conversa feita -> proposta -> pago
 *   contacted     call_booked        call_done         proposal    paid
 *
 * It is a roll-up over `crm_contact` rows whose `source` is 'design-partner'.
 * Nothing new is stored: the stage the founder set IS the funnel.
 *
 * TWO HONESTY RULES BAKED IN
 * ---------------------------------------------------------------------------
 * 1. A funnel that cannot be read is reported as unavailable, with the reason
 *    and the nominal action — never as a row of zeros. Zeros and "the column
 *    does not exist yet" look identical in a report and mean opposite things,
 *    and the report is read on a Monday morning to decide the week.
 *
 * 2. It is MONOTONIC. A contact at 'proposal' has necessarily been contacted,
 *    had the call booked and had the call happen. So each stage counts everyone
 *    who reached it OR passed it — otherwise "conversa feita: 0" would appear
 *    the moment the last person moved on, and read as a collapse.
 *    `atStage` keeps the raw where-they-are-now count alongside.
 *
 * Legacy rows: 'customer' predates this funnel and means the same as 'paid', so
 * it counts as paid. 'lost' leaves the funnel and is reported separately — a
 * lost design partner is a fact the weekly report needs, not a gap to hide.
 *
 * Pure module: no I/O, no SQL. The route does the reading.
 */

/** The stage the founder set, as stored. */
export interface FunnelContactRow {
  email: string;
  stage: string;
  source?: string | null;
  next_follow_up?: string | null;
  updated_at?: string;
}

export const DESIGN_PARTNER_SOURCE = "design-partner";

/** The founder's target for canal B: 3 to 5 design partners. */
export const DESIGN_PARTNER_TARGET = 5;

export interface FunnelStageDef {
  key: string;
  /** Portuguese label — the founder reads this report. */
  label: string;
  /** Stages that count as "reached this step or a later one". */
  reachedBy: readonly string[];
}

/**
 * Ordered. `reachedBy` is cumulative by construction (see rule 2 above), and
 * 'customer' rides along with 'paid' so pre-funnel rows are not lost.
 */
export const DESIGN_PARTNER_FUNNEL: readonly FunnelStageDef[] = Object.freeze([
  {
    key: "contacted",
    label: "Contatado",
    reachedBy: ["contacted", "qualified", "call_booked", "call_done", "proposal", "paid", "customer"],
  },
  {
    key: "call_booked",
    label: "Conversa marcada",
    reachedBy: ["call_booked", "call_done", "proposal", "paid", "customer"],
  },
  {
    key: "call_done",
    label: "Conversa feita",
    reachedBy: ["call_done", "proposal", "paid", "customer"],
  },
  { key: "proposal", label: "Proposta", reachedBy: ["proposal", "paid", "customer"] },
  { key: "paid", label: "Pago", reachedBy: ["paid", "customer"] },
]);

export interface FunnelStageCount {
  key: string;
  label: string;
  /** Everyone who reached this step or passed it. The number to read. */
  reached: number;
  /** Everyone sitting exactly here right now. */
  atStage: number;
  /** Emails at this step right now, so the report can name who is stuck. */
  emails: string[];
}

export interface DesignPartnerFunnel {
  /** False when the funnel could not be read. Then `reason` says why. */
  available: boolean;
  /** Why it is unavailable, and what turns it on. null when available. */
  reason: string | null;
  target: number;
  stages: FunnelStageCount[];
  /** Design-partner contacts that are not lost. */
  total: number;
  /** Reached 'paid' (or legacy 'customer'). The number the target is against. */
  paid: number;
  /** Design partners marked lost. Reported, never hidden. */
  lost: number;
  /** Contacts with a design-partner source whose stage is outside the funnel. */
  offFunnel: { email: string; stage: string }[];
}

/** An unavailable funnel, stated rather than faked with zeros. */
export function unavailableFunnel(reason: string): DesignPartnerFunnel {
  return {
    available: false,
    reason,
    target: DESIGN_PARTNER_TARGET,
    stages: DESIGN_PARTNER_FUNNEL.map((s) => ({
      key: s.key,
      label: s.label,
      reached: 0,
      atStage: 0,
      emails: [],
    })),
    total: 0,
    paid: 0,
    lost: 0,
    offFunnel: [],
  };
}

const KNOWN_STAGES = new Set(
  DESIGN_PARTNER_FUNNEL.flatMap((s) => [...s.reachedBy])
);

/**
 * Roll the design-partner rows into the funnel.
 *
 * `rows` is every crm_contact row the caller read; this filters by source so
 * the caller does not have to duplicate the rule. Rows whose source column is
 * absent (undefined) are NOT design partners — a missing label is not a claim.
 */
export function buildDesignPartnerFunnel(rows: readonly FunnelContactRow[]): DesignPartnerFunnel {
  const mine = rows.filter((r) => (r.source ?? null) === DESIGN_PARTNER_SOURCE);
  const live = mine.filter((r) => r.stage !== "lost");

  const stages: FunnelStageCount[] = DESIGN_PARTNER_FUNNEL.map((def) => {
    const reachedBy = new Set(def.reachedBy);
    const here = live.filter((r) => r.stage === def.key || (def.key === "paid" && r.stage === "customer"));
    return {
      key: def.key,
      label: def.label,
      reached: live.filter((r) => reachedBy.has(r.stage)).length,
      atStage: here.length,
      emails: here.map((r) => r.email).sort(),
    };
  });

  return {
    available: true,
    reason: null,
    target: DESIGN_PARTNER_TARGET,
    stages,
    total: live.length,
    paid: live.filter((r) => r.stage === "paid" || r.stage === "customer").length,
    lost: mine.filter((r) => r.stage === "lost").length,
    offFunnel: live
      .filter((r) => !KNOWN_STAGES.has(r.stage))
      .map((r) => ({ email: r.email, stage: r.stage }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}
