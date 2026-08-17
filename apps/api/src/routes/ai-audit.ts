/**
 * ai-audit.ts — the AI Audit Stack HTTP surface. PAID product ($49 one-time,
 * founder 2026-08-15) with a MANDATORY email — the same structure as the $29
 * Get-Cited Kit (products.ts) and the free test's email capture.
 *
 *  - GET  /api/ai-audit/meta            — questionnaire vocabulary + price.
 *  - POST /api/ai-audit/checkout        — email (required) + answers → lead_capture
 *      row (source 'ai_audit') + ai_audit_order (pending) + Stripe Checkout
 *      (or dev-unlock URL outside production when Stripe is not configured).
 *  - GET  /api/ai-audit/order/:token    — status (+ deliverable once delivered).
 *  - POST /api/ai-audit/order/:token/deliver?session_id=|dev_unlock=1 —
 *      Kit trust rule: paid = status 'paid' AND a bound Stripe session; sync
 *      verify by session metadata; dev unlock non-production only; 402 else.
 *  - POST /api/ai-audit/entry, /assess  — kept as TEASER endpoints: they no
 *      longer return a tool pick or the report. They answer with the honest
 *      counts only (totalMatched, withheldCount, painSummary [+ matrix counts
 *      for /assess]) so the questionnaire can show "we matched N tools" BEFORE
 *      the $49 checkout. The pick and the full report are only ever built for
 *      a paid order (lib/ai-audit/deliverable.ts). This is the simpler honest
 *      option over key-gating: nothing sellable leaks, nothing to configure.
 *
 * Migration gate: the table ai_audit_order lands in a separate founder-merged
 * PR. Until then every DB touch on it raises 42P01 and these routes answer
 * 503 {code:"AI_AUDIT_ORDERS_NOT_READY"} — logged once, never a crash, never a
 * fabricated success.
 *
 * Every public endpoint is rate-limited per IP: /meta 30/h, /entry + /assess
 * 8/h (D8c, lib/ip-rate-limit.ts — Redis ZSET with bounded memory fallback,
 * #261); /checkout keeps its own 8/h limiter below.
 *
 * Honesty carried to the wire: every payload says whether the catalog came
 * from the DB or the seed and whether its numbers are human-verified.
 */

import { Hono, type Context } from "hono";
import { randomBytes, randomUUID } from "node:crypto";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { getSharedRedis } from "../shared-redis";
import { memoryRateLimitAllow } from "../lib/memory-rate-limit";
import { clientIp } from "../lib/client-ip";
import { asStr } from "../lib/coerce";
import { truncateIp } from "./dpa";
import { loadCatalog } from "../lib/ai-audit/catalog-repo";
import { buildAuditReport, buildEntryResult } from "../lib/ai-audit/engine";
import { clientSafeGroundingSources } from "../lib/ai-audit/grounding-sources";
import type { BusinessEngine, QuestionnaireAnswers } from "../lib/ai-audit/types";
import {
  AI_AUDIT_PRICE_USD,
  aiAuditUpsell,
  isUndefinedTable,
} from "../lib/ai-audit/deliverable";
import { fulfillAiAuditOrder } from "../lib/ai-audit/fulfill";
import {
  createAiAuditCheckoutSession,
  verifyAiAuditCheckoutSession,
} from "../integrations/stripe";
import {
  sharedIpRateLimiter,
  truncateIp as truncateIpForRateLimit,
  type IpRateLimiter,
} from "../lib/ip-rate-limit";

// Per-IP limits (D8c, 2026-08-17) — same ZSET pattern as /api/test. /meta is
// cheap (30/h); /entry and /assess build a teaser (8/h, like the free test).
export const AI_AUDIT_META_LIMIT = 30;
export const AI_AUDIT_ASSESS_LIMIT = 8;
const HOUR_MS = 60 * 60 * 1000;

const MAX_PAINS = 20;
const MAX_STR = 120;
const VALID_ENGINES: readonly BusinessEngine[] = ["attract", "convert", "deliver", "retain", "run"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limit: 8 checkouts / hour / IP — same sliding-window ZSET as /api/test.
const CHECKOUT_RATE_LIMIT = 8;
const CHECKOUT_RATE_WINDOW_MS = 60 * 60 * 1000;
const CHECKOUT_RATE_WINDOW_S = 3600;

function cleanStr(v: unknown, max = MAX_STR): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanStrArray(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= MAX_STR)
    .slice(0, maxItems);
}

function cleanPosNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Keep only the five valid business engines the questionnaire offers. */
function cleanEngines(v: unknown): BusinessEngine[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")));
  return VALID_ENGINES.filter((e) => set.has(e));
}

function answersFromBody(body: Record<string, unknown>): QuestionnaireAnswers {
  return {
    businessType: cleanStr(body["businessType"]),
    primaryFocus: cleanStr(body["primaryFocus"]),
    pains: cleanStrArray(body["pains"], MAX_PAINS),
    engines: cleanEngines(body["engines"]),
    hourlyRateUsd: cleanPosNumber(body["hourlyRateUsd"]),
    maxMonthlyBudgetUsd: cleanPosNumber(body["maxMonthlyBudgetUsd"]),
    toolsInUse: cleanStrArray(body["toolsInUse"], MAX_PAINS),
  };
}

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? process.env["FRONTEND_URL"] ?? "http://localhost:3000";
}

async function checkCheckoutRateLimit(ipTruncated: string): Promise<boolean> {
  const redis = getSharedRedis();
  const key = `ai_audit_rl:${ipTruncated}`;
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - CHECKOUT_RATE_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, CHECKOUT_RATE_WINDOW_S);
  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= CHECKOUT_RATE_LIMIT;
}

// Log the "table not ready" state once per process, not once per request.
let notReadyLogged = false;
function notReady(c: Context, where: string): Response {
  if (!notReadyLogged) {
    notReadyLogged = true;
    logger.error("ai_audit_orders_not_ready", {
      where,
      hint: "migration 20260815000002_ai_audit_order not applied (founder-gated PR)",
    });
  }
  return c.json(
    {
      message: "The AI Audit Stack checkout is not available yet. Please try again soon.",
      code: "AI_AUDIT_ORDERS_NOT_READY",
    },
    503
  );
}

interface OrderRow {
  id: string;
  order_token: string;
  email: string;
  business_type: string | null;
  primary_focus: string | null;
  answers: unknown;
  status: string;
  deliverable: unknown;
  stripe_session_id: string | null;
  lead_capture_id: string | null;
}

export function registerAiAuditRoutes(
  app: Hono,
  db: PostgresClient,
  opts: { limiter?: IpRateLimiter } = {}
): void {
  const limiter = opts.limiter ?? sharedIpRateLimiter;
  const limited = async (
    c: { req: { header: (n: string) => string | undefined } },
    bucket: "meta" | "assess",
    limit: number
  ): Promise<boolean> => {
    const ip = truncateIpForRateLimit(clientIp(c));
    return !(await limiter(`ai_audit_rl:${bucket}:${ip}`, limit, HOUR_MS));
  };
  const tooMany = (limit: number) => ({
    message: `Too many requests. Up to ${limit} per hour per network. Try again later.`,
    code: "RATE_LIMITED",
  });

  // GET /api/ai-audit/meta — vocabulary for the questionnaire, from the catalog.
  app.get("/api/ai-audit/meta", async (c) => {
    if (await limited(c, "meta", AI_AUDIT_META_LIMIT)) return c.json(tooMany(AI_AUDIT_META_LIMIT), 429);
    const { tools, source, allVerified } = await loadCatalog(db);
    const pains = [...new Set(tools.flatMap((t) => t.pains))].sort();
    const categories = [...new Set(tools.map((t) => t.category))].sort();
    const niches = [...new Set(tools.flatMap((t) => t.niches))].sort();
    return c.json({
      engines: VALID_ENGINES,
      pains,
      categories,
      niches,
      toolCount: tools.length,
      // The offer, so the UI never hardcodes a price the API does not sell.
      offer: { priceUsd: AI_AUDIT_PRICE_USD, currency: "USD", oneTime: true, emailRequired: true },
      catalog: { source, estimatesUnverified: !allVerified },
      research: { groundingSources: clientSafeGroundingSources() },
    });
  });

  // POST /api/ai-audit/assess — TEASER (counts only). The 9-section report is
  // built server-side for paid orders and for the OrganicPosts DFY audit; it
  // is never returned here.
  app.post("/api/ai-audit/assess", async (c) => {
    if (await limited(c, "assess", AI_AUDIT_ASSESS_LIMIT)) return c.json(tooMany(AI_AUDIT_ASSESS_LIMIT), 429);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ message: "Invalid JSON body." }, 400);
    const answers = answersFromBody(body);
    if (answers.pains.length === 0) {
      return c.json(
        { message: "Select at least one pain so the recommendation can be anchored in a real need.", code: "NO_PAINS" },
        400
      );
    }
    const { tools, source, allVerified } = await loadCatalog(db);
    const report = buildAuditReport(answers, tools);
    const entry = buildEntryResult(answers, tools);
    return c.json({
      teaser: {
        totalMatched: entry.totalMatched,
        withheldCount: entry.withheldCount,
        painSummary: report.painSummary,
        matrixCounts: {
          "quick-win": report.matrix["quick-win"].length,
          "major-project": report.matrix["major-project"].length,
          "fill-in": report.matrix["fill-in"].length,
          ignore: report.matrix.ignore.length,
        },
        empty: report.empty,
      },
      offer: { priceUsd: AI_AUDIT_PRICE_USD },
      catalog: { source, estimatesUnverified: !allVerified },
    });
  });

  // POST /api/ai-audit/entry — TEASER (counts only, no pick). The pick is
  // what the $49 buys; it is delivered only through /order/:token/deliver.
  app.post("/api/ai-audit/entry", async (c) => {
    if (await limited(c, "assess", AI_AUDIT_ASSESS_LIMIT)) return c.json(tooMany(AI_AUDIT_ASSESS_LIMIT), 429);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ message: "Invalid JSON body." }, 400);
    const answers = answersFromBody(body);
    if (answers.pains.length === 0) {
      return c.json({ message: "Select at least one pain.", code: "NO_PAINS" }, 400);
    }
    const { tools, source, allVerified } = await loadCatalog(db);
    const entry = buildEntryResult(answers, tools);
    return c.json({
      teaser: {
        totalMatched: entry.totalMatched,
        withheldCount: entry.withheldCount,
        painSummary: entry.painSummary,
        empty: entry.empty,
      },
      offer: { priceUsd: AI_AUDIT_PRICE_USD },
      upsell: aiAuditUpsell(entry.totalMatched),
      catalog: { source, estimatesUnverified: !allVerified },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/ai-audit/checkout — email + answers → lead + order + Stripe
  // -------------------------------------------------------------------------
  app.post("/api/ai-audit/checkout", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ message: "Invalid JSON body." }, 400);

    const email = asStr(body["email"]);
    if (!email) return c.json({ message: "Email is required to get your AI stack.", code: "EMAIL_REQUIRED" }, 400);
    if (!EMAIL_RE.test(email)) return c.json({ message: "Invalid email.", code: "EMAIL_INVALID" }, 400);

    const answers = answersFromBody(body);
    if (answers.pains.length === 0) {
      return c.json({ message: "Pick at least one pain first.", code: "NO_PAINS" }, 400);
    }
    if (!answers.businessType) {
      return c.json({ message: "Tell us your business first.", code: "NO_BUSINESS" }, 400);
    }
    // LGPD Art. 7(I) / GDPR Art. 6(1)(a): explicit opt-in only, never inferred.
    const marketingConsent = body["marketing_consent"] === true;

    // Rate limit (8/h/IP). Redis blip → bounded in-process limiter (#261).
    const rawIp = clientIp(c);
    const ipTruncated = rawIp ? truncateIpForRateLimit(rawIp) : "unknown";
    let allowed = true;
    try {
      allowed = await checkCheckoutRateLimit(ipTruncated);
    } catch (err) {
      allowed = memoryRateLimitAllow(`ai_audit_rl:${ipTruncated}`, CHECKOUT_RATE_LIMIT, CHECKOUT_RATE_WINDOW_MS);
      logger.warn("ai_audit_rate_limit_redis_unavailable_fallback", {
        message: (err as Error).message,
        fallback: "memory",
        allowed,
      });
    }
    if (!allowed) {
      return c.json(
        { message: "Too many attempts. Try again in an hour.", code: "RATE_LIMITED" },
        429
      );
    }

    // Optional link to the free test that led here (only a real lead row).
    const testId = asStr(body["testId"]);
    let priorLeadId: string | null = null;
    if (UUID_RE.test(testId)) {
      try {
        const lc = await db.query<{ id: string }>(`SELECT id FROM lead_capture WHERE id = $1`, [testId]);
        if (lc.rows[0]) priorLeadId = lc.rows[0].id;
      } catch (err) {
        logger.warn("ai_audit_checkout_testid_lookup_failed", { message: (err as Error).message });
      }
    }

    // Lead capture (source 'ai_audit') — the same shape as the free test's
    // insert. Best-effort: a lead-row failure must not block a paying buyer.
    // Email is never logged.
    const leadId = randomUUID();
    let leadCaptureId: string | null = null;
    try {
      await db.query(
        `INSERT INTO lead_capture (id, email, brand, competitor, category, region, sector, country, result, source, ip_truncated, marketing_consent, created_at)
         VALUES ($1,$2,$3,NULL,$4,'US',NULL,NULL,$5,'ai_audit',$6,$7, NOW())`,
        [
          leadId,
          email,
          answers.businessType,
          answers.primaryFocus || "ai-audit",
          jsonbParam({ pains: answers.pains, engines: answers.engines, priorLeadId }),
          rawIp ? truncateIp(rawIp) : null,
          marketingConsent,
        ]
      );
      leadCaptureId = leadId;
    } catch (err) {
      logger.warn("ai_audit_lead_capture_insert_failed", { message: (err as Error).message });
    }

    // Identity continuity (#218): claim the lead row now when the email
    // already has an account. Best-effort + idempotent.
    if (leadCaptureId) {
      try {
        const { rows: ownerRows } = await db.query<{ tenant_id: string }>(
          `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
          [email.toLowerCase().trim()]
        );
        const tenantId = ownerRows[0]?.tenant_id ?? null;
        if (tenantId) {
          await db.query(
            `UPDATE lead_capture SET claimed_at = NOW(), claimed_by_tenant_id = $2
             WHERE id = $1 AND claimed_at IS NULL`,
            [leadCaptureId, tenantId]
          );
          logger.info("ai_audit_lead_claimed_at_capture", { lead_id: leadCaptureId, tenant_id: tenantId });
        }
      } catch (err) {
        logger.warn("ai_audit_lead_immediate_claim_failed", { message: (err as Error).message });
      }
    }

    // The order (pending). 42P01 → 503, never a fake success.
    const id = randomUUID();
    const token = randomBytes(24).toString("base64url");
    try {
      await db.query(
        `INSERT INTO ai_audit_order (id, order_token, email, business_type, primary_focus, answers, status, lead_capture_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7, NOW())`,
        [
          id,
          token,
          email,
          answers.businessType,
          answers.primaryFocus || null,
          jsonbParam({
            businessType: answers.businessType,
            primaryFocus: answers.primaryFocus,
            pains: answers.pains,
            engines: answers.engines,
            toolsInUse: answers.toolsInUse ?? [],
          }),
          leadCaptureId,
        ]
      );
    } catch (err) {
      if (isUndefinedTable(err)) return notReady(c, "checkout");
      throw err;
    }

    const stripeConfigured = !!process.env["STRIPE_SECRET_KEY"] && !!process.env["STRIPE_PRICE_ID_AI_AUDIT"];
    const origin = webOrigin();
    if (stripeConfigured) {
      try {
        const { url } = await createAiAuditCheckoutSession(
          id,
          token,
          email,
          `${origin}/ai-audit/${token}?session_id={CHECKOUT_SESSION_ID}`,
          `${origin}/ai-audit/${token}?canceled=1`
        );
        return c.json({ token, url });
      } catch (err) {
        logger.error("ai_audit_checkout_failed", { message: (err as Error).message });
        return c.json({ message: "Checkout is not available right now." }, 502);
      }
    }
    // No Stripe → dev unlock (never in production).
    if (process.env["NODE_ENV"] !== "production") {
      return c.json({ token, url: `/ai-audit/${token}?dev_unlock=1`, dev: true });
    }
    return c.json({ message: "Checkout is not configured.", code: "CHECKOUT_UNCONFIGURED" }, 503);
  });

  // -------------------------------------------------------------------------
  // GET /api/ai-audit/order/:token — status + deliverable once delivered.
  // -------------------------------------------------------------------------
  app.get("/api/ai-audit/order/:token", async (c) => {
    const token = c.req.param("token");
    let row: OrderRow | undefined;
    try {
      const res = await db.query<OrderRow>(
        `SELECT id, order_token, email, business_type, primary_focus, answers, status, deliverable, stripe_session_id, lead_capture_id
           FROM ai_audit_order WHERE order_token = $1`,
        [token]
      );
      row = res.rows[0];
    } catch (err) {
      if (isUndefinedTable(err)) return notReady(c, "order_get");
      throw err;
    }
    if (!row) return c.json({ message: "Order not found." }, 404);
    const delivered = row.status === "delivered" && !!row.deliverable;
    return c.json({
      status: row.status,
      businessType: row.business_type,
      // Never the deliverable while pending/paid-but-not-built.
      deliverable: delivered ? row.deliverable : null,
      upsell: delivered
        ? (row.deliverable as { upsell?: unknown }).upsell ?? aiAuditUpsell(0)
        : aiAuditUpsell(0),
      offer: { priceUsd: AI_AUDIT_PRICE_USD },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/ai-audit/order/:token/deliver — Kit trust rule.
  // -------------------------------------------------------------------------
  app.post("/api/ai-audit/order/:token/deliver", async (c) => {
    const token = c.req.param("token");
    const sessionId = c.req.query("session_id") ?? null;
    const devUnlock = c.req.query("dev_unlock") === "1";

    let order: OrderRow | undefined;
    try {
      const res = await db.query<OrderRow>(
        `SELECT id, order_token, email, business_type, primary_focus, answers, status, deliverable, stripe_session_id, lead_capture_id
           FROM ai_audit_order WHERE order_token = $1`,
        [token]
      );
      order = res.rows[0];
    } catch (err) {
      if (isUndefinedTable(err)) return notReady(c, "deliver");
      throw err;
    }
    if (!order) return c.json({ message: "Order not found." }, 404);

    // Already delivered → stored deliverable (idempotent).
    if (order.status === "delivered" && order.deliverable) {
      return c.json({ status: "delivered", deliverable: order.deliverable });
    }
    // Revoked/failed orders never unlock, whatever the query string says.
    if (order.status === "refunded" || order.status === "failed") {
      return c.json({ message: "This order is no longer active." , code: "ORDER_INACTIVE" }, 402);
    }

    // 'paid' is only trusted when a Stripe session is BOUND (Hermes #263).
    let paid = order.status === "paid" && order.stripe_session_id != null;
    let source: "webhook" | "sync" | "dev_unlock" = "webhook";
    if (!paid && sessionId && process.env["STRIPE_SECRET_KEY"]) {
      const check = await verifyAiAuditCheckoutSession(sessionId, { orderId: order.id, orderToken: token });
      if (check.ok) {
        try {
          const upd = await db.query<{ id: string }>(
            `UPDATE ai_audit_order SET status='paid', stripe_session_id=$2, paid_at=NOW()
              WHERE id=$1 AND status IN ('pending','paid') RETURNING id`,
            [order.id, sessionId]
          );
          paid = upd.rows.length > 0;
          source = "sync";
        } catch (err) {
          if ((err as { code?: string })?.code === "23505") {
            logger.warn("ai_audit_deliver_session_already_bound", { ai_audit_order_id: order.id });
          } else {
            throw err;
          }
        }
      } else {
        logger.warn("ai_audit_deliver_session_rejected", { ai_audit_order_id: order.id, reason: check.reason });
      }
    }
    if (!paid && devUnlock && process.env["NODE_ENV"] !== "production") {
      paid = true;
      source = "dev_unlock";
      await db.query(`UPDATE ai_audit_order SET status='paid', paid_at=NOW() WHERE id=$1 AND status='pending'`, [order.id]);
    }
    if (!paid) return c.json({ message: "Payment not verified.", code: "PAYMENT_NOT_VERIFIED" }, 402);

    const { deliverable } = await fulfillAiAuditOrder(db, { ...order, status: "paid" }, { source });
    return c.json({ status: "delivered", deliverable });
  });
}
