/**
 * dossier.ts — pure aggregation logic for the per-client dossier ("ficheiro").
 *
 * Founder directive (01/09): "todo cliente deve ter seu próprio ficheiro desde
 * o primeiro e-mail". Everything is ALREADY recorded append-only across five
 * surfaces (smartlead_event, crm_contact, lead_capture, kit_order +
 * ai_audit_order, nurture_*); what was missing is the merged per-email VIEW.
 * This module is decisions, not I/O — the route does the queries, this file
 * turns rows into one chronological timeline. Exported for unit tests, same
 * reason smartlead-stage.ts lives apart from its route.
 *
 * Real-world facts these functions encode (verified against production data
 * stored since 10/08):
 *   - smartlead_event.payload is a jsonb STRING (the webhook JSON.stringify's
 *     the body and the driver serializes again), so the reader must parse the
 *     inner text. parseSmartleadPayload tolerates both shapes.
 *   - an EMAIL_REPLY payload carries the reply content in reply_message.text
 *     (fallbacks: preview_text, then reply_body html).
 *   - crm_contact.note accumulates one line per touch (webhook: "[smartlead]
 *     EVENT (campaign N) YYYY-MM-DD"; recycle job: "[recycle] proposto
 *     YYYY-MM-DD campanha <slug>"; plus the founder's free-text notes).
 */

export type DossierSource = "smartlead" | "crm" | "purchase" | "nurture" | "test";

export interface DossierEntry {
  /** ISO timestamp used for sorting. Note lines without a full timestamp get
   *  midnight UTC of their embedded date (or the CRM row's updated_at). */
  at: string;
  source: DossierSource;
  /** Machine-ish kind: event_type, "note", "stage", "kit_order", … */
  kind: string;
  /** Short human line for the timeline. */
  title: string;
  /** Longer body when there is one (reply text, note line, verdict). */
  detail: string | null;
  /** Campaign name/id when the surface knows it. */
  campaign: string | null;
}

/** Max entries returned by the dossier — newest first past this are dropped. */
export const DOSSIER_MAX_ENTRIES = 200;

const ISO_DATE_RE = /(\d{4}-\d{2}-\d{2})/;

/**
 * The webhook stores the raw body via JSON.stringify into a jsonb column, so
 * production rows hold a jsonb string whose text IS the JSON object. Accept
 * both that shape and a plain object (in case the storage is ever fixed);
 * anything else degrades to {} — the event row still shows, just without
 * payload-derived detail.
 */
export function parseSmartleadPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    try {
      const parsed: unknown = JSON.parse(payload);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

/** Strips tags/entities from an html fragment — good enough for a preview. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const REPLY_MAX_CHARS = 600;

/**
 * Reply content, when the stored payload carries it (EMAIL_REPLY does):
 * reply_message.text → preview_text → reply_body (html, stripped). Truncated
 * to keep the dossier response bounded. Null when nothing usable exists.
 */
export function extractReplyText(payload: unknown): string | null {
  const p = parseSmartleadPayload(payload);
  const rm = p["reply_message"];
  if (rm !== null && typeof rm === "object" && !Array.isArray(rm)) {
    const text = (rm as Record<string, unknown>)["text"];
    if (typeof text === "string" && text.trim() !== "") {
      return text.trim().slice(0, REPLY_MAX_CHARS);
    }
  }
  const preview = p["preview_text"];
  if (typeof preview === "string" && preview.trim() !== "") {
    return preview.trim().slice(0, REPLY_MAX_CHARS);
  }
  const body = p["reply_body"];
  if (typeof body === "string" && body.trim() !== "") {
    const stripped = stripHtml(body);
    return stripped === "" ? null : stripped.slice(0, REPLY_MAX_CHARS);
  }
  return null;
}

/** Campaign name preferred over the numeric id; null when neither exists. */
export function extractCampaignLabel(
  payload: unknown,
  campaignId: number | string | null
): string | null {
  const p = parseSmartleadPayload(payload);
  const name = p["campaign_name"];
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  if (campaignId !== null && campaignId !== undefined && `${campaignId}` !== "") {
    return `campaign ${campaignId}`;
  }
  return null;
}

export interface CrmRowForDossier {
  stage: string;
  note: string | null;
  updated_at: string;
}

/**
 * The note field is the CRM's own append-only history — one line per touch.
 * Each non-empty line becomes a timeline entry; a line's date is the FIRST
 * ISO date embedded in it (the webhook suffixes one, the recycle marker
 * carries one mid-line), and lines without any date (founder free text) get
 * the row's updated_at so they still appear on the timeline.
 *
 * skipSmartleadLines: when the smartlead_event source loaded fine, its
 * "[smartlead] …" note echoes are duplicates of richer event entries — skip
 * them. When that source failed, keep them: a degraded dossier that still
 * shows the derived lines beats a silently thinner one.
 */
export function crmNoteEntries(
  crm: CrmRowForDossier,
  opts: { skipSmartleadLines: boolean }
): DossierEntry[] {
  if (!crm.note) return [];
  const entries: DossierEntry[] = [];
  for (const rawLine of crm.note.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (opts.skipSmartleadLines && line.startsWith("[smartlead]")) continue;
    const dateMatch = ISO_DATE_RE.exec(line);
    const at = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : crm.updated_at;
    entries.push({
      at,
      source: "crm",
      kind: line.startsWith("[recycle]")
        ? "recycle_marker"
        : line.startsWith("[smartlead]")
          ? "smartlead_note"
          : "note",
      title: line.slice(0, 160),
      detail: line.length > 160 ? line : null,
      campaign: null,
    });
  }
  return entries;
}

export interface SmartleadEventRow {
  event_type: string;
  campaign_id: number | string | null;
  payload: unknown;
  received_at: string;
}

export function smartleadEntries(rows: SmartleadEventRow[]): DossierEntry[] {
  return rows.map((r) => {
    const campaign = extractCampaignLabel(r.payload, r.campaign_id);
    const reply = r.event_type === "EMAIL_REPLY" ? extractReplyText(r.payload) : null;
    return {
      at: r.received_at,
      source: "smartlead" as const,
      kind: r.event_type,
      title: `${r.event_type}${campaign ? ` — ${campaign}` : ""}`,
      detail: reply,
      campaign,
    };
  });
}

export interface LeadCaptureRow {
  brand: string;
  source: string;
  origin_from: string | null;
  utm_campaign: string | null;
  created_at: string;
}

export function leadCaptureEntries(rows: LeadCaptureRow[]): DossierEntry[] {
  return rows.map((r) => {
    const campaign = r.origin_from ?? r.utm_campaign ?? null;
    return {
      at: r.created_at,
      source: "test" as const,
      kind: r.source,
      title: `Lead/test — ${r.brand} (${r.source})`,
      detail: null,
      campaign,
    };
  });
}

export interface OrderRowForDossier {
  product: string; // "kit" | "ai_audit"
  status: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  extra: string | null; // brand for kit, business_type/primary_focus for audit
}

export function orderEntries(rows: OrderRowForDossier[]): DossierEntry[] {
  return rows.map((r) => {
    const label = r.product === "kit" ? "Get-Cited Kit ($29)" : "AI Audit ($49)";
    const when = [
      r.paid_at ? `paid ${r.paid_at.slice(0, 10)}` : null,
      r.delivered_at ? `delivered ${r.delivered_at.slice(0, 10)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      at: r.created_at,
      source: "purchase" as const,
      kind: `${r.product}_order`,
      title: `${label} — ${r.status}`,
      detail: [r.extra, when === "" ? null : when].filter(Boolean).join(" · ") || null,
      campaign: null,
    };
  });
}

export interface NurtureEnrollmentRow {
  sequence: string;
  current_step: number;
  total_steps: number;
  enrolled_at: string;
  suppressed: boolean;
  suppressed_reason: string | null;
  completed_at: string | null;
}

export interface NurtureSendRow {
  sequence: string;
  step: number;
  sent_at: string;
}

export function nurtureEntries(
  enrollments: NurtureEnrollmentRow[],
  sends: NurtureSendRow[]
): DossierEntry[] {
  const out: DossierEntry[] = enrollments.map((e) => {
    const state = e.suppressed
      ? `suppressed (${e.suppressed_reason ?? "?"})`
      : e.completed_at
        ? "completed"
        : `step ${e.current_step}/${e.total_steps}`;
    return {
      at: e.enrolled_at,
      source: "nurture" as const,
      kind: "enrollment",
      title: `Nurture ${e.sequence} — ${state}`,
      detail: null,
      campaign: null,
    };
  });
  for (const s of sends) {
    out.push({
      at: s.sent_at,
      source: "nurture",
      kind: "send",
      title: `Nurture send — ${s.sequence} step ${s.step}`,
      detail: null,
      campaign: null,
    });
  }
  return out;
}

/**
 * Merge + sort (newest first) + cap. Invalid timestamps sort last instead of
 * throwing — a malformed row must not take the whole dossier down.
 */
export function buildDossier(groups: DossierEntry[][]): {
  entries: DossierEntry[];
  truncated: boolean;
} {
  const all = groups.flat();
  const ts = (e: DossierEntry): number => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  all.sort((a, b) => ts(b) - ts(a));
  return {
    entries: all.slice(0, DOSSIER_MAX_ENTRIES),
    truncated: all.length > DOSSIER_MAX_ENTRIES,
  };
}

/** Same normalization the webhook applies before storing lead_email. */
export function normalizeDossierEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  return email;
}
