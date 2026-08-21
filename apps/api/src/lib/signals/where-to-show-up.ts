/**
 * where-to-show-up.ts — pure shaping for the "Where to show up" product tab.
 *
 * The Signal Engine (docs/signal-engine-integration.md) hands us a "where to
 * act" queue: for each tracked keyword it says whether Reddit already ranks and
 * what the client should do about it. This module turns that raw, evolving
 * shape into the bounded, humanized action cards the tab renders — and nothing
 * more. It never invents a card: a row with no keyword and no action is dropped.
 *
 * House rules honored here:
 *  - Pure + deterministic → unit-testable without a network.
 *  - Bounded → at most MAX_OPPORTUNITIES leave this module.
 *  - Honest → we only humanize what the engine actually said; unknown actions
 *    fall back to a neutral, non-fabricated label.
 *  - No secrets → this module never sees the bearer; it only shapes payloads.
 */

import type { SeOpportunity } from "../../../../../packages/llm/src/signal-engine";

/** Hard cap on how many cards ever reach the client. */
export const MAX_OPPORTUNITIES = 25;

/** The action verbs the Signal Engine emits (opportunities.py). */
export type SignalAction =
  | "comment_on_ranking_thread"
  | "publish_own_community"
  | "publish_own_contest"
  | "defend_position"
  | "already_covered"
  | "no_snapshot_yet";

export interface HumanAction {
  /** Short, human label for the action. */
  label: string;
  /** First-person CTA when there is a place to go; null when there is nothing to do. */
  cta: string | null;
  /** Whether this row is something the client can act on now. */
  actionable: boolean;
}

/**
 * Humanize the action enum into UI copy. English, house style: short, first
 * person on the CTA, no em-dashes. Unknown/absent actions get a neutral label
 * and no CTA — we never dress up a value we do not understand.
 */
export function humanizeAction(action?: string | null): HumanAction {
  switch (action) {
    case "comment_on_ranking_thread":
      return { label: "Comment on the ranking thread", cta: "Show me the thread", actionable: true };
    case "publish_own_community":
      return { label: "Start your own thread", cta: "Show me where to post", actionable: true };
    case "publish_own_contest":
      return { label: "Start a thread to contest this", cta: "Show me where to post", actionable: true };
    case "defend_position":
      return { label: "Defend your position", cta: "Show me the thread", actionable: true };
    case "already_covered":
      return { label: "Already covered", cta: null, actionable: false };
    case "no_snapshot_yet":
      return { label: "No snapshot yet", cta: null, actionable: false };
    default:
      return { label: "Opportunity", cta: null, actionable: false };
  }
}

/** One card as the tab consumes it — flat, humanized, evidence-first. */
export interface WhereToShowUpCard {
  keyword: string | null;
  action: string | null;
  actionLabel: string;
  cta: string | null;
  actionable: boolean;
  community: string | null;
  evidenceUrl: string | null;
  position: number | null;
  karmaNeeded: number | null;
  reason: string | null;
  checkedAt: string | null;
  /** Where the signal came from (legal_basis / source), shown for honesty. */
  source: string | null;
}

const MAX_REASON = 240;
const MAX_FIELD = 160;

function asStr(v: unknown, max = MAX_FIELD): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function asNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Only http(s) evidence URLs survive — never a bare word the LLM emitted. */
function asUrl(v: unknown): string | null {
  const s = asStr(v, 500);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : null;
}

/**
 * Sort weight: actionable rows first, then by best rank (lowest position),
 * then by lowest karma needed. Non-actionable rows (already covered / no
 * snapshot) sink to the bottom. Deterministic, so tests can pin the order.
 */
function rankKey(c: WhereToShowUpCard): [number, number, number] {
  const actionRank = c.actionable ? 0 : 1;
  const posRank = c.position == null ? Number.MAX_SAFE_INTEGER : c.position;
  const karmaRank = c.karmaNeeded == null ? Number.MAX_SAFE_INTEGER : c.karmaNeeded;
  return [actionRank, posRank, karmaRank];
}

/**
 * Normalize + bound the raw queue into cards. A row with neither a keyword nor
 * an action carries no meaning, so it is dropped (never rendered as an empty
 * card). Sorted by actionability then rank; capped at MAX_OPPORTUNITIES.
 */
export function normalizeOpportunities(
  raw: SeOpportunity[],
  opts?: { defaultSource?: string }
): WhereToShowUpCard[] {
  const defaultSource = opts?.defaultSource ?? null;
  const cards: WhereToShowUpCard[] = [];
  for (const o of raw) {
    const keyword = asStr(o.keyword);
    const action = asStr(o.action);
    if (!keyword && !action) continue; // nothing to say → no card
    const human = humanizeAction(action);
    cards.push({
      keyword,
      action,
      actionLabel: human.label,
      cta: human.cta,
      actionable: human.actionable,
      community: asStr(o.community),
      evidenceUrl: asUrl(o.reddit_url),
      position: asNum(o.position),
      karmaNeeded: asNum(o.karma_needed),
      reason: asStr(o.reason, MAX_REASON),
      checkedAt: asStr(o.checked_at, 40),
      source: asStr((o as Record<string, unknown>)["source"]) ?? asStr((o as Record<string, unknown>)["legal_basis"]) ?? defaultSource,
    });
  }
  cards.sort((a, b) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
  return cards.slice(0, MAX_OPPORTUNITIES);
}
