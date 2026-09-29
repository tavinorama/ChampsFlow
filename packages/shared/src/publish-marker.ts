/**
 * publish-marker.ts — D5 (Codex N07 + cap. 11, 28/09).
 *
 * The publish step wrote "published via postiz …" the moment the scheduler
 * ACCEPTED the post. Acceptance is not publication. The record now starts
 * "accepted via …" and only becomes "published via …" when the scheduler,
 * asked by the post's own id, says it is published.
 *
 * Both prefixes are a "publish record": the cadence valve, the channel memory
 * and the anti-repetition reader count ATTEMPTS that the scheduler took, and
 * every row written before this change says "published via". Readers accept
 * both; nothing that was counted yesterday stops being counted today.
 */
export const ACCEPTED_PREFIX = "accepted via";
export const PUBLISHED_PREFIX = "published via";

export function isPublishRecord(summary: string | null | undefined): boolean {
  const s = summary ?? "";
  return s.startsWith(ACCEPTED_PREFIX) || s.startsWith(PUBLISHED_PREFIX);
}

/** Turn an accepted record into a published one. Idempotent. */
export function markRecordPublished(summary: string): string {
  return summary.startsWith(ACCEPTED_PREFIX) ? PUBLISHED_PREFIX + summary.slice(ACCEPTED_PREFIX.length) : summary;
}

/** Receipt states. `unknown_expired` is terminal: nobody could confirm in time. */
export type ReceiptState = "queued" | "published" | "error" | "unknown" | "unknown_expired";

/** After this long without an answer a queued receipt stops being asked about. */
export const RECEIPT_WINDOW_HOURS = 72;
/** How far back the expiry sweep looks, so old rows are closed once and never again. */
export const RECEIPT_EXPIRY_LOOKBACK_DAYS = 14;
