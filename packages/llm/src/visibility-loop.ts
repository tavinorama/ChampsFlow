/**
 * visibility-loop.ts — Visibility Loop v2 (Phase 1): deterministic "Do Next"
 * generation from audit evidence.
 *
 * The broken promise this closes: every COMPLETED audit must refresh the
 * client's action list ("Do Next") from what the probes actually measured —
 * no LLM required, no button to click. Facts come from citation rows:
 *
 *   1. Query NOT cited (worse when competitors ARE cited there)  → create/
 *      optimize a page answering that exact query.
 *   2. Query cited but low rank (>3)                             → improve it.
 *   3. Source domains the AI used on answers where the brand was absent
 *      → "get present on <domain>".
 *
 * Determinism contract: for the same probe evidence the same candidates (same
 * gap text, same key) are produced. `gap` is the STABLE KEY — the worker
 * matches tasks across audits by exact gap equality, so re-runs UPDATE the
 * standing card instead of duplicating it, and a query that flips to cited
 * marks its card "Worked — verified in the audit of <date>".
 *
 * Pure module: no I/O, no SQL, no LLM. The worker (audit-run.ts) does the
 * reading/writing around it; tests exercise these functions directly.
 */

/** One probe's evidence, already normalized to DB provider names. */
export interface LoopProbe {
  provider: string; // 'openai' | 'anthropic' | 'google' | 'perplexity' | 'dataforseo'
  queryText: string;
  cited: boolean; // majority-of-runs mention (same as citation_check.cited)
  rank: number | null; // 1-based position when cited
  sources: string[]; // sanitized URLs the answer cited
  competitors: string[]; // competitor names detected in this answer's text
}

export type LoopVector = "brand" | "performance" | "ai";
export type LoopLevel = "low" | "medium" | "high";

export interface LoopCandidate {
  /** Stable identity — equals `gap`. Matching across audits is by this text. */
  key: string;
  vector: LoopVector;
  gap: string;
  action: string;
  effort: LoopLevel;
  impact: LoopLevel;
  priority: number; // 0..100, higher = more important
  metric: string; // KPI the next audit verifies
  evidence: string; // the concrete finding that triggered this card
}

export interface LoopBuildResult {
  /** Cards for gaps that are OPEN in this audit, sorted by priority desc. */
  candidates: LoopCandidate[];
  /**
   * gap-key → verification note for gaps that are now RESOLVED in this audit
   * (query cited everywhere it is probed / domain no longer an absence).
   * Used to flip a previously open card to done with attribution.
   */
  resolved: Map<string, string>;
}

/** Max OPEN generated cards after a refresh (founder: "tudo mastigado", not a backlog). */
export const LOOP_OPEN_CAP = 12;

/** Max done cards carried forward into the fresh plan (history stays in old plans). */
export const LOOP_DONE_CARRY_CAP = 15;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const uniq = <T>(xs: T[]): T[] => Array.from(new Set(xs));

/** Bare registrable-ish host of a sanitized source URL ("" when unparseable). */
export function sourceDomain(src: string): string {
  try {
    return new URL(src).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const m = /^(?:[a-z]+:\/\/)?([^/?#]+)/i.exec(src.trim());
    return (m?.[1] ?? "").replace(/^www\./, "").toLowerCase();
  }
}

/** Deterministic gap texts — these ARE the cross-audit match keys. */
export const gapForUncited = (q: string): string => `Not cited for "${q}"`;
export const gapForLowRank = (q: string): string => `Cited low for "${q}"`;
export const gapForSource = (domain: string): string => `Absent from ${domain}`;

interface QueryAgg {
  query: string;
  citedProviders: string[];
  uncitedProviders: string[];
  worstRank: number | null; // among cited answers
  competitors: string[]; // competitors seen on this query's answers (any provider)
  competitorsWhereAbsent: string[]; // competitors cited where the brand was not
  absentSourceDomains: string[]; // domains the AI used on answers without the brand
}

function aggregateByQuery(probes: LoopProbe[]): Map<string, QueryAgg> {
  const byQuery = new Map<string, QueryAgg>();
  for (const p of probes) {
    const q = p.queryText.trim();
    if (!q) continue;
    let agg = byQuery.get(q);
    if (!agg) {
      agg = {
        query: q,
        citedProviders: [],
        uncitedProviders: [],
        worstRank: null,
        competitors: [],
        competitorsWhereAbsent: [],
        absentSourceDomains: [],
      };
      byQuery.set(q, agg);
    }
    if (p.cited) {
      agg.citedProviders.push(p.provider);
      if (p.rank != null && p.rank > 0) {
        agg.worstRank = agg.worstRank == null ? p.rank : Math.max(agg.worstRank, p.rank);
      }
    } else {
      agg.uncitedProviders.push(p.provider);
      agg.competitorsWhereAbsent.push(...p.competitors);
      for (const s of p.sources) {
        const d = sourceDomain(s);
        if (d) agg.absentSourceDomains.push(d);
      }
    }
    agg.competitors.push(...p.competitors);
  }
  for (const agg of byQuery.values()) {
    agg.citedProviders = uniq(agg.citedProviders).sort();
    agg.uncitedProviders = uniq(agg.uncitedProviders).sort();
    agg.competitors = uniq(agg.competitors);
    agg.competitorsWhereAbsent = uniq(agg.competitorsWhereAbsent);
    agg.absentSourceDomains = uniq(agg.absentSourceDomains);
  }
  return byQuery;
}

const LOW_RANK_THRESHOLD = 3;

/**
 * Build the deterministic candidate set + resolved keys from one audit's
 * probe evidence. `brandDomain` (when known) is excluded from "get present
 * on <domain>" cards — being told to get present on your own site is noise.
 */
export function buildLoopCandidates(
  probes: LoopProbe[],
  opts: { brandDomain?: string | null } = {}
): LoopBuildResult {
  const brandDomain = (opts.brandDomain ?? "").replace(/^www\./, "").toLowerCase();
  const byQuery = aggregateByQuery(probes);
  const candidates: LoopCandidate[] = [];
  const resolved = new Map<string, string>();

  // --- 1+2: per-query cards -------------------------------------------------
  for (const agg of byQuery.values()) {
    const uncitedKey = gapForUncited(agg.query);
    const lowRankKey = gapForLowRank(agg.query);

    if (agg.uncitedProviders.length > 0) {
      const winner = agg.competitorsWhereAbsent[0] ?? null;
      const domains = agg.absentSourceDomains.filter((d) => d !== brandDomain).slice(0, 2);
      const engines = agg.uncitedProviders.join(", ");
      const actionParts = [
        `Create or optimize a page that directly answers "${agg.query}".`,
        winner
          ? `Today AI cites ${winner}${domains.length > 0 ? ` using ${domains.join(" and ")}` : ""} — not you.`
          : domains.length > 0
            ? `Today AI builds this answer from ${domains.join(" and ")} — without you.`
            : `Today AI answers this without citing you.`,
      ];
      const priority = clamp(
        60 + 8 * agg.uncitedProviders.length + (agg.competitorsWhereAbsent.length > 0 ? 12 : 0),
        0,
        100
      );
      candidates.push({
        key: uncitedKey,
        vector: "ai",
        gap: uncitedKey,
        action: actionParts.join(" "),
        effort: "medium",
        impact: agg.competitorsWhereAbsent.length > 0 ? "high" : "medium",
        priority,
        metric: `Cited for "${agg.query}" on ${engines}`,
        evidence:
          `Not cited on ${engines}` +
          (agg.citedProviders.length > 0 ? `; cited on ${agg.citedProviders.join(", ")}` : "") +
          (agg.competitorsWhereAbsent.length > 0
            ? `. Competitors cited instead: ${agg.competitorsWhereAbsent.slice(0, 3).join(", ")}`
            : ""),
      });
      // A query can't be simultaneously "fully cited but low" — if it was a
      // low-rank card before and now lost the citation somewhere, the uncited
      // card supersedes it; the low-rank card is NOT resolved (it got worse).
    } else if (agg.citedProviders.length > 0) {
      // Cited everywhere it was probed → the uncited gap (if it existed) is
      // verifiably closed.
      resolved.set(uncitedKey, `now cited on ${agg.citedProviders.join(", ")}`);
      if (agg.worstRank != null && agg.worstRank > LOW_RANK_THRESHOLD) {
        candidates.push({
          key: lowRankKey,
          vector: "ai",
          gap: lowRankKey,
          action:
            `You are cited for "${agg.query}" but in position ${agg.worstRank}. ` +
            `Strengthen the page that answers it (clearer direct answer, sources, freshness) to move up.`,
          effort: "low",
          impact: "medium",
          priority: clamp(40 + (agg.worstRank - LOW_RANK_THRESHOLD) * 2, 0, 100),
          metric: `Citation position ≤ ${LOW_RANK_THRESHOLD} for "${agg.query}"`,
          evidence: `Cited on ${agg.citedProviders.join(", ")} at worst position ${agg.worstRank}`,
        });
      } else {
        resolved.set(lowRankKey, `now cited at position ${agg.worstRank ?? 1} on ${agg.citedProviders.join(", ")}`);
      }
    }
  }

  // --- 3: source-presence cards --------------------------------------------
  // Domains the AI leaned on for answers where the brand was ABSENT, ranked by
  // how many distinct queries used them. Domains that appear only on answers
  // where the brand IS cited are resolved (we're present in that pool).
  const absentFreq = new Map<string, number>();
  const seenAnywhere = new Set<string>();
  for (const agg of byQuery.values()) {
    for (const d of agg.absentSourceDomains) {
      absentFreq.set(d, (absentFreq.get(d) ?? 0) + 1);
    }
  }
  for (const p of probes) {
    for (const s of p.sources) {
      const d = sourceDomain(s);
      if (d) seenAnywhere.add(d);
    }
  }
  for (const d of seenAnywhere) {
    if (d === brandDomain || !d) continue;
    const freq = absentFreq.get(d) ?? 0;
    const key = gapForSource(d);
    if (freq > 0) {
      candidates.push({
        key,
        vector: "brand",
        gap: key,
        action:
          `AI answers in your category cite ${d} on ${freq} ${freq === 1 ? "query" : "queries"} where you are absent. ` +
          `Get your brand present there (listing, profile, article, or answer — whatever ${d} accepts).`,
        effort: "medium",
        impact: freq >= 3 ? "high" : "medium",
        priority: clamp(28 + 4 * freq, 0, 100),
        metric: `Cited on queries where AI uses ${d}`,
        evidence: `${d} used as a source on ${freq} ${freq === 1 ? "answer" : "answers"} that did not cite you`,
      });
    } else {
      resolved.set(key, `${d} still cited by AI, and you are now cited on those answers`);
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || a.gap.localeCompare(b.gap));
  return { candidates, resolved };
}

// ---------------------------------------------------------------------------
// Reconciliation — previous plan's tasks × this audit's build → rows for the
// FRESH plan. plan_task rows are INSERT-only for the worker (grants), so the
// loop writes a new strategy_plan per audit and carries state forward by key.
// ---------------------------------------------------------------------------

export interface PrevTask {
  vector: string;
  gap: string;
  action: string;
  effort: string;
  impact: string;
  priority: number;
  status: string; // proposed | accepted | rejected | done
  evidence: string | null;
  metric: string | null;
  owner: string | null;
}

export interface LoopTaskRow {
  vector: LoopVector;
  gap: string;
  action: string;
  effort: LoopLevel;
  impact: LoopLevel;
  priority: number;
  status: "proposed" | "accepted" | "rejected" | "done";
  evidence: string | null;
  metric: string | null;
  owner: "you" | "organicposts" | "platform";
}

export interface ReconcileStats {
  inserted: number;
  refreshed: number; // candidates that had a predecessor and stayed open
  created: number; // brand-new candidates
  verified: number; // open cards flipped to done by this audit's evidence
  carried: number; // previous tasks kept as-is (custom/stale/done)
  droppedByCap: number;
}

const asVector = (v: string): LoopVector =>
  v === "brand" || v === "performance" || v === "ai" ? v : "ai";
const asLevel = (v: string): LoopLevel =>
  v === "low" || v === "medium" || v === "high" ? v : "medium";
const asOwner = (v: string | null): "you" | "organicposts" | "platform" =>
  v === "organicposts" || v === "platform" ? v : "you";
const asStatus = (v: string): "proposed" | "accepted" | "rejected" | "done" =>
  v === "accepted" || v === "rejected" || v === "done" ? v : "proposed";

export const VERIFIED_PREFIX = "Worked — verified in the audit of ";

/**
 * Merge the previous plan's tasks with this audit's candidates.
 *
 * Rules (the contract Phase 1 promises):
 *  - match is by exact `gap` text (deterministic generation makes it stable);
 *  - done and rejected predecessors keep their status and text (done stays
 *    done, a rejection is respected — the card is not re-proposed);
 *  - open predecessors matching a candidate are REFRESHED (new action/
 *    evidence/priority) but keep their accepted/proposed status;
 *  - open predecessors whose gap is in `resolved` flip to done with
 *    "Worked — verified in the audit of <date>: <note>" — the client SEES
 *    that doing the card moved the number;
 *  - open predecessors not matching anything this audit (custom cards, or
 *    queries not probed this run) are carried unchanged — never silently
 *    dropped;
 *  - at most LOOP_OPEN_CAP open cards after the merge: carried/refreshed open
 *    cards keep their place, brand-new candidates fill remaining slots by
 *    priority;
 *  - done carry is bounded by LOOP_DONE_CARRY_CAP (freshly verified first).
 */
export function reconcileLoopTasks(
  prevTasks: PrevTask[],
  build: LoopBuildResult,
  auditDate: string
): { rows: LoopTaskRow[]; stats: ReconcileStats } {
  const stats: ReconcileStats = {
    inserted: 0,
    refreshed: 0,
    created: 0,
    verified: 0,
    carried: 0,
    droppedByCap: 0,
  };
  const prevByGap = new Map<string, PrevTask>();
  for (const t of prevTasks) if (!prevByGap.has(t.gap)) prevByGap.set(t.gap, t);

  const rows: LoopTaskRow[] = [];
  const doneRows: LoopTaskRow[] = [];
  const usedGaps = new Set<string>();
  let openCount = 0;

  const carryRow = (t: PrevTask, over: Partial<LoopTaskRow> = {}): LoopTaskRow => ({
    vector: asVector(t.vector),
    gap: t.gap,
    action: t.action,
    effort: asLevel(t.effort),
    impact: asLevel(t.impact),
    priority: t.priority,
    status: asStatus(t.status),
    evidence: t.evidence,
    metric: t.metric,
    owner: asOwner(t.owner),
    ...over,
  });

  // Pass 1 — previous tasks: verify flips, carry the rest.
  for (const t of prevTasks) {
    if (usedGaps.has(t.gap)) continue; // defensive: legacy duplicate rows collapse
    usedGaps.add(t.gap);
    const status = asStatus(t.status);
    const open = status === "proposed" || status === "accepted";
    const note = build.resolved.get(t.gap);

    if (open && note) {
      const verification = `${VERIFIED_PREFIX}${auditDate}: ${note}.`;
      doneRows.push(
        carryRow(t, {
          status: "done",
          evidence: t.evidence ? `${verification} ${t.evidence}` : verification,
        })
      );
      stats.verified += 1;
      continue;
    }
    const candidate = build.candidates.find((cd) => cd.gap === t.gap);
    if (open && candidate) {
      rows.push(
        carryRow(t, {
          action: candidate.action,
          evidence: candidate.evidence,
          metric: candidate.metric,
          priority: candidate.priority,
          impact: candidate.impact,
          effort: candidate.effort,
          vector: candidate.vector,
        })
      );
      stats.refreshed += 1;
      openCount += 1;
      continue;
    }
    if (open) {
      rows.push(carryRow(t));
      stats.carried += 1;
      openCount += 1;
      continue;
    }
    if (status === "done") {
      doneRows.push(carryRow(t));
      stats.carried += 1;
      continue;
    }
    // rejected: carried so the same card is not re-proposed next audit.
    rows.push(carryRow(t));
    stats.carried += 1;
  }

  // Pass 2 — brand-new candidates fill the remaining open slots by priority.
  for (const cd of build.candidates) {
    if (usedGaps.has(cd.gap)) continue;
    if (openCount >= LOOP_OPEN_CAP) {
      stats.droppedByCap += 1;
      continue;
    }
    usedGaps.add(cd.gap);
    rows.push({
      vector: cd.vector,
      gap: cd.gap,
      action: cd.action,
      effort: cd.effort,
      impact: cd.impact,
      priority: cd.priority,
      status: "proposed",
      evidence: cd.evidence,
      metric: cd.metric,
      owner: "you",
    });
    stats.created += 1;
    openCount += 1;
  }

  // Done cards: freshly verified first, then carried done, bounded.
  const boundedDone = doneRows.slice(0, LOOP_DONE_CARRY_CAP);
  const allRows = [...rows, ...boundedDone];
  stats.inserted = allRows.length;
  return { rows: allRows, stats };
}
