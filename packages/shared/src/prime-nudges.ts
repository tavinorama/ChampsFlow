/**
 * prime-nudges.ts — the ONE decision for the OrganicPosts "Prime" nudges in
 * the dashboard (D3, 2026-08-17). Pure, so it is unit-tested and the API and
 * the web read the same rule.
 *
 * Triggers (founder spec):
 *   low_visibility  — after an audit with Visibility < 40
 *   credits_out     — credit balance at 0
 *   score_drop      — weekly Visibility drop of 10 or more points
 * Limits: at most ONE nudge per session; each kind can be dismissed (stored
 * client-side, and mirrored to audit_log via POST /api/prime/nudge). Priority
 * when several fire: score_drop (a change is news), then credits_out (blocks
 * work), then low_visibility.
 *
 * Copy: English, no em-dash, short sentences, first-person CTA. Numbers are
 * the real ones passed in; nothing is invented here.
 */

export const NUDGE_KINDS = ["score_drop", "credits_out", "low_visibility"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

export const LOW_VISIBILITY_THRESHOLD = 40;
export const SCORE_DROP_THRESHOLD = 10;

export interface NudgeFacts {
  /** Latest Visibility (0..100) or null before the first audit. */
  visibility: number | null;
  /** Visibility now minus ~7 days ago; negative = drop. Null without two points. */
  weeklyChange: number | null;
  /** Current credit balance, or null when unknown. */
  creditsBalance: number | null;
  /** True when the tenant already has OrganicPosts (won). No nudges then. */
  hasOrganicPosts: boolean;
}

export interface Nudge {
  kind: NudgeKind;
  title: string;
  body: string;
  cta: string;
}

/** Which nudges the facts justify, in priority order. Empty for prime tenants. */
export function eligibleNudges(f: NudgeFacts): Nudge[] {
  if (f.hasOrganicPosts) return [];
  const out: Nudge[] = [];
  if (f.weeklyChange != null && f.visibility != null && f.weeklyChange <= -SCORE_DROP_THRESHOLD) {
    out.push({
      kind: "score_drop",
      title: `Your Visibility fell ${Math.abs(Math.round(f.weeklyChange))} points this week.`,
      body: "AI answers moved against you. We find the cause and fix it for you.",
      cta: "Book my call",
    });
  }
  if (f.creditsBalance != null && f.creditsBalance <= 0) {
    out.push({
      kind: "credits_out",
      title: "You are out of audit credits.",
      body: "OrganicPosts runs the audits for you, every week, with no credit math.",
      cta: "Book my call",
    });
  }
  if (f.visibility != null && f.visibility < LOW_VISIBILITY_THRESHOLD) {
    out.push({
      kind: "low_visibility",
      title: `Your Visibility is ${Math.round(f.visibility)} of 100.`,
      body: "Under 40, AI rarely names you. We do the work that changes that.",
      cta: "Book my call",
    });
  }
  return out;
}

/**
 * The single nudge to show now, or null. `dismissed` = kinds the client
 * dismissed before; `shownThisSession` = a nudge already appeared this session.
 */
export function pickNudge(f: NudgeFacts, state: { dismissed: readonly string[]; shownThisSession: boolean }): Nudge | null {
  if (state.shownThisSession) return null;
  const dismissed = new Set(state.dismissed);
  return eligibleNudges(f).find((n) => !dismissed.has(n.kind)) ?? null;
}
