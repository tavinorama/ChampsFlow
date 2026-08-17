/**
 * signal-engine.ts — the TS client for the founder's Signal Engine
 * (reddit-signal-infrastructure: FastAPI on Railway, multi-tenant, API key
 * per tenant). See docs/signal-engine-integration.md.
 *
 * What it gives Ozvor: REAL conversations + a "where to act" queue for
 * SEO/GEO/PPC (Reddit today; Meta/Google/TikTok ad libraries as their
 * collectors land). Two consumers: our own content graphs (signal nodes,
 * sphere-ppc, the future sphere-reddit) and the product's "Where to show up"
 * tab (per-brand tenant → opportunities → action cards → measured result).
 *
 * Contract, house rules applied:
 *  - FAIL-OPEN, HONEST: any transport/schema problem returns { ok:false,
 *    reason } — the caller renders "SEM SINAL EXTERNO" / "sem dado", never
 *    invents. No throws to callers.
 *  - Bounded: 15s timeout per call, response bodies capped when rendered.
 *  - Never logs the bearer. Never stores the key here (callers pass it).
 *  - Pure enough to test with a fake fetch.
 *
 * Endpoints (verified in the repo, commit 058ae35):
 *   GET /health · GET /me · GET /me/opportunities · GET /me/ads ·
 *   GET /me/google-visibility · GET /me/threads · GET /me/evolution ·
 *   GET /tenants/{id}/action-queue · /insights · /ai-citations · /kpis ·
 *   /content-ledger · PATCH /action-items/{id} · POST /tenants (provisioning).
 */

export interface SignalEngineConfig {
  baseUrl: string; // e.g. https://<app>.up.railway.app
  apiKey: string; // tenant bearer
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type SeResult<T> = { ok: true; data: T; fetchedAt: string } | { ok: false; reason: string; status?: number };

/** One row of the "where to act" queue (opportunities.py). Fields we rely on
 * are optional on purpose: the engine evolves; we render what exists. */
export interface SeOpportunity {
  keyword?: string;
  action?: string; // publish_own_community | publish_own_contest | comment_on_ranking_thread | defend_position | already_covered | no_snapshot_yet
  reason?: string;
  reddit_url?: string | null;
  position?: number | null;
  community?: string | null;
  karma_needed?: number | null;
  checked_at?: string | null;
  [k: string]: unknown;
}

export interface SeActionItem {
  id?: string;
  score?: number;
  type?: string;
  title?: string;
  reason?: string;
  evidence_url?: string | null;
  status?: string;
  [k: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function seGet<T>(cfg: SignalEngineConfig, path: string): Promise<SeResult<T>> {
  const f = cfg.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await f(`${trimSlash(cfg.baseUrl)}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, status: res.status };
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid_json", status: res.status };
    }
    return { ok: true, data: json as T, fetchedAt: new Date().toISOString() };
  } catch (err) {
    const name = (err as Error)?.name ?? "";
    return { ok: false, reason: name === "AbortError" ? "timeout" : `transport:${(err as Error)?.message?.slice(0, 80) ?? "unknown"}` };
  } finally {
    clearTimeout(t);
  }
}

export function signalEngine(cfg: SignalEngineConfig) {
  return {
    health: () => seGet<{ ok?: boolean; status?: string }>(cfg, "/health"),
    me: () => seGet<Record<string, unknown>>(cfg, "/me"),
    /** The "where to act" queue for the tenant's tracked keywords. */
    opportunities: (country?: string) =>
      seGet<{ items?: SeOpportunity[]; opportunities?: SeOpportunity[]; [k: string]: unknown }>(
        cfg,
        `/me/opportunities${country ? `?country=${encodeURIComponent(country)}` : ""}`
      ),
    /** Competitors' ads (Reddit Ad Library today; Meta/Google when collectors land). */
    ads: () => seGet<{ items?: unknown[]; ads?: unknown[]; [k: string]: unknown }>(cfg, "/me/ads"),
    googleVisibility: () => seGet<Record<string, unknown>>(cfg, "/me/google-visibility"),
    threads: () => seGet<Record<string, unknown>>(cfg, "/me/threads"),
    actionQueue: (tenantId: string) =>
      seGet<{ items?: SeActionItem[]; [k: string]: unknown }>(cfg, `/tenants/${encodeURIComponent(tenantId)}/action-queue`),
    aiCitations: (tenantId: string) => seGet<Record<string, unknown>>(cfg, `/tenants/${encodeURIComponent(tenantId)}/ai-citations`),
    kpis: (tenantId: string) => seGet<Record<string, unknown>>(cfg, `/tenants/${encodeURIComponent(tenantId)}/kpis`),
    insights: (tenantId: string) => seGet<{ items?: unknown[]; [k: string]: unknown }>(cfg, `/tenants/${encodeURIComponent(tenantId)}/insights`),
  };
}

/** Normalize the two shapes the engine may use for list payloads. */
export function listOf<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/**
 * Render the queue as the [__signals__] block a content briefing can use —
 * bounded, evidence-first, honest when empty. Pure.
 */
export function signalsBlock(opps: SeOpportunity[], opts?: { max?: number; fetchedAt?: string; source?: string }): string {
  const max = opts?.max ?? 8;
  const src = opts?.source ?? "Signal Engine (Reddit via API oficial + SERP DataForSEO)";
  if (opps.length === 0) return `SINAIS EXTERNOS: SEM DADO (${src}). Nao invente conversas; use so o que estiver em [memory].`;
  const lines = [`SINAIS EXTERNOS REAIS (${src}${opts?.fetchedAt ? `, ${opts.fetchedAt.slice(0, 16)}` : ""}). Cada linha tem evidencia; cite a URL quando usar:`];
  for (const o of opps.slice(0, max)) {
    const bits = [
      o.keyword ? `kw="${o.keyword}"` : null,
      o.action ? `acao=${o.action}` : null,
      o.position != null ? `pos=${o.position}` : null,
      o.community ? `sub=${o.community}` : null,
      o.karma_needed != null ? `karma=${o.karma_needed}` : null,
      o.reddit_url ? `url=${o.reddit_url}` : null,
      o.reason ? `porque: ${String(o.reason).slice(0, 140)}` : null,
    ].filter(Boolean);
    lines.push(`- ${bits.join(" · ")}`);
  }
  if (opps.length > max) lines.push(`(+${opps.length - max} outras)`);
  return lines.join("\n");
}
