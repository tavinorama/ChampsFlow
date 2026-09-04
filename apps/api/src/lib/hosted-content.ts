/**
 * hosted-content.ts — P0-08, the DB/IO side of hosted content generation.
 *
 * The pure arithmetic (what a draft costs, how many are left, the customer
 * sentences, the idempotency key, the retry spacing) lives in
 * packages/shared/src/hosted-content.ts so the web app can render the same
 * meter the API bills with. What is here is everything that needs a hash, a
 * key, a clock or Postgres.
 *
 * Five jobs, in the order the request meets them:
 *   1. resolveContentKey — client BYOK first, platform key second.
 *   2. draftRefId        — the deterministic UUID the ledger dedupes on.
 *   3. findExistingDraft — reprocessing returns the draft, does not make another.
 *   4. generateWithRetry — exponential backoff, no silence on the way down.
 *   5. recordDraftFailure— dead-letter row + ops alert when it finally fails.
 */

import { createHash } from "node:crypto";
import { logger } from "../../../../packages/shared/src/logger";
import { alertOps } from "../../../../packages/shared/src/ops-alert";
import {
  HOSTED_DRAFT_ATTEMPTS,
  hostedDraftRetryDelayMs,
  isDraftFailurePermanent,
} from "../../../../packages/shared/src/hosted-content";
import {
  PLATFORM_KEY_ENV_VAR,
  type PlatformKeyProvider,
} from "../../../../packages/shared/src/platform-keys";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";

// ---------------------------------------------------------------------------
// 1. Key cascade
// ---------------------------------------------------------------------------

export type ContentKeySource = "client" | "platform" | "none";

export interface ResolvedContentKey {
  apiKey: string | null;
  source: ContentKeySource;
}

/**
 * Resolve the key that will pay for this draft: the CLIENT's own first, ours
 * second.
 *
 * The order is the whole point. BYOK does not disappear — it stays the advanced
 * option an agency uses to control its own model and its own bill, and it
 * remains free of any credit charge. What changes is that its ABSENCE stops
 * being a wall: an SMB who never heard of an API key now gets the draft they
 * paid a subscription for, funded by us and metered by their credit balance
 * (the founder's 03/09 decision).
 *
 * `resolve` is injected rather than imported so this module does not drag the
 * whole system route file (and its hono closure) into anything that imports it
 * — the exact dependency accident documented at the top of lib/credits.ts.
 */
export async function resolveContentKey(
  provider: PlatformKeyProvider,
  resolveClientKey: () => Promise<string | null>
): Promise<ResolvedContentKey> {
  let clientKey: string | null = null;
  try {
    clientKey = await resolveClientKey();
  } catch (err) {
    // A corrupt BYOK blob must not take down a request the platform key could
    // have served. Loud in the log, transparent in behaviour.
    logger.error("content_client_key_resolve_failed", {
      provider,
      message: (err as Error).message?.slice(0, 200),
    });
  }
  if (clientKey && clientKey.trim().length > 0) {
    return { apiKey: clientKey, source: "client" };
  }

  const platformKey = (process.env[PLATFORM_KEY_ENV_VAR[provider]] ?? "").trim();
  if (platformKey.length > 0) return { apiKey: platformKey, source: "platform" };

  return { apiKey: null, source: "none" };
}

// ---------------------------------------------------------------------------
// 2. Idempotency reference
// ---------------------------------------------------------------------------

/**
 * The ledger's ref_id column is a UUID, and the draft's identity is a string.
 * md5 → UUID is the same bridge ensureMonthlyGrant already uses for its
 * period_expiry ref (`md5('expiry:' || …)::uuid`), so the two idempotency
 * schemes in this ledger are shaped alike rather than each inventing one.
 *
 * Namespaced with `content-draft:` so a generation key can never collide with
 * a geo_audit id in uniq_credit_ref.
 */
export function draftRefId(generationKey: string): string {
  const h = createHash("md5").update(`content-draft:${generationKey}`).digest("hex");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join("-");
}

// ---------------------------------------------------------------------------
// 3. Draft-level idempotency
// ---------------------------------------------------------------------------

export interface ExistingDraft {
  id: string;
  content_type: string;
  title: string | null;
  body: string;
  schema_markup: string | null;
  status: string;
  created_at: string;
}

/**
 * Has this exact draft already been produced?
 *
 * Reprocessing the same job must return the SAME draft rather than making a
 * second one (RELATORIO §16 P0-08 item 2). The unique index enforces it at
 * write time; this read is what turns the enforcement into a good answer
 * instead of a 500.
 *
 * DEGRADES, DOES NOT GUESS: if migration 20260904000001 has not been applied
 * the column does not exist, the query throws, and we return `undefined`
 * meaning "unknown, carry on" — the same defensive pattern the plan route uses
 * for due_date. The route still cannot charge twice, because the LEDGER's
 * idempotency is independent of this column.
 */
export async function findExistingDraft(
  db: PostgresClient,
  tenantId: string,
  generationKey: string
): Promise<ExistingDraft | null | undefined> {
  try {
    const res = await db.query<ExistingDraft>(
      `SELECT id, content_type, title, body, schema_markup, status, created_at
         FROM content_piece
        WHERE tenant_id = $1 AND generation_key = $2
        LIMIT 1`,
      [tenantId, generationKey]
    );
    return res.rows[0] ?? null;
  } catch (err) {
    logger.warn("content_generation_key_unavailable", {
      reason: "content_piece.generation_key missing — migration 20260904000001 not applied",
      message: (err as Error).message?.slice(0, 200),
    });
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 4. Retry
// ---------------------------------------------------------------------------

export interface GenerationAttemptOutcome<T> {
  /** The artifact, when the attempt produced a usable one. */
  value: T | null;
  /** Short machine reason when it did not. Never a stack trace. */
  reason: string | null;
}

export interface RetryResult<T> {
  value: T | null;
  reason: string | null;
  attempts: number;
}

/**
 * Run `attempt` until it yields a usable artifact, backing off exponentially.
 *
 * WHY RETRY AT ALL, AND WHY NOT MORE
 * The failure this path actually sees is a provider 429/5xx/timeout — transient
 * by nature, and the current code turns every one of them into a hard 402 with
 * nothing persisted. Three attempts at 2s then 4s absorbs that class without
 * making the customer wait long enough to think the page hung (RELATORIO §16
 * P0-08 item 8 forbids the eternal spinner as firmly as it forbids the raw
 * error).
 *
 * Permanent failures short-circuit: re-asking a provider a prompt it rejected
 * spends money to fail identically. Same rule as isAuditFailurePermanent, and
 * the 17/08 retry storm is why it exists.
 *
 * `sleep` is injected so the test asserts the spacing without waiting for it.
 */
export async function generateWithRetry<T>(
  attempt: (attemptNumber: number) => Promise<GenerationAttemptOutcome<T>>,
  opts?: { attempts?: number; sleep?: (ms: number) => Promise<void> }
): Promise<RetryResult<T>> {
  const maxAttempts = opts?.attempts ?? HOSTED_DRAFT_ATTEMPTS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastReason: string | null = "unknown";
  for (let n = 1; n <= maxAttempts; n++) {
    if (n > 1) await sleep(hostedDraftRetryDelayMs(n));
    let outcome: GenerationAttemptOutcome<T>;
    try {
      outcome = await attempt(n);
    } catch (err) {
      // A throw is a failed attempt, not a crashed request. The message is
      // deliberately NOT propagated to the customer or to the dead-letter row:
      // provider exception text has carried keys before.
      logger.error("content_generation_attempt_threw", {
        attempt: n,
        message: (err as Error).message?.slice(0, 200),
      });
      outcome = { value: null, reason: "attempt_threw" };
    }
    if (outcome.value !== null && outcome.value !== undefined) {
      return { value: outcome.value, reason: null, attempts: n };
    }
    lastReason = outcome.reason ?? "unknown";
    if (isDraftFailurePermanent(lastReason)) {
      return { value: null, reason: lastReason, attempts: n };
    }
  }
  return { value: null, reason: lastReason, attempts: maxAttempts };
}

// ---------------------------------------------------------------------------
// 5. Dead letter + alert
// ---------------------------------------------------------------------------

export interface DraftFailure {
  tenantId: string;
  brandId: string | null;
  generationKey: string;
  reason: string;
  attempts: number;
  keySource: ContentKeySource;
}

export interface DraftFailureRecord {
  /** True when the dead-letter row was written. */
  persisted: boolean;
  /** True when the ops alert actually LEFT the process — the intention is not the fact. */
  alerted: boolean;
}

/**
 * Dead-letter a failed generation and make it audible.
 *
 * This is the item RELATORIO §16 P0-08 item 3 and §17 ("Draft failure cria
 * retry/alerta, não silêncio") are about. Before this, a failed draft returned
 * a 402 and left no trace anywhere: nobody could answer "how often does
 * generation fail?", so the honest answer was "we do not know", and nobody was
 * asking because nothing ever said anything.
 *
 * NEVER THROWS. A dead-letter writer that can 500 the request it is recording
 * turns one failure into two, and loses the record of the first.
 *
 * Carries no draft body, no prompt, no provider response and no key — only what
 * an operator needs to see the shape of the problem.
 */
export async function recordDraftFailure(
  db: PostgresClient,
  f: DraftFailure
): Promise<DraftFailureRecord> {
  const alerted = await alertOps(
    [
      "🚨 Hosted content draft failed",
      `tenant: ${f.tenantId}`,
      f.brandId ? `brand: ${f.brandId}` : null,
      `key: ${f.keySource}`,
      `attempts: ${f.attempts}/${HOSTED_DRAFT_ATTEMPTS}`,
      `reason: ${f.reason.slice(0, 200)}`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  let persisted = false;
  try {
    await db.query(
      `INSERT INTO content_generation_failure
         (tenant_id, brand_id, generation_key, reason, attempts, alerted, key_source)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
      [f.tenantId, f.brandId, f.generationKey, f.reason.slice(0, 200), f.attempts, alerted, f.keySource]
    );
    persisted = true;
  } catch (err) {
    // Most likely cause: migration 20260904000001 not applied. Say which,
    // rather than logging a bare Postgres string — a log nobody can act on is
    // the quiet failure this whole function exists to prevent.
    logger.error("content_dead_letter_write_failed", {
      reason: "content_generation_failure insert failed (migration 20260904000001 may be missing)",
      tenantId: f.tenantId,
      failureReason: f.reason.slice(0, 200),
      message: (err as Error).message?.slice(0, 200),
    });
  }

  logger.error("content_generation_failed", {
    tenantId: f.tenantId,
    brandId: f.brandId,
    reason: f.reason.slice(0, 200),
    attempts: f.attempts,
    keySource: f.keySource,
    alerted,
    persisted,
  });

  return { persisted, alerted };
}
