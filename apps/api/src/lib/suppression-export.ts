/**
 * suppression-export.ts — C06 / P11 (Codex 19/09, confirmed 21/09 and 23/09).
 *
 * The problem, in the founder's words: "a STOP has to stay out of a list bought
 * next week". Today a STOP reply makes the CRM row `lost` (B9), and SmartLead
 * stops that lead's sequence — but the campaign loader (scripts/smartlead/
 * campaigns_v4.py) reads SmartLead, not the CRM. A person who said STOP to a
 * campaign the loader does not know about, or whose STOP arrived by another
 * path, can be uploaded again from a new purchased list. Neither the CRM stage
 * nor the SmartLead block list is, by itself, the suppression.
 *
 * This module is the CRM side of the fix: one export of every address the
 * company must never write to again, as sha256 digests of the normalized
 * e-mail. The loader hashes each candidate the same way and drops matches.
 * No plaintext address leaves the database for this purpose; the operator
 * key that reads the export is the PII-free tier (["operator"]).
 *
 * Sources (union, distinct):
 *   - crm_contact.stage = 'lost'   (STOP replies, textual unsubscribes, B9 verdicts)
 *   - smartlead_event LEAD_UNSUBSCRIBED / EMAIL_BOUNCE with a lead_email
 *     (the provider's own word, kept append-only since 10/08)
 */
import { createHash } from "node:crypto";

export const SUPPRESSION_HASH_ALGORITHM = "sha256(lower(trim(email)))" as const;

/** The one normalization both sides use. Empty input → null (never hash ""). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function hashEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  return e ? createHash("sha256").update(e).digest("hex") : null;
}

export interface SuppressionExport {
  generated_at: string;
  algorithm: typeof SUPPRESSION_HASH_ALGORITHM;
  count: number;
  sources: { crm_lost: number; provider_unsubscribed_or_bounced: number };
  hashes: string[];
}

interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const SUPPRESSION_SQL = `
  SELECT lower(trim(email)) AS email, 'crm' AS src
    FROM crm_contact WHERE stage = 'lost' AND email IS NOT NULL
  UNION
  SELECT lower(trim(lead_email)) AS email, 'provider' AS src
    FROM smartlead_event
   WHERE lead_email IS NOT NULL
     AND event_type IN ('LEAD_UNSUBSCRIBED', 'EMAIL_BOUNCE')`;

export async function buildSuppressionExport(db: Db, now: Date = new Date()): Promise<SuppressionExport> {
  const { rows } = await db.query<{ email: string; src: "crm" | "provider" }>(SUPPRESSION_SQL, []);
  const hashes = new Set<string>();
  let crm = 0;
  let provider = 0;
  for (const r of rows) {
    const h = hashEmail(r.email);
    if (!h) continue;
    if (r.src === "crm") crm += 1;
    else provider += 1;
    hashes.add(h);
  }
  return {
    generated_at: now.toISOString(),
    algorithm: SUPPRESSION_HASH_ALGORITHM,
    count: hashes.size,
    sources: { crm_lost: crm, provider_unsubscribed_or_bounced: provider },
    hashes: [...hashes].sort(),
  };
}
