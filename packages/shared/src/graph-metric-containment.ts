/**
 * graph-metric-containment.ts — G03 containment, not a corrected metric.
 *
 * Incidente P0 (11/09/2026): graph verdicts were written to ops.agent_outcome
 * under the SAME metric names the social collector uses, and the next harvest
 * summed them back by prefix (66.923.770 "impressions" in production, exact
 * sum of every prior row). Containment = nothing derived is read, written or
 * learned from until a reviewed lineage/window contract exists.
 *
 * Reopening requires a reviewed PR that changes the constants below — never
 * an environment flag. (Reconciliação 14/09: Codex candidate 1e63a64 + Claude
 * ff31245; allowlist instead of denylist per REVISAO-CLAUDE-PACOTE-2026-09-14 §2.5c.)
 */
export const G03_INVALID =
  "business_state=invalid_g03; metric evaluation/learning suspended pending source, window and lineage reconciliation; not zero and not measured performance";

/**
 * Partial snapshots (memory, cadence) keep their PUBLICATION facts — counts of
 * `published via` steps, which never came from ops.agent_outcome — and replace
 * every metric-derived section with this marker. A consumer must never read a
 * number after this line as performance.
 */
export const G03_PARTIAL =
  "business_state=partial_g03; metricas de ops.agent_outcome suspensas (G03) — as contagens abaixo sao steps de publicacao/rejeicao, nunca desempenho";

/** Documented contaminated namespaces (the collector's families + A/B). Reference only. */
export const KNOWN_CONTAMINATED_METRIC_PREFIXES =
  /^(?:x_|linkedinpage_|youtube_|tiktok_|instagramstandalone_|instagram_|facebook_|reddit_|blog_|ab_)/i;

/**
 * ALLOWLIST: the only metric families a graph may read or record. Everything
 * else — including names nobody has seen yet — is quarantined by default
 * ("desconhecido não é medido"). Adding a prefix here is a reviewed decision.
 *  - sales_reply_rate_ : written by the followup graph from SmartLead events;
 *    a ratio per campaign, never a social snapshot, never summed by prefix.
 */
export const ALLOWED_GRAPH_METRIC_PREFIXES: readonly string[] = ["sales_reply_rate_"];

export function isAllowedGraphMetric(metric: string): boolean {
  const m = metric.trim().toLowerCase();
  if (!m) return false;
  return ALLOWED_GRAPH_METRIC_PREFIXES.some((p) => m.startsWith(p));
}

export function isQuarantinedGraphMetric(metric: string): boolean {
  return !isAllowedGraphMetric(metric);
}

/** Fully quarantined: every line of these snapshots derives from ops.agent_outcome or from verdict summaries. */
export function isQuarantinedSnapshotSource(source: string): boolean {
  return ["outcomes", "tuning"].includes(source);
}

/** Partially quarantined: publication/rejection facts survive; metric sections are replaced by G03_PARTIAL. */
export function isPartiallyQuarantinedSnapshotSource(source: string): boolean {
  return ["memory", "cadence"].includes(source);
}

/** True when an artifact was produced UNDER containment (either marker). Anything else from a guarded node is legacy evidence. */
export function isG03Marked(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  return text.startsWith(G03_INVALID) || text.startsWith(G03_PARTIAL);
}

/** Existing persisted learning has no input-lineage/validity contract. Preserve it, never load/activate it. */
export function quarantineLegacyGraphLearning(): boolean {
  return true;
}

export interface ParsedGraphHarvest {
  metric: string;
  total: number;
  n: number;
  noData: boolean;
}

/** G04: absent, malformed, non-finite, coerced and contradictory values are not a measurement. */
export function parseGraphHarvest(raw: string | null): ParsedGraphHarvest | null {
  try {
    const p: unknown = JSON.parse(raw ?? "null");
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const v = p as Record<string, unknown>;
    if (typeof v.metric !== "string" || !v.metric.trim()) return null;
    if (typeof v.total !== "number" || !Number.isFinite(v.total) || v.total < 0) return null;
    if (typeof v.n !== "number" || !Number.isSafeInteger(v.n) || v.n < 0) return null;
    if (v.noData !== undefined && typeof v.noData !== "boolean") return null;
    if ((v.n === 0) !== (v.noData === true)) return null;
    if (v.noData === true && v.total !== 0) return null;
    return { metric: v.metric.trim(), total: v.total, n: v.n, noData: v.noData === true };
  } catch {
    return null;
  }
}
