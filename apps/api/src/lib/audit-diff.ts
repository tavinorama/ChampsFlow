/**
 * audit-diff.ts — pure, deterministic point-by-point comparison of two audits.
 *
 * Founder requirement (2026-07-03): audits are saved per date and the dashboard
 * must show a point-by-point comparison of what changed between any two audits.
 *
 * This module is PURE (no DB, no I/O) so the diff logic is unit-testable and can
 * never fabricate: it only ever reports differences between two real snapshots
 * assembled by the route. Prompts present in one audit but not the other are
 * reported as added/removed — never silently compared against nothing.
 */

// ---------------------------------------------------------------------------
// Snapshot shape (assembled by the route from geo_score + citation_check +
// competitor_citation + provider_breakdown)
// ---------------------------------------------------------------------------

export interface AuditProbe {
  provider: string;
  queryText: string;
  cited: boolean;
  rank: number | null;
  mentionRate: number | null;
}

export interface AuditSnapshot {
  auditId: string;
  createdAt: string;
  scores: { ai: number; performance: number; brand: number; overall: number | null };
  probes: AuditProbe[];
  competitors: Array<{ name: string; mentions: number; displacement: number }>;
  /** label → present, from provider_breakdown.offsite.sources */
  offsiteSources: Array<{ label: string; present: boolean }>;
  /** trait → 0..1, from provider_breakdown.content.traits */
  contentTraits: Record<string, number>;
  providersUsed: string[];
}

// ---------------------------------------------------------------------------
// Diff shape (what the dashboard renders)
// ---------------------------------------------------------------------------

export interface ProbeChange {
  provider: string;
  queryText: string;
  from: { cited: boolean; rank: number | null; mentionRate: number | null };
  to: { cited: boolean; rank: number | null; mentionRate: number | null };
}

export interface AuditDiff {
  from: { auditId: string; createdAt: string };
  to: { auditId: string; createdAt: string };
  scores: {
    ai: { from: number; to: number; delta: number };
    performance: { from: number; to: number; delta: number };
    brand: { from: number; to: number; delta: number };
    overall: { from: number | null; to: number | null; delta: number | null };
  };
  citations: {
    gained: ProbeChange[];        // not cited → cited
    lost: ProbeChange[];          // cited → not cited
    positionChanged: ProbeChange[]; // cited in both, rank moved
    rateChanged: ProbeChange[];   // cited in both, mentionRate moved ≥0.1 (rank unchanged)
    promptsAdded: AuditProbe[];   // probe exists only in `to`
    promptsRemoved: AuditProbe[]; // probe exists only in `from`
    unchanged: number;            // count (cited-state and rank identical)
  };
  competitors: {
    changed: Array<{
      name: string;
      from: { mentions: number; displacement: number } | null; // null = new competitor
      to: { mentions: number; displacement: number } | null;   // null = removed
    }>;
  };
  offsite: {
    gained: string[]; // absent → present
    lost: string[];   // present → absent
  };
  contentTraits: {
    changed: Array<{ trait: string; from: number | null; to: number | null; delta: number | null }>;
  };
  providers: { added: string[]; removed: string[] };
}

const probeKey = (p: AuditProbe): string =>
  `${p.provider}|${p.queryText.trim().toLowerCase()}`;

/** Compare two audit snapshots point by point. `from` = older, `to` = newer. */
export function compareAudits(from: AuditSnapshot, to: AuditSnapshot): AuditDiff {
  // --- Scores ---
  const scoreDelta = (a: number, b: number) => b - a;
  const overallDelta =
    from.scores.overall != null && to.scores.overall != null
      ? to.scores.overall - from.scores.overall
      : null;

  // --- Citations: join on (provider, normalized prompt) ---
  const fromMap = new Map(from.probes.map((p) => [probeKey(p), p]));
  const toMap = new Map(to.probes.map((p) => [probeKey(p), p]));

  const gained: ProbeChange[] = [];
  const lost: ProbeChange[] = [];
  const positionChanged: ProbeChange[] = [];
  const rateChanged: ProbeChange[] = [];
  const promptsAdded: AuditProbe[] = [];
  const promptsRemoved: AuditProbe[] = [];
  let unchanged = 0;

  for (const [key, toP] of toMap) {
    const fromP = fromMap.get(key);
    if (!fromP) {
      promptsAdded.push(toP);
      continue;
    }
    const change: ProbeChange = {
      provider: toP.provider,
      queryText: toP.queryText,
      from: { cited: fromP.cited, rank: fromP.rank, mentionRate: fromP.mentionRate },
      to: { cited: toP.cited, rank: toP.rank, mentionRate: toP.mentionRate },
    };
    if (!fromP.cited && toP.cited) gained.push(change);
    else if (fromP.cited && !toP.cited) lost.push(change);
    else if (fromP.cited && toP.cited && fromP.rank !== toP.rank) positionChanged.push(change);
    else if (
      fromP.cited && toP.cited &&
      fromP.mentionRate != null && toP.mentionRate != null &&
      Math.abs(toP.mentionRate - fromP.mentionRate) >= 0.1
    ) rateChanged.push(change);
    else unchanged += 1;
  }
  for (const [key, fromP] of fromMap) {
    if (!toMap.has(key)) promptsRemoved.push(fromP);
  }

  // --- Competitors ---
  const compFrom = new Map(from.competitors.map((c) => [c.name.toLowerCase(), c]));
  const compTo = new Map(to.competitors.map((c) => [c.name.toLowerCase(), c]));
  const compChanged: AuditDiff["competitors"]["changed"] = [];
  const compNames = new Set([...compFrom.keys(), ...compTo.keys()]);
  for (const key of compNames) {
    const a = compFrom.get(key) ?? null;
    const b = compTo.get(key) ?? null;
    if (a && b && a.mentions === b.mentions && a.displacement === b.displacement) continue;
    compChanged.push({
      name: (b ?? a)!.name,
      from: a ? { mentions: a.mentions, displacement: a.displacement } : null,
      to: b ? { mentions: b.mentions, displacement: b.displacement } : null,
    });
  }

  // --- Off-site presence flips ---
  const offFrom = new Map(from.offsiteSources.map((s) => [s.label, s.present]));
  const offGained: string[] = [];
  const offLost: string[] = [];
  for (const s of to.offsiteSources) {
    const was = offFrom.get(s.label);
    if (was === undefined) continue; // source not measured in `from` — no claim
    if (!was && s.present) offGained.push(s.label);
    if (was && !s.present) offLost.push(s.label);
  }

  // --- Content traits (report only meaningful moves ≥ 0.05) ---
  const traitNames = new Set([
    ...Object.keys(from.contentTraits ?? {}),
    ...Object.keys(to.contentTraits ?? {}),
  ]);
  const traitsChanged: AuditDiff["contentTraits"]["changed"] = [];
  for (const t of traitNames) {
    const a = from.contentTraits?.[t];
    const b = to.contentTraits?.[t];
    if (a != null && b != null) {
      if (Math.abs(b - a) >= 0.05) traitsChanged.push({ trait: t, from: a, to: b, delta: b - a });
    } else {
      traitsChanged.push({ trait: t, from: a ?? null, to: b ?? null, delta: null });
    }
  }

  // --- Providers used ---
  const provFrom = new Set(from.providersUsed);
  const provTo = new Set(to.providersUsed);

  return {
    from: { auditId: from.auditId, createdAt: from.createdAt },
    to: { auditId: to.auditId, createdAt: to.createdAt },
    scores: {
      ai: { from: from.scores.ai, to: to.scores.ai, delta: scoreDelta(from.scores.ai, to.scores.ai) },
      performance: { from: from.scores.performance, to: to.scores.performance, delta: scoreDelta(from.scores.performance, to.scores.performance) },
      brand: { from: from.scores.brand, to: to.scores.brand, delta: scoreDelta(from.scores.brand, to.scores.brand) },
      overall: { from: from.scores.overall, to: to.scores.overall, delta: overallDelta },
    },
    citations: { gained, lost, positionChanged, rateChanged, promptsAdded, promptsRemoved, unchanged },
    competitors: { changed: compChanged },
    offsite: { gained: offGained, lost: offLost },
    contentTraits: { changed: traitsChanged },
    providers: {
      added: [...provTo].filter((p) => !provFrom.has(p)),
      removed: [...provFrom].filter((p) => !provTo.has(p)),
    },
  };
}
