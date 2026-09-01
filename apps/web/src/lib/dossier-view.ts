/**
 * dossier-view.ts — pure display helpers for the client dossier ("Ficheiro")
 * and the recycle batches panel on /admin. No React, no DOM — the colocated
 * test convention (see vitest.config.ts) requires framework-free logic here.
 */

export type DossierSource = "smartlead" | "crm" | "purchase" | "nurture" | "test";

export interface DossierEntry {
  at: string;
  source: DossierSource;
  kind: string;
  title: string;
  detail: string | null;
  campaign: string | null;
}

export interface DossierResponse {
  email: string;
  crm: {
    stage: string;
    note: string | null;
    next_follow_up: string | null;
    owner: string | null;
    updated_at: string;
  } | null;
  entries: DossierEntry[];
  truncated: boolean;
  sourcesUnavailable: string[];
}

/** Badge labels per source — PT where the founder reads PT. */
export const DOSSIER_SOURCE_LABELS: Record<DossierSource, string> = {
  smartlead: "SmartLead",
  crm: "CRM",
  purchase: "Compra",
  nurture: "Nurture",
  test: "Test",
};

/** Badge color tokens per source, reusing the admin badge token families. */
export const DOSSIER_SOURCE_TOKENS: Record<DossierSource, { bg: string; color: string }> = {
  smartlead: { bg: "var(--color-badge-status-info-bg)",    color: "var(--color-badge-status-info-text)" },
  crm:       { bg: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" },
  purchase:  { bg: "var(--color-badge-status-active-bg)",  color: "var(--color-badge-status-active-text)" },
  nurture:   { bg: "var(--color-badge-status-warn-bg)",    color: "var(--color-badge-status-warn-text)" },
  test:      { bg: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" },
};

/** An unknown source (future API) must still render — degrade to CRM colors. */
export function dossierSourceLabel(source: string): string {
  return DOSSIER_SOURCE_LABELS[source as DossierSource] ?? source;
}

export function dossierSourceTokens(source: string): { bg: string; color: string } {
  return DOSSIER_SOURCE_TOKENS[source as DossierSource] ?? DOSSIER_SOURCE_TOKENS.crm;
}

/**
 * Timeline timestamp: full date+time for real timestamps, date only for the
 * midnight-UTC dates that note-line entries carry (their time is synthetic).
 */
export function formatDossierWhen(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return at;
  const d = new Date(t);
  const isMidnightUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const date = at.slice(0, 10);
  if (isMidnightUtc) return date;
  return `${date} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export interface RecycleBatchView {
  slug: string;
  proposedOn: string;
  emails: string[];
}

/**
 * CSV for a recycle batch, SmartLead-loadable: a header + one address per
 * line. Addresses are data, not formulas — but a defensive quote guard keeps
 * a hostile "=cmd()" address from executing in a spreadsheet.
 */
export function recycleBatchCsv(batch: RecycleBatchView): string {
  const safe = (v: string): string =>
    /^[=+\-@]/.test(v) ? `'${v}` : v;
  return ["email", ...batch.emails.map(safe)].join("\n") + "\n";
}
