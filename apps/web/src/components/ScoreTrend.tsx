"use client";

/**
 * ScoreTrend — SVG sparkline/line chart for TrustIndex Score over time.
 *
 * Renders a polyline chart of `score_overall` values (0–100) from the
 * /api/brands/:id/score `trend[]` array (returned newest-first; reversed here
 * to chronological left-to-right order before rendering).
 *
 * Two modes:
 *  - full (default): 400×100 viewBox, date labels at both ends, current score
 *    + delta badge, section label.
 *  - compact: 200×50 viewBox, single date label (latest only), no badge.
 *
 * Accessibility: role="img" + aria-label on the SVG describing the trend.
 * No external chart libraries — pure SVG + CSS variables from tokens.css.
 */

interface TrendRow {
  recorded_at: string;
  score_overall: number | null;
  score_ai?: number | null;
  score_performance?: number | null;
  score_brand?: number | null;
}

export interface ScoreTrendProps {
  /** Trend rows from /api/brands/:id/score — in any order (component reverses to chronological) */
  trend: TrendRow[];
  /** compact=true: small sparkline (for dashboard summary); false: full chart (brand detail) */
  compact?: boolean;
  /** Brand name for aria-label */
  brandName?: string;
  /** multiSeries=true: draw AI / Performance / Brand vector lines (full mode only) */
  multiSeries?: boolean;
}

const VECTOR_SERIES = [
  { key: "score_ai" as const, label: "AI", color: "#2563eb" },
  { key: "score_performance" as const, label: "Performance", color: "#7c3aed" },
  { key: "score_brand" as const, label: "Brand", color: "#0fb488" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ScoreTrend({ trend, compact = false, brandName, multiSeries = false }: ScoreTrendProps) {
  // 1. Filter rows with a valid score_overall
  const valid = trend.filter(
    (r): r is { recorded_at: string; score_overall: number } =>
      r.score_overall !== null && r.score_overall !== undefined
  );

  // 2. Sort to chronological order (oldest first = left on chart)
  const chronological = [...valid].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  // 3. < 2 valid data points → friendly message
  if (chronological.length < 2) {
    return (
      <div
        style={{
          color: "var(--color-muted)",
          fontSize: "var(--font-size-body-sm)",
          lineHeight: 1.6,
        }}
      >
        Not enough history yet — your score trend appears after your next
        weekly audit.
      </div>
    );
  }

  // Chart dimensions
  const viewW = compact ? 200 : 400;
  const viewH = compact ? 50 : 100;
  const strokeW = compact ? 1.5 : 2;
  const dotR = compact ? 2 : 3;

  const n = chronological.length;

  // Map each data point to SVG coordinates
  const points = chronological.map((row, i) => {
    const x = n === 1 ? viewW / 2 : (i / (n - 1)) * (viewW - 8) + 4;
    // y: score 0 at bottom, 100 at top.
    // Formula from spec: y = (heightPx - 4) - ((score / 100) * (heightPx - 8))
    const y = viewH - 4 - (row.score_overall / 100) * (viewH - 8);
    return { x, y, row };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Multi-series: one polyline per vector (AI / Performance / Brand). Vectors
  // are always present when a row exists (geo_score columns are NOT NULL), so
  // they share the overall x-scale. Null-safe regardless.
  const vectorSeries = VECTOR_SERIES.map((s) => {
    const pts = chronological
      .map((row, i) => {
        const raw = (row as unknown as Record<string, number | null | undefined>)[s.key];
        const val = typeof raw === "number" ? raw : null;
        const x = n === 1 ? viewW / 2 : (i / (n - 1)) * (viewW - 8) + 4;
        const y = val == null ? null : viewH - 4 - (val / 100) * (viewH - 8);
        return y == null ? null : { x, y };
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    return { ...s, pts };
  }).filter((s) => s.pts.length >= 2);

  const useMulti = multiSeries && !compact && vectorSeries.length > 0;

  const firstScore = chronological[0].score_overall;
  const latestScore = chronological[chronological.length - 1].score_overall;
  const delta = latestScore - firstScore;

  const firstDate = formatDate(chronological[0].recorded_at);
  const latestDate = formatDate(
    chronological[chronological.length - 1].recorded_at
  );

  const ariaLabel = [
    brandName
      ? `TrustIndex Score trend for ${brandName}:`
      : "TrustIndex Score trend:",
    `from ${firstScore} to ${latestScore},`,
    delta > 0
      ? `+${delta} points`
      : delta < 0
      ? `${delta} points`
      : "no change",
  ].join(" ");

  const deltaColor =
    delta > 0
      ? "var(--color-success)"
      : delta < 0
      ? "var(--color-error)"
      : "var(--color-muted)";

  const deltaLabel =
    delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "±0";

  return (
    <div style={{ width: "100%" }}>
      {/* Full mode: current score + delta badge row */}
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <span
            style={{
              fontSize: "clamp(2rem, 6vw, 3rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              lineHeight: 1,
            }}
            aria-label={`Current TrustIndex Score: ${latestScore}`}
          >
            {latestScore}
          </span>
          <span
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              fontWeight: 500,
            }}
            aria-hidden="true"
          >
            / 100
          </span>
          <span
            style={{
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 700,
              color: deltaColor,
              backgroundColor:
                delta > 0
                  ? "var(--color-success-subtle)"
                  : delta < 0
                  ? "var(--color-badge-status-error-bg)"
                  : "var(--color-surface-muted)",
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
            }}
            aria-label={`Change: ${deltaLabel} points since first audit`}
          >
            {deltaLabel}
          </span>
        </div>
      )}

      {/* SVG sparkline */}
      <svg
        width="100%"
        viewBox={`0 0 ${viewW} ${viewH}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block", overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {useMulti ? (
          /* One line per vector — AI / Performance / Brand */
          vectorSeries.map((s) => (
            <polyline
              key={s.key}
              points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke={s.color}
              strokeWidth={strokeW}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        ) : (
          <>
            {/* Line connecting all data points (overall) */}
            <polyline
              points={polylinePoints}
              stroke="var(--color-primary)"
              strokeWidth={strokeW}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dots at each data point */}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="var(--color-primary)" aria-hidden="true" />
            ))}
          </>
        )}
      </svg>

      {/* Legend — multi-series only */}
      {useMulti && (
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: "var(--space-2)" }} aria-hidden="true">
          {vectorSeries.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 600 }}>
              <span style={{ width: "12px", height: "3px", borderRadius: "2px", backgroundColor: s.color, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Date labels below the SVG */}
      <div
        style={{
          display: "flex",
          justifyContent: compact ? "flex-end" : "space-between",
          marginTop: "var(--space-1)",
        }}
        aria-hidden="true"
      >
        {!compact && (
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            {firstDate}
          </span>
        )}
        <span
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          {latestDate}
        </span>
      </div>
    </div>
  );
}

export default ScoreTrend;
