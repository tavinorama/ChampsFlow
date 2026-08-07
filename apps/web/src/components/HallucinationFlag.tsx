"use client";

/**
 * HallucinationFlag — the P7 council verdict, on screen (approved by the
 * founder 2026-08-07).
 *
 * Shown when the day's control battery caught an engine CONFIRMING a brand we
 * invented, on the same day this audit ran. The council's reasoning, kept
 * here because it constrains every future edit:
 *  - the Wilson interval is an implicit precision claim; knowing about a
 *    same-day hallucination and staying quiet is a material omission
 *    (FTC §5) — specific defect, specific day, specific customer;
 *  - the score is NEVER changed (append-only): we annotate and show the
 *    with/without comparison so the caveat is checkable, not taken on faith;
 *  - anti-patterns rejected by the council: buried footnotes, permanent
 *    generic "AI can make mistakes" banners (they train users to ignore),
 *    silent recomputation (worse than saying nothing).
 *
 * One component, both screens — the #163 lesson: one truth on one screen is
 * how the product lies by accident.
 *
 * COPY IS THE COUNCIL'S EXACT TEXT — do not paraphrase without a new verdict.
 */

import { useState } from "react";
import { ENGINE_NAME } from "./CoverageNote";

export interface HallucinationInfo {
  engines: string[];
  citation_rate: number | null;
  citation_rate_without_flagged: number | null;
}

export function HallucinationFlag({
  info,
  dateLabel,
}: {
  info?: HallucinationInfo | null;
  /** Audit date for the detail text; falls back to "that day". */
  dateLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!info || info.engines.length === 0) return null;

  const names = info.engines.map((e) => ENGINE_NAME[e] ?? e);
  const engineList = names.join(" and ");
  const withPct = info.citation_rate != null ? Math.round(info.citation_rate * 100) : null;
  const withoutPct =
    info.citation_rate_without_flagged != null
      ? Math.round(info.citation_rate_without_flagged * 100)
      : null;
  const when = dateLabel ?? "that day";
  const plural = names.length > 1;

  return (
    <div
      style={{
        margin: "var(--space-3) 0 0",
        padding: "var(--space-3) var(--space-4)",
        borderLeft: "3px solid var(--color-error, #bd3b2e)",
        background: "var(--color-surface-alt, transparent)",
        fontSize: "var(--font-size-caption)",
        color: "var(--color-muted)",
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: 0 }}>
        <b style={{ color: "var(--color-text)" }}>Data-quality flag:</b>{" "}
        {engineList} answered questions about a company we invented, on the day
        this audit ran. We&rsquo;ve marked {plural ? "their" : "its"} citations
        below.{" "}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--color-accent-ink, var(--color-primary))",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "inherit",
          }}
        >
          See your score with and without {plural ? "them" : "it"} →
        </button>
      </p>
      {open && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <p style={{ margin: "0 0 var(--space-2)" }}>
            On {when}, {engineList} confirmed the existence of a brand we made
            up to test {plural ? "them" : "it"} — a sign {plural ? "they" : "it"}{" "}
            may invent real ones too. We still count {plural ? "their" : "its"}{" "}
            answers here, because changing a report after you&rsquo;ve seen it
            would be its own kind of dishonest. What we do instead: flag it,
            show the comparison, and stop trusting that engine for new audits
            until it passes the same test again.
          </p>
          {withPct !== null && withoutPct !== null && (
            <p style={{ margin: 0 }}>
              <b style={{ color: "var(--color-text)" }}>Check it yourself:</b>{" "}
              cited in <b style={{ color: "var(--color-text)" }}>{withPct}%</b>{" "}
              of answers with {engineList} included, and{" "}
              <b style={{ color: "var(--color-text)" }}>{withoutPct}%</b>{" "}
              without {plural ? "them" : "it"}.{" "}
              {withPct === withoutPct
                ? "Identical — the flagged engine did not change your result."
                : `A ${Math.abs(withPct - withoutPct)} point difference, so treat this run's number with that much room.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
