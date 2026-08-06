"use client";

/**
 * CoverageNote — the one place the panel's honesty story is written (#163).
 *
 * Extracted from dashboard-v3's PanelCoverage so the brand page can tell the
 * SAME story in the SAME words. The bug this fixes was never a missing
 * feature — it was one truth on one screen: dashboard-v3 explained "4 of 5
 * engines, here's why, here's the number without the flagged one", while
 * /brands/[id] read the same audit and said only "4 engines". A customer who
 * saw both screens had to decide which one was lying.
 *
 * The score is a rate over the probes that ran, so a run missing two engines
 * is a different measurement from the one before it — not a lower one. Drawn
 * on the same trend line without a word, it reads as "you lost ground", which
 * is the single most damaging thing this product can say wrongly.
 *
 * Silent when coverage is unknown (older audits) or complete. A badge that
 * says "5 of 5" on every healthy run trains people to stop reading it.
 */

/** Engine coverage for one audit, as written by the worker into
 *  provider_breakdown.coverage. Absent on audits that predate the field. */
export interface CoverageData {
  requested?: number;
  answered?: number;
  /** Asked, gave nothing back — key, quota, outage. */
  missing?: string[];
  /** Withheld by us: the engine's control battery says it is drifting. */
  paused?: string[];
  /** Answered and counted, but its control battery says it is failing. */
  degraded?: string[];
  comparable?: boolean;
  /** Headline citation rate, as published. */
  citationRate?: number;
  /** Same measurement with the degraded engines removed. Null when none were. */
  citationRateWithoutDegraded?: number | null;
}

export const ENGINE_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  google: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overviews",
  dataforseo: "Google AI Overviews",
};

export function CoverageNote({ coverage }: { coverage?: CoverageData | null }) {
  if (!coverage || coverage.comparable !== false) return null;
  const silent = (coverage.missing ?? []).map((e) => ENGINE_NAME[e] ?? e);
  const paused = (coverage.paused ?? []).map((e) => ENGINE_NAME[e] ?? e);
  const degraded = (coverage.degraded ?? []).map((e) => ENGINE_NAME[e] ?? e);
  if (silent.length === 0 && paused.length === 0 && degraded.length === 0) return null;

  // The check the customer can run themselves. We publish a number, flag an
  // engine, and then show what the number would have been without it — so the
  // caveat is verifiable instead of something to take on trust.
  const withPct = coverage.citationRate != null ? Math.round(coverage.citationRate * 100) : null;
  const withoutPct =
    coverage.citationRateWithoutDegraded != null
      ? Math.round(coverage.citationRateWithoutDegraded * 100)
      : null;
  const showCompare = degraded.length > 0 && withPct !== null && withoutPct !== null;

  return (
    <p
      style={{
        margin: "var(--space-3) 0 0",
        padding: "var(--space-3) var(--space-4)",
        borderLeft: "3px solid var(--color-badge-status-warn-text, #b9781a)",
        background: "var(--color-surface-alt, transparent)",
        fontSize: "var(--font-size-caption)",
        color: "var(--color-muted)",
        lineHeight: 1.55,
      }}
    >
      <b style={{ color: "var(--color-text)" }}>
        This run reached {coverage.answered} of {coverage.requested} engines.
      </b>{" "}
      {/* Why the panel changed matters: one is an outage on their side, the
          other is us holding an engine back. Saying only "missing" would hide
          our own decision behind the engines' failure. */}
      {silent.length > 0 && (
        <>
          {silent.join(" and ")} did not answer.{" "}
        </>
      )}
      {paused.length > 0 && (
        <>
          We held {paused.join(" and ")} back: {paused.length === 1 ? "its" : "their"}{" "}
          daily control check says {paused.length === 1 ? "it is" : "they are"} drifting, and a
          drifting engine produces fiction rather than citations.{" "}
        </>
      )}
      {degraded.length > 0 && (
        <>
          We kept {degraded.join(" and ")} in the panel, but{" "}
          {degraded.length === 1 ? "its" : "their"} daily control check is failing:{" "}
          {degraded.length === 1 ? "it has" : "they have"} stopped naming brands{" "}
          {degraded.length === 1 ? "it" : "they"} should name. The answers still
          count toward the number above.{" "}
        </>
      )}
      {silent.length + paused.length > 0 && (
        <>
          So this number is not comparable to your earlier audits — a smaller
          panel is a different measurement, not a worse result. Run it again once
          the full panel is back.{" "}
        </>
      )}
      {showCompare && (
        <span style={{ display: "block", marginTop: "var(--space-2)" }}>
          {/* Two numbers, one measurement, two panels. If they match, the flag
              cost nothing and the score stands. If they diverge, the flag WAS
              the story — and either way the customer gets to decide, which is
              the whole point of saying anything at all. */}
          <b style={{ color: "var(--color-text)" }}>Check it yourself:</b> you were
          cited in <b style={{ color: "var(--color-text)" }}>{withPct}%</b> of
          answers with {degraded.join(" and ")} included, and{" "}
          <b style={{ color: "var(--color-text)" }}>{withoutPct}%</b> without{" "}
          {degraded.length === 1 ? "it" : "them"}.{" "}
          {withPct === withoutPct
            ? `Identical — the flagged engine did not change your result.`
            : `A ${Math.abs(withPct - withoutPct)} point difference, so treat this run's number with that much room.`}
        </span>
      )}
    </p>
  );
}
