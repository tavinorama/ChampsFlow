/**
 * products.ts — Acquisition ladder API (lead magnet + $29 Kit)
 * See docs/marketing/value-ladder.md.
 *
 * PUBLIC endpoints (no auth — pre-account leads/buyers):
 *   POST /api/test               — "The AI Invisibility Test" (free): 1 prompt,
 *                                   brand vs competitor, instant scorecard + lead
 *                                   capture.
 *   POST /api/kit/checkout       — create a Get-Cited Kit order + Stripe one-time
 *                                   checkout (or dev-unlock link when Stripe/keys
 *                                   absent, gated to NODE_ENV !== production).
 *   GET  /api/kit/:token         — order status + deliverable (once delivered).
 *   POST /api/kit/:token/deliver — verify payment (Stripe session or dev-unlock),
 *                                   build + store the deliverable, return it.
 *
 * GEO-A1/FTC: results are evidence-based estimates; AI is non-deterministic; no
 * guaranteed-citation claims. Only email is PII; no raw answers stored.
 */

import { Hono } from "hono";
import { randomUUID, randomBytes } from "node:crypto";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import {
  runInvisibilityTest,
  buildKitDeliverable,
  buildFallbackKitDeliverable,
  type InvisibilityTestResult,
} from "../../../../packages/llm/src/index";
import {
  createKitCheckoutSession,
  createPagesCheckoutSession,
  verifyKitCheckoutSession,
} from "../integrations/stripe";
import { truncateIp } from "./dpa";
import { requireAuth } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { enrollNurture } from "./nurture";
import { sendFreeTestResultEmail } from "../../../../packages/shared/src/emails/free-test-result";
import { signedDownloadUrl } from "../../../../packages/shared/src/download-token";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? process.env["FRONTEND_URL"] ?? "http://localhost:3000";
}

/**
 * Downloadable files surfaced on a paid Kit page. The Kit PDF is GATED — served
 * only via a signed, expiring /api/download token so it cannot be shared as a
 * plain public URL. The companion whitepaper ("Understanding GEO Search") is the
 * intentionally-free Part 2 and stays a static public file.
 */
interface KitDownload {
  label: string;
  description: string;
  url: string;
}
function kitDownloads(): KitDownload[] {
  const origin = webOrigin();
  return [
    {
      label: "The Get-Cited Kit (PDF)",
      description: "Your complete Kit — the full playbook to download and keep.",
      url: signedDownloadUrl("get-cited-kit", origin),
    },
    {
      label: "Understanding GEO Search (PDF)",
      description: "Part 2 — the companion whitepaper on how AI search decides who gets cited.",
      url: `${origin}/downloads/Understanding-GEO-Search.pdf`,
    },
  ];
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? null;
}

function normRegion(r: unknown): "EU" | "US" {
  return r === "EU" ? "EU" : "US";
}

// ---------------------------------------------------------------------------
// IP truncation for rate-limit key (GDPR data minimization — no dpa.ts dep)
// IPv4: zero last octet. IPv6: keep first 3 groups (first 48 bits).
// ---------------------------------------------------------------------------

function truncateIpForRateLimit(ip: string): string {
  if (!ip) return "unknown";
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.0`;
  const colons = ip.split(":");
  if (colons.length >= 4) return colons.slice(0, 3).join(":") + "::/48";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Lazy Redis singleton for /api/test rate limiting (distinct from billing _redis)
// ---------------------------------------------------------------------------

function getTestRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Rate limit: 8 free tests / hour / IP — sliding-window ZSET (same pipeline
// pattern as chat.ts). Key prefix: test_rl:{truncatedIp}
// ---------------------------------------------------------------------------

const TEST_RATE_LIMIT = 8;
const TEST_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms
const TEST_RATE_WINDOW_S = 3600;             // 1 hour in seconds (Redis EXPIRE)

async function checkTestRateLimit(ipTruncated: string): Promise<boolean> {
  const redis = getTestRedis();
  const key = `test_rl:${ipTruncated}`;
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - TEST_RATE_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, TEST_RATE_WINDOW_S);

  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= TEST_RATE_LIMIT;
}

export function registerProductRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/test — The AI Invisibility Test (free lead magnet)
  // -------------------------------------------------------------------------
  app.post("/api/test", async (c) => {
    let body: { brand?: string; competitor?: string; competitors?: string[]; category?: string; sector?: string; country?: string; region?: string; email?: string; marketing_consent?: boolean; domain?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    const brand = (body.brand ?? "").trim();
    const category = (body.category ?? "").trim();
    // Accept competitors[] (mockup: up to 3); the free test uses the primary one
    // for the head-to-head. Fall back to the single `competitor` field.
    const competitorList = Array.isArray(body.competitors)
      ? body.competitors.map((x) => (x ?? "").trim()).filter(Boolean)
      : [];
    const competitor = (competitorList[0] ?? (body.competitor ?? "").trim()) || null;
    const sector = (body.sector ?? "").trim() || null;
    const country = (body.country ?? "").trim() || null;
    const region = normRegion(body.region);
    const email = (body.email ?? "").trim() || null;
    const domain = (body.domain ?? "").trim() || null;
    // LGPD Art. 7(I) / GDPR Art. 6(1)(a): marketing consent must be explicitly true
    const marketingConsent = body.marketing_consent === true;

    if (!brand) return c.json({ message: "Brand name is required." }, 400);
    if (!category) return c.json({ message: "Category is required." }, 400);
    if (!email) return c.json({ message: "Email is required to run the free test." }, 400);
    if (!EMAIL_RE.test(email)) return c.json({ message: "Invalid email." }, 400);

    // One free test per email. If this email already ran one, don't run another
    // (cost control + funnel: push them to convert). Best-effort — a DB error
    // fails open so a transient issue never blocks a genuine first test.
    try {
      const prior = await db.query<{ id: string }>(
        `SELECT id FROM lead_capture WHERE lower(email) = lower($1) LIMIT 1`,
        [email]
      );
      if (prior.rows.length > 0) {
        return c.json(
          {
            alreadyUsed: true,
            message:
              "This email already used its free AI Visibility Test. Create your account to run more audits, or get the $29 Get-Cited Kit.",
            code: "FREE_TEST_ALREADY_USED",
          },
          200
        );
      }
    } catch (err) {
      logger.warn("free_test_dedupe_check_failed_open", { message: (err as Error).message });
    }

    // Rate limit: 8 free tests / hour / IP (fail-open on Redis error)
    const rawIp = clientIp(c);
    const ipTruncated = rawIp ? truncateIpForRateLimit(rawIp) : "unknown";
    let rateLimitAllowed = true;
    try {
      rateLimitAllowed = await checkTestRateLimit(ipTruncated);
    } catch (err) {
      logger.warn("test_rate_limit_redis_unavailable", { message: (err as Error).message });
    }
    if (!rateLimitAllowed) {
      return c.json(
        { message: "Too many tests. You can run up to 8 free tests per hour. Try again later.", code: "RATE_LIMITED" },
        429
      );
    }

    // Monthly budget cap (founder's platform-key spend). The free test is the
    // runaway-cost, UNAUTHENTICATED surface, so it is hard-capped against the
    // whole month's spend (free tests + audits).
    //
    // Fail-CLOSED (#261 P2, founder decision): this is a COST guard on paid
    // provider calls. If the spend ledger can't be read we must NOT make the
    // billable LLM/API call — during a DB outage an attacker could otherwise
    // hammer this open endpoint and blow the platform budget. We ask the visitor
    // to retry instead of spending blind. (The per-IP RATE limit above stays
    // fail-open — a Redis blip there shouldn't block legitimate sign-ups.)
    const budgetCents = Math.round(Number(process.env["MONTHLY_BUDGET_USD"] ?? 100) * 100);
    const freeTestCostCents = Number(process.env["FREE_TEST_COST_CENTS"] ?? 3);
    try {
      const spendRows = await db.query<{ c: number }>(
        `SELECT COALESCE(SUM(est_cost_cents), 0)::int AS c FROM api_spend WHERE created_at >= date_trunc('month', NOW())`
      );
      const spentCents = Number(spendRows.rows[0]?.c ?? 0);
      if (spentCents + freeTestCostCents > budgetCents) {
        return c.json(
          {
            message:
              "We've reached this month's free-test capacity. Start a plan to run audits now — or try again next month.",
            code: "BUDGET_REACHED",
          },
          429
        );
      }
    } catch (err) {
      logger.error("budget_check_failed_closed", { message: (err as Error).message });
      return c.json(
        {
          message: "We can't start your test right now. Please try again in a minute.",
          code: "BUDGET_CHECK_UNAVAILABLE",
        },
        503
      );
    }

    let result;
    try {
      result = await runInvisibilityTest(brand, competitor, category, region, domain);
    } catch (err) {
      logger.error("invisibility_test_failed", { message: (err as Error).message });
      return c.json({ message: "Could not run the test right now. Try again." }, 502);
    }

    // Record estimated spend for the monthly budget ledger (best-effort).
    void db
      .query(`INSERT INTO api_spend (op, est_cost_cents) VALUES ('free_test', $1)`, [freeTestCostCents])
      .catch(() => {});

    // Best-effort lead capture (email NOT logged). Never blocks the response.
    // testId lets the visitor carry this test into the Kit checkout so the Kit's
    // Part 1 can be framed as "your free test, completed" (Test → Kit → Plans).
    const leadId = randomUUID();
    let testId: string | null = null;
    try {
      const ip = clientIp(c);
      await db.query(
        `INSERT INTO lead_capture (id, email, brand, competitor, category, region, sector, country, result, source, ip_truncated, marketing_consent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'invisibility_test',$10,$11, NOW())`,
        [leadId, email, brand, competitor, category, region, sector, country, jsonbParam(result), ip ? truncateIp(ip) : null, marketingConsent]
      );
      testId = leadId;
    } catch (err) {
      logger.warn("lead_capture_insert_failed", { message: (err as Error).message });
    }

    // Claim immediately when the visitor ALREADY has an account (#218): the
    // bootstrap claim (#166) only runs at first login, so a test run after
    // signup would otherwise stay orphaned forever. Best-effort + idempotent
    // (claimed_at IS NULL); email is never logged.
    if (testId && email) {
      try {
        const { rows: ownerRows } = await db.query<{ tenant_id: string }>(
          `SELECT u.tenant_id FROM users u WHERE lower(u.email) = $1 LIMIT 1`,
          [email.toLowerCase().trim()]
        );
        const visitorTenantId = ownerRows[0]?.tenant_id ?? null;
        if (visitorTenantId) {
          await db.query(
            `UPDATE lead_capture SET claimed_at = NOW(), claimed_by_tenant_id = $2
             WHERE id = $1 AND claimed_at IS NULL`,
            [testId, visitorTenantId]
          );
          logger.info("lead_capture_claimed_at_capture", {
            test_id: testId,
            tenant_id: visitorTenantId,
          });
        }
      } catch (err) {
        logger.warn("lead_capture_immediate_claim_failed", { message: (err as Error).message });
      }
    }

    // Best-effort immediate result email (transactional — no consent required;
    // this delivers back the result the user just requested).
    // NEVER blocks the response or returns 500 due to email failure.
    if (email) {
      try {
        const typedResult = result as import("../../../../packages/llm/src/index").FreeTestResult;
        await sendFreeTestResultEmail({
          to: email,
          brand,
          score: typedResult.score,
          verdict: typedResult.verdict,
          prompt: typedResult.prompt,
          engines: typedResult.engines.map((e) => ({
            engine: e.engine,
            brandCited: e.brandCited,
            competitorCited: e.competitorCited,
            live: e.live,
          })),
          enginesLive: typedResult.enginesLive,
          recommendations: typedResult.recommendations,
          webOrigin: webOrigin(),
        });
      } catch (err) {
        logger.warn("free_test_result_email_failed", { message: (err as Error).message });
        // best-effort: do not block the response
      }
    }

    // Best-effort nurture enrollment (LGPD Art. 7(I): only if consent given).
    // Never blocks the response — best-effort; fail-open on any DB error.
    if (email && marketingConsent) {
      try {
        await enrollNurture(db, {
          email,
          sequence: "free_to_kit",
          brand,
          metadata: {
            verdict: (result as unknown as Record<string, unknown>).verdict ?? null,
            score: (result as unknown as Record<string, unknown>).score ?? null,
            category,
            region,
          },
          sourceLeadId: testId ?? undefined,
          delayMs: 0, // worker sends step 1 immediately
        });
      } catch (err) {
        logger.warn("nurture_enroll_failed", { message: (err as Error).message });
        // best-effort: do not block the response
      }
    }

    return c.json({ result, captured: !!email, testId });
  });

  // -------------------------------------------------------------------------
  // POST /api/kit/checkout — create order + checkout (or dev unlock)
  // -------------------------------------------------------------------------
  app.post("/api/kit/checkout", async (c) => {
    let body: { brand?: string; domain?: string; category?: string; region?: string; email?: string; testId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    const brand = (body.brand ?? "").trim();
    const category = (body.category ?? "").trim();
    const domain = (body.domain ?? "").trim() || null;
    const region = normRegion(body.region);
    const email = (body.email ?? "").trim();

    if (!brand) return c.json({ message: "Brand name is required." }, 400);
    if (!category) return c.json({ message: "Category is required." }, 400);
    if (!email || !EMAIL_RE.test(email)) return c.json({ message: "A valid email is required." }, 400);

    // Optional link to the free test that led here. Only honour it if it's a
    // valid UUID that points to a real lead_capture row — otherwise null, so a
    // stale/forged testId can never break checkout (FK) and never links blindly.
    const testId = (body.testId ?? "").trim();
    let leadCaptureId: string | null = null;
    if (UUID_RE.test(testId)) {
      try {
        const lc = await db.query<{ id: string }>(`SELECT id FROM lead_capture WHERE id = $1`, [testId]);
        if (lc.rows[0]) leadCaptureId = lc.rows[0].id;
      } catch (err) {
        logger.warn("kit_checkout_testid_lookup_failed", { message: (err as Error).message });
      }
    }

    const id = randomUUID();
    const token = randomBytes(24).toString("base64url");
    await db.query(
      `INSERT INTO kit_order (id, order_token, email, brand, domain, category, region, status, lead_capture_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8, NOW())`,
      [id, token, email, brand, domain, category, region, leadCaptureId]
    );

    const stripeConfigured = !!process.env["STRIPE_SECRET_KEY"] && !!process.env["STRIPE_PRICE_ID_KIT"];
    const origin = webOrigin();
    if (stripeConfigured) {
      try {
        const { url } = await createKitCheckoutSession(
          id,
          token,
          email,
          `${origin}/kit/${token}?session_id={CHECKOUT_SESSION_ID}`,
          `${origin}/kit/${token}?canceled=1`,
          region === "EU" ? "EU" : "US"
        );
        return c.json({ token, url });
      } catch (err) {
        logger.error("kit_checkout_failed", { message: (err as Error).message });
        return c.json({ message: "Checkout is not available right now." }, 502);
      }
    }

    // No Stripe configured → dev unlock (local/staging only; never in production).
    // Relative URL so it resolves to whatever origin the browser is on.
    if (process.env["NODE_ENV"] !== "production") {
      return c.json({ token, url: `/kit/${token}?dev_unlock=1`, dev: true });
    }
    return c.json({ message: "Checkout is not configured." }, 503);
  });

  // -------------------------------------------------------------------------
  // POST /api/pages/checkout — Ozvor Pages $99 one-time purchase (#208 PR-2)
  //
  // Public (pre-account, like the Kit): creates a pages_order + Stripe one-time
  // checkout. Fulfillment happens in the billing webhook (credit the tenant
  // matching the buyer email, or leave 'paid' for the bootstrap claim on first
  // login — onboarding.ts). No dev unlock: there is nothing to deliver without
  // the webhook credit, so absent Stripe config this is simply unavailable.
  // -------------------------------------------------------------------------
  app.post("/api/pages/checkout", async (c) => {
    let body: { email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    const email = (body.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ message: "A valid email is required." }, 400);
    }

    const stripeConfigured =
      !!process.env["STRIPE_SECRET_KEY"] && !!process.env["STRIPE_PRICE_ID_PAGES"];
    if (!stripeConfigured) {
      return c.json({ message: "Checkout is not configured." }, 503);
    }

    const id = randomUUID();
    await db.query(
      `INSERT INTO pages_order (id, email, status, created_at)
       VALUES ($1, $2, 'pending', NOW())`,
      [id, email]
    );

    const origin = webOrigin();
    try {
      const { url } = await createPagesCheckoutSession(
        id,
        email,
        `${origin}/welcome?flow=pages&session_id={CHECKOUT_SESSION_ID}`,
        `${origin}/pricing?pages_canceled=1`
      );
      return c.json({ url });
    } catch (err) {
      logger.error("pages_checkout_failed", { message: (err as Error).message });
      return c.json({ message: "Checkout is not available right now." }, 502);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/kit/:token — order status + deliverable (once delivered)
  // -------------------------------------------------------------------------
  app.get("/api/kit/:token", async (c) => {
    const token = c.req.param("token");
    const res = await db.query<{ brand: string; status: string; deliverable: unknown }>(
      `SELECT brand, status, deliverable FROM kit_order WHERE order_token = $1`,
      [token]
    );
    const row = res.rows[0];
    if (!row) return c.json({ message: "Order not found." }, 404);
    return c.json({
      brand: row.brand,
      status: row.status,
      deliverable: row.status === "delivered" ? row.deliverable : null,
      downloads: row.status === "delivered" ? kitDownloads() : null,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/kit/:token/deliver — verify payment, build + return deliverable
  // -------------------------------------------------------------------------
  app.post("/api/kit/:token/deliver", async (c) => {
    const token = c.req.param("token");
    const sessionId = c.req.query("session_id") ?? null;
    const devUnlock = c.req.query("dev_unlock") === "1";

    const res = await db.query<{
      id: string; brand: string; domain: string | null; category: string; region: string;
      status: string; deliverable: unknown; lead_capture_id: string | null;
    }>(
      `SELECT id, brand, domain, category, region, status, deliverable, lead_capture_id FROM kit_order WHERE order_token = $1`,
      [token]
    );
    const order = res.rows[0];
    if (!order) return c.json({ message: "Order not found." }, 404);

    // Already delivered → return stored deliverable (idempotent).
    if (order.status === "delivered" && order.deliverable) {
      return c.json({ status: "delivered", deliverable: order.deliverable, downloads: kitDownloads() });
    }

    // Verify payment: paid status already set, OR a paid Stripe session BOUND to
    // THIS order, OR a dev unlock outside production.
    let paid = order.status === "paid";
    if (!paid && sessionId && process.env["STRIPE_SECRET_KEY"]) {
      // Binding check (#262): the session's own metadata must name THIS order +
      // token + product + Kit price — payment_status alone would let a buyer
      // replay one paid session against another order to get a free Kit.
      const check = await verifyKitCheckoutSession(sessionId, {
        orderId: order.id,
        orderToken: token,
      });
      if (check.ok) {
        try {
          // Guarded + idempotent transition, and the DB UNIQUE(stripe_session_id)
          // (partial index) is the backstop: a session can bind to at most one
          // order even if the metadata check were ever bypassed.
          const upd = await db.query<{ id: string }>(
            `UPDATE kit_order SET status='paid', stripe_session_id=$2, paid_at=NOW()
              WHERE id=$1 AND status IN ('pending','paid') RETURNING id`,
            [order.id, sessionId]
          );
          paid = upd.rows.length > 0;
        } catch (err) {
          // 23505 = another order already claimed this session → reject, do not unlock.
          if ((err as { code?: string })?.code === "23505") {
            logger.warn("kit_deliver_session_already_bound", { kit_order_id: order.id });
          } else {
            throw err;
          }
        }
      } else {
        logger.warn("kit_deliver_session_rejected", {
          kit_order_id: order.id,
          reason: check.reason,
        });
      }
    }
    if (!paid && devUnlock && process.env["NODE_ENV"] !== "production") {
      paid = true;
      await db.query(`UPDATE kit_order SET status='paid', paid_at=NOW() WHERE id=$1`, [order.id]);
    }
    if (!paid) return c.json({ message: "Payment not verified." }, 402);

    // If this Kit came from a free test, load that result so Part 1 can be
    // framed as "your free test, completed". Best-effort — never blocks delivery.
    let testSeed: InvisibilityTestResult | null = null;
    if (order.lead_capture_id) {
      try {
        const lc = await db.query<{ result: unknown }>(
          `SELECT result FROM lead_capture WHERE id = $1`,
          [order.lead_capture_id]
        );
        const raw = lc.rows[0]?.result;
        if (raw && typeof raw === "object") testSeed = raw as InvisibilityTestResult;
      } catch (err) {
        logger.warn("kit_test_seed_load_failed", { message: (err as Error).message, kit_order_id: order.id });
      }
    }

    // Build the deliverable (audit + top-3 + 3 drafts + checklist).
    // A paid buyer must not land on a dead-end page if a live provider/crawl path
    // is unavailable. Fall back to an honest deterministic starter Kit rather than
    // fabricating live probe results or returning a generic 502.
    let deliverable;
    try {
      deliverable = await buildKitDeliverable({
        brand: order.brand,
        domain: order.domain,
        category: order.category,
        region: order.region === "EU" ? "EU" : "US",
        testSeed,
      });
    } catch (err) {
      logger.error("kit_deliverable_failed_fallback_used", { message: (err as Error).message, kit_order_id: order.id });
      deliverable = buildFallbackKitDeliverable({
        brand: order.brand,
        domain: order.domain,
        category: order.category,
        region: order.region === "EU" ? "EU" : "US",
        testSeed,
      });
    }

    await db.query(
      // `deliverable` is a jsonb column: pass the object and let postgres.js
      // serialize it. JSON.stringify() here double-encodes it (stores a JSON
      // *string* inside jsonb), so the /kit page reads a string instead of an
      // object and renders blank. (Found by the first live Kit purchase.)
      `UPDATE kit_order SET status='delivered', deliverable=$2, delivered_at=NOW() WHERE id=$1`,
      [order.id, deliverable]
    );
    logger.info("kit_delivered", { kit_order_id: order.id });
    return c.json({ status: "delivered", deliverable, downloads: kitDownloads() });
  });

  // -------------------------------------------------------------------------
  // GET /api/account/claimed-history — the READ side of identity continuity
  // (#166 wrote claims; nothing ever surfaced them — #218). Returns the
  // tenant's recovered pre-account history: free tests (lead_capture) and Kit
  // purchases (kit_order) claimed to this tenant by verified email. The Kit's
  // order_token is the buyer's own delivery handle (same one their email
  // links to), so returning it to the OWNING tenant is safe.
  // -------------------------------------------------------------------------
  app.get("/api/account/claimed-history", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);

    const tests = await db.query<{
      id: string;
      brand: string;
      created_at: string;
      verdict: string | null;
    }>(
      `SELECT id, brand, created_at, result->>'verdict' AS verdict
         FROM lead_capture
        WHERE claimed_by_tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 10`,
      [auth.tenantId]
    );

    const kits = await db.query<{
      id: string;
      brand: string;
      status: string;
      order_token: string;
      created_at: string;
    }>(
      `SELECT id, brand, status, order_token, created_at
         FROM kit_order
        WHERE claimed_by_tenant_id = $1 AND status IN ('paid', 'delivered')
        ORDER BY created_at DESC
        LIMIT 10`,
      [auth.tenantId]
    );

    return c.json({ tests: tests.rows, kits: kits.rows });
  });
}
