/**
 * C8 — Prompt Library — API routes (TrustIndex AI)
 *
 * Routes:
 *   GET    /api/brands/:id/prompts            — list defaults + custom prompts (all roles)
 *   POST   /api/brands/:id/prompts            — add a custom prompt (Owner/Editor)
 *   DELETE /api/brands/:id/prompts/:promptId  — remove a custom prompt (Owner/Editor)
 *
 * Custom prompts are stored in the `audit_prompt` table (migration 20260626000001).
 * Default prompts are computed inline from the brand's name + category using the
 * same buildPromptPortfolio() logic as the audit worker — no DB row, no deletion.
 *
 * Hard rules:
 *  - tenant_id resolved from JWT only — never from request body
 *  - All DB queries parameterized — no string interpolation EVER
 *  - db.setTenantId(auth.tenantId) called before any query (RLS enforcement)
 *  - requireAuth comes first on every route; requireRole applied per contract
 *  - Graceful 503/fallback when audit_prompt table doesn't exist yet (42P01)
 *  - Error responses: { error, code, requestId } — no stack traces or DB text
 *  - Rate limiting: auth + resource-creation endpoints declared here (middleware
 *    config enforces; Upstash Redis limit deferred to the global middleware tier)
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../auth/middleware";
import type { PostgresClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Default prompt portfolio — same logic as apps/worker/src/jobs/audit-run.ts
// buildPromptPortfolio(). Kept inline so this route module has zero worker
// dependency and stays independently deployable.
// ---------------------------------------------------------------------------

function buildPromptPortfolio(brandName: string, category: string | null): string[] {
  const cat = category && category.trim() ? category.trim() : "solution";
  return [
    `What is the best ${cat} for small businesses?`,
    `Top ${cat} providers in 2026`,
    `${cat} alternatives worth considering`,
    `Which ${cat} do experts recommend?`,
    `Most trusted ${cat} companies`,
    `Best ${cat} for SMBs on a budget`,
    `${brandName} vs competitors`,
    `Is ${brandName} a good choice?`,
    `Pros and cons of leading ${cat} options`,
    `How to choose a ${cat} vendor`,
  ];
}

// ---------------------------------------------------------------------------
// Table-missing error detection
// Postgres error code 42P01 = undefined_table.
// postgres-js wraps the server error in a PostgresError with a `.code` field.
// We also check the message string as a belt-and-suspenders fallback.
// ---------------------------------------------------------------------------

function isTableMissingError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    if (code === "42P01") return true;
    const msg = (err as Error).message ?? "";
    if (msg.includes("does not exist")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPromptRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/brands/:id/prompts
  // Returns the brand's default + custom prompt lists.
  // Default prompts are derived from brand name + category (no DB row).
  // Custom prompts come from audit_prompt table (RLS tenant-scoped).
  // -------------------------------------------------------------------------
  app.get(
    "/api/brands/:id/prompts",
    requireAuth,
    requireRole(["owner", "editor", "viewer"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      await db.setTenantId(tenantId);

      // Verify the brand belongs to this tenant (RLS also enforces, but explicit
      // check avoids leaking 404 vs 403 timing differences via tenant mismatch).
      const brandRes = await db.query<{ id: string; name: string; category: string | null }>(
        `SELECT id, name, category FROM brands WHERE id = $1 AND tenant_id = $2`,
        [brandId, tenantId]
      );
      const brand = brandRes.rows[0];
      if (!brand) {
        return c.json({ error: "Brand not found.", code: "BRAND_NOT_FOUND" }, 404);
      }

      // Build default prompts from brand name + category.
      const defaultPromptTexts = buildPromptPortfolio(brand.name, brand.category);
      const defaults = defaultPromptTexts.map((text) => ({ text, is_custom: false }));

      // Load custom prompts — graceful fallback when table not yet created.
      let custom: Array<{
        id: string;
        text: string;
        sort_order: number;
        is_custom: boolean;
        created_at: string;
      }> = [];

      try {
        const customRes = await db.query<{
          id: string;
          text: string;
          sort_order: number;
          is_custom: boolean;
          created_at: string;
        }>(
          `SELECT id, text, sort_order, is_custom, created_at
             FROM audit_prompt
            WHERE brand_id = $1
            ORDER BY sort_order ASC`,
          [brandId]
        );
        custom = customRes.rows;
      } catch (err) {
        if (isTableMissingError(err)) {
          // Table not yet applied — return defaults only. Not an error.
          logger.warn("audit_prompt_table_missing_get", { brand_id: brandId });
        } else {
          throw err; // re-throw unexpected errors to the global handler
        }
      }

      return c.json({ defaults, custom });
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/brands/:id/prompts
  // Add a custom prompt to the brand's library (max 10 per brand, max 200 chars).
  // Returns 201 with the new row on success.
  // -------------------------------------------------------------------------
  app.post(
    "/api/brands/:id/prompts",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");

      // Parse body.
      let body: { text?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
      }

      // Validate text: non-empty string, max 200 characters after trim.
      if (typeof body.text !== "string") {
        return c.json({ error: "text must be a string.", code: "INVALID_TEXT" }, 400);
      }
      const text = body.text.trim();
      if (!text) {
        return c.json({ error: "text must not be empty.", code: "INVALID_TEXT" }, 400);
      }
      if (text.length > 200) {
        return c.json(
          { error: "PROMPT_TOO_LONG", code: "PROMPT_TOO_LONG", max: 200 },
          422
        );
      }

      await db.setTenantId(tenantId);

      // Verify brand ownership.
      const brandRes = await db.query<{ id: string }>(
        `SELECT id FROM brands WHERE id = $1 AND tenant_id = $2`,
        [brandId, tenantId]
      );
      if (!brandRes.rows[0]) {
        return c.json({ error: "Brand not found.", code: "BRAND_NOT_FOUND" }, 404);
      }

      try {
        // Enforce cap of 10 custom prompts per brand.
        const countRes = await db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM audit_prompt WHERE brand_id = $1`,
          [brandId]
        );
        const existingCount = parseInt(countRes.rows[0]?.count ?? "0", 10);
        if (existingCount >= 10) {
          return c.json(
            { error: "PROMPT_LIMIT_REACHED", code: "PROMPT_LIMIT_REACHED", max: 10 },
            422
          );
        }

        // Insert: sort_order = max existing + 1 (0-based); subquery is parameterized.
        const insertRes = await db.query<{
          id: string;
          text: string;
          sort_order: number;
          is_custom: boolean;
          created_at: string;
        }>(
          `INSERT INTO audit_prompt (id, tenant_id, brand_id, text, sort_order, is_custom)
           VALUES (
             gen_random_uuid(),
             $1,
             $2,
             $3,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM audit_prompt WHERE brand_id = $4),
             TRUE
           )
           RETURNING id, text, sort_order, is_custom, created_at`,
          [tenantId, brandId, text, brandId]
        );

        const newPrompt = insertRes.rows[0];
        return c.json(newPrompt, 201);
      } catch (err) {
        if (isTableMissingError(err)) {
          logger.warn("audit_prompt_table_missing_post", { brand_id: brandId });
          return c.json(
            { error: "PROMPT_TABLE_NOT_READY", code: "PROMPT_TABLE_NOT_READY" },
            503
          );
        }
        throw err;
      }
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/brands/:id/prompts/:promptId
  // Remove a custom prompt. Only is_custom=TRUE rows can be deleted via API
  // (default prompts have no DB row so this constraint is belt-and-suspenders).
  // Returns 204 on success, 404 if not found/already deleted.
  // -------------------------------------------------------------------------
  app.delete(
    "/api/brands/:id/prompts/:promptId",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const { tenantId } = auth;
      const brandId = c.req.param("id");
      const promptId = c.req.param("promptId");

      await db.setTenantId(tenantId);

      // Verify brand ownership before attempting delete.
      const brandRes = await db.query<{ id: string }>(
        `SELECT id FROM brands WHERE id = $1 AND tenant_id = $2`,
        [brandId, tenantId]
      );
      if (!brandRes.rows[0]) {
        return c.json({ error: "Brand not found.", code: "BRAND_NOT_FOUND" }, 404);
      }

      try {
        // Delete with full triple-key constraint: id + brand_id + tenant_id + is_custom.
        // Using RETURNING id to detect whether a row was actually deleted.
        const delRes = await db.query<{ id: string }>(
          `DELETE FROM audit_prompt
            WHERE id = $1
              AND brand_id = $2
              AND tenant_id = $3
              AND is_custom = TRUE
           RETURNING id`,
          [promptId, brandId, tenantId]
        );

        if (delRes.rows.length === 0) {
          return c.json(
            { error: "Prompt not found.", code: "PROMPT_NOT_FOUND" },
            404
          );
        }

        return new Response(null, { status: 204 });
      } catch (err) {
        if (isTableMissingError(err)) {
          logger.warn("audit_prompt_table_missing_delete", { brand_id: brandId, prompt_id: promptId });
          return c.json(
            { error: "PROMPT_TABLE_NOT_READY", code: "PROMPT_TABLE_NOT_READY" },
            503
          );
        }
        throw err;
      }
    }
  );
}
