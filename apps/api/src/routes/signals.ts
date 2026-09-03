/**
 * signals.ts — the product-facing half of the Signal Engine integration
 * (docs/signal-engine-integration.md §2, Camada 2: "Where to show up").
 *
 * The content-graph half already ships in the worker (#485, graph-tick reads
 * [__signals__] for the Ozvor tenant). THIS route surfaces the same "where to
 * act" queue to the signed-in client, per brand, as action cards.
 *
 *   GET /api/signals/where-to-show-up?brandId=... (requireAuth)
 *
 * Honesty is the whole point (memory rule "'Mergeado' não é produção"):
 *  - SIGNAL_ENGINE_URL / _API_KEY unset → { connected:false, opportunities:[],
 *    reason:"not_configured" } at 200. Not an error: the radar simply is not
 *    switched on yet. The tab renders the honest not-connected state.
 *  - Configured but the engine says ok:false → { connected:true,
 *    opportunities:[], reason:<r>, fetchedAt:null } at 200. We never invent a
 *    queue when the upstream is down.
 *  - Configured + ok → the normalized, bounded (≤25) card list with the
 *    fetchedAt timestamp and the source label.
 *
 * The bearer NEVER leaves this process: env → signalEngine cfg → out. The
 * response echoes no config. Read-only, so a light per-tenant rate limit is the
 * only guard (the shared ZSET limiter; failure falls back to memory, #261).
 */

import type { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { requireAuth } from "../auth/middleware";
import { sharedIpRateLimiter, type IpRateLimiter } from "../lib/ip-rate-limit";
import { signalEngine, listOf, type SeOpportunity } from "../../../../packages/llm/src/signal-engine";
import {
  normalizeOpportunities,
  type WhereToShowUpCard,
} from "../lib/signals/where-to-show-up";

// Read-only + cheap, but not free: cap per tenant so a hot loop cannot fan out
// to the Signal Engine. 60/hour is far above any human's use of the tab.
const WHERE_LIMIT = 60;
const HOUR_MS = 60 * 60 * 1000;

// The honest default provenance line when the engine does not stamp one itself.
const DEFAULT_SOURCE = "Reddit (official API) + SERP (DataForSEO)";

interface WhereResponse {
  connected: boolean;
  opportunities: WhereToShowUpCard[];
  reason: string | null;
  fetchedAt: string | null;
  source: string | null;
  brandId: string | null;
}

/**
 * P0-03 — the Opportunity Radar is OFF.
 *
 * Not an env flag: the block is commercial, not operational. The web app holds
 * the mirror of this constant in apps/web/src/lib/feature-flags.ts, with the
 * full reasoning. Both must be flipped together, and only once the source is
 * cleared for commercial use AND this route has a real entitlement check (it
 * has none today — requireAuth + a rate limit is the whole gate).
 */
export const OPPORTUNITY_RADAR_ENABLED = false;

export function registerSignalsRoutes(
  app: Hono,
  _db: PostgresClient,
  opts: { limiter?: IpRateLimiter } = {}
): void {
  const limiter = opts.limiter ?? sharedIpRateLimiter;

  // GET /api/signals/where-to-show-up — the brand's live opportunity radar.
  app.get("/api/signals/where-to-show-up", requireAuth, async (c) => {
    const auth = c.get("auth");
    // brandId is carried through for the future per-brand tenant mapping
    // (provider_keys). Today the queue comes from the single configured Ozvor
    // Signal Engine tenant, so brandId only scopes the view, never the bearer.
    const brandId = (c.req.query("brandId") ?? "").trim().slice(0, 64) || null;

    // Light per-tenant guard. Never throws (memory fallback inside).
    const allowed = await limiter(`signals_wtsu:${auth.tenantId}`, WHERE_LIMIT, HOUR_MS);
    if (!allowed) {
      return c.json(
        { message: "Too many requests. Try again in a moment.", code: "RATE_LIMITED" },
        429
      );
    }

    // P0-03 — commercial block, checked BEFORE the env. The intended source is
    // the Signal Engine's Reddit module, which the 03/09/2026 audit puts at
    // compliance_state=blocked for commercial use until there is a direct Reddit
    // contract or a licensed vendor reviewed by counsel. Setting SIGNAL_ENGINE_*
    // in an environment must therefore NOT be enough to serve this queue: the
    // env is a deployment detail, the block is a legal one. Lifting it is a
    // reviewed decision that has to happen here, in the diff, alongside the
    // entitlement check this route still does not have.
    if (!OPPORTUNITY_RADAR_ENABLED) {
      const body: WhereResponse = {
        connected: false,
        opportunities: [],
        reason: "unavailable",
        fetchedAt: null,
        source: null,
        brandId,
      };
      return c.json(body);
    }

    const url = process.env["SIGNAL_ENGINE_URL"]?.trim() ?? "";
    const apiKey = process.env["SIGNAL_ENGINE_API_KEY"]?.trim() ?? "";
    const country = process.env["SIGNAL_ENGINE_COUNTRY"]?.trim() ?? "";

    // Not wired yet → honest "off", never an error, never a fabricated queue.
    if (!url || !apiKey) {
      const body: WhereResponse = {
        connected: false,
        opportunities: [],
        reason: "not_configured",
        fetchedAt: null,
        source: null,
        brandId,
      };
      return c.json(body);
    }

    // Configured. Read the "where to act" queue (the bearer stays here).
    const se = signalEngine({ baseUrl: url, apiKey });
    const r = await se.opportunities(country || undefined);
    if (!r.ok) {
      // Upstream down / auth / timeout: connected, but no data this tick. We log
      // the reason (never the key) and show the honest connected-but-empty state.
      logger.warn("signals_where_to_show_up_unavailable", {
        tenant_id: auth.tenantId,
        reason: r.reason,
        status: r.status ?? null,
      });
      const body: WhereResponse = {
        connected: true,
        opportunities: [],
        reason: r.reason,
        fetchedAt: null,
        source: null,
        brandId,
      };
      return c.json(body);
    }

    const opps = listOf<SeOpportunity>(r.data, "items", "opportunities");
    const opportunities = normalizeOpportunities(opps, { defaultSource: DEFAULT_SOURCE });
    const body: WhereResponse = {
      connected: true,
      opportunities,
      reason: opportunities.length === 0 ? "empty" : null,
      fetchedAt: r.fetchedAt,
      source: DEFAULT_SOURCE,
      brandId,
    };
    return c.json(body);
  });
}
