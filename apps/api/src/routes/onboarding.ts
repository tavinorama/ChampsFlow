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
