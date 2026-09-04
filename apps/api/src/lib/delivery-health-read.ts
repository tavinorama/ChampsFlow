/**
 * delivery-health-read.ts — the database side of Delivery Health (P0-09).
 *
 * The rules live in packages/llm/src/delivery-health.ts and
 * packages/llm/src/delivery-canary.ts and are pure. This file is the only place
 * that turns real rows into observations, and it obeys one law:
 *
 *   A READ THAT FAILS IS NOT A ZERO.
 *
 * Every probe is wrapped. A missing table (42P01) or a missing column (42703)
 * becomes `not_connected` with the reason naming what is missing; an
 * unexpected error becomes `not_measured` and is logged. Neither ever produces
 * a number, so nothing here can paint the panel green by accident — which is
 * the exact failure mode the audit found in System Health (RELATORIO §3.4).
 *
 * It reads cross-tenant, as the admin routes do (see the header of
 * apps/api/src/routes/admin.ts): super-admin requests run without a tenant
 * scope, so db.query() here is unscoped by design. Do NOT call setTenantId.
 *
 * Nothing new is stored: every number is derived from tables that already
 * exist, so this ships with no migration. Two indicators depend on the pending
 * lifecycle migration (20260903000001) and say so instead of guessing.
 */

import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import {
  DELIVERY_INDICATOR_IDS,
  evaluateIndicator,
  looksLikeRawError,
  rollupDelivery,
  type DeliveryIndicatorId,
  type DeliveryObservation,
  type DeliveryRollup,
} from "../../../../packages/llm/src/delivery-health";
import {
  CANARY_VERSION,
  OZVOR_GOLDEN_PROMPTS,
  canaryPromptKey,
  evaluateCanary,
  type CanaryObservation,
  type CanaryPromptObservation,
  type CanaryResult,
} from "../../../../packages/llm/src/delivery-canary";
import {
  computeExecution,
  normalizePlanTaskState,
  OPEN_STATES,
  type PlanTaskState,
} from "../../../../packages/llm/src/plan-task-state";
import { markComparableTrend } from "./trend-comparability";
import { detectLifecycle } from "./plan-task-lifecycle";

// ---------------------------------------------------------------------------
// Probe plumbing
// ---------------------------------------------------------------------------

/** Postgres: undefined_table / undefined_column. Both mean "not connected". */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703"]);

type Probe = () => Promise<DeliveryObservation | DeliveryObservation[]>;

/**
 * Runs a probe and converts any failure into an honest unknown observation.
 * `ids` is what this probe was responsible for, so a failure cannot silently
 * drop indicators off the panel.
 */
async function safely(ids: DeliveryIndicatorId[], probe: Probe): Promise<DeliveryObservation[]> {
  try {
    const out = await probe();
    return Array.isArray(out) ? out : [out];
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    const missing = typeof code === "string" && MISSING_SCHEMA_CODES.has(code);
    const message = (err as Error).message?.slice(0, 200) ?? "unknown error";
    if (!missing) {
      logger.warn("delivery_health_probe_failed", { indicators: ids.join(","), message });
    }
    return ids.map((id) => ({
      id,
      value: null,
      sample: 0,
      unknown: missing ? ("not_connected" as const) : ("not_measured" as const),
      detail: missing
        ? `source of truth missing in this database (${message})`
        : `the read failed — reported as unmeasured, never as zero (${message})`,
    }));
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// The plan_task probe — feeds four indicators from one read
// ---------------------------------------------------------------------------

interface PlanTaskRow {
  status: string;
  action: string | null;
  evidence: string | null;
  metric: string | null;
  owner: string | null;
}

const OPEN = new Set<PlanTaskState>(OPEN_STATES);

async function probePlanTasks(db: PostgresClient): Promise<DeliveryObservation[]> {
  const { rows } = await db.query<PlanTaskRow>(
    `SELECT status, action, evidence, metric, owner
       FROM plan_task
      WHERE created_at >= NOW() - INTERVAL '30 days'
      LIMIT 5000`
  );

  const states = rows.map((r) => normalizePlanTaskState(r.status));
  const openRows = rows.filter((_, i) => OPEN.has(states[i] as PlanTaskState));

  // 1. Recommendation coverage — an open gap with no action is a problem shown
  //    with no way out. That is the "All caught up" lie in aggregate form.
  const covered = openRows.filter((r) => (r.action ?? "").trim().length > 0);

  // 2. Useful action rate — an action is useful when it says WHY (evidence)
  //    and HOW we will know it worked (metric). Client-authored to-dos are
  //    excluded: the client owes us no evidence.
  const ours = openRows.filter((r) => r.owner !== "you" || (r.evidence ?? "").trim().length > 0);
  const useful = ours.filter(
    (r) => (r.evidence ?? "").trim().length > 0 && (r.metric ?? "").trim().length > 0
  );

  const observations: DeliveryObservation[] = [
    {
      id: "recommendation_coverage",
      value: openRows.length > 0 ? covered.length / openRows.length : null,
      sample: openRows.length,
      ...(openRows.length === 0
        ? { unknown: "insufficient_evidence" as const, detail: "no open cards in the last 30 days" }
        : {}),
    },
    {
      id: "useful_action_rate",
      value: ours.length > 0 ? useful.length / ours.length : null,
      sample: ours.length,
      ...(ours.length === 0
        ? { unknown: "insufficient_evidence" as const, detail: "no Ozvor-owned open cards in the last 30 days" }
        : {}),
    },
  ];

  // 3. Action verification rate — reuses the P0-02 state machine so there is
  //    exactly one definition of "verified" in the product.
  const cap = await detectLifecycle(db);
  const breakdown = computeExecution(states);
  if (!cap.full) {
    // Before the migration nothing CAN be verified, so 0% would be an artefact
    // of the schema and not a measurement. Say that instead.
    observations.push({
      id: "action_verification_rate",
      value: null,
      sample: breakdown.counts.denominator,
      unknown: "not_connected",
      detail:
        "the task-lifecycle migration (20260903000001_plan_task_lifecycle) is not applied — verification cannot be recorded yet, so this is unmeasurable, not 0%",
    });
  } else {
    observations.push({
      id: "action_verification_rate",
      value: breakdown.verifiedPct === null ? null : breakdown.verifiedPct / 100,
      sample: breakdown.counts.denominator,
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Regression SLA — needs the transition history (pending migration)
// ---------------------------------------------------------------------------

async function probeRegressionSla(db: PostgresClient): Promise<DeliveryObservation> {
  const cap = await detectLifecycle(db);
  if (!cap.history) {
    return {
      id: "regression_investigation_sla",
      value: null,
      sample: 0,
      unknown: "not_connected",
      detail:
        "plan_task_transition does not exist yet (migration 20260903000001_plan_task_lifecycle) — regression age cannot be read",
    };
  }
  // The oldest card that entered 'regressed' and that nobody has touched since.
  const { rows } = await db.query<{ hours: string | null; n: string }>(
    `WITH last_move AS (
       SELECT task_id,
              MAX(created_at) AS moved_at,
              (ARRAY_AGG(to_state ORDER BY created_at DESC))[1] AS to_state
         FROM plan_task_transition
        GROUP BY task_id
     )
     SELECT MAX(EXTRACT(EPOCH FROM (NOW() - moved_at)) / 3600.0)::float AS hours,
            COUNT(*)::int AS n
       FROM last_move
      WHERE to_state = 'regressed'`
  );
  const n = Number(rows[0]?.n ?? 0);
  return {
    id: "regression_investigation_sla",
    value: n > 0 ? num(rows[0]?.hours) : 0,
    sample: Math.max(n, 1), // minSample is 1; "no open regression" is a real, healthy reading
    ...(n === 0 ? { detail: "no untouched regression" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Prompts, engines, drafts, audits
// ---------------------------------------------------------------------------

async function probePromptRelevance(db: PostgresClient): Promise<DeliveryObservation> {
  const { rows } = await db.query<{ total: string; classified: string }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(intent_id)::int AS classified
       FROM audit_prompt`
  );
  const total = Number(rows[0]?.total ?? 0);
  const classified = Number(rows[0]?.classified ?? 0);
  return {
    id: "prompt_relevance_pass",
    value: total > 0 ? classified / total : null,
    sample: total,
    ...(total === 0 ? { unknown: "insufficient_evidence" as const, detail: "no prompts stored" } : {}),
    ...(total > 0
      ? {
          detail:
            "measured as intent-classification coverage — relevance itself is not scored yet (P0-06); the panel does not pretend otherwise",
        }
      : {}),
  };
}

async function probeEntityFalsePositives(db: PostgresClient): Promise<DeliveryObservation> {
  const { rows } = await db.query<{ rate: string | null; n: string }>(
    `SELECT AVG(negative_rate)::float AS rate, COUNT(*)::int AS n
       FROM engine_drift_check
      WHERE checked_at >= NOW() - INTERVAL '7 days'`
  );
  const n = Number(rows[0]?.n ?? 0);
  return {
    id: "entity_false_positive_rate",
    value: n > 0 ? num(rows[0]?.rate) : null,
    sample: n,
    ...(n === 0
      ? {
          unknown: "not_measured" as const,
          detail: "the daily anti-drift battery has not written a row in 7 days — hallucination is unmeasured, not clean",
        }
      : {}),
  };
}

async function probeDrafts(db: PostgresClient): Promise<DeliveryObservation[]> {
  const { rows } = await db.query<{
    total: string;
    failed: string;
    timed: string;
    p95: string | null;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status <> 'discarded')::int AS total,
            COUNT(*) FILTER (WHERE status = 'failed')::int      AS failed,
            COUNT(*) FILTER (WHERE status <> 'failed'
                               AND status <> 'discarded'
                               AND body IS NOT NULL)::int       AS timed,
            PERCENTILE_CONT(0.95) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))
            ) FILTER (WHERE status <> 'failed'
                        AND status <> 'discarded'
                        AND body IS NOT NULL)::float            AS p95
       FROM drafts
      WHERE created_at >= NOW() - INTERVAL '30 days'`
  );
  const total = Number(rows[0]?.total ?? 0);
  const failed = Number(rows[0]?.failed ?? 0);
  const timed = Number(rows[0]?.timed ?? 0);
  return [
    {
      id: "draft_generation_success",
      value: total > 0 ? (total - failed) / total : null,
      sample: total,
      ...(total === 0
        ? { unknown: "insufficient_evidence" as const, detail: "no drafts created in 30 days" }
        : {}),
    },
    {
      id: "draft_generation_time",
      value: timed > 0 ? num(rows[0]?.p95) : null,
      sample: timed,
      ...(timed === 0
        ? { unknown: "insufficient_evidence" as const, detail: "no completed draft to time" }
        : {}),
    },
  ];
}

async function probeAudits(db: PostgresClient): Promise<DeliveryObservation[]> {
  const { rows } = await db.query<{
    complete: string;
    failed: string;
    queue_minutes: string | null;
    waiting: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'complete'
                               AND created_at >= NOW() - INTERVAL '7 days')::int AS complete,
            COUNT(*) FILTER (WHERE status = 'failed'
                               AND created_at >= NOW() - INTERVAL '7 days')::int AS failed,
            MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60.0)
              FILTER (WHERE status IN ('pending', 'running'))::float             AS queue_minutes,
            COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::int        AS waiting
       FROM geo_audit`
  );
  const complete = Number(rows[0]?.complete ?? 0);
  const failed = Number(rows[0]?.failed ?? 0);
  const terminal = complete + failed;
  const waiting = Number(rows[0]?.waiting ?? 0);

  return [
    {
      id: "failed_jobs",
      value: terminal > 0 ? failed / terminal : null,
      sample: terminal,
      ...(terminal === 0
        ? { unknown: "insufficient_evidence" as const, detail: "no audit finished in 7 days" }
        : {}),
    },
    {
      id: "queue_age",
      // An empty queue is a real, healthy measurement of zero — not an unknown.
      value: waiting > 0 ? num(rows[0]?.queue_minutes) : 0,
      sample: waiting,
      ...(waiting === 0 ? { detail: "queue empty" } : {}),
    },
  ];
}

async function probeRawErrorLeak(db: PostgresClient): Promise<DeliveryObservation> {
  const { rows } = await db.query<{ error_message: string | null }>(
    `SELECT error_message
       FROM geo_audit
      WHERE status = 'failed'
        AND created_at >= NOW() - INTERVAL '7 days'
        AND error_message IS NOT NULL
      LIMIT 500`
  );
  const leaked = rows.filter((r) => looksLikeRawError(r.error_message)).length;
  return {
    id: "raw_error_leak",
    value: leaked,
    sample: rows.length,
    ...(leaked > 0
      ? { detail: `${leaked} of ${rows.length} customer-visible failure messages are raw provider/runtime strings` }
      : {}),
  };
}

async function probeComparableTrend(db: PostgresClient): Promise<DeliveryObservation> {
  const { rows } = await db.query<{
    brand_id: string;
    audit_id: string | null;
    recorded_at: string;
    providers_used: unknown;
    checks: number | null;
    coverage: { comparable?: unknown } | null;
  }>(
    `SELECT s.brand_id, s.audit_id, s.recorded_at,
            a.providers_used,
            (s.provider_breakdown->>'probesTotal')::int AS checks,
            s.provider_breakdown->'coverage'            AS coverage
       FROM geo_score s
       LEFT JOIN geo_audit a ON a.id = s.audit_id
      WHERE s.recorded_at >= NOW() - INTERVAL '30 days'
      ORDER BY s.recorded_at DESC
      LIMIT 2000`
  );

  const asProviders = (v: unknown): string[] | null => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v) as unknown;
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const byBrand = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byBrand.get(r.brand_id) ?? [];
    list.push(r);
    byBrand.set(r.brand_id, list);
  }

  let total = 0;
  let inTrend = 0;
  for (const [, brandRows] of byBrand) {
    // A brand with one run has no trend to be comparable with (contract).
    if (brandRows.length < 2) continue;
    const marks = markComparableTrend(
      brandRows.map((r) => ({
        auditId: r.audit_id,
        recordedAt: r.recorded_at,
        providers: asProviders(r.providers_used),
        checks: r.checks,
        comparableFlag:
          r.coverage && typeof r.coverage.comparable === "boolean" ? r.coverage.comparable : null,
      }))
    );
    total += marks.marks.length;
    inTrend += marks.marks.filter((m) => m.inTrend).length;
  }

  return {
    id: "comparable_trend_coverage",
    value: total > 0 ? inTrend / total : null,
    sample: total,
    ...(total === 0
      ? {
          unknown: "insufficient_evidence" as const,
          detail: "no brand has two or more runs in the window — there is no trend to compare",
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// The canary tenant
// ---------------------------------------------------------------------------

const NOT_CONNECTED = (reason: string): CanaryObservation => ({
  connected: false,
  disconnectedReason: reason,
  auditId: null,
  auditAgeHours: null,
  prompts: [],
  gaps: null,
  entityFalsePositives: null,
  draft: null,
  verify: null,
});

/**
 * Builds the canary observation from OUR OWN brand's rows. The brand is named
 * by OZVOR_OWN_BRAND_ID — the same env var the dogfood loop already uses
 * (apps/worker/src/jobs/graph-tick.ts:61), so there is one canary identity in
 * the company, not two.
 */
export async function readCanaryObservation(db: PostgresClient): Promise<CanaryObservation> {
  const brandId = (process.env["OZVOR_OWN_BRAND_ID"] ?? "").trim();
  if (!brandId) {
    return NOT_CONNECTED(
      "canary brand not configured — set OZVOR_OWN_BRAND_ID to the Ozvor brand id (the same var the dogfood loop uses)"
    );
  }

  let auditId: string | null = null;
  let auditAgeHours: number | null = null;
  try {
    const { rows } = await db.query<{ id: string; hours: string | null }>(
      `SELECT id, EXTRACT(EPOCH FROM (NOW() - COALESCE(completed_at, created_at))) / 3600.0 AS hours
         FROM geo_audit
        WHERE brand_id = $1 AND status = 'complete'
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT 1`,
      [brandId]
    );
    auditId = rows[0]?.id ?? null;
    auditAgeHours = rows[0] ? num(rows[0].hours) : null;
  } catch (err) {
    return NOT_CONNECTED(`canary audits unreadable: ${(err as Error).message?.slice(0, 120)}`);
  }

  // Golden prompts — matched by normalised text against the brand's own set.
  let prompts: CanaryPromptObservation[] = [];
  try {
    const { rows } = await db.query<{ text: string; intent_id: string | null }>(
      `SELECT text, intent_id FROM audit_prompt WHERE brand_id = $1 LIMIT 500`,
      [brandId]
    );
    const byKey = new Map(
      rows
        .filter((r): r is { text: string; intent_id: string | null } => typeof r.text === "string")
        .map((r) => [canaryPromptKey(r.text), r] as const)
    );
    prompts = OZVOR_GOLDEN_PROMPTS.map((g) => {
      const hit = byKey.get(canaryPromptKey(g.text));
      return {
        goldenId: g.id,
        present: Boolean(hit),
        category: hit?.intent_id ?? null,
        // Relevance is not scored anywhere yet (P0-06). null = not measured,
        // which the canary reports as unproven — never as a pass.
        relevance: null,
      };
    });
  } catch (err) {
    logger.warn("canary_prompts_read_failed", { message: (err as Error).message?.slice(0, 160) });
    prompts = [];
  }

  // Action coverage over the canary brand's latest plan.
  let gaps: { total: number; withAction: number } | null = null;
  let verify: { claimed: number; verified: number } | null = null;
  try {
    const { rows } = await db.query<{ status: string; action: string | null }>(
      `SELECT t.status, t.action
         FROM plan_task t
         JOIN strategy_plan p ON p.id = t.plan_id
        WHERE p.brand_id = $1
          AND p.created_at = (SELECT MAX(created_at) FROM strategy_plan WHERE brand_id = $1)`,
      [brandId]
    );
    const states = rows.map((r) => normalizePlanTaskState(r.status));
    const open = rows.filter((_, i) => OPEN.has(states[i] as PlanTaskState));
    gaps = {
      total: open.length,
      withAction: open.filter((r) => (r.action ?? "").trim().length > 0).length,
    };
    const cap = await detectLifecycle(db);
    if (cap.full) {
      const b = computeExecution(states);
      verify = { claimed: b.counts.denominator, verified: b.counts.verified };
    } else {
      verify = null; // migration pending → not_measured, not a pass
    }
  } catch (err) {
    logger.warn("canary_plan_read_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  // Entity false positives — the negative controls of the daily battery.
  let entityFalsePositives: number | null = null;
  try {
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n
         FROM engine_drift_check
        WHERE checked_at >= NOW() - INTERVAL '7 days'
          AND negative_rate > 0`
    );
    // Zero rows in the window means UNMEASURED, not clean.
    const { rows: any7 } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM engine_drift_check WHERE checked_at >= NOW() - INTERVAL '7 days'`
    );
    entityFalsePositives = Number(any7[0]?.n ?? 0) > 0 ? Number(rows[0]?.n ?? 0) : null;
  } catch (err) {
    logger.warn("canary_drift_read_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  // Draft canary — did hosted generation produce something for us recently?
  let draft: { ageHours: number | null; succeeded: boolean } | null = null;
  try {
    const { rows } = await db.query<{ status: string; hours: string | null }>(
      `SELECT d.status,
              EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 3600.0 AS hours
         FROM drafts d
         JOIN brands b ON b.tenant_id = d.tenant_id
        WHERE b.id = $1 AND d.status <> 'discarded'
        ORDER BY d.created_at DESC
        LIMIT 1`,
      [brandId]
    );
    if (rows[0]) {
      draft = { ageHours: num(rows[0].hours), succeeded: rows[0].status !== "failed" };
    }
  } catch (err) {
    logger.warn("canary_draft_read_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  return {
    connected: true,
    auditId,
    auditAgeHours,
    prompts,
    gaps,
    entityFalsePositives,
    draft,
    verify,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface DeliveryHealth {
  rollup: DeliveryRollup;
  canary: CanaryResult;
  canaryVersion: string;
}

/**
 * Reads every indicator and the canary. Never throws: the whole point of this
 * panel is to be readable exactly when things are broken.
 */
export async function readDeliveryHealth(db: PostgresClient): Promise<DeliveryHealth> {
  const readAt = new Date().toISOString();

  const groups = await Promise.all([
    safely(
      ["recommendation_coverage", "useful_action_rate", "action_verification_rate"],
      () => probePlanTasks(db)
    ),
    safely(["regression_investigation_sla"], () => probeRegressionSla(db)),
    safely(["prompt_relevance_pass"], () => probePromptRelevance(db)),
    safely(["entity_false_positive_rate"], () => probeEntityFalsePositives(db)),
    safely(["draft_generation_success", "draft_generation_time"], () => probeDrafts(db)),
    safely(["failed_jobs", "queue_age"], () => probeAudits(db)),
    safely(["raw_error_leak"], () => probeRawErrorLeak(db)),
    safely(["comparable_trend_coverage"], () => probeComparableTrend(db)),
  ]);

  const byId = new Map<DeliveryIndicatorId, DeliveryObservation>();
  for (const g of groups) for (const o of g) byId.set(o.id, o);

  // Any indicator no probe produced is reported as not_measured — an indicator
  // cannot vanish from the panel just because its probe forgot it.
  const indicators = DELIVERY_INDICATOR_IDS.map((id) =>
    evaluateIndicator(
      byId.get(id) ?? {
        id,
        value: null,
        sample: 0,
        unknown: "not_measured",
        detail: "no probe produced this indicator",
      }
    )
  );

  let canary: CanaryResult;
  try {
    canary = evaluateCanary(await readCanaryObservation(db), readAt);
  } catch (err) {
    logger.warn("delivery_canary_failed", { message: (err as Error).message?.slice(0, 200) });
    canary = evaluateCanary(
      NOT_CONNECTED(`canary read failed: ${(err as Error).message?.slice(0, 120)}`),
      readAt
    );
  }

  const rollup = rollupDelivery(
    indicators,
    { status: canary.status, version: canary.version, reasons: canary.reasons },
    readAt
  );

  return { rollup, canary, canaryVersion: CANARY_VERSION };
}
