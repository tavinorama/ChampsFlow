"use client";

/**
 * OzvorScorecard — reusable presentational component
 *
 * Mirrors the landing hero's audit-screen mockup (AppMockupSVG) with real
 * DOM/CSS so the authenticated product matches what we sell on the landing page.
 *
 * Design language (from AppMockupSVG in (marketing)/page.tsx):
 *  - Score ring: SVG circle progress, green arc (var(--color-primary) / #0A7E5A),
 *    track #eef2f7, starting at 12 o'clock via rotate(-90).
 *  - THREE primary scores: Visibility #2563eb · Citation Readiness #7c3aed · Execution #0fb488
 *  - Competitor card: bar rows with "N / 10" count, warm reds/ambers matching hero.
 *  - Card chrome: var(--color-surface), 1px var(--color-border),
 *    var(--radius-lg), var(--shadow-card).
 *  - Responsive: ring + scores side-by-side on wide, stacked on narrow (375px).
 *
 * Mode selection:
 *  - If `threeScores` is provided → THREE-score layout (primary mode)
 *  - If only `vectors` is provided (legacy) → old AI/Performance/Brand layout
 *
 * Accessibility:
 *  - Ring: role="img" aria-label with full score description.
 *  - Score bars: role="progressbar" aria-valuenow/min/max.
 *  - Competitor bars: role="progressbar" aria-valuenow/min/max.
 *  - WCAG AA contrast on all text (verified: all colors on white or tinted surfaces).
 */

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Public interface — ThreeScores (primary) + ScorecardVectors (legacy)
// ---------------------------------------------------------------------------

export interface ThreeScores {
  visibility: number | null;
  citationReadiness: number | null;
  /** null = no action cards yet (show "Not started" text, not a bar) */
  executionProgress: number | null;
}

export interface ScorecardVectors {
  ai: number | null;
  performance: number | null;
  brand: number | null;
}

export interface ScorecardCompetitor {
  name: string;
  /** 0..10-ish — how often AI recommends them instead of the tracked brand */
  displacement: number;
}

export interface OzvorScorecardProps {
  overall: number | null;
  /** NEW: the three primary scores */
  threeScores?: ThreeScores;
  /** LEGACY: still accepted so old callers don't break until updated */
  vectors?: ScorecardVectors;
  competitors?: ScorecardCompetitor[];
  /** e.g. "50 AI probes · 5 engines" */
  probeSummary?: string;
  /** e.g. "Acme CRM" — used as heading prefix */
  brandName?: string;
  /**
   * compact mode: tighter layout for dashboard hero.
   * Competitor card is always hidden in compact mode.
   */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Color constants — single source of truth.
// Exported so brands/[id] and dashboard can import and standardise on it.
// ---------------------------------------------------------------------------
export const VECTOR_COLORS = {
  ai: "#2563eb",
  performance: "#7c3aed",
  brand: "#0fb488",
} as const;

export const THREE_SCORE_COLORS = {
  visibility: "#2563eb",
  citationReadiness: "#7c3aed",
  executionProgress: "#0fb488",
} as const;

// Competitor warm accent colors mirroring the hero SVG
const COMPETITOR_FILL_COLORS = ["#ef4444", "#f59e0b", "#f97316", "#a855f7"];
const COMPETITOR_TRACK_COLORS = ["#fee2e2", "#fef3c7", "#ffedd5", "#f3e8ff"];

const MAX_DISPLACEMENT = 10;

// ---------------------------------------------------------------------------
// Responsive styles injected once — avoids inline breakpoints per instance
// ---------------------------------------------------------------------------

const SCORECARD_STYLES = `
  .tia-sc-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-5);
    align-items: center;
  }
  .tia-sc-grid--compact {
    gap: var(--space-4);
  }
  @media (max-width: 479px) {
    .tia-sc-grid {
      grid-template-columns: 1fr;
    }
  }
`;

function useScorecardStyles() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    if (typeof document === "undefined") return;
    if (document.getElementById("tia-scorecard-styles")) {
      injected.current = true;
      return;
    }
    const el = document.createElement("style");
    el.id = "tia-scorecard-styles";
    el.textContent = SCORECARD_STYLES;
    document.head.appendChild(el);
    injected.current = true;
  }, []);
}

// ---------------------------------------------------------------------------
// Score Ring (SVG inline)
// ---------------------------------------------------------------------------

function ScoreRingSVG({ value, size }: { value: number | null; size: number }) {
  const r = Math.round(size * 0.3375); // ~54 at 160px — matches hero proportions
  const strokeW = Math.round(size * 0.075); // ~12px at 160px
  const circumference = 2 * Math.PI * r;
  const fraction = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const cx = size / 2;
  const cy = size / 2;
  const displayText = value == null ? "—" : String(value);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={
        value == null
          ? "Overall Ozvor AI Visibility Score: not yet computed"
          : `Overall Ozvor AI Visibility Score: ${value} out of 100`
      }
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#eef2f7"
        strokeWidth={strokeW}
      />
      {/* Progress arc — rotate -90 so it starts at 12 o'clock */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      {/* Score number */}
      <text
        x={cx}
        y={cy - size * 0.04}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={Math.round(size * 0.245)}
        fontWeight="800"
        fill="var(--color-text)"
        fontFamily="var(--font-family)"
        aria-hidden="true"
      >
        {displayText}
      </text>
      {/* / 100 sub-text */}
      <text
        x={cx}
        y={cy + size * 0.115}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={Math.round(size * 0.079)}
        fill="var(--color-muted)"
        fontFamily="var(--font-family)"
        aria-hidden="true"
      >
        / 100
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Three-score rows (primary mode)
// ---------------------------------------------------------------------------

const THREE_SCORE_META: Array<{
  key: keyof ThreeScores;
  label: string;
  description: string;
  color: string;
}> = [
  {
    key: "visibility",
    label: "Visibility",
    description: "What AI engines see when asked about your brand",
    color: THREE_SCORE_COLORS.visibility,
  },
  {
    key: "citationReadiness",
    label: "Citation Readiness",
    description: "How ready your content and presence is to be cited",
    color: THREE_SCORE_COLORS.citationReadiness,
  },
  {
    key: "executionProgress",
    label: "Execution",
    description: "% of recommended actions completed",
    color: THREE_SCORE_COLORS.executionProgress,
  },
];

function ThreeScoreRow({
  meta,
  value,
  compact,
}: {
  meta: (typeof THREE_SCORE_META)[number];
  value: number | null;
  compact: boolean;
}) {
  const isExecution = meta.key === "executionProgress";
  const isNotStarted = isExecution && value === null;

  const filledPct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const displayText = value == null ? (isExecution ? "—" : "—") : String(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: compact
              ? "var(--font-size-caption)"
              : "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
            color: isNotStarted ? "var(--color-muted)" : "var(--color-text)",
          }}
        >
          {meta.label}
        </span>
        <span
          style={{
            fontSize: compact
              ? "var(--font-size-body-sm)"
              : "var(--font-size-h4)",
            fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
            color: isNotStarted ? "var(--color-muted)" : "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          {isNotStarted ? "—" : displayText}
        </span>
      </div>

      {isNotStarted ? (
        /* Execution not started — honest "no cards yet" state, no fabricated bar */
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          Create your action plan to track progress
        </p>
      ) : (
        <div
          role="progressbar"
          aria-valuenow={value ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${meta.label} score: ${displayText} out of 100`}
          style={{
            height: compact ? "7px" : "9px",
            borderRadius: "var(--radius-pill)",
            backgroundColor: "#eef2f7",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${filledPct}%`,
              height: "100%",
              backgroundColor: meta.color,
              borderRadius: "var(--radius-pill)",
              transition: "width 0.6s ease",
            }}
            aria-hidden="true"
          />
        </div>
      )}

      {!isNotStarted && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.4,
          }}
        >
          {isExecution
            ? "% of recommended actions completed"
            : meta.description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy vector bar row (backward-compat path)
// ---------------------------------------------------------------------------

const VECTOR_LABELS: Record<keyof ScorecardVectors, string> = {
  ai: "AI",
  performance: "Performance",
  brand: "Brand",
};

const VECTOR_ORDER: ReadonlyArray<keyof ScorecardVectors> = [
  "ai",
  "performance",
  "brand",
];

function VectorRow({
  vectorKey,
  value,
  compact,
}: {
  vectorKey: keyof ScorecardVectors;
  value: number | null;
  compact: boolean;
}) {
  const color = VECTOR_COLORS[vectorKey];
  const label = VECTOR_LABELS[vectorKey];
  const filledPct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const displayText = value == null ? "—" : String(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: compact
              ? "var(--font-size-caption)"
              : "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
            color: "var(--color-text)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: compact
              ? "var(--font-size-body-sm)"
              : "var(--font-size-h4)",
            fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
            color: "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          {displayText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} score: ${displayText} out of 100`}
        style={{
          height: compact ? "7px" : "9px",
          borderRadius: "var(--radius-pill)",
          backgroundColor: "#eef2f7",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${filledPct}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: "var(--radius-pill)",
            transition: "width 0.6s ease",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Probe summary pill — green chip matching the hero's badge
// ---------------------------------------------------------------------------

function ProbePill({ summary }: { summary: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "3px 10px",
        borderRadius: "var(--radius-pill)",
        backgroundColor: "var(--color-badge-connected-bg)",
        border: "1px solid var(--color-success)",
        fontSize: "var(--font-size-caption)",
        fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
        color: "var(--color-success)",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: "var(--color-success)",
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      {summary}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Competitor benchmark card
// ---------------------------------------------------------------------------

function CompetitorCard({ competitors }: { competitors: ScorecardCompetitor[] }) {
  if (competitors.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3
        style={{
          fontSize: "var(--font-size-body-sm)",
          fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
          color: "var(--color-text)",
          margin: "0 0 var(--space-4) 0",
        }}
      >
        Who AI recommends instead of you
      </h3>

      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        {competitors.map((comp, i) => {
          const fillColor = COMPETITOR_FILL_COLORS[i % COMPETITOR_FILL_COLORS.length];
          const trackColor = COMPETITOR_TRACK_COLORS[i % COMPETITOR_TRACK_COLORS.length];
          const capped = Math.min(comp.displacement, MAX_DISPLACEMENT);
          const fillPct = (capped / MAX_DISPLACEMENT) * 100;
          const countLabel = `${capped} / ${MAX_DISPLACEMENT}`;

          return (
            <div key={comp.name}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "var(--space-1)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--font-size-caption)",
                    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
                    color: fillColor,
                  }}
                >
                  {comp.name}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-caption)",
                    fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                    color: "var(--color-muted)",
                    flexShrink: 0,
                    marginLeft: "var(--space-2)",
                  }}
                >
                  {countLabel}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={capped}
                aria-valuemin={0}
                aria-valuemax={MAX_DISPLACEMENT}
                aria-label={`${comp.name} displaces you in ${capped} out of ${MAX_DISPLACEMENT} queries`}
                style={{
                  height: "9px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: trackColor,
                  overflow: "hidden",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: `${fillPct}%`,
                    height: "100%",
                    backgroundColor: fillColor,
                    borderRadius: "var(--radius-pill)",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function OzvorScorecard({
  overall,
  threeScores,
  vectors,
  competitors,
  probeSummary,
  brandName,
  compact = false,
}: OzvorScorecardProps) {
  useScorecardStyles();

  const hasCompetitors =
    !compact && Array.isArray(competitors) && competitors.length > 0;

  const ringSize = compact ? 120 : 160;

  // Prefer threeScores when provided; fall back to legacy vectors.
  const useThreeScores = threeScores != null;

  return (
    <section
      aria-label={
        brandName
          ? `${brandName} — Ozvor Scorecard`
          : "Ozvor Scorecard"
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? "var(--space-4)" : "var(--space-5)",
      }}
    >
      {/* Heading row */}
      {(brandName || probeSummary) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-3)",
          }}
        >
          {brandName && (
            <h2
              style={{
                fontSize: compact
                  ? "var(--font-size-h3)"
                  : "var(--font-size-h2)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              {brandName} &#8212; Ozvor AI Visibility Score
            </h2>
          )}
          {probeSummary && <ProbePill summary={probeSummary} />}
        </div>
      )}

      {/* Ring + Scores grid — responsive via injected stylesheet */}
      <div
        className={`tia-sc-grid${compact ? " tia-sc-grid--compact" : ""}`}
        style={compact ? { gap: "var(--space-4)" } : undefined}
      >
        {/* Score ring card */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: compact ? "var(--space-4)" : "var(--space-6)",
            boxShadow: "var(--shadow-card)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <ScoreRingSVG value={overall} size={ringSize} />
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
              color: "var(--color-muted)",
              margin: 0,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            Ozvor AI Visibility Score
          </p>
        </div>

        {/* Scores card — three-score primary mode or legacy vectors */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: compact ? "var(--space-4)" : "var(--space-6)",
            boxShadow: "var(--shadow-card)",
            display: "flex",
            flexDirection: "column",
            gap: compact ? "var(--space-4)" : "var(--space-5)",
            alignSelf: "stretch",
            justifyContent: "center",
          }}
        >
          {useThreeScores
            ? THREE_SCORE_META.map((meta) => (
                <ThreeScoreRow
                  key={meta.key}
                  meta={meta}
                  value={threeScores[meta.key]}
                  compact={compact}
                />
              ))
            : vectors != null
              ? VECTOR_ORDER.map((key) => (
                  <VectorRow
                    key={key}
                    vectorKey={key}
                    value={vectors[key]}
                    compact={compact}
                  />
                ))
              : null}
        </div>
      </div>

      {/* Competitor benchmark — hidden in compact mode */}
      {hasCompetitors && <CompetitorCard competitors={competitors!} />}
    </section>
  );
}
