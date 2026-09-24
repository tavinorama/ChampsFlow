/**
 * hermes-health.ts — B10 (Codex D02, 23/09). What each Hermes engine is
 * doing, by cause, and one alarm per window for whoever hits the fallback.
 *
 * What happened. From 21/09 the Claude OAuth session on the VPS was expired
 * and Codex timed out at 220 s; Kimi carried every graph step and every
 * follow-up. The graph tick shouted once per 6 h; the follow-up scan only
 * logged (72 `followup_intent_engines_down` in two days, no message). The
 * operator health endpoint said "live: true" for every engine because the
 * API key was PRESENT — presence is not health. Nobody could answer "which
 * engine is down, why, since when" without reading logs.
 *
 * This module is pure (a store interface, a clock) so worker and API share
 * one vocabulary: the worker records outcomes and alarms; the API reads.
 */

export type EngineFailureCause = "auth" | "timeout" | "quota" | "unreachable" | "unknown";

/** The cause, from the error text Hermes or the transport gave back. */
export function classifyEngineError(error: string): EngineFailureCause {
  const e = (error || "").toLowerCase();
  if (/oauth|authenticat|unauthori[sz]ed|\b401\b|login required|session expired/.test(e)) return "auth";
  if (/timeout|timed out|etimedout|aborted/.test(e)) return "timeout";
  if (/credit|balance|quota|rate limit|too many requests|\b402\b|\b429\b|insufficient/.test(e)) return "quota";
  if (/econnrefused|econnreset|enotfound|\b502\b|\b503\b|\b504\b|http_5|unreachable|socket hang up/.test(e)) return "unreachable";
  return "unknown";
}

/** What a human does about it. Written for the Telegram line. */
export function fixHintFor(cause: EngineFailureCause): string {
  switch (cause) {
    case "auth":
      return "re-autentique na VPS (ex.: `claude login`)";
    case "timeout":
      return "o engine está lento ou a VPS está presa: veja a fila do Hermes";
    case "quota":
      return "saldo ou limite do fornecedor: veja a conta";
    case "unreachable":
      return "o Hermes/VPS não responde: veja o serviço e a rede";
    default:
      return "veja o log do worker (hermes_engine_fallback)";
  }
}

// ---------------------------------------------------------------------------
// Per-engine health record
// ---------------------------------------------------------------------------

export interface EngineHealthEntry {
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastCause: EngineFailureCause | null;
  /** Short, redacted error head. */
  lastError: string | null;
}

export interface HealthStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
}

export const ENGINE_HEALTH_TTL_S = 7 * 24 * 3600;
export const engineHealthKey = (engine: string): string => `hermes:engine:${engine.toLowerCase()}:health`;

export interface FallbackOutcome {
  ok: boolean;
  engineUsed: string | null;
  failures: ReadonlyArray<{ engine: string; error: string }>;
}

async function readEntry(store: HealthStore, engine: string): Promise<EngineHealthEntry> {
  const empty: EngineHealthEntry = { lastOkAt: null, lastFailAt: null, lastCause: null, lastError: null };
  try {
    const raw = await store.get(engineHealthKey(engine));
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<EngineHealthEntry>;
    return {
      lastOkAt: typeof p.lastOkAt === "string" ? p.lastOkAt : null,
      lastFailAt: typeof p.lastFailAt === "string" ? p.lastFailAt : null,
      lastCause: (p.lastCause as EngineFailureCause | undefined) ?? null,
      lastError: typeof p.lastError === "string" ? p.lastError : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Record one fallback outcome: every failed engine gets a fail stamp with its
 * cause; the engine that answered gets an ok stamp. Fail-open: a store error
 * never affects the caller.
 */
export async function recordEngineHealth(store: HealthStore, res: FallbackOutcome, now: Date = new Date()): Promise<void> {
  const at = now.toISOString();
  try {
    for (const f of res.failures) {
      const cur = await readEntry(store, f.engine);
      const next: EngineHealthEntry = {
        ...cur,
        lastFailAt: at,
        lastCause: classifyEngineError(f.error),
        lastError: head(f.error, 120),
      };
      await store.set(engineHealthKey(f.engine), JSON.stringify(next), "EX", ENGINE_HEALTH_TTL_S);
    }
    if (res.ok && res.engineUsed) {
      const cur = await readEntry(store, res.engineUsed);
      await store.set(engineHealthKey(res.engineUsed), JSON.stringify({ ...cur, lastOkAt: at }), "EX", ENGINE_HEALTH_TTL_S);
    }
  } catch {
    /* fail-open by contract */
  }
}

export type EngineHealthStatus = "healthy" | "failing" | "unknown";

export interface EngineHealthSummary {
  engine: string;
  status: EngineHealthStatus;
  cause: EngineFailureCause | null;
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastError: string | null;
  fix: string | null;
}

/** healthy = last success is newer than the last failure; failing = the reverse; unknown = nothing recorded. */
export function summarizeEngineHealth(engine: string, entry: EngineHealthEntry | null): EngineHealthSummary {
  const e = entry ?? { lastOkAt: null, lastFailAt: null, lastCause: null, lastError: null };
  let status: EngineHealthStatus = "unknown";
  if (e.lastOkAt && (!e.lastFailAt || e.lastOkAt > e.lastFailAt)) status = "healthy";
  else if (e.lastFailAt) status = "failing";
  return {
    engine,
    status,
    cause: status === "failing" ? e.lastCause : null,
    lastOkAt: e.lastOkAt,
    lastFailAt: e.lastFailAt,
    lastError: status === "failing" ? e.lastError : null,
    fix: status === "failing" && e.lastCause ? fixHintFor(e.lastCause) : null,
  };
}

export async function readEngineHealth(store: HealthStore, engines: readonly string[]): Promise<EngineHealthSummary[]> {
  const out: EngineHealthSummary[] = [];
  for (const engine of engines) out.push(summarizeEngineHealth(engine, await readEntry(store, engine)));
  return out;
}

// ---------------------------------------------------------------------------
// One alarm per window, shared by every caller of the fallback chain
// ---------------------------------------------------------------------------

export const HERMES_PRIMARY_DOWN_KEY = "hermes:primary_down_alarm";
export const HERMES_ALL_DOWN_KEY = "hermes:all_down_alarm";
export const HERMES_ALARM_WINDOW_S = 6 * 3600;

/** Short, redacted error head: no key-shaped strings, no bearer tokens. */
const head = (s: string, n = 80): string =>
  (s || "no output")
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .slice(0, n);

/** The Telegram line: which engine, why, what to do, who noticed. */
export function fallbackAlarmText(res: FallbackOutcome, source: string): string {
  const primary = res.failures[0]!;
  const cause = classifyEngineError(primary.error);
  if (res.ok) {
    return `🟡 HERMES (${source}): engine "${primary.engine}" falhou — causa: ${cause} (${head(primary.error)}). Rodando em fallback "${res.engineUsed}". Para voltar ao primário: ${fixHintFor(cause)}. Este aviso repete a cada 6h enquanto durar.`;
  }
  return `🔴 HERMES (${source}): TODOS os engines falharam (${res.failures.map((f) => `${f.engine}: ${classifyEngineError(f.error)}`).join(", ")}). Último erro: ${head(primary.error)}. Nenhum passo de LLM avança até um engine voltar. ${fixHintFor(cause)}.`;
}

/**
 * Shout once per window (per key), never per step, never silently. `onceKey`
 * is the caller's Redis SET NX; returning true when Redis is absent is the
 * right failure mode (a duplicate alarm beats silence).
 */
export async function alarmOnFallback(input: {
  res: FallbackOutcome;
  source: string;
  onceKey: (key: string, ttlSeconds: number) => Promise<boolean>;
  telegram: (text: string) => Promise<void>;
}): Promise<{ alarmed: boolean }> {
  if (input.res.failures.length === 0) return { alarmed: false };
  const key = input.res.ok ? HERMES_PRIMARY_DOWN_KEY : HERMES_ALL_DOWN_KEY;
  let first = true;
  try {
    first = await input.onceKey(key, HERMES_ALARM_WINDOW_S);
  } catch {
    first = true;
  }
  if (!first) return { alarmed: false };
  await input.telegram(fallbackAlarmText(input.res, input.source));
  return { alarmed: true };
}
