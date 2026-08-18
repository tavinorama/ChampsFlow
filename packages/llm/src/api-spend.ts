/**
 * api-spend.ts — the ONE writer for the platform spend ledger (#152).
 *
 * api_spend is OUR ledger: what the platform paid providers. (The client's
 * ledger is credit_ledger — different question, never derived from this.)
 *
 * Every row records HOW the number was obtained, in precedence order:
 *   measured › rate › flat
 *   - measured: model + real token counts known → measured_cost_cents =
 *               tokens × list price (packages/llm/src/cost.ts). The engine's
 *               per-call RATE estimate is still stored in est_cost_cents so
 *               the two can be compared row by row.
 *   - rate:     no usable tokens → est_cost_cents = calls × measured per-call
 *               rate (the 2026-08-05 experiment); measured_cost_cents NULL.
 *   - flat:     a fixed per-operation number (env override, legacy writer).
 *
 * Schema tolerance: the measured columns land with migration
 * 20260815000001_api_spend_measured, and `tenant_id` with
 * 20260817000001_api_spend_tenant — both founder-gated. Until they are
 * applied, Postgres answers the wide INSERT with 42703 (undefined_column);
 * this writer then steps down: (measured + tenant_id) → (measured, no
 * tenant_id) → legacy (op, est_cost_cents), logging `api_spend_tenant_column_absent`
 * / `api_spend_legacy_schema` ONCE per process each, and keeps working. The
 * ledger degrades honestly instead of losing rows.
 *
 * NEVER throws: an audit must never fail because the ledger did. Failure is
 * logged at error level (a meter that fails silently under-counts — #139)
 * and reported in the return value for callers that want to know.
 *
 * `exec` is a tiny adapter so both drivers in the repo work:
 *   postgres.js:  (q, p) => sql.unsafe(q, p)
 *   pg / db.query: (q, p) => db.query(q, p)
 */

import { logger } from "../../shared/src/logger";
import { measuredCostCents } from "./cost";

export type SpendExec = (query: string, params: unknown[]) => Promise<unknown>;

export type SpendSource = "measured" | "rate" | "flat";

export interface SpendInput {
  /** 'audit' | 'free_test' | 'drift_control' | 'pages_generate' | ... */
  op: string;
  /** Provider/engine id ('anthropic', 'openai', 'gemini', 'perplexity', 'serp', 'extraction'). */
  engine?: string | null;
  /** Provider model id, when known. */
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Provider-side web searches, when reported (priced for anthropic). */
  searchRequests?: number | null;
  /** API requests aggregated in this row (per-request fees). Default 1. */
  requests?: number | null;
  /**
   * The estimate this row would have carried before #152 (calls × rate, or a
   * flat number), in cents (may be fractional; stored rounded). Required —
   * even a measured row keeps its estimate for comparison.
   */
  estCents: number;
  /** How estCents was obtained. Default 'rate'. */
  estSource?: Exclude<SpendSource, "measured">;
  /** Opaque correlation id: audit_id / job id. */
  ref?: string | null;
  /**
   * Tenant the spend was incurred for, when known (audit, pages_generate;
   * free_test has none). Column lands with migration 20260817000001
   * (founder-gated); until then the writer retries without it — see below.
   */
  tenantId?: string | null;
}

export interface SpendResult {
  ok: boolean;
  /** Which number won. */
  source: SpendSource;
  /** measured_cost_cents when source='measured', else null. */
  measuredCents: number | null;
  /** est_cost_cents as stored (integer). */
  estCents: number;
  /** true when the row went through the legacy (op, est_cost_cents) INSERT. */
  legacy: boolean;
  /** true when tenant_id was persisted (column present AND tenantId given). */
  tenantRecorded: boolean;
}

let legacySchemaLogged = false;
let tenantColumnLogged = false;

/** Test seam: reset the once-per-process log flags. */
export function _resetApiSpendStateForTests(): void {
  legacySchemaLogged = false;
  tenantColumnLogged = false;
}

function isUndefinedColumn(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42703";
}

/** 42703 whose message names tenant_id → only that column is missing. */
function isTenantColumnMissing(err: unknown): boolean {
  if (!isUndefinedColumn(err)) return false;
  const msg = String((err as { message?: unknown } | null)?.message ?? "");
  return /tenant_id/i.test(msg);
}

function toIntCents(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export async function recordSpend(exec: SpendExec, input: SpendInput): Promise<SpendResult> {
  const engine = input.engine ?? null;
  const model = input.model ?? null;
  const inputTokens =
    typeof input.inputTokens === "number" && Number.isFinite(input.inputTokens)
      ? Math.max(0, Math.floor(input.inputTokens))
      : null;
  const outputTokens =
    typeof input.outputTokens === "number" && Number.isFinite(input.outputTokens)
      ? Math.max(0, Math.floor(input.outputTokens))
      : null;

  const measured = measuredCostCents({
    model,
    inputTokens,
    outputTokens,
    provider: engine,
    searchRequests: input.searchRequests ?? null,
    requests: input.requests ?? null,
  });
  const source: SpendSource = measured !== null ? "measured" : (input.estSource ?? "rate");
  const estCents = toIntCents(input.estCents);
  const ref = input.ref ?? null;

  const tenantId = input.tenantId ?? null;

  const base: SpendResult = {
    ok: false,
    source,
    measuredCents: measured,
    estCents,
    legacy: false,
    tenantRecorded: false,
  };

  const wideParams = [input.op, estCents, engine, model, inputTokens, outputTokens, measured, source, ref];

  // Widest path: measured columns + tenant_id (only attempted when a tenant is known).
  if (tenantId) {
    try {
      await exec(
        `INSERT INTO api_spend
           (op, est_cost_cents, engine, model, input_tokens, output_tokens, measured_cost_cents, source, ref, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [...wideParams, tenantId]
      );
      return { ...base, ok: true, tenantRecorded: true };
    } catch (err) {
      if (!isUndefinedColumn(err)) {
        logger.error("api_spend_insert_failed", {
          op: input.op,
          engine: engine ?? "",
          message: (err as Error)?.message?.slice(0, 200) ?? "",
        });
        return base;
      }
      if (isTenantColumnMissing(err)) {
        if (!tenantColumnLogged) {
          tenantColumnLogged = true;
          logger.warn("api_spend_tenant_column_absent", {
            note: "api_spend.tenant_id absent (migration 20260817000001 not applied) — per-tenant cost attribution is being DROPPED until the migration lands",
          });
        }
        // fall through to the measured-only INSERT
      }
      // Any other 42703 (measured columns absent too) also falls through; the
      // measured INSERT below will hit the same error and step down to legacy.
    }
  }

  try {
    await exec(
      `INSERT INTO api_spend
         (op, est_cost_cents, engine, model, input_tokens, output_tokens, measured_cost_cents, source, ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      wideParams
    );
    return { ...base, ok: true };
  } catch (err) {
    if (!isUndefinedColumn(err)) {
      logger.error("api_spend_insert_failed", {
        op: input.op,
        engine: engine ?? "",
        message: (err as Error)?.message?.slice(0, 200) ?? "",
      });
      return base;
    }
    if (!legacySchemaLogged) {
      legacySchemaLogged = true;
      logger.warn("api_spend_legacy_schema", {
        note: "measured columns absent (migration 20260815000001 not applied) — writing legacy (op, est_cost_cents) rows; measured tokens are being DROPPED until the migration lands",
      });
    }
  }

  // Legacy path: pre-#152 schema.
  try {
    await exec(`INSERT INTO api_spend (op, est_cost_cents) VALUES ($1, $2)`, [input.op, estCents]);
    return { ...base, ok: true, legacy: true, source: input.estSource ?? "rate", measuredCents: null };
  } catch (err) {
    logger.error("api_spend_insert_failed", {
      op: input.op,
      engine: engine ?? "",
      legacy: true,
      message: (err as Error)?.message?.slice(0, 200) ?? "",
    });
    return { ...base, legacy: true, source: input.estSource ?? "rate", measuredCents: null };
  }
}

/** Adapter for postgres.js (`sql.unsafe`). */
export function execForPostgresJs(sql: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsafe: (q: string, params?: any[]) => Promise<unknown>;
}): SpendExec {
  return (q, params) => sql.unsafe(q, params);
}

/** Adapter for node-postgres style clients (`db.query(text, values)`). */
export function execForPg(db: { query: (q: string, params?: unknown[]) => Promise<unknown> }): SpendExec {
  return (q, params) => db.query(q, params);
}
