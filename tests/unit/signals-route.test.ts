/**
 * signals route — "Where to show up" (the product half of the Signal Engine
 * integration, docs/signal-engine-integration.md §2).
 *
 * Pins the honest contract on the wire, driven through a real Hono app with a
 * fake signalEngine and a stand-in requireAuth (no network, no DB, no key):
 *  - SIGNAL_ENGINE_* unset            → { connected:false, reason:"not_configured" } 200
 *  - configured + engine ok           → normalized, bounded (≤25) card list
 *  - configured + engine ok:false     → { connected:true, opportunities:[], reason } 200
 *  - the bearer never appears in the response body
 * Plus the pure humanizer + normalizer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// shared-redis is imported transitively by ip-rate-limit; keep it inert (we
// pass an explicit memory limiter to the route anyway).
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () => null,
  getSharedRedis: () => null,
}));

// requireAuth stand-in: a fixed tenant, no JWT.
vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { userId: "u1", tenantId: "11111111-1111-1111-1111-111111111111", role: "owner", supabaseUid: "s1", isSuperAdmin: false });
    await next();
  },
}));

// Fake signalEngine: keep the real listOf, swap the client factory so
// `.opportunities()` returns whatever the test stages.
const h = vi.hoisted(() => ({ opportunities: vi.fn() }));
vi.mock("../../packages/llm/src/signal-engine", async (importActual) => {
  const actual = await importActual<typeof import("../../packages/llm/src/signal-engine")>();
  return { ...actual, signalEngine: () => ({ opportunities: h.opportunities }) };
});

import { registerSignalsRoutes } from "../../apps/api/src/routes/signals";
import { humanizeAction, normalizeOpportunities } from "../../apps/api/src/lib/signals/where-to-show-up";
import type { PostgresClient } from "../../packages/shared/src/db-client";
import type { SeOpportunity } from "../../packages/llm/src/signal-engine";

const noopDb = { async query() { return { rows: [] }; } } as unknown as PostgresClient;
const allow = async () => true;

/**
 * The app as PRODUCTION registers it — no radarEnabled override, so the P0-03
 * commercial block applies. This is what a real request meets today.
 */
function appAsShipped(): Hono {
  const app = new Hono();
  registerSignalsRoutes(app, noopDb, { limiter: allow });
  return app;
}

/**
 * The app with the radar forced on. The wire contract below (normalization,
 * the ≤25 bound, reason pass-through, and above all the bearer never leaking)
 * is still worth pinning while the feature is blocked — when the block lifts,
 * these are the guarantees it has to come back with. The override exists only
 * for that; production never passes it.
 */
function appNow(): Hono {
  const app = new Hono();
  registerSignalsRoutes(app, noopDb, { limiter: allow, radarEnabled: true });
  return app;
}

const BEARER = "se-secret-bearer-DO-NOT-LEAK-123";

beforeEach(() => {
  h.opportunities.mockReset();
  delete process.env["SIGNAL_ENGINE_URL"];
  delete process.env["SIGNAL_ENGINE_API_KEY"];
  delete process.env["SIGNAL_ENGINE_COUNTRY"];
});

// ---------------------------------------------------------------------------
// Route contract
// ---------------------------------------------------------------------------

describe("GET /api/signals/where-to-show-up — as shipped (P0-03 block on)", () => {
  it("refuses even when SIGNAL_ENGINE_* is fully configured", async () => {
    // The gate is COMMERCIAL, not operational: the intended source (Reddit) is
    // compliance_state=blocked for commercial use until there is a contract.
    // Setting the envs in an environment must therefore not be enough to serve
    // the queue — otherwise a Railway variable silently re-opens a blocked
    // feature. Still 200: this is "we do not offer this", not an error.
    process.env["SIGNAL_ENGINE_URL"] = "https://engine.example.com";
    process.env["SIGNAL_ENGINE_API_KEY"] = BEARER;
    h.opportunities.mockResolvedValue({ ok: true, data: { items: [{ keyword: "k", action: "comment_on_ranking_thread" }] }, fetchedAt: "2026-08-18T12:00:00Z" });

    const res = await appAsShipped().request("/api/signals/where-to-show-up?brandId=b1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; opportunities: unknown[]; reason: string };
    expect(body.connected).toBe(false);
    expect(body.opportunities).toEqual([]);
    expect(body.reason).toBe("unavailable");
    // And the engine is never called — no request, no spend, no data received
    // from a source we are not cleared to use commercially.
    expect(h.opportunities).not.toHaveBeenCalled();
  });
});

describe("GET /api/signals/where-to-show-up — wire contract (radar forced on)", () => {
  it("not configured → connected:false, empty, reason not_configured, 200 (never an error)", async () => {
    const res = await appNow().request("/api/signals/where-to-show-up?brandId=b1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; opportunities: unknown[]; reason: string; brandId: string };
    expect(body.connected).toBe(false);
    expect(body.opportunities).toEqual([]);
    expect(body.reason).toBe("not_configured");
    expect(body.brandId).toBe("b1");
    // The engine is never called when the envs are absent.
    expect(h.opportunities).not.toHaveBeenCalled();
  });

  it("configured + engine ok → normalized, bounded (≤25) list, connected:true", async () => {
    process.env["SIGNAL_ENGINE_URL"] = "https://engine.example.com";
    process.env["SIGNAL_ENGINE_API_KEY"] = BEARER;
    // 30 rows → capped to 25. One non-actionable row to prove sorting sinks it.
    const items: SeOpportunity[] = Array.from({ length: 30 }, (_, i) => ({
      keyword: `keyword ${i}`,
      action: "comment_on_ranking_thread",
      reason: "Reddit ranks here; a good comment is citable by AI.",
      reddit_url: `https://reddit.com/r/x/comments/${i}`,
      position: 3,
      community: "r/x",
      karma_needed: 50,
      checked_at: "2026-08-18T00:00:00Z",
    }));
    items.push({ keyword: "old keyword", action: "no_snapshot_yet" });
    h.opportunities.mockResolvedValue({ ok: true, data: { items }, fetchedAt: "2026-08-18T12:00:00Z" });

    const res = await appNow().request("/api/signals/where-to-show-up");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connected: boolean; opportunities: Array<{ actionLabel: string; cta: string | null; evidenceUrl: string | null; actionable: boolean }>;
      fetchedAt: string; source: string; reason: string | null;
    };
    expect(body.connected).toBe(true);
    expect(body.opportunities.length).toBe(25); // bounded
    expect(body.fetchedAt).toBe("2026-08-18T12:00:00Z");
    expect(body.source).toBeTruthy();
    expect(body.reason).toBeNull();
    // First card is actionable and humanized with a first-person CTA + link.
    expect(body.opportunities[0].actionable).toBe(true);
    expect(body.opportunities[0].actionLabel).toBe("Comment on the ranking thread");
    expect(body.opportunities[0].cta).toBe("Show me the thread");
    expect(body.opportunities[0].evidenceUrl).toMatch(/^https:\/\/reddit\.com/);
  });

  it("configured + engine ok:false → connected:true, empty, reason carried, fetchedAt null", async () => {
    process.env["SIGNAL_ENGINE_URL"] = "https://engine.example.com";
    process.env["SIGNAL_ENGINE_API_KEY"] = BEARER;
    h.opportunities.mockResolvedValue({ ok: false, reason: "http_503", status: 503 });

    const res = await appNow().request("/api/signals/where-to-show-up");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; opportunities: unknown[]; reason: string; fetchedAt: string | null };
    expect(body.connected).toBe(true);
    expect(body.opportunities).toEqual([]);
    expect(body.reason).toBe("http_503");
    expect(body.fetchedAt).toBeNull();
  });

  it("configured + engine ok but empty → connected:true, empty, reason 'empty'", async () => {
    process.env["SIGNAL_ENGINE_URL"] = "https://engine.example.com";
    process.env["SIGNAL_ENGINE_API_KEY"] = BEARER;
    h.opportunities.mockResolvedValue({ ok: true, data: { items: [] }, fetchedAt: "2026-08-18T12:00:00Z" });

    const res = await appNow().request("/api/signals/where-to-show-up");
    const body = (await res.json()) as { connected: boolean; opportunities: unknown[]; reason: string };
    expect(body.connected).toBe(true);
    expect(body.opportunities).toEqual([]);
    expect(body.reason).toBe("empty");
  });

  it("never leaks the bearer in the response body", async () => {
    process.env["SIGNAL_ENGINE_URL"] = "https://engine.example.com";
    process.env["SIGNAL_ENGINE_API_KEY"] = BEARER;
    h.opportunities.mockResolvedValue({
      ok: true,
      data: { items: [{ keyword: "k", action: "comment_on_ranking_thread", reddit_url: "https://reddit.com/x" }] },
      fetchedAt: "2026-08-18T12:00:00Z",
    });
    const res = await appNow().request("/api/signals/where-to-show-up");
    const text = await res.text();
    expect(text).not.toContain(BEARER);
  });
});

// ---------------------------------------------------------------------------
// Pure humanizer
// ---------------------------------------------------------------------------

describe("humanizeAction", () => {
  it("maps each known action to a label + first-person CTA + actionability", () => {
    expect(humanizeAction("comment_on_ranking_thread")).toEqual({ label: "Comment on the ranking thread", cta: "Show me the thread", actionable: true });
    expect(humanizeAction("publish_own_community").actionable).toBe(true);
    expect(humanizeAction("publish_own_contest").actionable).toBe(true);
    expect(humanizeAction("defend_position").cta).toBe("Show me the thread");
    expect(humanizeAction("already_covered")).toEqual({ label: "Already covered", cta: null, actionable: false });
    expect(humanizeAction("no_snapshot_yet")).toEqual({ label: "No snapshot yet", cta: null, actionable: false });
  });

  it("falls back to a neutral, non-fabricated label for unknown/absent actions", () => {
    expect(humanizeAction(undefined)).toEqual({ label: "Opportunity", cta: null, actionable: false });
    expect(humanizeAction("something_new")).toEqual({ label: "Opportunity", cta: null, actionable: false });
  });

  it("no CTA carries an em-dash (house rule)", () => {
    for (const a of ["comment_on_ranking_thread", "publish_own_community", "defend_position"]) {
      expect(humanizeAction(a).cta ?? "").not.toContain("—");
    }
  });
});

// ---------------------------------------------------------------------------
// Pure normalizer
// ---------------------------------------------------------------------------

describe("normalizeOpportunities", () => {
  it("drops rows with neither keyword nor action, keeps the rest", () => {
    const raw: SeOpportunity[] = [
      { keyword: "a", action: "comment_on_ranking_thread" },
      {}, // meaningless → dropped
      { action: "defend_position" },
    ];
    const out = normalizeOpportunities(raw);
    expect(out.length).toBe(2);
  });

  it("sorts actionable first, then by best position, then by lowest karma", () => {
    const raw: SeOpportunity[] = [
      { keyword: "covered", action: "already_covered" },
      { keyword: "far", action: "defend_position", position: 9 },
      { keyword: "near", action: "comment_on_ranking_thread", position: 2 },
    ];
    const out = normalizeOpportunities(raw);
    expect(out.map((c) => c.keyword)).toEqual(["near", "far", "covered"]);
  });

  it("caps at 25 and only keeps http(s) evidence URLs", () => {
    const raw: SeOpportunity[] = Array.from({ length: 40 }, (_, i) => ({ keyword: `k${i}`, action: "comment_on_ranking_thread", position: 1 }));
    raw[0].reddit_url = "not-a-url";
    raw[1].reddit_url = "https://reddit.com/ok";
    const out = normalizeOpportunities(raw);
    expect(out.length).toBe(25);
    const bad = out.find((c) => c.keyword === "k0");
    const good = out.find((c) => c.keyword === "k1");
    expect(bad?.evidenceUrl).toBeNull();
    expect(good?.evidenceUrl).toBe("https://reddit.com/ok");
  });

  it("uses the default source only when the row carries none", () => {
    const raw: SeOpportunity[] = [
      { keyword: "a", action: "comment_on_ranking_thread" },
      { keyword: "b", action: "comment_on_ranking_thread", source: "Reddit, official API" } as SeOpportunity,
    ];
    const out = normalizeOpportunities(raw, { defaultSource: "DEFAULT" });
    expect(out.find((c) => c.keyword === "a")?.source).toBe("DEFAULT");
    expect(out.find((c) => c.keyword === "b")?.source).toBe("Reddit, official API");
  });
});
