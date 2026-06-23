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
import {
  runInvisibilityTest,
  buildKitDeliverable,
  type InvisibilityTestResult,
} from "../../../../packages/llm/src/index";
import { createKitCheckoutSession, isCheckoutSessionPaid } from "../integrations/stripe";
import { truncateIp } from "./dpa";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? process.env["FRONTEND_URL"] ?? "http://localhost:3000";
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? null;
}

function normRegion(r: unknown): "EU" | "US" {
  return r === "EU" ? "EU" : "US";
}

export function registerProductRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // POST /api/test — The AI Invisibility Test (free lead magnet)
  // -------------------------------------------------------------------------
  app.post("/api/test", async (c) => {
    let body: { brand?: string; competitor?: string; category?: string; region?: string; email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    const brand = (body.brand ?? "").trim();
    const category = (body.category ?? "").trim();
    const competitor = (body.competitor ?? "").trim() || null;
    const region = normRegion(body.region);
    const email = (body.email ?? "").trim() || null;

    if (!brand) return c.json({ message: "Brand name is required." }, 400);
    if (!category) return c.json({ message: "Category is required." }, 400);
    if (email && !EMAIL_RE.test(email)) return c.json({ message: "Invalid email." }, 400);

    let result;
    try {
      result = await runInvisibilityTest(brand, competitor, category, region);
    } catch (err) {
      logger.error("invisibility_test_failed", { message: (err as Error).message });
      return c.json({ message: "Could not run the test right now. Try again." }, 502);
    }

    // Best-effort lead capture (email NOT logged). Never blocks the response.
    // testId lets the visitor carry this test into the Kit checkout so the Kit's
    // Part 1 can be framed as "your free test, completed" (Test → Kit → Plans).
    const leadId = randomUUID();
    let testId: string | null = null;
    try {
      const ip = clientIp(c);
      await db.query(
        `INSERT INTO lead_capture (id, email, brand, competitor, category, region, result, source, ip_truncated, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'invisibility_test',$8, NOW())`,
        [leadId, email, brand, competitor, category, region, JSON.stringify(result), ip ? truncateIp(ip) : null]
      );
      testId = leadId;
    } catch (err) {
      logger.warn("lead_capture_insert_failed", { message: (err as Error).message });
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
      return c.json({ status: "delivered", deliverable: order.deliverable });
    }

    // Verify payment: paid status already set, OR a paid Stripe session, OR a
    // dev unlock outside production.
    let paid = order.status === "paid";
    if (!paid && sessionId && process.env["STRIPE_SECRET_KEY"]) {
      paid = await isCheckoutSessionPaid(sessionId);
      if (paid) {
        await db.query(`UPDATE kit_order SET status='paid', stripe_session_id=$2, paid_at=NOW() WHERE id=$1`, [order.id, sessionId]);
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
      logger.error("kit_deliverable_failed", { message: (err as Error).message, kit_order_id: order.id });
      return c.json({ message: "Could not generate your kit. Our team has been notified." }, 502);
    }

    await db.query(
      `UPDATE kit_order SET status='delivered', deliverable=$2, delivered_at=NOW() WHERE id=$1`,
      [order.id, JSON.stringify(deliverable)]
    );
    logger.info("kit_delivered", { kit_order_id: order.id });
    return c.json({ status: "delivered", deliverable });
  });
}
