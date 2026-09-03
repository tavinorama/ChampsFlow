/**
 * request-context.ts (10.B.14) — correlation id + PII-minimised log ids.
 *
 * - requestIdFrom(): honour an inbound `x-request-id` (or Cloudflare's
 *   `cf-ray`) so one id follows the request across web → api → logs; generate
 *   a UUID otherwise. Inbound values are length-capped and charset-filtered —
 *   a header is attacker-controlled text and log lines must stay clean.
 * - hashId(): sha256 → 12 hex chars for tenant/user ids in the http log line.
 *   Architecture §10 always said "log hashed tenant/user IDs"; the raw ids
 *   were a documented deferral, closed here. 12 hex chars keep the id
 *   correlatable inside the logs without being reversible to the UUID.
 */

import { createHash, randomUUID } from "node:crypto";

const REQ_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/** Pick/generate the correlation id for a request. */
export function requestIdFrom(
  header: (name: string) => string | undefined
): string {
  const inbound = header("x-request-id") ?? header("cf-ray");
  if (inbound && REQ_ID_RE.test(inbound)) return inbound;
  return randomUUID();
}

/** Stable, non-reversible short hash for tenant/user ids in logs. */
export function hashId(id: string | null | undefined): string | null {
  if (!id) return null;
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}
