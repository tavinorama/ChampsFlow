/**
 * measurement-status.ts — D1 (Codex N04, 28/09).
 *
 * On 28/09 the weekly audit could not measure: four of five engines were held
 * back. The protection worked (no partial score was published) but the
 * dashboard kept showing the 21/09 number with nothing on the main view
 * saying that today's attempt had failed. A customer reads that as "measured
 * today, still 49". This module answers, from the audit rows alone:
 *   - which is the last VALID measurement,
 *   - what happened on the last ATTEMPT, and why, engine by engine,
 *   - whether there is an incident the main view must show.
 *
 * It also folds the queue's retries: three failed rows seventy seconds apart
 * are ONE attempt that was tried three times, not three audits.
 */
import { engineLabel } from "./engine-names";

export interface AuditAttemptRow {
  id: string;
  status: string;
  created_at: string;
  score_ai: number | null;
  error_message: string | null;
  triggered_by?: string | null;
}

export interface MeasurementStatus {
  lastValid: { auditId: string; at: string; index: number | null } | null;
  lastAttempt: {
    at: string;
    status: string;
    tries: number;
    answered: number | null;
    requested: number | null;
    heldBack: string[];
    noAnswer: string[];
  } | null;
  /** True when the newest attempt failed AFTER the last valid measurement. */
  incident: boolean;
  headline: string | null;
  detail: string | null;
}

/** Failed rows closer than this are retries of the same scheduled run. */
export const SAME_ATTEMPT_WINDOW_MS = 30 * 60 * 1000;

const list = (s: string | undefined): string[] =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && x.toLowerCase() !== "none");

/** Read the engines out of the worker's own refusal sentence. */
export function parseCoverageRefusal(message: string | null | undefined): {
  answered: number | null;
  requested: number | null;
  heldBack: string[];
  noAnswer: string[];
} {
  const m = message ?? "";
  const n = /Only (\d+) of (\d+) AI engines answered/.exec(m);
  const held = /held back for drift: ([^).;]+)/.exec(m);
  const none = /no answer: ([^).;]+)/.exec(m);
  return {
    answered: n ? Number(n[1]) : null,
    requested: n ? Number(n[2]) : null,
    heldBack: list(held?.[1]),
    noAnswer: list(none?.[1]),
  };
}

const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export function summarizeMeasurementStatus(rows: AuditAttemptRow[]): MeasurementStatus {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const valid = sorted.find((r) => r.status === "complete") ?? null;
  const newest = sorted[0] ?? null;
  const lastValid = valid ? { auditId: valid.id, at: valid.created_at, index: valid.score_ai } : null;
  if (!newest) return { lastValid, lastAttempt: null, incident: false, headline: null, detail: null };

  // Fold retries: consecutive failed rows inside the window, newest first.
  let tries = 1;
  if (newest.status === "failed") {
    let cursor = new Date(newest.created_at).getTime();
    for (const r of sorted.slice(1)) {
      if (r.status !== "failed") break;
      const t = new Date(r.created_at).getTime();
      if (cursor - t > SAME_ATTEMPT_WINDOW_MS) break;
      tries += 1;
      cursor = t;
    }
  }
  const oldestOfAttempt = sorted[tries - 1] ?? newest;
  const refusal = parseCoverageRefusal(newest.error_message);
  const lastAttempt = {
    at: oldestOfAttempt.created_at,
    status: newest.status,
    tries,
    answered: refusal.answered,
    requested: refusal.requested,
    heldBack: refusal.heldBack,
    noAnswer: refusal.noAnswer,
  };
  const incident = newest.status === "failed" && (!valid || newest.created_at > valid.created_at);
  if (!incident) return { lastValid, lastAttempt, incident: false, headline: null, detail: null };

  const headline = lastValid
    ? `We could not measure on ${day(lastAttempt.at)}. Your last valid score is from ${day(lastValid.at)}.`
    : `We could not measure on ${day(lastAttempt.at)}. There is no valid score yet.`;
  const parts: string[] = [];
  if (refusal.requested !== null) parts.push(`Only ${refusal.answered} of ${refusal.requested} AI engines could be measured.`);
  if (refusal.heldBack.length) parts.push(`Held back by our own checks: ${refusal.heldBack.map(engineLabel).join(", ")}.`);
  if (refusal.noAnswer.length) parts.push(`Gave no answer: ${refusal.noAnswer.map(engineLabel).join(", ")}.`);
  // True by construction, checked 29/09: both monthly caps count only
  // status='complete' (audit-run.ts, routes/audits.ts) and the credit debit
  // runs after a successful score. tests/unit/measurement-status.test.ts pins it.
  parts.push("We do not publish a score from a partial panel. This run used none of your audits or credits.");
  return { lastValid, lastAttempt, incident: true, headline, detail: parts.join(" ") };
}
