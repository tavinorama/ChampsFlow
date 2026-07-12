/**
 * onboarding.ts — first-login tenant provisioning.
 *
 * Problem it solves: a brand-new Supabase magic-link user has a valid session
 * but NO `app_metadata.tenant_id`, so requireAuth 401s (MISSING_TENANT_CLAIM)
 * and the product is unreachable. This endpoint provisions, on first login:
 *   1. a `tenants` row (free tier),
 *   2. a `users` row (role 'owner', linked to the Supabase UID),
 *   3. sets the Supabase user's app_metadata { tenant_id, app_role: 'owner' }
 *      via the Admin API (SUPABASE_SERVICE_ROLE_KEY) so future JWTs carry it.
 *
 * The web client calls this right after login, then refreshes its session so
 * the new JWT carries the claims. Idempotent: a user who already has a tenant
 * (claim or users row) is returned as-is.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-only). If absent → 503 (so a
 * misconfigured deploy fails loud rather than silently leaving users tenant-less).
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { verifySupabaseToken } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// pendingEmailMatches — pure helper for case-insensitive email comparison
// Exported for unit testing.
//
// SECURITY: the `verifiedEmail` parameter must come from a Supabase JWT that
// has been validated by verifySupabaseToken(). Supabase verifies email
// ownership via magic-link before including it in the JWT. Trusting it here
// is therefore safe — we are NOT trusting anything the client sent directly.
// ---------------------------------------------------------------------------
export function pendingEmailMatches(
  verifiedEmail: string,
  pendingEmail: string
): boolean {
  return verifiedEmail.toLowerCase().trim() === pendingEmail.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// claimPendingSubscription — called from bootstrap on first login
// ---------------------------------------------------------------------------
// Looks for an unclaimed pending_subscription matching the Supabase-verified
// email. If found, writes billing_subscriptions for the new tenant and marks
// the pending row as claimed.
//
// This is best-effort: if the claim fails, the user still gets their account.
// They can contact support to link the subscription.
//
// Parameters:
//   db            — injected Postgres client (service-role; runs before RLS ctx)
//   tenantId      — newly-created tenant UUID (just provisioned by bootstrap)
//   verifiedEmail — email from the validated Supabase JWT (NEVER from client body)
// ---------------------------------------------------------------------------
async function claimPendingSubscription(
  db: PostgresClient,
  tenantId: string,
  verifiedEmail: string
): Promise<void> {
  if (!verifiedEmail) return;

  const normalizedEmail = verifiedEmail.toLowerCase().trim();

  try {
    // Find the first unclaimed pending subscription for this email.
    const { rows } = await db.query<{
      id: string;
      stripe_customer_id: string;
      stripe_subscription_id: string;
      plan_tier: string;
      billing_interval: string;
      status: string;
      stripe_event_id: string;
    }>(
      `SELECT id, stripe_customer_id, stripe_subscription_id, plan_tier,
              billing_interval, status, stripe_event_id
       FROM pending_subscription
       WHERE lower(email) = $1 AND claimed_at IS NULL
       LIMIT 1`,
      [normalizedEmail]
    );

    const pending = rows[0];
    if (!pending) {
      // No pending subscription — normal free account, nothing to claim.
      return;
    }

    // Write billing_subscriptions for the newly-created tenant.
    // Same INSERT ON CONFLICT pattern as the authed webhook path.
    // Use the billing_interval from the pending row to set a reasonable
    // current_period_end. Stripe's customer.subscription.updated event will
    // correct this to the exact anchor date shortly after.
    const periodEndInterval = pending.billing_interval === "month" ? "1 month" : "1 year";

    await db.query(
      `INSERT INTO billing_subscriptions
         (id, tenant_id, stripe_customer_id, stripe_subscription_id,
          plan_tier, status, current_period_start, current_period_end,
          stripe_event_id_last, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5,
          NOW(), NOW() + $7::INTERVAL, $6, NOW(), NOW())
       ON CONFLICT (stripe_subscription_id) DO UPDATE
         SET tenant_id          = EXCLUDED.tenant_id,
             stripe_customer_id = EXCLUDED.stripe_customer_id,
             plan_tier          = EXCLUDED.plan_tier,
             status             = EXCLUDED.status,
             updated_at         = NOW()`,
      [
        tenantId,
        pending.stripe_customer_id,
        pending.stripe_subscription_id,
        pending.plan_tier,
        pending.status,
        pending.stripe_event_id,
        periodEndInterval,
      ]
    );

    // Sync tenants.plan_tier denormalized column
    await db.query(
      `UPDATE tenants SET plan_tier = $1 WHERE id = $2`,
      [pending.plan_tier, tenantId]
    );

    // Mark the pending_subscription as claimed (soft-retain for audit).
    await db.query(
      `UPDATE pending_subscription
       SET claimed_at = NOW(), claimed_by_tenant_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [tenantId, pending.id]
    );

    logger.info("pending_subscription_claimed", {
      tenant_id: tenantId,
      pending_subscription_id: pending.id,
      // NOTE: email, stripe IDs intentionally NOT logged — hard rule
    });
  } catch (err) {
    // Non-fatal: log and continue. User gets their account even if the claim fails.
    logger.error("pending_subscription_claim_failed", {
      tenant_id: tenantId,
      message: (err as Error).message,
      // NOTE: email intentionally NOT logged — hard rule (PII)
    });
  }
}

// ---------------------------------------------------------------------------
// claimFreeTests / claimKitOrders — funnel continuity (#166)
// ---------------------------------------------------------------------------
// On first login, attach the visitor's pre-account free tests (lead_capture)
// and $29 Kit purchases (kit_order) to the new tenant, matched on the
// Supabase-verified email. Rows are retained + stamped (claimed_at,
// claimed_by_tenant_id) so their prior test/purchase is recoverable in-account.
//
// SECURITY: verifiedEmail MUST come from the validated Supabase JWT (see
// pendingEmailMatches note). email columns are CITEXT (case-insensitive); we
// still normalize (lower+trim) for consistency. Best-effort: a failure NEVER
// blocks account creation. Idempotent: WHERE claimed_at IS NULL, so re-running
// bootstrap re-claims nothing already claimed.
// Exported for unit testing.
// ---------------------------------------------------------------------------
export async function claimFreeTests(
  db: PostgresClient,
  tenantId: string,
  verifiedEmail: string
): Promise<number> {
  if (!verifiedEmail) return 0;
  const normalizedEmail = verifiedEmail.toLowerCase().trim();
  try {
    const { rows } = await db.query<{ id: string }>(
      `UPDATE lead_capture
          SET claimed_at = NOW(), claimed_by_tenant_id = $1
        WHERE email = $2 AND claimed_at IS NULL
        RETURNING id`,
      [tenantId, normalizedEmail]
    );
    if (rows.length > 0) {
      logger.info("free_tests_claimed", { tenant_id: tenantId, count: rows.length });
    }
    return rows.length;
  } catch (err) {
    logger.error("free_tests_claim_failed", {
      tenant_id: tenantId,
      message: (err as Error).message,
      // NOTE: email intentionally NOT logged — hard rule (PII)
    });
    return 0;
  }
}

export async function claimKitOrders(
  db: PostgresClient,
  tenantId: string,
  verifiedEmail: string
): Promise<number> {
  if (!verifiedEmail) return 0;
  const normalizedEmail = verifiedEmail.toLowerCase().trim();
  try {
    const { rows } = await db.query<{ id: string }>(
      `UPDATE kit_order
          SET claimed_at = NOW(), claimed_by_tenant_id = $1
        WHERE email = $2 AND claimed_at IS NULL
        RETURNING id`,
      [tenantId, normalizedEmail]
    );
    if (rows.length > 0) {
      logger.info("kit_orders_claimed", { tenant_id: tenantId, count: rows.length });
    }
    return rows.length;
  } catch (err) {
    logger.error("kit_orders_claim_failed", {
      tenant_id: tenantId,
      message: (err as Error).message,
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// claimPagesOrders — Ozvor Pages $99 credits (#208 PR-2)
// ---------------------------------------------------------------------------
// On first login, grant the landing-site credits from paid-but-unclaimed
// pages_order rows matching the Supabase-verified email: each claimed order
// adds +1 to tenants.extra_landing_sites. Same security/best-effort/idempotency
// contract as claimKitOrders above (status transition 'paid' → 'credited'
// guards double-crediting). Exported for unit testing.
// ---------------------------------------------------------------------------
export async function claimPagesOrders(
  db: PostgresClient,
  tenantId: string,
  verifiedEmail: string
): Promise<number> {
  if (!verifiedEmail) return 0;
  const normalizedEmail = verifiedEmail.toLowerCase().trim();
  try {
    // ATOMIC (#262 related HIGH): the status transition + tenant increment must
    // commit together, or a crash between them loses the paid credit forever
    // (retry only re-selects status='paid'). One transaction fixes that.
    const count = await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE pages_order
            SET status = 'credited', credited_tenant_id = $1, credited_at = NOW()
          WHERE email = $2 AND status = 'paid'
          RETURNING id`,
        [tenantId, normalizedEmail]
      );
      if (rows.length > 0) {
        await tx.query(
          `UPDATE tenants SET extra_landing_sites = extra_landing_sites + $2 WHERE id = $1`,
          [tenantId, rows.length]
        );
      }
      return rows.length;
    });
    if (count > 0) {
      logger.info("pages_orders_claimed", { tenant_id: tenantId, count });
    }
    return count;
  } catch (err) {
    logger.error("pages_orders_claim_failed", {
      tenant_id: tenantId,
      message: (err as Error).message,
    });
    return 0;
  }
}

function tenantNameFromEmail(email: string | undefined): string {
  if (!email) return "My workspace";
  const domain = email.split("@")[1];
  if (domain && !/(gmail|outlook|hotmail|yahoo|proton|icloud)\./i.test(domain)) {
    return domain.split(".")[0]!.replace(/^\w/, (c) => c.toUpperCase());
  }
  return `${email.split("@")[0]}'s workspace`;
}

/** Set app_metadata on the Supabase user via the Admin API (service role). */
async function setSupabaseAppMetadata(uid: string, tenantId: string): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${uid}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ app_metadata: { tenant_id: tenantId, app_role: "owner" } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function registerOnboardingRoutes(app: Hono, db: PostgresClient): void {
  // POST /api/account/bootstrap — provision tenant + user on first login.
  app.post("/api/account/bootstrap", async (c) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized", code: "MISSING_TOKEN" }, 401);
    }

    let session: Awaited<ReturnType<typeof verifySupabaseToken>>;
    try {
      session = await verifySupabaseToken(authHeader.slice(7));
    } catch {
      return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
    }

    // Already has a tenant claim → nothing to do.
    if (session.tenantId) {
      return c.json({ tenant_id: session.tenantId, role: session.role, provisioned: false });
    }

    // Idempotency: a users row may already exist (e.g. metadata write failed last time).
    const existing = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM users WHERE supabase_auth_uid = $1 LIMIT 1`,
      [session.uid]
    );
    let tenantId = existing.rows[0]?.tenant_id;

    if (!tenantId) {
      // Provisioning is privileged — not under a tenant RLS context.
      tenantId = randomUUID();
      await db.query(
        `INSERT INTO tenants (id, name, plan, plan_tier, created_at)
         VALUES ($1, $2, 'solo', 'free', NOW())`,
        [tenantId, tenantNameFromEmail(session.email)]
      );
      await db.setTenantId(tenantId);
      await db.query(
        `INSERT INTO users (id, tenant_id, email, role, supabase_auth_uid, created_at)
         VALUES ($1, $2, $3, 'owner', $4, NOW())
         ON CONFLICT (supabase_auth_uid) DO NOTHING`,
        [randomUUID(), tenantId, session.email ?? "", session.uid]
      );
      logger.info("tenant_provisioned", { tenant_id: tenantId, supabaseUid: session.uid });
    }

    // Claim any pending subscription for this verified email.
    // SECURITY: session.email comes from the validated Supabase JWT — Supabase
    // has verified email ownership via magic link. Safe to use as lookup key.
    // Best-effort: claim failure must not block account creation.
    await claimPendingSubscription(db, tenantId, session.email ?? "");

    // Funnel continuity (#166): recover the visitor's pre-account free tests +
    // Kit purchases by the same verified email. Best-effort; never blocks signup.
    // One hook covers magic-link AND all OAuth providers (Google/GitHub/LinkedIn),
    // since they all land here with a Supabase-verified session.email.
    await claimFreeTests(db, tenantId, session.email ?? "");
    await claimKitOrders(db, tenantId, session.email ?? "");
    await claimPagesOrders(db, tenantId, session.email ?? "");

    // Push the claim into Supabase so future JWTs carry tenant_id + owner role.
    const metaSet = await setSupabaseAppMetadata(session.uid, tenantId);
    if (!metaSet) {
      // Tenant+user exist, but the claim couldn't be set → product still 401s
      // until SUPABASE_SERVICE_ROLE_KEY is configured. Fail loud.
      logger.error("bootstrap_metadata_set_failed", { supabaseUid: session.uid });
      return c.json(
        { error: "provisioning_incomplete", code: "METADATA_NOT_SET", tenant_id: tenantId },
        503
      );
    }

    // Client must refresh its session to pick up the new claims.
    return c.json({ tenant_id: tenantId, role: "owner", provisioned: true, refresh: true });
  });
}
