/**
 * landing.ts — Ozvor Pages: sites, pages, versions, testimonials (issue #208, PR-3)
 *
 * Authenticated CRUD for the 5-page website builder. Public rendering of
 * published pages (`/l/[slug]`) is PR-6 — nothing here is public.
 *
 * Entitlement model (founder decisions in #208):
 *   allowance = PLAN_LIMITS[plan_tier].max_landing_sites            (free 0 / growth 1 / agency 25)
 *             + tenants.extra_landing_sites                          ($99 one-time credits, PR-2)
 *   Every write re-checks the plan SERVER-SIDE — the dashboard UI is a
 *   storefront, the API is the bouncer. A standalone buyer stays plan_tier
 *   'free' with a credit; paid features beyond the builder keep 403ing.
 *
 * Access rules:
 *   - all routes requireAuth (tenant from JWT app_metadata only)
 *   - writes requireRole(['owner','editor']); site DELETE is owner-only
 *   - viewers can read everything, mutate nothing (role middleware)
 *   - RLS backstop: db.setTenantId + explicit tenant_id filters (audits.ts pattern)
 *
 * Versioning: PATCHing a page's sections/seo snapshots the PREVIOUS state to
 * landing_page_versions (saved_by 'user'), capped at VERSION_CAP with pruning.
 * Restore snapshots current state first, so a restore is itself undoable.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { requireAuth, requireRole } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { PLAN_LIMITS, type PlanTier } from "../integrations/stripe";
import { getSharedRedis } from "../shared-redis";
import { resolvePlace, googlePlacesConfigured, PlacesError } from "../lib/google-places";
// computeLandingAllowance lives in a Hono-free module so the WORKER can import
// it without dragging this route file (and `hono`) into its build. Re-exported
// here for existing importers/tests.
import { computeLandingAllowance } from "../lib/landing-allowance";
export { computeLandingAllowance };

const VERSION_CAP = 20;

export const PAGE_TYPES = new Set([
  "home",
  "service_city",
  "service",
  "area",
  "faq",
  "proof",
  "campaign",
]);

// Slugs that would shadow real routes or confuse users if a site claimed them.
export const RESERVED_SITE_SLUGS = new Set([
  "admin", "api", "app", "assets", "blog", "dashboard", "kit", "l", "legal",
  "login", "ozvor", "pricing", "privacy", "results", "static", "terms",
  "test", "www",
]);

const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const PAGE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
// Google Place IDs are alphanumeric + '-'/'_', no fixed length in the spec —
// this is a shape guard on CLIENT input, not a Google-format validator.
const PLACE_ID_INPUT_RE = /^[A-Za-z0-9_-]{1,255}$/;
const MAX_MAPS_URL_LEN = 2000;

// ---------------------------------------------------------------------------
// slugify — deterministic, ASCII-only, matches the DB CHECK constraints.
// Exported for unit testing.
// ---------------------------------------------------------------------------
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// validateSiteSlug — shape + reserved words. Returns an error message or null.
// Exported for unit testing.
// ---------------------------------------------------------------------------
export function validateSiteSlug(slug: string): string | null {
  // Reserved first — "api" or "l" should say "reserved", not "bad shape".
  if (RESERVED_SITE_SLUGS.has(slug)) {
    return "That slug is reserved. Pick another.";
  }
  if (!SITE_SLUG_RE.test(slug)) {
    return "Slug must be 3–64 chars: lowercase letters, digits and hyphens (no leading/trailing hyphen).";
  }
  return null;
}

// ---------------------------------------------------------------------------
// landingAllowanceFor — plan base + purchased credits ( #208 entitlement).
// The pure math (computeLandingAllowance) now lives in ../lib/landing-allowance
// (imported + re-exported above) so the worker can share it Hono-free.
// ---------------------------------------------------------------------------
async function landingAllowanceFor(
  db: PostgresClient,
  tenantId: string,
  isSuperAdmin: boolean
): Promise<{ maxSites: number; maxPagesPerSite: number }> {
  if (isSuperAdmin) {
    // Platform-operator bypass (same rationale as planLimitsFor in audits.ts).
    return { maxSites: Number.MAX_SAFE_INTEGER, maxPagesPerSite: Number.MAX_SAFE_INTEGER };
  }
  const res = await db.query<{ plan_tier: string | null; extra_landing_sites: number | null }>(
    `SELECT plan_tier, extra_landing_sites FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tier = (res.rows[0]?.plan_tier ?? "free") as PlanTier;
  return computeLandingAllowance(tier, res.rows[0]?.extra_landing_sites ?? 0);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ---------------------------------------------------------------------------
// containsPlaceholder — publish guard (Hermes review requirement, #208 PR-5).
// Generated FAQ answers that couldn't be grounded in real input facts are
// written verbatim as `[PLACEHOLDER: ...]` (packages/llm/src/landing-generate.ts
// faqFromGap) rather than fabricated — same audit-integrity rule as GEO-A2.
// A page (or a whole site) must never go live carrying one of those markers.
// Pure/exported for unit testing.
// ---------------------------------------------------------------------------
const PLACEHOLDER_MARKER = "[PLACEHOLDER:";

export function containsPlaceholder(sections: unknown): boolean {
  try {
    return JSON.stringify(sections ?? []).includes(PLACEHOLDER_MARKER);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// sectionsEmpty — the "never publish an empty/ungenerated site" guard (Ozvor
// Pages end-to-end delivery). A site that was never generated still has the
// stub home page POST /api/landing/sites seeds with `sections` = '[]'. Flipping
// such a site to 'published' used to succeed, yet the public /l/[slug] route
// requires a PUBLISHED page WITH content, so the visitor got a 404 — the
// confidence-destroying "I published but nothing is visible" dead end. This
// guard (paired with containsPlaceholder) makes the publish route reject a site
// that has no real content yet. A page is "empty" when `sections` is absent,
// not a JSON array, or a zero-length array. Pure/exported for unit testing.
// ---------------------------------------------------------------------------

export function sectionsEmpty(sections: unknown): boolean {
  return !Array.isArray(sections) || sections.length === 0;
}

// ---------------------------------------------------------------------------
// Pages regeneration quota (issue #217) — usage_counters-backed. INITIAL
// generation (a site with no generated content yet) is always free; a
// REGENERATION is quota-checked: free tenants regenerate against a LIFETIME
// credit (the $99 site), growth/agency against a per-site MONTHLY quota from
// PLAN_LIMITS. Exported for unit testing.
// ---------------------------------------------------------------------------

/** Feature key for the usage_counters ledger (Ozvor Pages regenerations). */
export const PAGES_REGEN_FEATURE = "pages_regeneration";

/** Sentinel period_start for LIFETIME quotas (free tier's $99-credit site). */
export const LIFETIME_PERIOD_START = "1970-01-01";

/** Free tenants regenerate against a lifetime credit, not a monthly quota —
 * PLAN_LIMITS.free.pages_regens_per_site_month is deliberately 0/unused; the
 * free-tier allowance is this constant instead (founder decision, #217). */
const FREE_LIFETIME_PAGES_REGEN_QUOTA = 2;

export function pagesRegenQuotaFor(
  planTier: PlanTier
): { scope: "lifetime" | "monthly"; quota: number } {
  if (planTier === "free") {
    return { scope: "lifetime", quota: FREE_LIFETIME_PAGES_REGEN_QUOTA };
  }
  const limits = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;
  return { scope: "monthly", quota: limits.pages_regens_per_site_month };
}

/**
 * Pure gate: should this /generate call be checked against the regeneration
 * quota at all? `contentPageCount` is the number of this site's pages that
 * already carry generated content (sections <> '[]') — 0 means this is the
 * FREE initial generation. super_admin always bypasses. Exported so the
 * decision is unit-testable without a DB or Redis.
 */
export function shouldEnforcePagesRegenQuota(
  contentPageCount: number,
  isSuperAdmin: boolean
): boolean {
  const isInitialGeneration = contentPageCount === 0;
  return !isInitialGeneration && !isSuperAdmin;
}

/**
 * DATE-shaped bucket key for usage_counters.period_start. `monthly` uses the
 * UTC calendar month (documented in the 429 message: "resets on the 1st,
 * UTC" — the DB column is DATE, no per-tenant timezone). `now` is injectable
 * for tests.
 */
export function pagesRegenPeriodStart(
  scope: "lifetime" | "monthly",
  now: Date = new Date()
): string {
  if (scope === "lifetime") return LIFETIME_PERIOD_START;
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Atomically increments a usage_counters row and returns the NEW count —
 * INSERT ... ON CONFLICT DO UPDATE, no read-then-write race (issue #217).
 */
export async function incrementUsageCounter(
  db: PostgresClient,
  tenantId: string,
  feature: string,
  subjectId: string,
  periodStart: string
): Promise<number> {
  const res = await db.query<{ count: number }>(
    `INSERT INTO usage_counters (tenant_id, feature, subject_id, period_start, count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (tenant_id, feature, subject_id, period_start)
     DO UPDATE SET count = usage_counters.count + 1
     RETURNING count`,
    [tenantId, feature, subjectId, periodStart]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/**
 * Refunds a single unit — called when incrementUsageCounter's RETURNING count
 * exceeds quota, so a DENIED attempt never burns the tenant's allowance.
 */
export async function decrementUsageCounter(
  db: PostgresClient,
  tenantId: string,
  feature: string,
  subjectId: string,
  periodStart: string
): Promise<void> {
  await db.query(
    `UPDATE usage_counters
        SET count = count - 1
      WHERE tenant_id = $1 AND feature = $2 AND subject_id = $3 AND period_start = $4`,
    [tenantId, feature, subjectId, periodStart]
  );
}

async function siteOwnedByTenant(
  db: PostgresClient,
  tenantId: string,
  siteId: string
): Promise<boolean> {
  const res = await db.query<{ id: string }>(
    `SELECT id FROM landing_sites WHERE id = $1 AND tenant_id = $2`,
    [siteId, tenantId]
  );
  return !!res.rows[0];
}

// ---------------------------------------------------------------------------
// writeLandingAuditLog — append-only publish/unpublish trail (PR-6 addition,
// #208 issue). Same pattern as agency.ts' writeAuditLog / billing.ts'
// writeBillingAuditLog. Never blocks the caller's response — logs and
// swallows on failure. No PII in metadata (site/page ids only).
// ---------------------------------------------------------------------------

async function writeLandingAuditLog(
  db: PostgresClient,
  eventType:
    | "landing_site_published"
    | "landing_site_unpublished"
    | "landing_page_published"
    | "landing_page_unpublished",
  actorUserId: string,
  tenantId: string,
  targetEntity: "landing_site" | "landing_page",
  targetId: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log
         (id, tenant_id, actor_user_id, event_type, target_entity, target_id, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '{}'::jsonb, NOW())`,
      [tenantId, actorUserId, eventType, targetEntity, targetId]
    );
  } catch (err) {
    logger.error("landing_audit_log_write_failed", {
      event_type: eventType,
      message: (err as Error).message?.slice(0, 160),
    });
  }
}

// ---------------------------------------------------------------------------
// Generator job queue (BullMQ) — same Redis connection convention as
// audits.ts' getAuditQueue / schedules.ts.
// ---------------------------------------------------------------------------

let _landingGenerateQueue: Queue | null = null;
let _landingGenerateIoRedis: IORedis | null = null;

function getLandingGenerateQueue(): Queue {
  if (_landingGenerateQueue) return _landingGenerateQueue;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  _landingGenerateIoRedis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  _landingGenerateIoRedis.on("error", (err: Error) => {
    logger.error("landing_generate_queue_redis_connection_error", { message: err.message });
  });
  _landingGenerateQueue = new Queue("landing-generate", {
    connection: _landingGenerateIoRedis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 2000 },
    },
  });
  return _landingGenerateQueue;
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit for the generator trigger (10/hour) — Redis fixed
// window, same INCR + EXPIRE pattern as billing.ts' checkBillingRateLimit.
// ---------------------------------------------------------------------------

async function checkLandingGenerateRateLimit(tenantId: string): Promise<boolean> {
  const redis = getSharedRedis();
  const key = `landing:rl:generate:${tenantId}`;
  const limit = 10;
  const windowSeconds = 3600;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return current <= limit;
}

// ---------------------------------------------------------------------------
// Per-tenant rate limit for the Places resolve lookup (10/hour) — same
// fixed-window INCR+EXPIRE pattern as checkLandingGenerateRateLimit above
// (issue #208 PR-9). Google's own console-side caps (20/min details+search)
// protect against burst abuse; this bounds sustained per-tenant usage.
// ---------------------------------------------------------------------------

async function checkPlacesResolveRateLimit(tenantId: string): Promise<boolean> {
  const redis = getSharedRedis();
  const key = `landing:rl:places-resolve:${tenantId}`;
  const limit = 10;
  const windowSeconds = 3600;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return current <= limit;
}

export function registerLandingRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/landing/allowance — what can this tenant build? (drives the UI)
  // -------------------------------------------------------------------------
  app.get("/api/landing/allowance", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const allowance = await landingAllowanceFor(db, auth.tenantId, auth.isSuperAdmin);
    const count = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM landing_sites WHERE tenant_id = $1`,
      [auth.tenantId]
    );
    const used = parseInt(count.rows[0]?.count ?? "0", 10);
    return c.json({
      max_sites: allowance.maxSites >= Number.MAX_SAFE_INTEGER ? null : allowance.maxSites,
      max_pages_per_site:
        allowance.maxPagesPerSite >= Number.MAX_SAFE_INTEGER ? null : allowance.maxPagesPerSite,
      sites_used: used,
      can_create: used < allowance.maxSites,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/landing/sites — list this tenant's sites
  // -------------------------------------------------------------------------
  app.get("/api/landing/sites", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    const res = await db.query<{
      id: string;
      slug: string;
      status: string;
      business: unknown;
      created_at: string;
      updated_at: string;
      page_count: string;
      open_fixes: string;
    }>(
      `SELECT s.id, s.slug, s.status, s.business, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM landing_pages p WHERE p.site_id = s.id) AS page_count,
              (SELECT COUNT(*) FROM plan_task pt
                 JOIN strategy_plan sp ON sp.id = pt.plan_id
                WHERE sp.brand_id = s.brand_id AND pt.status IN ('proposed', 'accepted')) AS open_fixes
         FROM landing_sites s
        WHERE s.tenant_id = $1
        ORDER BY s.created_at DESC`,
      [auth.tenantId]
    );
    return c.json({
      sites: res.rows.map((r) => ({
        ...r,
        page_count: parseInt(r.page_count, 10),
        open_fixes: parseInt(r.open_fixes, 10),
      })),
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/landing/sites — create a site (+ its home page)
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/sites",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      let body: {
        name?: string;
        slug?: string;
        business?: Record<string, unknown>;
        theme?: Record<string, unknown>;
        brand_id?: string;
        place_id?: string;
      };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      const name = (body.name ?? "").trim();
      if (!name) return c.json({ message: "Business name is required." }, 400);

      const slug = (body.slug ?? "").trim() || slugify(name);
      const slugError = validateSiteSlug(slug);
      if (slugError) return c.json({ message: slugError, code: "INVALID_SLUG" }, 400);

      // Optional Google Places link — the wizard resolves it client-side via
      // POST /api/landing/places/resolve and submits the returned place_id
      // (+ the pre-filled facts, already merged into `business` by the
      // caller) on create. No server-side re-fetch here (#208 PR-9).
      let placeId: string | null = null;
      if (body.place_id !== undefined) {
        const trimmed = (body.place_id ?? "").trim();
        if (trimmed) {
          if (!PLACE_ID_INPUT_RE.test(trimmed)) {
            return c.json({ message: "Invalid place_id." }, 400);
          }
          placeId = trimmed;
        }
      }

      await db.setTenantId(auth.tenantId);

      // Entitlement: plan base + purchased credits (super_admin bypasses).
      const allowance = await landingAllowanceFor(db, auth.tenantId, auth.isSuperAdmin);
      const count = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM landing_sites WHERE tenant_id = $1`,
        [auth.tenantId]
      );
      if (parseInt(count.rows[0]?.count ?? "0", 10) >= allowance.maxSites) {
        return c.json(
          {
            message:
              allowance.maxSites === 0
                ? "Your plan does not include the website builder. Subscribe to Growth or buy a site to unlock it."
                : `Your plan allows ${allowance.maxSites} site(s). Upgrade or buy an extra site to add more.`,
            code: "PLAN_LIMIT_LANDING_SITES",
          },
          403
        );
      }

      // Optional brand link (flywheel: audit gaps feed the generator, PR-4/7).
      let brandId: string | null = null;
      if (body.brand_id) {
        const brand = await db.query<{ id: string }>(
          `SELECT id FROM brands WHERE id = $1 AND tenant_id = $2`,
          [body.brand_id, auth.tenantId]
        );
        if (!brand.rows[0]) return c.json({ message: "brand_id not found." }, 400);
        brandId = brand.rows[0].id;
      }

      const business = { name, ...(body.business ?? {}) };
      const siteId = randomUUID();
      try {
        // $7 is cast to ::text because it is referenced twice — once as the
        // place_id value and once in `CASE WHEN … IS NOT NULL`. Without the
        // cast, the bare IS NULL test gives Postgres no type hint and it fails
        // with "could not determine data type of parameter $7", breaking every
        // site creation (regression from the place_id column, #226).
        await db.query(
          `INSERT INTO landing_sites
             (id, tenant_id, brand_id, slug, status, business, theme, place_id, google_synced_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7::text, CASE WHEN $7::text IS NOT NULL THEN NOW() ELSE NULL END, NOW(), NOW())`,
          [
            siteId,
            auth.tenantId,
            brandId,
            slug,
            JSON.stringify(business),
            JSON.stringify(body.theme ?? {}),
            placeId,
          ]
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          return c.json({ message: "That slug is already taken. Pick another.", code: "SLUG_TAKEN" }, 409);
        }
        throw err;
      }

      // Every site starts with its home page (slug '' = site root).
      const homePageId = randomUUID();
      await db.query(
        `INSERT INTO landing_pages (id, tenant_id, site_id, page_type, slug, title, created_at, updated_at)
         VALUES ($1, $2, $3, 'home', '', $4, NOW(), NOW())`,
        [homePageId, auth.tenantId, siteId, name]
      );

      logger.info("landing_site_created", { tenant_id: auth.tenantId, site_id: siteId });
      return c.json({ id: siteId, slug, status: "draft", home_page_id: homePageId }, 201);
    }
  );

  // =========================================================================
  // Google Places (New) integration (#208 PR-9) — kept in its own clearly-
  // delimited block to minimize merge conflicts with concurrent work on this
  // file (PR-8's site-detail/leads additions). All parsing/API logic lives
  // in apps/api/src/lib/google-places.ts; this route is pure request/
  // response plumbing: configured-gate, rate-limit, call, map typed errors.
  //
  // POST /api/landing/places/resolve — "paste your Google Maps link" wizard
  // prefill. Does NOT write anything to the DB (pure lookup) — the wizard
  // submits the create as usual with the resolved facts + place_id.
  // =========================================================================
  app.post(
    "/api/landing/places/resolve",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");

      // Fail-safe: no server key configured → 503, UI hides/disables the field.
      if (!googlePlacesConfigured()) {
        return c.json(
          {
            message: "Google Maps lookup is not available right now.",
            code: "PLACES_NOT_CONFIGURED",
          },
          503
        );
      }

      let body: { maps_url?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      const mapsUrl = (body.maps_url ?? "").trim();
      if (!mapsUrl) return c.json({ message: "maps_url is required." }, 400);
      if (mapsUrl.length > MAX_MAPS_URL_LEN) {
        return c.json({ message: "That link is too long." }, 400);
      }

      const allowed = await checkPlacesResolveRateLimit(auth.tenantId).catch((err) => {
        logger.warn("landing_places_resolve_rate_limit_redis_failed", {
          message: (err as Error).message,
        });
        return true; // fail open on Redis error, consistent with the generate route
      });
      if (!allowed) {
        c.header("Retry-After", "3600");
        return c.json(
          {
            message: "Too many lookups. Please try again in an hour.",
            code: "PLACES_RATE_LIMITED",
          },
          429
        );
      }

      try {
        const resolved = await resolvePlace(mapsUrl);
        return c.json(resolved);
      } catch (err) {
        if (err instanceof PlacesError) {
          if (err.code === "not_configured") {
            return c.json({ message: err.message, code: "PLACES_NOT_CONFIGURED" }, 503);
          }
          if (err.code === "not_found") {
            return c.json({ message: err.message, code: "PLACES_NOT_FOUND" }, 404);
          }
          if (err.code === "invalid_url") {
            return c.json({ message: err.message, code: "PLACES_INVALID_URL" }, 400);
          }
          return c.json({ message: err.message, code: "PLACES_UPSTREAM_ERROR" }, 502);
        }
        // Never surface internal error text — PlacesError already carries a
        // client-safe message; anything else is an unexpected bug.
        logger.error("landing_places_resolve_unexpected_error", {
          tenantId: auth.tenantId,
          message: (err as Error).message?.slice(0, 160),
        });
        return c.json({ message: "Could not look up that business. Please try again." }, 502);
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/landing/sites/:id — site + pages
  //
  // open_fixes (#208 PR-7 — the audit → rebuild loop): the count of this
  // site's linked brand's plan_task rows still 'proposed'/'accepted' — i.e.
  // fixes that the NEXT generate/regenerate will apply and close. 0 when the
  // site has no brand_id link.
  // -------------------------------------------------------------------------
  app.get("/api/landing/sites/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    const siteId = c.req.param("id") ?? "";
    await db.setTenantId(auth.tenantId);
    const site = await db.query<Record<string, unknown> & { open_fixes: string }>(
      `SELECT s.id, s.brand_id, s.slug, s.status, s.business, s.theme, s.review_themes,
              s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM plan_task pt
                 JOIN strategy_plan sp ON sp.id = pt.plan_id
                WHERE sp.brand_id = s.brand_id AND pt.status IN ('proposed', 'accepted')) AS open_fixes
         FROM landing_sites s WHERE s.id = $1 AND s.tenant_id = $2`,
      [siteId, auth.tenantId]
    );
    const siteRow = site.rows[0];
    if (!siteRow) return c.json({ message: "Site not found." }, 404);
    const pages = await db.query<Record<string, unknown>>(
      `SELECT id, page_type, slug, title, status, ai_readiness, published_at, created_at, updated_at
         FROM landing_pages WHERE site_id = $1 AND tenant_id = $2
        ORDER BY (slug = '') DESC, created_at ASC`,
      [siteId, auth.tenantId]
    );
    return c.json({
      site: { ...siteRow, open_fixes: parseInt(siteRow.open_fixes, 10) },
      pages: pages.rows,
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/landing/sites/:id — business/theme/status
  // -------------------------------------------------------------------------
  app.patch(
    "/api/landing/sites/:id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const siteId = c.req.param("id") ?? "";
      let body: {
        business?: Record<string, unknown>;
        theme?: Record<string, unknown>;
        status?: string;
      };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      // 'suspended' is the admin abuse kill-switch — not settable by tenants.
      if (body.status !== undefined && !["draft", "published"].includes(body.status)) {
        return c.json({ message: "status must be 'draft' or 'published'." }, 400);
      }

      await db.setTenantId(auth.tenantId);
      const current = await db.query<{ status: string }>(
        `SELECT status FROM landing_sites WHERE id = $1 AND tenant_id = $2`,
        [siteId, auth.tenantId]
      );
      if (!current.rows[0]) return c.json({ message: "Site not found." }, 404);
      if (current.rows[0].status === "suspended") {
        return c.json({ message: "This site is suspended. Contact support.", code: "SITE_SUSPENDED" }, 403);
      }

      // Publish guards. Draft saves are unaffected.
      if (body.status === "published") {
        const pagesRes = await db.query<{ title: string; slug: string; sections: unknown }>(
          `SELECT title, slug, sections FROM landing_pages WHERE site_id = $1 AND tenant_id = $2`,
          [siteId, auth.tenantId]
        );

        // Guard 1 — never publish an ungenerated/empty site. The home page
        // (site root, slug '') must carry real content, and at least one page
        // overall must; otherwise /l/[slug] would render nothing and 404 the
        // visitor even though the dashboard shows "Published".
        const home = pagesRes.rows.find((p) => p.slug === "");
        const hasContent = pagesRes.rows.some((p) => !sectionsEmpty(p.sections));
        if (!home || sectionsEmpty(home.sections) || !hasContent) {
          return c.json(
            { code: "SITE_EMPTY", message: "Generate your site before publishing." },
            422
          );
        }

        // Guard 2 — no page may still carry a generator placeholder marker
        // (honesty rule: unfilled gap answers must never go live).
        const offending = pagesRes.rows.filter((p) => containsPlaceholder(p.sections));
        if (offending.length > 0) {
          return c.json(
            {
              code: "PLACEHOLDER_CONTENT",
              message: `These pages still have placeholder content: ${offending
                .map((p) => p.title || (p.slug || "Home"))
                .join(", ")}. Fill them in before publishing.`,
            },
            422
          );
        }
      }

      // A publish/unpublish is a real STATUS transition (status is validated to
      // 'draft'|'published' above; 'suspended' is already blocked). Business/
      // theme-only edits are neither and skip the cascade + audit trail.
      const isPublishTransition =
        body.status === "published" && current.rows[0].status !== "published";
      const isUnpublishTransition =
        body.status === "draft" && current.rows[0].status === "published";

      // Site update + page-visibility cascade run in ONE transaction, so a
      // "published site, draft pages" half-state (which 404s /l/[slug]) can
      // never be observed — either both land or neither does.
      const updated = await db.transaction(async (tx) => {
        const res = await tx.query<{ id: string }>(
          `UPDATE landing_sites
              SET business = COALESCE($3, business),
                  theme    = COALESCE($4, theme),
                  status   = COALESCE($5, status),
                  updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2
            RETURNING id`,
          [
            siteId,
            auth.tenantId,
            body.business ? JSON.stringify(body.business) : null,
            body.theme ? JSON.stringify(body.theme) : null,
            body.status ?? null,
          ]
        );
        if (!res.rows[0]) return false;

        // Publishing the SITE publishes its content-bearing pages so the public
        // route (which requires a PUBLISHED page WITH content) actually renders.
        // Guard 1/2 above already ensured the home page + real content qualify;
        // empty pages stay 'draft' and simply don't appear publicly.
        // Unpublishing takes every page offline so nothing lingers live.
        if (isPublishTransition) {
          await tx.query(
            `UPDATE landing_pages
                SET status = 'published',
                    published_at = COALESCE(published_at, NOW()),
                    updated_at = NOW()
              WHERE site_id = $1 AND tenant_id = $2
                AND jsonb_typeof(sections) = 'array'
                AND jsonb_array_length(sections) > 0`,
            [siteId, auth.tenantId]
          );
        } else if (isUnpublishTransition) {
          await tx.query(
            `UPDATE landing_pages SET status = 'draft', updated_at = NOW()
              WHERE site_id = $1 AND tenant_id = $2`,
            [siteId, auth.tenantId]
          );
        }
        return true;
      });
      if (!updated) return c.json({ message: "Site not found." }, 404);

      // Publish/unpublish audit trail — only on an actual transition. Never
      // blocks the response.
      if (isPublishTransition) {
        void writeLandingAuditLog(
          db,
          "landing_site_published",
          auth.userId,
          auth.tenantId,
          "landing_site",
          siteId
        );
      } else if (isUnpublishTransition) {
        void writeLandingAuditLog(
          db,
          "landing_site_unpublished",
          auth.userId,
          auth.tenantId,
          "landing_site",
          siteId
        );
      }

      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/landing/sites/:id — owner only (destructive: cascades pages)
  // -------------------------------------------------------------------------
  app.delete(
    "/api/landing/sites/:id",
    requireAuth,
    requireRole(["owner"]),
    async (c) => {
      const auth = c.get("auth");
      const siteId = c.req.param("id") ?? "";
      await db.setTenantId(auth.tenantId);
      const res = await db.query<{ id: string }>(
        `DELETE FROM landing_sites WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [siteId, auth.tenantId]
      );
      if (!res.rows[0]) return c.json({ message: "Site not found." }, 404);
      logger.info("landing_site_deleted", { tenant_id: auth.tenantId, site_id: siteId });
      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/landing/sites/:id/generate — enqueue the 5-page bundle generator
  // (#208 PR-4). The worker (landing-generate job) does the actual writing;
  // this route only validates, rate-limits, and enqueues.
  //
  // Body: { job_kind?: 'generate' | 'regenerate' } — optional; inferred from
  // whether the site already has generated (non-home) pages when omitted.
  // Idempotency: a STABLE BullMQ jobId (`landing-generate:<siteId>`) means a
  // duplicate click while a job is still waiting/active/delayed collapses
  // into the SAME job (returns 409 with that job's id) instead of enqueueing
  // a second run; once that job settles, the next trigger reuses the id for
  // a fresh run (BullMQ jobIds are only unique among NOT-YET-completed jobs).
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/sites/:id/generate",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const siteId = c.req.param("id") ?? "";

      let body: { job_kind?: string };
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      if (body.job_kind !== undefined && body.job_kind !== "generate" && body.job_kind !== "regenerate") {
        return c.json({ message: "job_kind must be 'generate' or 'regenerate'." }, 400);
      }

      // Rate limit: 10/hour per tenant (fail open on Redis error).
      const allowed = await checkLandingGenerateRateLimit(auth.tenantId).catch((err) => {
        logger.warn("landing_generate_rate_limit_redis_failed", { message: (err as Error).message });
        return true;
      });
      if (!allowed) {
        c.header("Retry-After", "3600");
        return c.json(
          {
            error: "rate_limit_exceeded",
            code: "GENERATE_RATE_LIMITED",
            message: "Too many generate requests. Please try again in an hour.",
          },
          429
        );
      }

      await db.setTenantId(auth.tenantId);
      const siteRes = await db.query<{ id: string; status: string; page_count: string }>(
        `SELECT s.id, s.status,
                (SELECT COUNT(*) FROM landing_pages p WHERE p.site_id = s.id) AS page_count
           FROM landing_sites s WHERE s.id = $1 AND s.tenant_id = $2`,
        [siteId, auth.tenantId]
      );
      const site = siteRes.rows[0];
      if (!site) return c.json({ message: "Site not found." }, 404);
      if (site.status === "suspended") {
        return c.json({ message: "This site is suspended. Contact support.", code: "SITE_SUSPENDED" }, 403);
      }

      const jobKind: "generate" | "regenerate" =
        (body.job_kind as "generate" | "regenerate" | undefined) ??
        (parseInt(site.page_count, 10) > 1 ? "regenerate" : "generate");

      const queue = getLandingGenerateQueue();
      // NOTE: no ':' in the jobId — BullMQ rejects custom ids containing a colon
      // ("Custom Ids cannot contain :"), which silently 503'd EVERY generate.
      // Hyphen-separated keeps it stable-per-site and colon-free.
      const jobId = `landing-generate-${siteId}`;

      // Duplicate/in-flight check FIRST (Hermes review, #221): a double-click,
      // refresh, or frontend retry while a run is in flight must 409 WITHOUT
      // touching the regeneration quota — the quota charges ACCEPTED runs,
      // never rejected duplicates.
      try {
        const existing = await queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === "waiting" || state === "active" || state === "delayed") {
            return c.json(
              {
                message: "A generation run for this site is already in progress. Wait for it to finish.",
                code: "GENERATE_ALREADY_RUNNING",
                job_id: jobId,
              },
              409
            );
          }
          // Previous run settled (completed/failed) — clear it so the stable
          // jobId can be reused for this fresh run.
          await existing.remove().catch(() => {
            // Best-effort — BullMQ add() below will still surface any real conflict.
          });
        }
      } catch (err) {
        logger.error("landing_generate_enqueue_failed", {
          tenantId: auth.tenantId,
          siteId,
          message: (err as Error).message?.slice(0, 160),
        });
        return c.json({ message: "Could not start the generator. Please try again." }, 503);
      }

      // Pages regeneration quota (issue #217). INITIAL generation (no page of
      // this site carries generated content yet) is always free — no counter
      // touched. A REGENERATION is quota-checked; super_admin bypasses.
      // (A concurrent request slipping between the in-flight check above and
      // add() below dedupes on the stable jobId — worst case one spare charge
      // for a genuinely simultaneous double-submit, never for plain retries.)
      let chargedPeriodStart: string | null = null;
      const contentRes = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM landing_pages
          WHERE site_id = $1 AND tenant_id = $2 AND sections <> '[]'::jsonb`,
        [siteId, auth.tenantId]
      );
      const contentPageCount = parseInt(contentRes.rows[0]?.count ?? "0", 10);

      if (shouldEnforcePagesRegenQuota(contentPageCount, auth.isSuperAdmin)) {
        const tenantRes = await db.query<{ plan_tier: string | null }>(
          `SELECT plan_tier FROM tenants WHERE id = $1`,
          [auth.tenantId]
        );
        const planTier = (tenantRes.rows[0]?.plan_tier ?? "free") as PlanTier;
        const { scope, quota } = pagesRegenQuotaFor(planTier);
        const periodStart = pagesRegenPeriodStart(scope);

        const count = await incrementUsageCounter(
          db,
          auth.tenantId,
          PAGES_REGEN_FEATURE,
          siteId,
          periodStart
        );
        if (count > quota) {
          // Denied — decrement back so this attempt doesn't burn quota.
          await decrementUsageCounter(db, auth.tenantId, PAGES_REGEN_FEATURE, siteId, periodStart);
          logger.warn("pages_regen_limit_hit", { tenantId: auth.tenantId, siteId, quota, scope });
          return c.json(
            {
              message:
                scope === "lifetime"
                  ? `This site has used its ${quota} included regenerations. Additional regenerations aren't available on the Free plan yet.`
                  : `This site has reached its regeneration limit (${quota} per month) for your plan. Resets on the 1st, UTC.`,
              code: "PAGES_REGEN_LIMIT",
            },
            429
          );
        }
        chargedPeriodStart = periodStart;
      }

      try {
        await queue.add(
          "generate",
          { tenant_id: auth.tenantId, site_id: siteId, job_kind: jobKind },
          { jobId }
        );
      } catch (err) {
        // The job never entered the queue — refund the charge (Hermes, #221):
        // an enqueue failure is not a generation run.
        if (chargedPeriodStart) {
          await decrementUsageCounter(
            db,
            auth.tenantId,
            PAGES_REGEN_FEATURE,
            siteId,
            chargedPeriodStart
          ).catch(() => {
            // Best-effort refund — never mask the 503 below.
          });
        }
        logger.error("landing_generate_enqueue_failed", {
          tenantId: auth.tenantId,
          siteId,
          message: (err as Error).message?.slice(0, 160),
        });
        return c.json({ message: "Could not start the generator. Please try again." }, 503);
      }

      logger.info("landing_generate_triggered", { tenant_id: auth.tenantId, site_id: siteId, job_kind: jobKind });
      return c.json({ queued: true, job_id: jobId, job_kind: jobKind }, 202);
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/landing/sites/:id/pages — add a page (cap: max_pages_per_site)
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/sites/:id/pages",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const siteId = c.req.param("id") ?? "";
      let body: { page_type?: string; title?: string; slug?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      const pageType = (body.page_type ?? "").trim();
      if (!PAGE_TYPES.has(pageType)) {
        return c.json({ message: `page_type must be one of: ${[...PAGE_TYPES].join(", ")}.` }, 400);
      }
      const title = (body.title ?? "").trim();
      const slug = (body.slug ?? "").trim() || slugify(title || pageType);
      if (!PAGE_SLUG_RE.test(slug)) {
        return c.json({ message: "Invalid page slug.", code: "INVALID_SLUG" }, 400);
      }

      await db.setTenantId(auth.tenantId);
      if (!(await siteOwnedByTenant(db, auth.tenantId, siteId))) {
        return c.json({ message: "Site not found." }, 404);
      }

      const allowance = await landingAllowanceFor(db, auth.tenantId, auth.isSuperAdmin);
      const count = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM landing_pages WHERE site_id = $1 AND tenant_id = $2`,
        [siteId, auth.tenantId]
      );
      if (parseInt(count.rows[0]?.count ?? "0", 10) >= allowance.maxPagesPerSite) {
        return c.json(
          {
            message: `This site has reached its ${allowance.maxPagesPerSite}-page limit.`,
            code: "PLAN_LIMIT_LANDING_PAGES",
          },
          403
        );
      }

      const pageId = randomUUID();
      try {
        await db.query(
          `INSERT INTO landing_pages (id, tenant_id, site_id, page_type, slug, title, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [pageId, auth.tenantId, siteId, pageType, slug, title]
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          return c.json({ message: "A page with that slug already exists on this site.", code: "SLUG_TAKEN" }, 409);
        }
        throw err;
      }
      return c.json({ id: pageId, page_type: pageType, slug, title }, 201);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/landing/pages/:pageId — full page (sections + seo)
  // -------------------------------------------------------------------------
  app.get("/api/landing/pages/:pageId", requireAuth, async (c) => {
    const auth = c.get("auth");
    const pageId = c.req.param("pageId");
    await db.setTenantId(auth.tenantId);
    const res = await db.query<Record<string, unknown>>(
      `SELECT id, site_id, page_type, slug, title, sections, seo, ai_readiness,
              status, published_at, created_at, updated_at
         FROM landing_pages WHERE id = $1 AND tenant_id = $2`,
      [pageId, auth.tenantId]
    );
    if (!res.rows[0]) return c.json({ message: "Page not found." }, 404);
    return c.json({ page: res.rows[0] });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/landing/pages/:pageId — edit (snapshots previous version)
  // -------------------------------------------------------------------------
  app.patch(
    "/api/landing/pages/:pageId",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const pageId = c.req.param("pageId");
      let body: {
        title?: string;
        slug?: string;
        sections?: unknown[];
        seo?: Record<string, unknown>;
        status?: string;
      };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }

      if (body.status !== undefined && !["draft", "published"].includes(body.status)) {
        return c.json({ message: "status must be 'draft' or 'published'." }, 400);
      }
      if (body.sections !== undefined && !Array.isArray(body.sections)) {
        return c.json({ message: "sections must be an array." }, 400);
      }
      if (body.slug !== undefined) {
        const s = body.slug.trim();
        // '' stays valid only for the home page — checked against the row below.
        if (s !== "" && !PAGE_SLUG_RE.test(s)) {
          return c.json({ message: "Invalid page slug.", code: "INVALID_SLUG" }, 400);
        }
      }

      await db.setTenantId(auth.tenantId);
      const current = await db.query<{
        slug: string;
        sections: unknown;
        seo: unknown;
        page_type: string;
        status: string;
      }>(
        `SELECT slug, sections, seo, page_type, status FROM landing_pages WHERE id = $1 AND tenant_id = $2`,
        [pageId, auth.tenantId]
      );
      const row = current.rows[0];
      if (!row) return c.json({ message: "Page not found." }, 404);
      if (body.slug !== undefined && body.slug.trim() === "" && row.slug !== "") {
        return c.json({ message: "Only the home page can use the root slug." }, 400);
      }

      // Publish guard: this page may not still carry a generator placeholder
      // marker — check whatever sections it WOULD have after this PATCH
      // (the incoming body if it updates sections, else the current row).
      if (body.status === "published") {
        const sectionsToCheck = body.sections !== undefined ? body.sections : row.sections;
        if (containsPlaceholder(sectionsToCheck)) {
          return c.json(
            {
              code: "PLACEHOLDER_CONTENT",
              message: "This page still has placeholder content. Fill in the highlighted section(s) before publishing.",
            },
            422
          );
        }
      }

      // Snapshot the PREVIOUS content when content actually changes.
      const contentChanged = body.sections !== undefined || body.seo !== undefined;
      if (contentChanged) {
        await db.query(
          `INSERT INTO landing_page_versions (id, tenant_id, page_id, version, sections, seo, saved_by, created_at)
           VALUES ($1, $2, $3,
                   COALESCE((SELECT MAX(version) FROM landing_page_versions WHERE page_id = $3), 0) + 1,
                   $4, $5, 'user', NOW())`,
          [randomUUID(), auth.tenantId, pageId, JSON.stringify(row.sections ?? []), JSON.stringify(row.seo ?? {})]
        );
        // Prune beyond the cap (oldest first).
        await db.query(
          `DELETE FROM landing_page_versions
            WHERE page_id = $1
              AND version <= (SELECT MAX(version) FROM landing_page_versions WHERE page_id = $1) - $2`,
          [pageId, VERSION_CAP]
        );
      }

      try {
        await db.query(
          `UPDATE landing_pages
              SET title    = COALESCE($3, title),
                  slug     = COALESCE($4, slug),
                  sections = COALESCE($5, sections),
                  seo      = COALESCE($6, seo),
                  status   = COALESCE($7, status),
                  published_at = CASE WHEN $7 = 'published' THEN NOW() ELSE published_at END,
                  updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2`,
          [
            pageId,
            auth.tenantId,
            body.title !== undefined ? body.title.trim() : null,
            body.slug !== undefined ? body.slug.trim() : null,
            body.sections !== undefined ? JSON.stringify(body.sections) : null,
            body.seo !== undefined ? JSON.stringify(body.seo) : null,
            body.status ?? null,
          ]
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          return c.json({ message: "A page with that slug already exists on this site.", code: "SLUG_TAKEN" }, 409);
        }
        throw err;
      }

      // Publish/unpublish audit trail — only on an actual transition, not
      // every content edit. Never blocks the response.
      if (body.status !== undefined && body.status !== row.status) {
        if (body.status === "published") {
          void writeLandingAuditLog(
            db,
            "landing_page_published",
            auth.userId,
            auth.tenantId,
            "landing_page",
            pageId ?? ""
          );
        } else if (row.status === "published") {
          void writeLandingAuditLog(
            db,
            "landing_page_unpublished",
            auth.userId,
            auth.tenantId,
            "landing_page",
            pageId ?? ""
          );
        }
      }

      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/landing/pages/:pageId — home page is not deletable
  // -------------------------------------------------------------------------
  app.delete(
    "/api/landing/pages/:pageId",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const pageId = c.req.param("pageId");
      await db.setTenantId(auth.tenantId);
      const res = await db.query<{ id: string; slug: string }>(
        `SELECT id, slug FROM landing_pages WHERE id = $1 AND tenant_id = $2`,
        [pageId, auth.tenantId]
      );
      if (!res.rows[0]) return c.json({ message: "Page not found." }, 404);
      if (res.rows[0].slug === "") {
        return c.json({ message: "The home page cannot be deleted." }, 400);
      }
      await db.query(`DELETE FROM landing_pages WHERE id = $1 AND tenant_id = $2`, [
        pageId,
        auth.tenantId,
      ]);
      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/landing/pages/:pageId/versions — history (newest first)
  // -------------------------------------------------------------------------
  app.get("/api/landing/pages/:pageId/versions", requireAuth, async (c) => {
    const auth = c.get("auth");
    const pageId = c.req.param("pageId");
    await db.setTenantId(auth.tenantId);
    const res = await db.query<Record<string, unknown>>(
      `SELECT version, saved_by, created_at
         FROM landing_page_versions
        WHERE page_id = $1 AND tenant_id = $2
        ORDER BY version DESC`,
      [pageId, auth.tenantId]
    );
    return c.json({ versions: res.rows });
  });

  // -------------------------------------------------------------------------
  // POST /api/landing/pages/:pageId/versions/:version/restore
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/pages/:pageId/versions/:version/restore",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const pageId = c.req.param("pageId");
      const version = parseInt(c.req.param("version") ?? "", 10);
      if (!Number.isInteger(version) || version < 1) {
        return c.json({ message: "Invalid version." }, 400);
      }

      await db.setTenantId(auth.tenantId);
      const snap = await db.query<{ sections: unknown; seo: unknown }>(
        `SELECT sections, seo FROM landing_page_versions
          WHERE page_id = $1 AND tenant_id = $2 AND version = $3`,
        [pageId, auth.tenantId, version]
      );
      if (!snap.rows[0]) return c.json({ message: "Version not found." }, 404);

      const current = await db.query<{ sections: unknown; seo: unknown }>(
        `SELECT sections, seo FROM landing_pages WHERE id = $1 AND tenant_id = $2`,
        [pageId, auth.tenantId]
      );
      if (!current.rows[0]) return c.json({ message: "Page not found." }, 404);

      // Snapshot current first — a restore must itself be undoable.
      await db.query(
        `INSERT INTO landing_page_versions (id, tenant_id, page_id, version, sections, seo, saved_by, created_at)
         VALUES ($1, $2, $3,
                 COALESCE((SELECT MAX(version) FROM landing_page_versions WHERE page_id = $3), 0) + 1,
                 $4, $5, 'user', NOW())`,
        [
          randomUUID(),
          auth.tenantId,
          pageId,
          JSON.stringify(current.rows[0].sections ?? []),
          JSON.stringify(current.rows[0].seo ?? {}),
        ]
      );
      await db.query(
        `UPDATE landing_pages SET sections = $3, seo = $4, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2`,
        [
          pageId,
          auth.tenantId,
          JSON.stringify(snap.rows[0].sections ?? []),
          JSON.stringify(snap.rows[0].seo ?? {}),
        ]
      );
      return c.json({ ok: true, restored_version: version });
    }
  );

  // -------------------------------------------------------------------------
  // Testimonials — client-owned reviews with rights attestation
  // -------------------------------------------------------------------------
  app.get("/api/landing/sites/:id/testimonials", requireAuth, async (c) => {
    const auth = c.get("auth");
    const siteId = c.req.param("id") ?? "";
    await db.setTenantId(auth.tenantId);
    if (!(await siteOwnedByTenant(db, auth.tenantId, siteId))) {
      return c.json({ message: "Site not found." }, 404);
    }
    const res = await db.query<Record<string, unknown>>(
      `SELECT id, author, body, rating, source, authorized, created_at
         FROM landing_testimonials WHERE site_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC`,
      [siteId, auth.tenantId]
    );
    return c.json({ testimonials: res.rows });
  });

  app.post(
    "/api/landing/sites/:id/testimonials",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const siteId = c.req.param("id") ?? "";
      let payload: {
        author?: string;
        body?: string;
        rating?: number;
        authorized?: boolean;
      };
      try {
        payload = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const text = (payload.body ?? "").trim();
      if (!text) return c.json({ message: "Testimonial body is required." }, 400);
      if (
        payload.rating !== undefined &&
        (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5)
      ) {
        return c.json({ message: "rating must be an integer 1–5." }, 400);
      }

      await db.setTenantId(auth.tenantId);
      if (!(await siteOwnedByTenant(db, auth.tenantId, siteId))) {
        return c.json({ message: "Site not found." }, 404);
      }
      const id = randomUUID();
      await db.query(
        `INSERT INTO landing_testimonials (id, tenant_id, site_id, author, body, rating, source, authorized, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, NOW())`,
        [
          id,
          auth.tenantId,
          siteId,
          (payload.author ?? "").trim(),
          text,
          payload.rating ?? null,
          payload.authorized === true,
        ]
      );
      return c.json({ id }, 201);
    }
  );

  app.delete(
    "/api/landing/testimonials/:id",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const id = c.req.param("id");
      await db.setTenantId(auth.tenantId);
      const res = await db.query<{ id: string }>(
        `DELETE FROM landing_testimonials WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, auth.tenantId]
      );
      if (!res.rows[0]) return c.json({ message: "Testimonial not found." }, 404);
      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/landing/sites/:id/leads — end-customer form submissions (#208 PR-8)
  //
  // landing_leads is PII (Ozvor acts as PROCESSOR for the tenant's end
  // customers — see the schema migration comment). Rows are inserted by the
  // public /l/[slug] form route (PR-6, privileged role); this route is the
  // tenant's read-only view of their own leads. No role restriction beyond
  // requireAuth — viewers may read leads same as testimonials, mutate nothing.
  // RLS backstop: db.setTenantId + explicit tenant_id filter (file convention).
  // Never logged — PII must not appear in structured logs (house rule).
  // -------------------------------------------------------------------------
  app.get("/api/landing/sites/:id/leads", requireAuth, async (c) => {
    const auth = c.get("auth");
    const siteId = c.req.param("id") ?? "";
    await db.setTenantId(auth.tenantId);
    if (!(await siteOwnedByTenant(db, auth.tenantId, siteId))) {
      return c.json({ message: "Site not found." }, 404);
    }
    const res = await db.query<{
      id: string;
      name: string;
      email: string;
      phone: string;
      message: string;
      consent: boolean;
      created_at: string;
    }>(
      `SELECT id, name, email, phone, message, consent, created_at
         FROM landing_leads
        WHERE site_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 200`,
      [siteId, auth.tenantId]
    );
    return c.json({ leads: res.rows });
  });
}
