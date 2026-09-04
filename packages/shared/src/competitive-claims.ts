/**
 * competitive-claims.ts — P0-05. A trust registry for everything we say about a
 * competitor in public.
 *
 * The audit found comparison pages asserting competitor pricing and capability
 * with no source, no date and no owner, so nobody could tell a checked fact from
 * a nine-month-old impression. Every claim now carries its provenance, and the
 * registry computes staleness rather than trusting a hand-maintained label.
 *
 * The important property: **status is computed, not declared.** A claim whose
 * review date has passed becomes `stale` on its own, on the next render, with
 * nobody remembering to do anything. A declared status can only make a claim
 * *less* trusted (blocked), never more.
 *
 * Pure and dependency-free so the web app, the API and any future admin view
 * share one definition of "can we still say this?".
 */

/**
 * What kind of assertion this is. The distinction matters because the three
 * decay differently and warrant different scrutiny:
 *  - `fact`      — checkable against an official source (a published price).
 *  - `opinion`   — our judgement ("the learning curve is steep"). Cannot be
 *                  sourced to the competitor; must be owned by a person.
 *  - `inference` — a fact-shaped conclusion drawn from indirect evidence
 *                  ("their functional tier is really $399"). The most dangerous
 *                  category: it reads like a fact and is not one.
 */
export type ClaimType = "fact" | "opinion" | "inference";

export type ClaimConfidence = "high" | "medium" | "low";

/**
 * `current` — verified against `sourceUrl` on `checkedAt`, review not yet due.
 * `stale`   — never verified, or past `nextReviewAt`. Must not be published.
 * `blocked` — must not be published regardless of dates: legal hold, a
 *             correction in flight, or a source we may not cite.
 */
export type ClaimStatus = "current" | "stale" | "blocked";

export interface CompetitiveClaim {
  /** Stable id, so a claim can be traced through logs and reviews. */
  id: string;
  /** Competitor slug, matching the comparison-page route. */
  competitor: string;
  /** The assertion as a reader would encounter it. */
  claim: string;
  type: ClaimType;
  /**
   * The official source that supports it — the competitor's own pricing page,
   * docs or filing. Null means unsourced, which forces `stale` no matter what
   * else is set. A review site is not an official source for a `fact`; if the
   * evidence is second-hand, the claim is an `inference`.
   */
  sourceUrl: string | null;
  /**
   * ISO date the claim was last verified against `sourceUrl` by a human.
   * Null means never verified — which forces `stale`. "We wrote it down once"
   * is not a check.
   */
  checkedAt: string | null;
  /** ISO date after which the claim is stale until re-checked. */
  nextReviewAt: string | null;
  /** A person, not a team. Somebody has to answer for it. */
  owner: string;
  confidence: ClaimConfidence;
  /**
   * Declared status. Only ever *lowers* trust: use `blocked` to hold a claim
   * that is otherwise in date. Never set `current` to override a missing check —
   * the computation ignores it.
   */
  status: ClaimStatus;
  /** Why it is blocked / what is missing. Rendered nowhere; read by humans. */
  note?: string;
}

/**
 * The status that actually governs publication.
 *
 * Order matters and is deliberate:
 *  1. `blocked` always wins — a hold is a hold.
 *  2. No source or no check → `stale`. Unverifiable is not publishable.
 *  3. Review date passed (or absent) → `stale`.
 *  4. Otherwise `current`.
 */
export function effectiveClaimStatus(
  claim: CompetitiveClaim,
  now: Date = new Date()
): ClaimStatus {
  if (claim.status === "blocked") return "blocked";
  if (!claim.sourceUrl || !claim.checkedAt) return "stale";
  if (!claim.nextReviewAt) return "stale";
  const due = Date.parse(claim.nextReviewAt);
  if (Number.isNaN(due)) return "stale";
  if (due <= now.getTime()) return "stale";
  return "current";
}

/** Claims safe to show a reader right now. */
export function publishableClaims(
  claims: readonly CompetitiveClaim[],
  now: Date = new Date()
): CompetitiveClaim[] {
  return claims.filter((c) => effectiveClaimStatus(c, now) === "current");
}

/**
 * Is this competitor's comparison page frozen?
 *
 * Frozen when ANY claim about them is not publishable — not when all of them
 * are. A page that quietly drops its unverified rows and keeps the rest still
 * presents a comparison the reader will take as complete, and a comparison
 * missing the rows where we lose is exactly the dishonesty this registry exists
 * to prevent.
 *
 * A competitor with no registered claims at all is frozen too: silence in the
 * registry means nobody has vouched for anything.
 */
export function isComparisonFrozen(
  claims: readonly CompetitiveClaim[],
  competitor: string,
  now: Date = new Date()
): boolean {
  const mine = claims.filter((c) => c.competitor === competitor);
  if (mine.length === 0) return true;
  return mine.some((c) => effectiveClaimStatus(c, now) !== "current");
}

/** Every competitor whose page is currently frozen, sorted for stable output. */
export function frozenCompetitors(
  claims: readonly CompetitiveClaim[],
  competitors: readonly string[],
  now: Date = new Date()
): string[] {
  return competitors.filter((s) => isComparisonFrozen(claims, s, now)).sort();
}

/** Human-readable reason, for an admin view or a build log. */
export function describeClaimStatus(
  claim: CompetitiveClaim,
  now: Date = new Date()
): string {
  const status = effectiveClaimStatus(claim, now);
  if (status === "blocked") return `blocked${claim.note ? `: ${claim.note}` : ""}`;
  if (status === "current") return `current until ${claim.nextReviewAt}`;
  if (!claim.sourceUrl) return "stale: no official source";
  if (!claim.checkedAt) return "stale: never verified against the source";
  if (!claim.nextReviewAt) return "stale: no review date set";
  return `stale: review was due ${claim.nextReviewAt}`;
}
