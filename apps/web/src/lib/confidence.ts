/**
 * confidence.ts — Probe confidence derivation rule for the audit UI.
 *
 * Used by the EvidenceTable component in the brand detail page to convert
 * raw mentionRate + runsCount from the /api/audits/:id/breakdown response
 * into a human-readable confidence label.
 *
 * Rules (documented per capability #84 requirement):
 *  - runsCount null or ≤ 1          → "single sample"  (no confidence claim)
 *  - mentionRate null (multi-run)   → "single sample"  (rate not recorded — honest fallback)
 *  - mentionRate === 1.0            → "High confidence (N/N runs)"
 *  - mentionRate === 0.0            → "High confidence (0/N runs)"
 *  - otherwise (split result)       → "Low confidence — volatile (X/N runs)"
 *
 * NEVER implies more certainty than the data supports. When rate data is absent,
 * always falls back to "single sample" rather than a misleading confidence level.
 */

export type ConfidenceLevel = "high" | "low" | "single";

export interface ConfidenceResult {
  text: string;
  level: ConfidenceLevel;
}

export function confidenceLabel(
  mentionRate: number | null,
  runsCount: number | null,
): ConfidenceResult {
  // No repeat data — show "single sample" for both null and ≤1 cases.
  if (runsCount === null || runsCount <= 1) {
    return { text: "single sample", level: "single" };
  }
  // mentionRate absent despite multi-run count — rate was not recorded; honest fallback.
  if (mentionRate === null) {
    return { text: "single sample", level: "single" };
  }
  const mentioned = Math.round(mentionRate * runsCount);
  if (mentionRate === 1.0) {
    return { text: `High confidence (${mentioned}/${runsCount} runs)`, level: "high" };
  }
  if (mentionRate === 0.0) {
    return { text: `High confidence (0/${runsCount} runs)`, level: "high" };
  }
  return {
    text: `Low confidence — volatile (${mentioned}/${runsCount} runs)`,
    level: "low",
  };
}
