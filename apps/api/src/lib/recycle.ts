/**
 * recycle.ts — pure logic of the 2-month non-responder recycling loop.
 *
 * Founder directive (01/09): a lead who never answered gets ANOTHER chance
 * after 2 months — a practice that repeats forever. This module is decisions
 * only (no I/O), imported by the weekly worker job and by the admin batch
 * endpoint, and unit-tested directly.
 *
 * Hard rules encoded here:
 *   - 'lost' is NEVER recycled (unsubscribed people are out forever), and
 *     neither are the founder's judgments ('qualified', 'customer'). Only
 *     'new' and 'contacted' qualify.
 *   - anyone who EVER replied (any EMAIL_REPLY event) is excluded.
 *   - the 60-day clock counts from the LATEST of: last smartlead event and
 *     last recycle marker. The marker is a note line on crm_contact —
 *     "[recycle] proposto YYYY-MM-DD campanha <slug>" — so proposing a batch
 *     restarts the clock and the same lead is never proposed twice in a
 *     window.
 *   - batches are capped (500) so a backlog cannot explode a campaign.
 */

export const RECYCLE_WINDOW_DAYS = 60;
export const RECYCLE_BATCH_CAP = 500;

/** Stages eligible for recycling. Everything else is out — forever for 'lost'. */
export const RECYCLABLE_STAGES = ["new", "contacted"] as const;

/** One marker per proposal: "[recycle] proposto 2026-09-01 campanha recycle-2026-09-01". */
const RECYCLE_MARKER_RE = /\[recycle\] proposto (\d{4}-\d{2}-\d{2}) campanha (\S+)/g;

export function buildRecycleSlug(now: Date): string {
  return `recycle-${now.toISOString().slice(0, 10)}`;
}

export function recycleMarkerLine(now: Date, slug: string): string {
  return `[recycle] proposto ${now.toISOString().slice(0, 10)} campanha ${slug}`;
}

/** Latest recycle-marker date embedded in a note, or null when none exists. */
export function latestRecycleMarkerDate(note: string | null | undefined): Date | null {
  if (!note) return null;
  let latest: Date | null = null;
  for (const m of note.matchAll(RECYCLE_MARKER_RE)) {
    const d = new Date(`${m[1]}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
  }
  return latest;
}

export interface RecycleCandidateRow {
  email: string;
  stage: string;
  note: string | null;
  /** MAX(smartlead_event.received_at) for this email. */
  last_event_at: string | Date;
  /** COUNT of EMAIL_REPLY events — SQL already filters to 0; re-checked here. */
  reply_count: number | string;
}

/**
 * Belt-and-braces filter over the SQL prefilter, plus the marker clock the SQL
 * cannot see (the marker lives inside free text). Deterministic order: oldest
 * last-touch first, so the coldest leads enter the batch before the cap bites.
 */
export function selectRecycleCandidates(
  rows: RecycleCandidateRow[],
  now: Date,
  cap: number = RECYCLE_BATCH_CAP
): string[] {
  const cutoffMs = now.getTime() - RECYCLE_WINDOW_DAYS * 24 * 3600 * 1000;
  const eligible = rows.filter((r) => {
    if (!(RECYCLABLE_STAGES as readonly string[]).includes(r.stage)) return false;
    if (Number(r.reply_count) > 0) return false;
    const lastEvent = new Date(r.last_event_at);
    if (Number.isNaN(lastEvent.getTime())) return false;
    if (lastEvent.getTime() >= cutoffMs) return false; // touched within the window
    const marker = latestRecycleMarkerDate(r.note);
    if (marker !== null && marker.getTime() >= cutoffMs) return false; // already proposed
    return true;
  });
  eligible.sort(
    (a, b) => new Date(a.last_event_at).getTime() - new Date(b.last_event_at).getTime()
  );
  return eligible.slice(0, Math.max(0, cap)).map((r) => r.email);
}

/**
 * PII mask for Telegram/logs: "joao@acme.com" → "j***@a***.com". Keeps just
 * enough for the founder to recognize a sample, never the address itself.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const lastDot = domain.lastIndexOf(".");
  const tld = lastDot > 0 ? domain.slice(lastDot) : "";
  const domainHead = domain === "" ? "*" : domain[0];
  return `${local[0]}***@${domainHead}***${tld}`;
}

export interface RecycleBatch {
  slug: string;
  proposedOn: string; // YYYY-MM-DD
  emails: string[];
}

/**
 * Rebuilds the proposed batches FROM the markers themselves — the marker is
 * the artifact (append-only note lines), so no new table is needed and the
 * batch stays reachable from /admin even if the Telegram notification failed.
 */
export function groupRecycleBatches(
  rows: { email: string; note: string | null }[],
  maxBatches = 12
): RecycleBatch[] {
  const bySlug = new Map<string, RecycleBatch>();
  for (const row of rows) {
    if (!row.note) continue;
    for (const m of row.note.matchAll(RECYCLE_MARKER_RE)) {
      const [, date, slug] = m;
      let batch = bySlug.get(slug);
      if (!batch) {
        batch = { slug, proposedOn: date, emails: [] };
        bySlug.set(slug, batch);
      }
      if (!batch.emails.includes(row.email)) batch.emails.push(row.email);
    }
  }
  const batches = [...bySlug.values()];
  for (const b of batches) b.emails.sort();
  batches.sort((a, b) => (a.proposedOn < b.proposedOn ? 1 : a.proposedOn > b.proposedOn ? -1 : 0));
  return batches.slice(0, maxBatches);
}
