/**
 * landing-public.ts — Ozvor Pages: PUBLIC rendering + lead capture (issue #208, PR-6)
 *
 * Serves published Ozvor Pages sites at ozvor.com/l/[slug] and captures leads
 * from their contact forms. Mirrors the established PUBLIC unscoped-route
 * model used by /api/r/:token (agency.ts) and /api/reports/:report_token
 * (audits.ts):
 *
 *   - NO auth middleware, NO tenant context set (db.setTenantId is never
 *     called). db.query() therefore runs as the privileged login role,
 *     bypassing RLS entirely — every query below filters explicitly by the
 *     resolved slug/status/tenant_id/site_id, never by session state.
 *   - tenant_id is resolved EXCLUSIVELY from the `landing_sites` row matched
 *     by slug — never trusted from the URL or the request body.
 *   - A missing site, a draft site, and a suspended site all return the
 *     IDENTICAL generic 404 body (publicSiteNotFoundBody()) — no oracle that
 *     would let a scanner distinguish "doesn't exist" from "not live yet"
 *     from "taken down for abuse".
 *   - Only non-sensitive fields are exposed: no tenant_id, no brand_id, no
 *     internal ids beyond the slug already present in the URL.
 *
 * Routes:
 *   GET  /api/public/landing/:siteSlug              — site + nav + home page
 *   GET  /api/public/landing/:siteSlug/:pageSlug     — site + nav + named page
 *   POST /api/public/landing/:siteSlug/lead          — lead capture (rate-limited, consent-gated)
 *   POST /api/public/landing/:siteSlug/event         — page_view/cta_click beacon (rate-limited)
 *   GET  /api/public/landing-sitemap                 — slugs + updated_at, capped 500 (for sitemap.ts)
 *   POST /api/landing/admin/sites/:id/suspend        — requireSuperAdmin abuse kill-switch
 *   POST /api/landing/admin/sites/:id/unsuspend      — requireSuperAdmin
 *
 * Hard rules:
 *   - Parameterized queries ONLY — no string interpolation in any SQL
 *   - No PII in logs — lead name/email/phone/message are NEVER logged
 *   - consent must be === true (LGPD Art. 7(I) / GDPR Art. 6(1)(a)) — 400 otherwise
 *   - Lead POST rate-limited 8/hour/truncated-IP (same sliding-window ZSET
 *     pattern + limit as products.ts POST /api/test)
 *   - Event POST rate-limited 60/hour/truncated-IP
 *   - ip_trunc stored via the existing truncateIp() helper (dpa.ts) — never
 *     the raw IP
 */

import { Hono } from "hono";
import { tryGetSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth, requireSuperAdmin } from "../auth/middleware";
import { truncateIp } from "./dpa";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { sendLandingLeadNotificationEmail } from "../../../../packages/shared/src/emails/landing-lead-notification";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SLUG_LEN = 80;
const MAX_NAME_LEN = 200;
const MAX_PHONE_LEN = 40;
const MAX_MESSAGE_LEN = 5000;
const MAX_EMAIL_LEN = 320; // RFC 5321

// ---------------------------------------------------------------------------
// No-oracle 404 — every "not renderable" reason (missing site, draft site,
// suspended site, missing page, draft page) returns this EXACT body. The
// `_reason` argument exists only for handler-side readability / future
// server-side logging; it deliberately never affects the returned shape.
// Pure/exported for unit testing.
// ---------------------------------------------------------------------------

export type PublicNotFoundReason =
  | "site_missing"
  | "site_draft"
  | "site_suspended"
  | "page_missing"
  | "page_draft";

export function publicSiteNotFoundBody(
  _reason: PublicNotFoundReason
): { message: string; code: string } {
  return { message: "Not found.", code: "NOT_FOUND" };
}

// ---------------------------------------------------------------------------
// clientIp — same header precedence as products.ts / agency.ts.
// ---------------------------------------------------------------------------

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? null;
}

/** Truncated IP for rate-limit bucketing + storage — "unknown" when absent/unparseable. */
function ipTruncOrUnknown(c: { req: { header: (n: string) => string | undefined } }): string {
  const raw = clientIp(c);
  if (!raw) return "unknown";
  return truncateIp(raw) || "unknown";
}

// ---------------------------------------------------------------------------
// Sliding-window rate limiter (ZSET pipeline) — same shape as products.ts'
// checkTestRateLimit / agency.ts' checkShareRateLimit. Fails OPEN (allows)
// when Redis is unconfigured or errors, consistent with every other public
// route in this codebase.
// ---------------------------------------------------------------------------

function getPublicLandingRedis(): SharedRedis | null {
  return tryGetSharedRedis();
}

async function checkSlidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  windowSeconds: number
): Promise<boolean> {
  const redis = getPublicLandingRedis();
  if (!redis) return true; // unconfigured — allow (dev)
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);
  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= limit;
}

const READ_RATE_LIMIT = 120;
const READ_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const READ_RATE_WINDOW_S = 600;

const LEAD_RATE_LIMIT = 8;
const LEAD_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LEAD_RATE_WINDOW_S = 3600;

const EVENT_RATE_LIMIT = 60;
const EVENT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EVENT_RATE_WINDOW_S = 3600;

// ---------------------------------------------------------------------------
// Pure validation helpers — exported for unit testing.
// ---------------------------------------------------------------------------

export interface LeadBodyInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  consent?: unknown;
}

export interface ValidatedLead {
  name: string;
  email: string;
  phone: string;
  message: string;
}

/**
 * Validates + normalizes a lead-capture POST body. Returns the trimmed,
 * length-capped fields on success, or `{ error }` on the first violation.
 * Email format is required; consent must be the literal boolean `true`
 * (LGPD Art. 7(I) / GDPR Art. 6(1)(a) — an absent/false/truthy-string
 * consent value is always rejected).
 */
export function validateLeadBody(
  body: LeadBodyInput
): ValidatedLead | { error: string } {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return { error: "Email is required." };
  if (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return { error: "Invalid email." };
  }
  if (body.consent !== true) {
    return { error: "Consent is required to submit this form." };
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LEN) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, MAX_PHONE_LEN) : "";
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : "";
  return { name, email, phone, message };
}

export interface EventBodyInput {
  event_type?: unknown;
  page_slug?: unknown;
}

export interface ValidatedEvent {
  eventType: "page_view" | "cta_click";
  pageSlug: string | null;
}

const PUBLIC_EVENT_TYPES = new Set(["page_view", "cta_click"]);

/**
 * Validates a beacon POST body. Only `page_view` and `cta_click` are
 * accepted here — `form_submit` is written exclusively by the lead route so
 * a lead insert and its event always happen together.
 */
export function validateEventBody(
  body: EventBodyInput
): ValidatedEvent | { error: string } {
  const eventType = typeof body.event_type === "string" ? body.event_type : "";
  if (!PUBLIC_EVENT_TYPES.has(eventType)) {
    return { error: "event_type must be 'page_view' or 'cta_click'." };
  }
  const pageSlug =
    typeof body.page_slug === "string" && body.page_slug.trim()
      ? body.page_slug.trim().slice(0, MAX_SLUG_LEN)
      : null;
  return { eventType: eventType as "page_view" | "cta_click", pageSlug };
}

// ---------------------------------------------------------------------------
// resolvePublishedSite — the single source of truth for "does this slug
// point at a live site". Runs unscoped (privileged role) with an explicit
// status filter — this IS the security boundary for every route below.
// ---------------------------------------------------------------------------

interface PublishedSite {
  id: string;
  tenant_id: string;
  slug: string;
  business: unknown;
  theme: unknown;
  /** Google Place ID (#208 PR-9) — non-sensitive public identifier, safe to
   *  expose; drives the optional Maps Embed iframe on the public site. */
  place_id: string | null;
}

async function resolvePublishedSite(
  db: PostgresClient,
  siteSlug: string
): Promise<PublishedSite | null> {
  if (!siteSlug || siteSlug.length > MAX_SLUG_LEN) return null;
  const res = await db.query<PublishedSite>(
    `SELECT id, tenant_id, slug, business, theme, place_id
       FROM landing_sites
      WHERE slug = $1 AND status = 'published'`,
    [siteSlug]
  );
  return res.rows[0] ?? null;
}

interface NavItem {
  slug: string;
  title: string;
  page_type: string;
}

async function fetchPublishedNav(
  db: PostgresClient,
  site: PublishedSite
): Promise<NavItem[]> {
  const res = await db.query<NavItem>(
    `SELECT slug, title, page_type
       FROM landing_pages
      WHERE site_id = $1 AND tenant_id = $2 AND status = 'published'
      ORDER BY (slug = '') DESC, created_at ASC`,
    [site.id, site.tenant_id]
  );
  return res.rows;
}

function siteBusinessName(site: PublishedSite): string {
  const business = site.business;
  if (business && typeof business === "object" && "name" in (business as Record<string, unknown>)) {
    const name = (business as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "your site";
}

// ---------------------------------------------------------------------------
// notifyLandingLeadOwner — best-effort Resend notification to the tenant
// owner. NEVER throws into the caller's request path in a way that could
// surface a 500 for a notification failure — callers always .catch().
// ---------------------------------------------------------------------------

async function notifyLandingLeadOwner(
  db: PostgresClient,
  site: PublishedSite,
  lead: ValidatedLead
): Promise<void> {
  const ownerRes = await db.query<{ email: string }>(
    `SELECT email FROM users WHERE tenant_id = $1 AND role = 'owner' LIMIT 1`,
    [site.tenant_id]
  );
  const ownerEmail = ownerRes.rows[0]?.email;
  if (!ownerEmail) return;
  await sendLandingLeadNotificationEmail({
    to: ownerEmail,
    siteName: siteBusinessName(site),
    leadName: lead.name,
    messageSnippet: lead.message.slice(0, 200),
  });
}

// ---------------------------------------------------------------------------
// Audit log helper for the admin suspend/unsuspend kill-switch — same
// append-only pattern as agency.ts' writeAuditLog / billing.ts'
// writeBillingAuditLog. No PII in metadata.
// ---------------------------------------------------------------------------

async function writeLandingAdminAuditLog(
  db: PostgresClient,
  eventType: "landing_site_suspended" | "landing_site_unsuspended",
  actorUserId: string,
  tenantId: string,
  siteId: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log
         (id, tenant_id, actor_user_id, event_type, target_entity, target_id, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'landing_site', $4, '{}'::jsonb, NOW())`,
      [tenantId, actorUserId, eventType, siteId]
    );
  } catch (err) {
    logger.error("landing_admin_audit_log_write_failed", {
      event_type: eventType,
      message: (err as Error).message?.slice(0, 160),
    });
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerLandingPublicRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/public/landing/:siteSlug — site + nav + home page ('' slug)
  // -------------------------------------------------------------------------
  app.get("/api/public/landing/:siteSlug", async (c) => {
    const allowed = await checkSlidingWindowRateLimit(
      `landing_read_rl:${ipTruncOrUnknown(c)}`,
      READ_RATE_LIMIT,
      READ_RATE_WINDOW_MS,
      READ_RATE_WINDOW_S
    ).catch(() => true);
    if (!allowed) {
      c.header("Retry-After", "600");
      return c.json({ message: "Too many requests. Please try again later." }, 429);
    }

    const siteSlug = c.req.param("siteSlug") ?? "";
    const site = await resolvePublishedSite(db, siteSlug);
    if (!site) return c.json(publicSiteNotFoundBody("site_missing"), 404);

    const nav = await fetchPublishedNav(db, site);

    const homeRes = await db.query<{
      slug: string;
      title: string;
      sections: unknown;
      seo: unknown;
    }>(
      `SELECT slug, title, sections, seo
         FROM landing_pages
        WHERE site_id = $1 AND tenant_id = $2 AND slug = '' AND status = 'published'`,
      [site.id, site.tenant_id]
    );

    return c.json({
      site: { slug: site.slug, business: site.business, theme: site.theme, place_id: site.place_id },
      nav,
      page: homeRes.rows[0] ?? null,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/public/landing/:siteSlug/:pageSlug — site + nav + named page
  // Both the site AND the page must be published, or this 404s identically.
  // -------------------------------------------------------------------------
  app.get("/api/public/landing/:siteSlug/:pageSlug", async (c) => {
    const allowed = await checkSlidingWindowRateLimit(
      `landing_read_rl:${ipTruncOrUnknown(c)}`,
      READ_RATE_LIMIT,
      READ_RATE_WINDOW_MS,
      READ_RATE_WINDOW_S
    ).catch(() => true);
    if (!allowed) {
      c.header("Retry-After", "600");
      return c.json({ message: "Too many requests. Please try again later." }, 429);
    }

    const siteSlug = c.req.param("siteSlug") ?? "";
    const pageSlug = c.req.param("pageSlug") ?? "";
    if (!pageSlug || pageSlug.length > MAX_SLUG_LEN) {
      return c.json(publicSiteNotFoundBody("page_missing"), 404);
    }

    const site = await resolvePublishedSite(db, siteSlug);
    if (!site) return c.json(publicSiteNotFoundBody("site_missing"), 404);

    const pageRes = await db.query<{
      slug: string;
      title: string;
      sections: unknown;
      seo: unknown;
    }>(
      `SELECT slug, title, sections, seo
         FROM landing_pages
        WHERE site_id = $1 AND tenant_id = $2 AND slug = $3 AND status = 'published'`,
      [site.id, site.tenant_id, pageSlug]
    );
    const page = pageRes.rows[0];
    if (!page) return c.json(publicSiteNotFoundBody("page_missing"), 404);

    const nav = await fetchPublishedNav(db, site);

    return c.json({
      site: { slug: site.slug, business: site.business, theme: site.theme, place_id: site.place_id },
      nav,
      page,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/public/landing/:siteSlug/lead — contact-form submission
  // -------------------------------------------------------------------------
  app.post("/api/public/landing/:siteSlug/lead", async (c) => {
    const siteSlug = c.req.param("siteSlug") ?? "";

    let body: LeadBodyInput;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }

    const validated = validateLeadBody(body);
    if ("error" in validated) {
      return c.json({ message: validated.error, code: "INVALID_LEAD" }, 400);
    }

    const rawIp = clientIp(c);
    const ipTrunc = rawIp ? truncateIp(rawIp) : "";

    let rateLimitAllowed = true;
    try {
      rateLimitAllowed = await checkSlidingWindowRateLimit(
        `landing_lead_rl:${ipTrunc || "unknown"}`,
        LEAD_RATE_LIMIT,
        LEAD_RATE_WINDOW_MS,
        LEAD_RATE_WINDOW_S
      );
    } catch (err) {
      logger.warn("landing_lead_rate_limit_failed_open", { message: (err as Error).message });
    }
    if (!rateLimitAllowed) {
      c.header("Retry-After", "3600");
      return c.json(
        { message: "Too many submissions. Please try again later.", code: "RATE_LIMITED" },
        429
      );
    }

    const site = await resolvePublishedSite(db, siteSlug);
    if (!site) return c.json(publicSiteNotFoundBody("site_missing"), 404);

    const userAgent = (c.req.header("user-agent") ?? "").slice(0, 300);

    try {
      await db.query(
        `INSERT INTO landing_leads
           (tenant_id, site_id, page_id, name, email, phone, message, consent, ip_trunc, user_agent, created_at)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, TRUE, $7, $8, NOW())`,
        [
          site.tenant_id,
          site.id,
          validated.name,
          validated.email,
          validated.phone,
          validated.message,
          ipTrunc,
          userAgent,
        ]
      );
    } catch (err) {
      // NEVER log the lead fields (name/email/phone/message) — PII.
      logger.error("landing_lead_insert_failed", {
        site_id: site.id,
        message: (err as Error).message?.slice(0, 160),
      });
      return c.json({ message: "Could not submit your request. Please try again." }, 502);
    }

    // Best-effort event counter + owner notification — never block the 201.
    void db
      .query(
        `INSERT INTO landing_events (tenant_id, site_id, page_id, event_type, ip_trunc, created_at)
         VALUES ($1, $2, NULL, 'form_submit', $3, NOW())`,
        [site.tenant_id, site.id, ipTrunc]
      )
      .catch((err) => {
        logger.warn("landing_lead_event_insert_failed", {
          site_id: site.id,
          message: (err as Error).message?.slice(0, 160),
        });
      });

    notifyLandingLeadOwner(db, site, validated).catch((err) => {
      logger.warn("landing_lead_notification_failed", {
        site_id: site.id,
        message: (err as Error).message?.slice(0, 160),
      });
    });

    logger.info("landing_lead_captured", { site_id: site.id });
    return c.json({ ok: true }, 201);
  });

  // -------------------------------------------------------------------------
  // POST /api/public/landing/:siteSlug/event — page_view / cta_click beacon
  // -------------------------------------------------------------------------
  app.post("/api/public/landing/:siteSlug/event", async (c) => {
    const siteSlug = c.req.param("siteSlug") ?? "";

    let body: EventBodyInput;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }

    const validated = validateEventBody(body);
    if ("error" in validated) {
      return c.json({ message: validated.error, code: "INVALID_EVENT" }, 400);
    }

    const rawIp = clientIp(c);
    const ipTrunc = rawIp ? truncateIp(rawIp) : "";

    let rateLimitAllowed = true;
    try {
      rateLimitAllowed = await checkSlidingWindowRateLimit(
        `landing_event_rl:${ipTrunc || "unknown"}`,
        EVENT_RATE_LIMIT,
        EVENT_RATE_WINDOW_MS,
        EVENT_RATE_WINDOW_S
      );
    } catch (err) {
      logger.warn("landing_event_rate_limit_failed_open", { message: (err as Error).message });
    }
    if (!rateLimitAllowed) {
      c.header("Retry-After", "3600");
      return c.json({ message: "Too many requests." }, 429);
    }

    const site = await resolvePublishedSite(db, siteSlug);
    if (!site) return c.json(publicSiteNotFoundBody("site_missing"), 404);

    let pageId: string | null = null;
    if (validated.pageSlug) {
      const pageRes = await db.query<{ id: string }>(
        `SELECT id FROM landing_pages
          WHERE site_id = $1 AND tenant_id = $2 AND slug = $3 AND status = 'published'`,
        [site.id, site.tenant_id, validated.pageSlug]
      );
      pageId = pageRes.rows[0]?.id ?? null;
    }

    try {
      await db.query(
        `INSERT INTO landing_events (tenant_id, site_id, page_id, event_type, ip_trunc, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [site.tenant_id, site.id, pageId, validated.eventType, ipTrunc]
      );
    } catch (err) {
      logger.warn("landing_event_insert_failed", {
        site_id: site.id,
        message: (err as Error).message?.slice(0, 160),
      });
      return c.json({ message: "Could not record the event." }, 502);
    }

    return c.json({ ok: true }, 202);
  });

  // -------------------------------------------------------------------------
  // GET /api/public/landing-sitemap — slugs + updated_at for sitemap.ts.
  // Capped at 500 rows; no PII, no auth. Distinct top-level path (no
  // collision with /api/public/landing/:siteSlug).
  // -------------------------------------------------------------------------
  app.get("/api/public/landing-sitemap", async (c) => {
    const res = await db.query<{
      site_slug: string;
      page_slug: string;
      updated_at: string;
    }>(
      `SELECT s.slug AS site_slug, p.slug AS page_slug, p.updated_at
         FROM landing_pages p
         JOIN landing_sites s ON s.id = p.site_id
        WHERE s.status = 'published' AND p.status = 'published'
        ORDER BY p.updated_at DESC
        LIMIT 500`
    );
    return c.json({ pages: res.rows });
  });

  // -------------------------------------------------------------------------
  // POST /api/landing/admin/sites/:id/suspend — abuse kill-switch (Hermes
  // requirement). requireSuperAdmin — runs without a tenant scope, so
  // db.query() executes as the privileged login role (same model as
  // admin.ts). Idempotent: suspending an already-suspended site is a no-op
  // 200, not an error.
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/admin/sites/:id/suspend",
    requireAuth,
    requireSuperAdmin,
    async (c) => {
      const auth = c.get("auth");
      const id = c.req.param("id") ?? "";
      if (!UUID_RE.test(id)) return c.json({ message: "Invalid site id." }, 400);

      const res = await db.query<{ id: string; tenant_id: string }>(
        `UPDATE landing_sites
            SET status = 'suspended', updated_at = NOW()
          WHERE id = $1 AND status <> 'suspended'
          RETURNING id, tenant_id`,
        [id]
      );
      if (!res.rows[0]) {
        const exists = await db.query<{ id: string }>(
          `SELECT id FROM landing_sites WHERE id = $1`,
          [id]
        );
        if (!exists.rows[0]) return c.json({ message: "Site not found." }, 404);
        return c.json({ ok: true }); // already suspended — idempotent
      }

      await writeLandingAdminAuditLog(
        db,
        "landing_site_suspended",
        auth.userId,
        res.rows[0].tenant_id,
        id
      );
      logger.info("landing_site_suspended", { site_id: id });
      return c.json({ ok: true });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/landing/admin/sites/:id/unsuspend — restores to 'draft' (the
  // tenant must explicitly re-publish; unsuspending never auto-publishes).
  // -------------------------------------------------------------------------
  app.post(
    "/api/landing/admin/sites/:id/unsuspend",
    requireAuth,
    requireSuperAdmin,
    async (c) => {
      const auth = c.get("auth");
      const id = c.req.param("id") ?? "";
      if (!UUID_RE.test(id)) return c.json({ message: "Invalid site id." }, 400);

      const res = await db.query<{ id: string; tenant_id: string }>(
        `UPDATE landing_sites
            SET status = 'draft', updated_at = NOW()
          WHERE id = $1 AND status = 'suspended'
          RETURNING id, tenant_id`,
        [id]
      );
      if (!res.rows[0]) {
        const exists = await db.query<{ id: string }>(
          `SELECT id FROM landing_sites WHERE id = $1`,
          [id]
        );
        if (!exists.rows[0]) return c.json({ message: "Site not found." }, 404);
        return c.json({ ok: true }); // not suspended — idempotent
      }

      await writeLandingAdminAuditLog(
        db,
        "landing_site_unsuspended",
        auth.userId,
        res.rows[0].tenant_id,
        id
      );
      logger.info("landing_site_unsuspended", { site_id: id });
      return c.json({ ok: true });
    }
  );
}
