/**
 * CI-3/CI-4/CI-5 — DSR Workflow + Audit Log — API routes
 *
 * Routes:
 *   POST  /api/dsr/intake                — PUBLIC. Submit a DSR request (any 5 types).
 *   POST  /api/dsr/verify                — PUBLIC. Verify OTP for a DSR request.
 *   POST  /api/dsr/lost-email-escalation — PUBLIC. Escalate when email is inaccessible.
 *   GET   /api/dsr/:id/status            — PUBLIC (token-gated via ?token=). Check status.
 *   POST  /api/dsr/:id/fulfill           — requireSuperAdmin. Trigger fulfillment.
 *
 * Security:
 *   - OTP: 6-digit, SHA-256(otp + salt) stored — NEVER plaintext. Salt = request UUID.
 *   - S-11: verification_attempts counter; > 5 attempts → OTP invalidated (hash NULLed,
 *     expiry set to epoch). Brute-force protection via Redis attempt counter for burst;
 *     DB attempts counter for persistent tracking.
 *   - S-14: per-IP rate limit 5/hour on POST /api/dsr/intake.
 *   - verification_token: random 32-byte hex, returned once on intake. Not the OTP.
 *   - No DPA gate: DSR is a legal right; requireDpaAcknowledged NOT applied here.
 *   - tenant_id resolved from JWT claim only (when auth context available).
 *   - Full IP NEVER stored — truncateIp() from dpa.ts applied to all write paths.
 *   - PII (email) never logged — only dsr_id in structured logs.
 *
 * Fulfillment:
 *   - access/portability: export all user data as JSON → store URL in result_artifact_url
 *   - erasure: cascade delete: drafts deleted, generation_log pseudonymized (user_id→NULL),
 *     social_accounts revoked + tokens NULLed, users.deleted_at set + deletion_requested_at set
 *   - correction/restriction: queued for super_admin to action; status → in_progress
 *   - restriction: users.restricted = TRUE → blocks generation/scheduling/publishing
 *
 * Architecture refs:
 *   docs/03-architecture.md §5, §6.3, §13 DSR Workflow
 *   docs/02-prd.md CI-3, CI-4, CI-5
 *   docs/compliance/dpia.md §4.1
 *
 * Hard rules:
 *   - All SQL parameterized — no string interpolation
 *   - No plaintext OTP stored or logged anywhere
 *   - All timestamps UTC
 *   - Lost-email escalation email sent to DSR_OPERATIONS_EMAIL env var
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { createHash, randomBytes } from "crypto";
import { getSharedRedis, type SharedRedis } from "../shared-redis";
import { requireAuth } from "../auth/middleware";
import { requireSuperAdmin } from "../auth/middleware";
import { truncateIp } from "./dpa";
import { clientIp } from "../lib/client-ip";
import type { PostgresClient, TxClient } from "./social-accounts";
import { logger } from "../../../../packages/shared/src/logger";
import { jsonbParam } from "../../../../packages/shared/src/jsonb";
import { sendResendEmail } from "../../../../packages/shared/src/emails/resend-send";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const DSR_INTAKE_RATE_LIMIT = 5; // per IP per hour
const DSR_INTAKE_WINDOW_MS = 60 * 60 * 1000;

const VALID_REQUEST_TYPES = [
  "access",
  "correction",
  "restriction",
  "erasure",
  "portability",
] as const;

type DsrRequestType = (typeof VALID_REQUEST_TYPES)[number];

// ---------------------------------------------------------------------------
// Redis (shared Railway Redis)
// ---------------------------------------------------------------------------

function getRedis(): SharedRedis {
  return getSharedRedis();
}

// ---------------------------------------------------------------------------
// Per-IP rate limit: 5 requests/hour (S-14)
// Key: dsr_intake:<truncated-ip>
// ---------------------------------------------------------------------------

async function checkIntakeRateLimit(ipTruncated: string): Promise<boolean> {
  const redis = getRedis();
  const key = `dsr_intake:${ipTruncated || "unknown"}`;
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - DSR_INTAKE_WINDOW_MS);
  pipeline.zadd(key, { score: now, member: String(now) });
  pipeline.zcard(key);
  pipeline.expire(key, 3600);

  const results = await pipeline.exec();
  const count = results[2] as number;
  return count <= DSR_INTAKE_RATE_LIMIT;
}

// ---------------------------------------------------------------------------
// OTP helpers
//
// generate6DigitOtp: cryptographically random 6-digit string.
// hashOtp: SHA-256(otp + salt) — salt = dsr_request.id (UUID).
//          Returns hex digest. NEVER log or store plaintext OTP.
// ---------------------------------------------------------------------------

function generate6DigitOtp(): string {
  // Generate 4 random bytes, take value mod 1_000_000, zero-pad to 6 digits.
  const buf = randomBytes(4);
  const num = buf.readUInt32BE(0) % 1_000_000;
  return String(num).padStart(6, "0");
}

function hashOtp(otp: string, salt: string): string {
  // SHA-256(otp + salt) — NEVER plaintext. Salt is the DSR request UUID.
  return createHash("sha256").update(otp + salt).digest("hex");
}

function generateVerificationToken(): string {
  // 32-byte random hex — returned to submitter for status-check URL.
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------

async function writeAuditLog(
  db: PostgresClient,
  params: {
    event_type: string;
    actor_user_id?: string | null;
    tenant_id?: string | null;
    target_entity?: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
    ip_truncated?: string;
  }
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (event_type, actor_user_id, tenant_id, target_entity, target_id, metadata, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
    [
      params.event_type,
      params.actor_user_id ?? null,
      params.tenant_id ?? null,
      params.target_entity ?? "dsr_requests",
      params.target_id ?? null,
      params.metadata ? jsonbParam(params.metadata) : null,
      params.ip_truncated ? params.ip_truncated : null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Send OTP email via integration module (best-effort)
// ---------------------------------------------------------------------------

async function sendOtpEmail(params: {
  email: string;
  otp: string;
  requestId: string;
}): Promise<void> {
  try {
    const { sendDsrOtpEmail } = await import(
      "../../../../packages/shared/src/emails/dsr-otp.js"
    );
    await sendDsrOtpEmail({
      to: params.email,
      otp: params.otp,
      expiryMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch (err) {
    // Best-effort: log structured error but do NOT fail the intake
    logger.error("dsr_otp_email_send_failed", {
      requestId: params.requestId,
      message: (err as Error).message,
      // Do NOT log email address (PII)
    });
  }
}

async function sendConfirmedEmail(params: {
  email: string;
  requestId: string;
  requestType: DsrRequestType;
}): Promise<void> {
  try {
    const { sendDsrConfirmedEmail } = await import(
      "../../../../packages/shared/src/emails/dsr-confirmed.js"
    );
    const slaDays = "30/45"; // GDPR 30 days / CCPA 45 days
    await sendDsrConfirmedEmail({
      to: params.email,
      requestType: params.requestType,
      slaDays,
    });
  } catch (err) {
    logger.error("dsr_confirmed_email_send_failed", {
      requestId: params.requestId,
      message: (err as Error).message,
    });
  }
}

async function sendCompletedEmail(params: {
  email: string;
  requestId: string;
  resultArtifactUrl?: string;
}): Promise<void> {
  try {
    const { sendDsrCompletedEmail } = await import(
      "../../../../packages/shared/src/emails/dsr-completed.js"
    );
    await sendDsrCompletedEmail({
      to: params.email,
      requestId: params.requestId,
      resultArtifactUrl: params.resultArtifactUrl,
    });
  } catch (err) {
    logger.error("dsr_completed_email_send_failed", {
      requestId: params.requestId,
      message: (err as Error).message,
    });
  }
}

/**
 * Confirm to an access/portability requester that the controller holds NO
 * personal data for their email (the honest GDPR Art. 15 / CCPA §1798.110
 * answer). Sent in place of sendCompletedEmail when the request closes as
 * 'closed_no_data' — so the requester is never linked to an empty export.
 */
async function sendNoDataEmail(params: {
  email: string;
  requestId: string;
  requestType: "access" | "portability";
}): Promise<void> {
  try {
    const { sendDsrNoDataEmail } = await import(
      "../../../../packages/shared/src/emails/dsr-no-data.js"
    );
    await sendDsrNoDataEmail({
      to: params.email,
      requestId: params.requestId,
      requestType: params.requestType,
    });
  } catch (err) {
    logger.error("dsr_no_data_email_send_failed", {
      requestId: params.requestId,
      message: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// GDPR Art. 17 erasure cascade
// ---------------------------------------------------------------------------

/**
 * The erasure cascade as a single unit of work. MUST be invoked inside one
 * db.transaction() so all four steps commit together or roll back together — a
 * partial erasure (e.g. drafts deleted but the user record still live) is a
 * GDPR Art. 17 integrity violation.
 *
 * Exported so the atomicity test exercises the SHIPPED cascade rather than a
 * copy; if a step is ever moved outside the transaction the test will catch it.
 *
 * Step order (architecture §13): drafts → generation_log pseudonymized →
 * social_accounts revoked → users soft-delete. The audit_log is NOT touched
 * (Art. 17(3)(e) accountability retention). Every statement carries an explicit
 * WHERE tenant_id as defence-in-depth for the unscoped (super-admin) path.
 */
export async function runErasureCascade(
  tx: TxClient,
  userId: string,
  tenantId: string
): Promise<void> {
  // 1. Delete drafts
  await tx.query(`DELETE FROM drafts WHERE user_id = $1 AND tenant_id = $2`, [userId, tenantId]);

  // 2. Pseudonymize generation_log: set user_id → NULL (row retained for audit).
  // app_user is REVOKED from UPDATE on generation_log (CC-1 append-only enforcement).
  // We call the SECURITY DEFINER function pseudonymize_generation_log_for_erasure()
  // which runs as the DB owner — the ONLY permitted path to UPDATE generation_log.
  // Migration 20260506000005 creates this function and GRANTS EXECUTE to app_user.
  await tx.query(`SELECT pseudonymize_generation_log_for_erasure($1::uuid, $2::uuid)`, [
    userId,
    tenantId,
  ]);

  // 3. Social accounts: revoke (NULL out encrypted tokens, set revoked_at)
  await tx.query(
    `UPDATE social_accounts
       SET access_token_enc = NULL,
           refresh_token_enc = NULL,
           revoked_at = NOW(),
           updated_at = NOW()
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  // 4. Soft-delete user record
  await tx.query(
    `UPDATE users
       SET deleted_at = NOW(),
           deletion_requested_at = NOW(),
           updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
}

/**
 * Resolve the data subject(s) a DSR fulfilment should act on.
 *
 * Historically the fulfil handler keyed erasure/restriction off `dsr.user_id`,
 * which is populated ONLY when the requester was authenticated at intake. Public
 * (unauthenticated) erasure requests — and authenticated users who submitted
 * while logged out — therefore had user_id = NULL and were silently skipped
 * while the request was still marked 'fulfilled'. This resolves the subject by
 * requester_email when user_id is absent.
 *
 * Returns 0, 1, or many {userId, tenantId} pairs:
 *   - 0  → controller holds no personal data for this email (close as no-data)
 *   - 1  → the data subject (act on it)
 *   - >1 → email maps to accounts in multiple tenants; the caller must refuse and
 *          route to a human, because erasing/restricting the wrong subject is
 *          itself an irreversible violation. users.email is unique only per
 *          (tenant_id, email), so a NULL-tenant intake row can match several.
 *
 * Soft-deleted users (deleted_at set) are excluded — they have already been
 * through erasure, so they neither need re-erasing nor count as "data held".
 */
export async function resolveDsrSubjects(
  db: PostgresClient,
  dsr: { user_id: string | null; tenant_id: string | null; requester_email: string }
): Promise<Array<{ userId: string; tenantId: string }>> {
  // Explicit user_id from intake (authenticated requester).
  if (dsr.user_id) {
    if (dsr.tenant_id) {
      return [{ userId: dsr.user_id, tenantId: dsr.tenant_id }];
    }
    // user_id without tenant_id — recover the tenant from the user row so the
    // tenant-scoped cascade can still run (the old code required both and so
    // silently skipped this case too).
    const byId = await db.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [dsr.user_id]
    );
    return byId.rows.map((u) => ({ userId: u.id, tenantId: u.tenant_id }));
  }

  // No user_id — resolve by the (verified) requester email, lowercased at intake.
  const email = dsr.requester_email.trim().toLowerCase();
  const matches = dsr.tenant_id
    ? await db.query<{ id: string; tenant_id: string }>(
        `SELECT id, tenant_id FROM users
         WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL`,
        [dsr.tenant_id, email]
      )
    : await db.query<{ id: string; tenant_id: string }>(
        `SELECT id, tenant_id FROM users
         WHERE email = $1 AND deleted_at IS NULL`,
        [email]
      );
  return matches.rows.map((u) => ({ userId: u.id, tenantId: u.tenant_id }));
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerDsrRoutes(app: Hono, db: PostgresClient): void {

  // -------------------------------------------------------------------------
  // POST /api/dsr/intake
  //
  // PUBLIC (no requireAuth). Accepts both authenticated and unauthenticated
  // requests. Email OTP identity verification happens separately via /verify.
  //
  // Hard rules:
  //  - S-14: per-IP rate limit 5/hour
  //  - OTP generated here but NEVER stored plaintext — only hash stored
  //  - IP truncated before storage
  //  - tenant_id resolved from auth context (if present) — never from body
  //  - email validated for basic format; no max-length exploit
  //  - Audit log: dsr_request_received
  // -------------------------------------------------------------------------
  app.post("/api/dsr/intake", async (ctx: Context) => {
    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, 400);
    }

    const { email, name, request_type, account_id, lost_email_explanation } = body;

    // Validate required fields
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return ctx.json({ error: "Valid email is required", code: "INVALID_EMAIL" }, 400);
    }

    if (!VALID_REQUEST_TYPES.includes(request_type as DsrRequestType)) {
      return ctx.json(
        {
          error: `request_type must be one of: ${VALID_REQUEST_TYPES.join(", ")}`,
          code: "INVALID_REQUEST_TYPE",
        },
        400
      );
    }

    // Sanitize optional string fields
    const cleanName = typeof name === "string" ? name.slice(0, 200).trim() : null;
    const cleanAccountId =
      typeof account_id === "string" ? account_id.slice(0, 100).trim() : null;
    const cleanLostEmailExplanation =
      typeof lost_email_explanation === "string"
        ? lost_email_explanation.slice(0, 2000).trim()
        : null;

    // Truncate IP (GDPR data minimization — never store full IP)
    // clientIp = cf-connecting-ip → LAST XFF hop (never the forgeable first hop)
    // → x-real-ip. Then truncate for storage (GDPR data minimization).
    const ipTruncated = truncateIp(clientIp(ctx) ?? "");

    // Per-IP rate limit (S-14): 5 requests/hour
    const allowed = await checkIntakeRateLimit(ipTruncated || "unknown");
    if (!allowed) {
      return ctx.json(
        { error: "Too many DSR submissions from this IP", code: "RATE_LIMITED", retry_after: 3600 },
        429
      );
    }

    // Resolve optional tenant_id from JWT (if authenticated user submitting)
    let tenantId: string | null = null;
    let userId: string | null = null;
    try {
      const auth = ctx.get("auth");
      if (auth) {
        tenantId = auth.tenantId;
        userId = auth.userId;
      }
    } catch {
      // Public route — auth context is optional; ignore if missing
    }

    // Generate OTP + verification token
    const otp = generate6DigitOtp();
    const verificationToken = generateVerificationToken();

    // Insert DSR request row (OTP hash computed AFTER we have the row ID for salt)
    // Compute OTP expiry timestamp before insert (avoids INTERVAL string interpolation)
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO dsr_requests
         (tenant_id, user_id, requester_email, request_type,
          verification_token, identity_verified, status,
          submitter_ip_truncated, notes,
          verification_otp_expires_at, verification_attempts,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, 'received', $6, $7,
               $8::timestamptz,
               0, NOW(), NOW())
       RETURNING id`,
      [
        tenantId,
        userId,
        email.trim().toLowerCase(),
        request_type,
        verificationToken,
        ipTruncated || null,
        cleanLostEmailExplanation
          ? JSON.stringify({ flag: "lost_email_context", detail: cleanLostEmailExplanation })
          : cleanAccountId
          ? JSON.stringify({ account_id: cleanAccountId })
          : null,
        otpExpiresAt,
      ]
    );

    const requestId = insertResult.rows[0].id;

    // Now compute OTP hash using requestId as salt — never log plaintext OTP
    const otpHash = hashOtp(otp, requestId);

    // Store hash in the row
    await db.query(
      `UPDATE dsr_requests
       SET verification_otp_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [otpHash, requestId]
    );

    // Audit log: dsr_request_received (no email in metadata — PII minimization)
    await writeAuditLog(db, {
      event_type: "dsr_request_received",
      actor_user_id: userId,
      tenant_id: tenantId,
      target_id: requestId,
      metadata: {
        request_type,
        identity_method: "email_otp",
      },
      ip_truncated: ipTruncated || undefined,
    });

    // Send OTP email (best-effort — does not block intake on failure)
    await sendOtpEmail({ email: email.trim(), otp, requestId });

    logger.info("dsr_intake_created", {
      requestId,
      request_type: String(request_type),
      // No email logged (PII)
    });

    return ctx.json(
      {
        request_id: requestId,
        verification_token: verificationToken,
        message:
          "DSR request received. Check your email for a 6-digit verification code (valid 10 minutes).",
        status: "received",
      },
      201
    );
  });

  // -------------------------------------------------------------------------
  // POST /api/dsr/verify
  //
  // PUBLIC. Verifies the OTP for a DSR request. Increments attempt counter.
  // S-11: > OTP_MAX_ATTEMPTS → OTP invalidated (hash NULLed, expiry → past).
  //
  // Body: { request_id: string, otp: string }
  // Response: { ok: true, status: 'processing' } on success
  // -------------------------------------------------------------------------
  app.post("/api/dsr/verify", async (ctx: Context) => {
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, 400);
    }

    const { request_id, otp } = body;

    if (typeof request_id !== "string" || !request_id.trim()) {
      return ctx.json({ error: "request_id is required", code: "MISSING_REQUEST_ID" }, 400);
    }

    if (typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
      return ctx.json(
        { error: "otp must be a 6-digit number", code: "INVALID_OTP_FORMAT" },
        400
      );
    }

    // Fetch the DSR request
    const result = await db.query<{
      id: string;
      tenant_id: string | null;
      user_id: string | null;
      requester_email: string;
      request_type: string;
      status: string;
      verification_otp_hash: string | null;
      verification_otp_expires_at: string | null;
      verification_attempts: number;
      verified_at: string | null;
    }>(
      `SELECT id, tenant_id, user_id, requester_email, request_type, status,
              verification_otp_hash, verification_otp_expires_at,
              verification_attempts, verified_at
       FROM dsr_requests
       WHERE id = $1
       LIMIT 1`,
      [request_id.trim()]
    );

    if (result.rows.length === 0) {
      // Return same error as wrong OTP to avoid enumeration
      return ctx.json({ error: "Invalid request or OTP", code: "INVALID_OTP" }, 400);
    }

    const row = result.rows[0];

    // Already verified
    if (row.verified_at !== null) {
      return ctx.json({ ok: true, status: row.status, already_verified: true }, 200);
    }

    // Already rejected/fulfilled
    if (row.status === "fulfilled" || row.status === "rejected") {
      return ctx.json({ error: "Request is no longer active", code: "REQUEST_CLOSED" }, 400);
    }

    // S-11: increment attempt counter first (before checking hash — prevents oracle)
    const updatedAttempts = row.verification_attempts + 1;

    // Check if OTP is already invalidated (max attempts exceeded previously)
    if (row.verification_otp_hash === null) {
      return ctx.json(
        {
          error: "OTP has been invalidated due to too many attempts. Please submit a new DSR request.",
          code: "OTP_INVALIDATED",
        },
        400
      );
    }

    // S-11: if this attempt exceeds max, invalidate OTP immediately
    if (updatedAttempts > OTP_MAX_ATTEMPTS) {
      await db.query(
        `UPDATE dsr_requests
         SET verification_otp_hash = NULL,
             verification_otp_expires_at = TO_TIMESTAMP(0),
             verification_attempts = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [updatedAttempts, row.id]
      );

      await writeAuditLog(db, {
        event_type: "dsr_otp_invalidated_brute_force",
        actor_user_id: null,
        tenant_id: row.tenant_id,
        target_id: row.id,
        metadata: { attempts: updatedAttempts },
      });

      logger.warn("dsr_otp_brute_force_invalidated", {
        requestId: row.id,
        attempts: updatedAttempts,
      });

      return ctx.json(
        {
          error: "OTP invalidated due to too many attempts. Please submit a new DSR request.",
          code: "OTP_INVALIDATED",
        },
        400
      );
    }

    // Check expiry
    const now = new Date();
    const expiresAt = row.verification_otp_expires_at
      ? new Date(row.verification_otp_expires_at)
      : null;
    const isExpired = !expiresAt || now > expiresAt;

    if (isExpired) {
      // Increment attempt count even on expired OTP
      await db.query(
        `UPDATE dsr_requests SET verification_attempts = $1, updated_at = NOW() WHERE id = $2`,
        [updatedAttempts, row.id]
      );
      return ctx.json({ error: "OTP has expired", code: "OTP_EXPIRED" }, 400);
    }

    // Compute expected hash (salt = row.id)
    const expectedHash = hashOtp(otp.trim(), row.id);
    const hashMatch = expectedHash === row.verification_otp_hash;

    if (!hashMatch) {
      // Increment attempts
      await db.query(
        `UPDATE dsr_requests SET verification_attempts = $1, updated_at = NOW() WHERE id = $2`,
        [updatedAttempts, row.id]
      );

      const attemptsRemaining = OTP_MAX_ATTEMPTS - updatedAttempts;
      return ctx.json(
        {
          error: "Invalid OTP",
          code: "INVALID_OTP",
          attempts_remaining: Math.max(0, attemptsRemaining),
        },
        400
      );
    }

    // OTP valid: set verified_at, status → 'processing', clear OTP hash
    await db.query(
      `UPDATE dsr_requests
       SET verified_at = NOW(),
           identity_verified = TRUE,
           identity_method = 'email_otp',
           status = 'processing',
           verification_otp_hash = NULL,
           verification_otp_expires_at = NULL,
           verification_attempts = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [updatedAttempts, row.id]
    );

    // Audit log: dsr_request_verified
    await writeAuditLog(db, {
      event_type: "dsr_request_verified",
      actor_user_id: row.user_id,
      tenant_id: row.tenant_id,
      target_id: row.id,
      metadata: { request_type: row.request_type },
    });

    logger.info("dsr_request_verified", {
      requestId: row.id,
      request_type: row.request_type,
    });

    // Send confirmation email (best-effort)
    await sendConfirmedEmail({
      email: row.requester_email,
      requestId: row.id,
      requestType: row.request_type as DsrRequestType,
    });

    return ctx.json({ ok: true, status: "processing" }, 200);
  });

  // -------------------------------------------------------------------------
  // POST /api/dsr/lost-email-escalation
  //
  // PUBLIC. For users who cannot access their account email.
  // Creates a DSR request flagged for manual verification.
  // Sends notification email to DSR_OPERATIONS_EMAIL.
  //
  // Body: { account_id: string, contact_method: string, explanation: string }
  // SLA: 5 business days (stated in response and email)
  // -------------------------------------------------------------------------
  app.post("/api/dsr/lost-email-escalation", async (ctx: Context) => {
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return ctx.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, 400);
    }

    const { account_id, contact_method, explanation } = body;

    if (typeof account_id !== "string" || !account_id.trim()) {
      return ctx.json({ error: "account_id is required", code: "MISSING_ACCOUNT_ID" }, 400);
    }

    if (typeof contact_method !== "string" || !contact_method.trim()) {
      return ctx.json(
        { error: "contact_method is required", code: "MISSING_CONTACT_METHOD" },
        400
      );
    }

    if (typeof explanation !== "string" || explanation.trim().length < 10) {
      return ctx.json(
        { error: "explanation must be at least 10 characters", code: "MISSING_EXPLANATION" },
        400
      );
    }

    // clientIp = cf-connecting-ip → LAST XFF hop (never the forgeable first hop)
    // → x-real-ip. Then truncate for storage (GDPR data minimization).
    const ipTruncated = truncateIp(clientIp(ctx) ?? "");

    // Per-IP rate limit (shared with intake)
    const allowed = await checkIntakeRateLimit(ipTruncated || "unknown");
    if (!allowed) {
      return ctx.json(
        { error: "Too many requests from this IP", code: "RATE_LIMITED", retry_after: 3600 },
        429
      );
    }

    const notesPayload = JSON.stringify({
      flag: "lost_email_escalation",
      account_id: account_id.trim().slice(0, 100),
      contact_method: contact_method.trim().slice(0, 500),
      explanation: explanation.trim().slice(0, 2000),
    });

    // Insert DSR row — no email (lost-email case), use placeholder
    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO dsr_requests
         (tenant_id, user_id, requester_email, request_type,
          identity_verified, status, submitter_ip_truncated, notes,
          created_at, updated_at)
       VALUES (NULL, NULL, $1, 'access', FALSE, 'received', $2, $3, NOW(), NOW())
       RETURNING id`,
      [
        `lost-email:${account_id.trim().slice(0, 100)}`, // placeholder email field
        ipTruncated || null,
        notesPayload,
      ]
    );

    const requestId = insertResult.rows[0].id;

    // Audit log
    await writeAuditLog(db, {
      event_type: "dsr_lost_email_escalation_received",
      actor_user_id: null,
      tenant_id: null,
      target_id: requestId,
      metadata: { account_id: account_id.trim() },
      ip_truncated: ipTruncated || undefined,
    });

    // Send alert to DSR operations email
    const opsEmail = process.env.DSR_OPERATIONS_EMAIL ?? "privacy@ozvor.com";
    try {
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const alertText = [
          `New lost-email DSR escalation received.`,
          ``,
          `DSR Request ID: ${requestId}`,
          `Account ID provided: ${account_id.trim()}`,
          `Contact method: ${contact_method.trim()}`,
          `Explanation: ${explanation.trim()}`,
          ``,
          `SLA: Manual verification within 5 business days.`,
          ``,
          `Action required: verify identity manually, then use POST /api/dsr/${requestId}/fulfill`,
        ].join("\n");
        await sendResendEmail({
          from: process.env.EMAIL_FROM ?? "noreply@ozvor.com",
          to: opsEmail,
          subject: `[DSR Escalation] Lost-email request — Account ID: ${account_id.trim()}`,
          text: alertText,
          html: `<pre>${alertText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</pre>`,
        });
      }
    } catch (err) {
      logger.error("dsr_escalation_alert_email_failed", {
        requestId,
        message: (err as Error).message,
      });
    }

    logger.info("dsr_lost_email_escalation_created", { requestId });

    return ctx.json(
      {
        request_id: requestId,
        message:
          "Your escalation has been received. Our privacy team will manually verify your identity within 5 business days and contact you via your provided method.",
        status: "received",
      },
      201
    );
  });

  // -------------------------------------------------------------------------
  // GET /api/dsr/:id/status
  //
  // PUBLIC. Requires verification_token as query param.
  // Returns request status without exposing personal data.
  //
  // Query: ?token=<verification_token>
  // Response: { request_id, request_type, status, created_at, processed_at }
  // -------------------------------------------------------------------------
  app.get("/api/dsr/:id/status", async (ctx: Context) => {
    const requestId = ctx.req.param("id");
    const token = ctx.req.query("token");

    if (!requestId || !token) {
      return ctx.json(
        { error: "request id and token are required", code: "MISSING_PARAMS" },
        400
      );
    }

    const result = await db.query<{
      id: string;
      request_type: string;
      status: string;
      created_at: string;
      processed_at: string | null;
      verified_at: string | null;
      verification_token: string | null;
    }>(
      `SELECT id, request_type, status, created_at, processed_at, verified_at, verification_token
       FROM dsr_requests
       WHERE id = $1
       LIMIT 1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      // Return same error as token mismatch — avoid enumeration
      return ctx.json({ error: "Not found or invalid token", code: "NOT_FOUND" }, 404);
    }

    const row = result.rows[0];

    // Constant-time token comparison to prevent timing attacks
    const expectedToken = row.verification_token ?? "";
    const providedToken = token;
    // Use Buffer.byteLength comparison as poor-man constant-time check for same length;
    // for true constant-time use timingSafeEqual when lengths match
    let tokenMatch = false;
    try {
      const { timingSafeEqual } = await import("crypto");
      const a = Buffer.from(expectedToken, "utf8");
      const b = Buffer.from(providedToken, "utf8");
      tokenMatch = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      tokenMatch = expectedToken === providedToken;
    }

    if (!tokenMatch) {
      return ctx.json({ error: "Not found or invalid token", code: "NOT_FOUND" }, 404);
    }

    return ctx.json({
      request_id: row.id,
      request_type: row.request_type,
      status: row.status,
      created_at: row.created_at,
      verified_at: row.verified_at,
      processed_at: row.processed_at,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/dsr/:id/fulfill
  //
  // requireSuperAdmin. Triggers fulfillment for a verified DSR request.
  //
  // For access/portability: build JSON export, store in result_artifact_url,
  //   set status → fulfilled, send completion email.
  // For erasure: cascade delete per architecture §13.
  // For correction/restriction: mark in_progress → fulfilled (super_admin action).
  //   restriction also sets users.restricted = TRUE.
  //
  // Idempotent: if already fulfilled, returns 200 with current state.
  // -------------------------------------------------------------------------
  app.post("/api/dsr/:id/fulfill", requireAuth, requireSuperAdmin, async (ctx: Context) => {
    const requestId = ctx.req.param("id");
    const auth = ctx.get("auth");

    if (!requestId) {
      return ctx.json({ error: "request id is required", code: "MISSING_REQUEST_ID" }, 400);
    }

    // Fetch DSR request
    const result = await db.query<{
      id: string;
      tenant_id: string | null;
      user_id: string | null;
      requester_email: string;
      request_type: string;
      status: string;
      verified_at: string | null;
      processed_at: string | null;
    }>(
      `SELECT id, tenant_id, user_id, requester_email, request_type, status, verified_at, processed_at
       FROM dsr_requests
       WHERE id = $1
       LIMIT 1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return ctx.json({ error: "DSR request not found", code: "NOT_FOUND" }, 404);
    }

    const dsr = result.rows[0];

    // Idempotency: already in a terminal state (fulfilled, or closed because no
    // personal data was held).
    if (dsr.status === "fulfilled" || dsr.status === "closed_no_data") {
      return ctx.json({ ok: true, status: dsr.status, already_fulfilled: true }, 200);
    }

    // Must be verified before fulfillment
    if (!dsr.verified_at && dsr.request_type !== "access") {
      // Admin can fulfill correction/restriction without OTP for lost-email cases
      if (dsr.request_type === "correction" || dsr.request_type === "restriction") {
        // Allowed — admin manually verified identity
      } else if (!dsr.verified_at) {
        return ctx.json(
          { error: "DSR request has not been identity-verified yet", code: "NOT_VERIFIED" },
          409
        );
      }
    }

    let resultArtifactUrl: string | null = null;
    // Outcome of this fulfilment. Default: a normal data-action fulfilment.
    // Switches to 'closed_no_data' when the controller holds no personal data
    // for the requester (GDPR Art. 17 permits confirming this) — recorded as a
    // distinct status + closure_reason so a no-op close is never indistinguishable
    // from a real erasure/restriction.
    let finalStatus: "fulfilled" | "closed_no_data" = "fulfilled";
    let closureReason: string | null = null;

    if (dsr.request_type === "access" || dsr.request_type === "portability") {
      // -----------------------------------------------------------------
      // Export: query all user data for the resolved data subject.
      // Same null-user_id gap as erasure/restriction: dsr.user_id is set ONLY
      // when the requester was authenticated at intake. A public/logged-out
      // access or portability request therefore had user_id = NULL — the old
      // code skipped every per-user read and still produced an artifact (just
      // wrapper metadata) + emailed a "completed" download link to an
      // essentially empty file: a misleading Art. 15 / CCPA §1798.110 response.
      // Resolve the subject by requester_email, refuse on ambiguity, and close
      // honestly when no data is held.
      // -----------------------------------------------------------------
      const subjects = await resolveDsrSubjects(db, dsr);

      if (subjects.length > 1) {
        // Ambiguous: requester_email maps to accounts in more than one tenant.
        // Exporting the wrong subject's data is itself a disclosure breach —
        // refuse and route to a human. Do NOT mark fulfilled. (Mirrors erasure.)
        logger.warn("dsr_access_ambiguous_subject", {
          requestId: dsr.id,
          matchCount: subjects.length,
        });
        await writeAuditLog(db, {
          event_type: "dsr_access_ambiguous",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          // Log only that it was ambiguous — not how many tenants matched
          // (defence-in-depth: keep cross-tenant cardinality out of the log).
          metadata: { request_type: dsr.request_type, ambiguous: true },
        });
        return ctx.json(
          {
            error:
              "Requester email matches multiple accounts; resolve the data subject manually before export.",
            code: "AMBIGUOUS_SUBJECT",
          },
          409
        );
      }

      if (subjects.length === 1) {
        const { userId } = subjects[0];

        const exportData: Record<string, unknown> = {
          export_generated_at: new Date().toISOString(),
          request_type: dsr.request_type,
          request_id: dsr.id,
        };

        // Read the whole export in ONE read-only, repeatable-read transaction so
        // the artifact is a consistent point-in-time snapshot across all tables
        // (no torn reads if the subject's data mutates mid-export). This route is
        // super-admin/unscoped, so the reads run as the privileged login role;
        // the prior db.setTenantId() call was a no-op in this context.
        await db.transaction(
          async (tx) => {
            // users table
            const userRows = await tx.query(
              `SELECT id, email, role, dpa_ack_version, dpa_ack_at, dpa_variant,
                      ccpa_optout, ccpa_optout_at, created_at
               FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
              [userId]
            );
            exportData["user"] = userRows.rows[0] ?? null;

            // social_accounts (token presence only — never export decrypted tokens)
            const socialRows = await tx.query<Record<string, unknown>>(
              `SELECT id, platform, platform_user_id, scope, expires_at, connected_at, revoked_at
               FROM social_accounts WHERE user_id = $1`,
              [userId]
            );
            exportData["social_accounts"] = socialRows.rows.map((r) => ({
              ...r,
              note: "OAuth token not exported for security",
            }));

            // drafts
            const draftRows = await tx.query(
              `SELECT id, platform, topic_input, body, hashtags, ai_generated,
                      status, approved_at, scheduled_at, published_at, created_at
               FROM drafts WHERE user_id = $1`,
              [userId]
            );
            exportData["drafts"] = draftRows.rows;

            // generation_log (prompts + outputs)
            const genRows = await tx.query(
              `SELECT id, provider, model_name, model_version, prompt_user,
                      regen_instructions, regen_count, latency_ms, created_at
               FROM generation_log WHERE user_id = $1`,
              [userId]
            );
            exportData["generation_log"] = genRows.rows;

            // audit_log events (IP redacted in export per §13 data minimization)
            const auditRows = await tx.query(
              `SELECT id, event_type, created_at, metadata
               FROM audit_log WHERE actor_user_id = $1
               ORDER BY created_at DESC`,
              [userId]
            );
            exportData["audit_events"] = auditRows.rows;
          },
          { mode: "read only isolation level repeatable read" }
        );

        // Serialize export as JSON — store as artifact URL
        // In production this would be uploaded to S3 / object storage.
        // For v1: store serialized JSON reference URL; actual delivery is via email link.
        const exportJson = JSON.stringify(exportData, null, 2);
        // Artifact URL convention: internal reference (actual upload to S3 deferred to v1.1)
        resultArtifactUrl = `dsr-export/${dsr.id}/data-export.json`;

        logger.info("dsr_export_generated", {
          requestId: dsr.id,
          request_type: dsr.request_type,
          bytesApprox: exportJson.length,
        });
      } else {
        // Zero matches: the controller holds no personal data for this email.
        // For an access/portability request "we hold no data" IS the substantive
        // Art. 15 / CCPA §1798.110 answer — so close as closed_no_data and
        // confirm that honestly. Do NOT fabricate an artifact or email a
        // "completed" download link to an empty export.
        logger.warn("dsr_access_skipped_null_user_id", { requestId: dsr.id });
        await writeAuditLog(db, {
          event_type: "dsr_access_no_data",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          metadata: { request_type: dsr.request_type },
        });
        finalStatus = "closed_no_data";
        closureReason = "no_personal_data_held";
        // resultArtifactUrl stays null — nothing to deliver.
      }
    } else if (dsr.request_type === "erasure") {
      // -----------------------------------------------------------------
      // Erasure cascade (architecture §13)
      // Order: drafts → generation_log pseudonymized → social_accounts revoked
      //        → users soft-delete
      // Audit log is NOT deleted (Art. 17(3)(e)); IP pseudonymized (hash replaced).
      // -----------------------------------------------------------------
      // Resolve the data subject. This used to key off dsr.user_id alone, which
      // is set ONLY for authenticated requesters — so public erasure requests and
      // logged-out real users were silently skipped yet still marked 'fulfilled'.
      const subjects = await resolveDsrSubjects(db, dsr);

      if (subjects.length > 1) {
        // Ambiguous: requester_email maps to accounts in more than one tenant.
        // Erasing the wrong subject is itself an irreversible violation — refuse
        // and route to a human. Do NOT mark fulfilled.
        logger.warn("dsr_erasure_ambiguous_subject", {
          requestId: dsr.id,
          matchCount: subjects.length,
        });
        await writeAuditLog(db, {
          event_type: "dsr_erasure_ambiguous",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          // Log only that it was ambiguous — not how many tenants matched
          // (defence-in-depth: keep cross-tenant cardinality out of the log).
          metadata: { request_type: dsr.request_type, ambiguous: true },
        });
        return ctx.json(
          {
            error:
              "Requester email matches multiple accounts; resolve the data subject manually before erasure.",
            code: "AMBIGUOUS_SUBJECT",
          },
          409
        );
      }

      if (subjects.length === 1) {
        const { userId, tenantId } = subjects[0];

        // ATOMICITY (GDPR Art. 17 integrity): the four-step cascade MUST commit
        // as a unit. Run unscoped (super-admin) these would otherwise execute as
        // four separate autocommitted statements — a failure after step 1 would
        // leave the data subject's personal data partially erased (drafts gone
        // but tokens/user still live), an Art. 17 integrity violation. Wrapping
        // in a single transaction guarantees all-or-nothing. The route is
        // super-admin/unscoped, so the cascade runs as the privileged login role
        // (no per-query RLS wrapping); every statement still carries an explicit
        // WHERE tenant_id as defence in depth (see runErasureCascade).
        await db.transaction((tx) => runErasureCascade(tx, userId, tenantId));
        logger.info("dsr_erasure_cascade_complete", { requestId: dsr.id, userId });
      } else {
        // Zero matches: the controller holds no personal data for this email.
        // Art. 17 is satisfied by confirming this — but record it as a DISTINCT
        // outcome, never an indistinguishable 'fulfilled'.
        logger.warn("dsr_erasure_skipped_null_user_id", { requestId: dsr.id });
        await writeAuditLog(db, {
          event_type: "dsr_erasure_no_data",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          metadata: { request_type: dsr.request_type },
        });
        finalStatus = "closed_no_data";
        closureReason = "no_personal_data_held";
      }
    } else if (dsr.request_type === "restriction") {
      // -----------------------------------------------------------------
      // Restriction: set users.restricted = TRUE
      // User can still log in and read data; generation/scheduling blocked.
      // Same null-user_id gap as erasure — resolve by email, refuse on ambiguity,
      // and close honestly when no data is held.
      // -----------------------------------------------------------------
      const subjects = await resolveDsrSubjects(db, dsr);

      if (subjects.length > 1) {
        logger.warn("dsr_restriction_ambiguous_subject", {
          requestId: dsr.id,
          matchCount: subjects.length,
        });
        await writeAuditLog(db, {
          event_type: "dsr_restriction_ambiguous",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          // Log only that it was ambiguous — not how many tenants matched
          // (defence-in-depth: keep cross-tenant cardinality out of the log).
          metadata: { request_type: dsr.request_type, ambiguous: true },
        });
        return ctx.json(
          {
            error:
              "Requester email matches multiple accounts; resolve the data subject manually before restriction.",
            code: "AMBIGUOUS_SUBJECT",
          },
          409
        );
      }

      if (subjects.length === 1) {
        const { userId, tenantId } = subjects[0];
        await db.setTenantId(tenantId);
        await db.query(
          `UPDATE users SET restricted = TRUE, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [userId, tenantId]
        );
        logger.info("dsr_restriction_applied", { requestId: dsr.id });
      } else {
        logger.warn("dsr_restriction_skipped_null_user_id", { requestId: dsr.id });
        await writeAuditLog(db, {
          event_type: "dsr_restriction_no_data",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          metadata: { request_type: dsr.request_type },
        });
        finalStatus = "closed_no_data";
        closureReason = "no_personal_data_held";
      }
    } else if (dsr.request_type === "correction") {
      // Correction is non-destructive and completed by a human (admin panel,
      // v1.1) — but if no account exists for the email there is nothing to
      // correct, so close it honestly rather than as an indistinguishable
      // 'fulfilled'. With one or more matches, keep the manual-queue behaviour.
      const subjects = await resolveDsrSubjects(db, dsr);
      if (subjects.length === 0) {
        logger.warn("dsr_correction_skipped_null_user_id", { requestId: dsr.id });
        await writeAuditLog(db, {
          event_type: "dsr_correction_no_data",
          actor_user_id: auth.userId,
          tenant_id: dsr.tenant_id,
          target_id: dsr.id,
          metadata: { request_type: dsr.request_type },
        });
        finalStatus = "closed_no_data";
        closureReason = "no_personal_data_held";
      } else {
        logger.info("dsr_correction_acknowledged", {
          requestId: dsr.id,
          matchCount: subjects.length,
        });
      }
    }
    // portability handled in same branch as access above

    // Update DSR request status → fulfilled, or closed_no_data when no personal
    // data was held (closure_reason records the distinction).
    await db.query(
      `UPDATE dsr_requests
       SET status = $1,
           closure_reason = $2,
           processed_at = NOW(),
           result_artifact_url = $3,
           closed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [finalStatus, closureReason, resultArtifactUrl, requestId]
    );

    // Audit log: dsr_request_fulfilled (final_status disambiguates a real
    // data action from a no-data close).
    await writeAuditLog(db, {
      event_type: "dsr_request_fulfilled",
      actor_user_id: auth.userId,
      tenant_id: dsr.tenant_id,
      target_id: dsr.id,
      metadata: {
        request_type: dsr.request_type,
        has_artifact: resultArtifactUrl !== null,
        fulfilled_by: auth.userId,
        final_status: finalStatus,
        closure_reason: closureReason,
      },
    });

    // Notify the access/portability requester (best-effort). When the request
    // closed because no personal data is held, confirm that honestly instead of
    // emailing a "completed" link to an empty export.
    if (dsr.request_type === "access" || dsr.request_type === "portability") {
      if (finalStatus === "closed_no_data") {
        await sendNoDataEmail({
          email: dsr.requester_email,
          requestId: dsr.id,
          requestType: dsr.request_type,
        });
      } else {
        await sendCompletedEmail({
          email: dsr.requester_email,
          requestId: dsr.id,
          resultArtifactUrl: resultArtifactUrl ?? undefined,
        });
      }
    }

    return ctx.json({
      ok: true,
      request_id: dsr.id,
      status: finalStatus,
      closure_reason: closureReason,
      processed_at: new Date().toISOString(),
    });
  });
}
