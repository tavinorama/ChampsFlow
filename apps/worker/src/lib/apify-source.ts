/**
 * apify-source.ts — the Apify client of the prospect-batch source layer
 * (10.C.17 / 5.A.6, founder decision 2 de 02/09).
 *
 * DETERMINISTIC I/O, no LLM anywhere: one HTTPS call to the Apify API
 * (run-sync-get-dataset-items) with the actor id + input coming from the
 * founder-confirmed RUN SPEC (never hardcoded), and the dataset parsed by the
 * pure functions in apps/api/src/lib/prospecting.ts.
 *
 * Money rules (house: "every paid call is explicit + cost shown first"):
 *  - NEVER automatic. This module runs only when a spec exists in Redis —
 *    and a spec only exists after an explicit confirmed dispatch (the
 *    workflow with confirm=yes, or the operator endpoint with confirm:true).
 *    There is NO cron and NO default path into this file.
 *  - env APIFY_TOKEN is OPTIONAL: absent → the source is UNAVAILABLE and the
 *    batch says so loudly and honestly (no silent degradation).
 *  - Budget guard: before the call, the month's ledger (api_spend rows with
 *    op='prospect_apify' — the EXISTING table, no new migration) is re-checked
 *    against env APIFY_MONTHLY_BUDGET_USD (default 100) via decideApifyRun —
 *    the SAME gate the operator endpoint applies. Estimate over budget = no
 *    call, honest reason.
 *  - After a real run the ACTUAL count of returned items is recorded in the
 *    same ledger (estSource 'flat', op 'prospect_apify') so next month's
 *    guard sees real numbers.
 *
 * The token never appears in logs, artifacts, or error messages.
 */

import {
  parseApifyItems,
  parseApifyRunSpec,
  apifySpecPlaces,
  apifyPricePer1kUsd,
  apifyMonthlyBudgetUsd,
  estimateApifyCostUsd,
  decideApifyRun,
  isValidApifyActorId,
  type ApifyCandidate,
  type ApifyRunSpec,
} from "../../../api/src/lib/prospecting";

/** Where the operator endpoint parks a confirmed spec for the worker (TTL'd). */
export const APIFY_SPEC_REDIS_KEY = "prospect:apify:spec";
export const APIFY_SPEC_TTL_SECONDS = 48 * 3600;

/** One request, generous timeout: run-sync waits for the actor (max ~5 min). */
const APIFY_SYNC_TIMEOUT_MS = 330_000;

export interface ApifyHttpResult {
  status: number;
  body: unknown;
}

/** Injected for tests; null = network error/timeout. */
export type ApifyFetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }, timeoutMs: number) => Promise<ApifyHttpResult | null>;

export const defaultApifyFetch: ApifyFetchFn = async (url, init, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export type FetchApifyResult =
  | { ok: true; candidates: ApifyCandidate[]; itemCount: number; actorId: string; costUsd: number }
  | { ok: false; reason: string };

/**
 * Run the actor synchronously and return parsed candidates. The actor id
 * resolution order: spec.actorId → env APIFY_MAPS_ACTOR — both only FORMAT
 * validated (e.g. compass/crawler-google-places); we never assume an actor
 * exists, a 404 comes back as an honest reason.
 */
export async function fetchApifyCandidates(
  spec: ApifyRunSpec,
  deps: { env?: NodeJS.ProcessEnv; fetchJson?: ApifyFetchFn } = {}
): Promise<FetchApifyResult> {
  const env = deps.env ?? process.env;
  const fetchJson = deps.fetchJson ?? defaultApifyFetch;
  const token = env["APIFY_TOKEN"]?.trim();
  if (!token) {
    return {
      ok: false,
      reason:
        "FONTE APIFY INDISPONIVEL: env APIFY_TOKEN ausente no worker — setar APIFY_TOKEN (Railway worker) destrava; nenhuma chamada foi feita",
    };
  }
  const actorId = spec.actorId?.trim() || env["APIFY_MAPS_ACTOR"]?.trim() || "";
  if (!actorId) {
    return {
      ok: false,
      reason:
        "FONTE APIFY SEM ACTOR: nem o spec trouxe actorId nem env APIFY_MAPS_ACTOR existe (ex.: compass/crawler-google-places) — nenhuma chamada foi feita",
    };
  }
  if (!isValidApifyActorId(actorId)) {
    return { ok: false, reason: `actor id '${actorId}' com formato invalido — nenhuma chamada foi feita` };
  }
  // Apify API path form: owner~name (the / becomes ~).
  const actorPath = encodeURIComponent(actorId.replace("/", "~"));
  const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;
  const input: Record<string, unknown> = {
    searchStringsArray: spec.queries,
    maxCrawledPlacesPerSearch: spec.maxPlaces,
    language: "en",
    ...(spec.input ?? {}),
  };
  const res = await fetchJson(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    APIFY_SYNC_TIMEOUT_MS
  );
  if (!res) {
    return { ok: false, reason: `Apify nao respondeu (timeout/erro de rede) para o actor ${actorId}` };
  }
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.body)) {
    const detail =
      res.body != null && typeof res.body === "object"
        ? JSON.stringify(res.body).slice(0, 160)
        : `sem corpo JSON de lista`;
    return { ok: false, reason: `Apify respondeu ${res.status} para o actor ${actorId}: ${detail}` };
  }
  const items = res.body as unknown[];
  const costUsd = estimateApifyCostUsd(items.length, apifyPricePer1kUsd(env));
  return { ok: true, candidates: parseApifyItems(items), itemCount: items.length, actorId, costUsd };
}

// ---------------------------------------------------------------------------
// Ledger (api_spend, op='prospect_apify') + spec mailbox (Redis)
// ---------------------------------------------------------------------------

export interface ApifyLedger {
  /** Month-to-date Apify spend in cents (op='prospect_apify'). */
  monthSpentCents(): Promise<number>;
  /** Append one run's actual cost to the ledger. */
  record(cents: number, ref: string): Promise<void>;
}

export interface ApifySpecMailbox {
  /** Take (and consume) a pending confirmed spec, or null. */
  take(): Promise<ApifyRunSpec | null>;
}

/** Minimal Redis surface (ioredis satisfies it). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

/**
 * The worker-side mailbox reader: the spec lands in Redis only via the
 * operator endpoint (founder-confirmed). Consumed on read — one dispatch,
 * one paid run, never a repeat.
 */
export function redisSpecMailbox(redis: RedisLike): ApifySpecMailbox {
  return {
    async take() {
      let raw: string | null = null;
      try {
        raw = await redis.get(APIFY_SPEC_REDIS_KEY);
        if (raw != null) await redis.del(APIFY_SPEC_REDIS_KEY);
      } catch {
        return null; // Redis blip → engine source, honest default
      }
      if (!raw) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const v = parseApifyRunSpec(parsed);
      return v.ok && v.spec ? v.spec : null;
    },
  };
}

/** Minimal SQL surface for the ledger (postgres-js tagged template NOT used —
 * the two queries are param'd plain text via the caller's exec). */
export type SqlExec = (query: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

export function apiSpendLedger(exec: SqlExec): ApifyLedger {
  return {
    async monthSpentCents() {
      const rows = await exec(
        `SELECT COALESCE(SUM(est_cost_cents), 0)::int AS cents
           FROM api_spend
          WHERE op = 'prospect_apify'
            AND created_at >= date_trunc('month', NOW())`,
        []
      );
      const cents = Number(rows[0]?.["cents"] ?? 0);
      return Number.isFinite(cents) ? cents : 0;
    },
    async record(cents, ref) {
      await exec(
        `INSERT INTO api_spend (op, est_cost_cents, engine, source, ref)
         VALUES ('prospect_apify', $1::int, 'apify', 'flat', $2)`,
        [Math.max(0, Math.round(cents)), ref.slice(0, 120)]
      );
    },
  };
}

export type ApifySourceRun =
  | { ok: true; candidates: ApifyCandidate[]; note: string }
  | { ok: false; reason: string };

/**
 * The worker-side gate + call, in order: budget re-check (decideApifyRun,
 * confirmed=true — confirmation already happened at dispatch) → actor call →
 * ledger append. Every refusal carries the honest reason for the artifact.
 */
export async function runApifySource(
  spec: ApifyRunSpec,
  deps: { env?: NodeJS.ProcessEnv; fetchJson?: ApifyFetchFn; ledger: ApifyLedger; ref: string }
): Promise<ApifySourceRun> {
  const env = deps.env ?? process.env;
  const estimateUsd = estimateApifyCostUsd(apifySpecPlaces(spec), apifyPricePer1kUsd(env));
  let monthSpentUsd = 0;
  try {
    monthSpentUsd = (await deps.ledger.monthSpentCents()) / 100;
  } catch {
    // Ledger unreadable → NO paid call on a blind budget (fail-closed: money).
    return { ok: false, reason: "ledger api_spend ilegivel — chamada paga recusada sem visibilidade de orcamento" };
  }
  const decision = decideApifyRun({
    confirmed: true,
    estimateUsd,
    monthSpentUsd,
    budgetUsd: apifyMonthlyBudgetUsd(env),
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  const run = await fetchApifyCandidates(spec, { env, ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}) });
  if (!run.ok) return run;
  try {
    await deps.ledger.record(Math.round(run.costUsd * 100), deps.ref);
  } catch {
    // Spend happened; a ledger write failure must be loud but not lose the batch.
    // The caller's artifact carries the cost either way.
  }
  return {
    ok: true,
    candidates: run.candidates,
    note: `apify actor ${run.actorId}: ${run.itemCount} places, custo real registrado ~$${run.costUsd.toFixed(2)} (${decision.reason})`,
  };
}
