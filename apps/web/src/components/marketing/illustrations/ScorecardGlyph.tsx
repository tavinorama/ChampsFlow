/**
 * ScorecardGlyph — compact 3-vector TrustIndex AI scorecard visual.
 *
 * Three arcs (AI · Brand · Performance) arranged as concentric partial rings,
 * each filled to a different percentage with the emerald gradient.
 * Used in the how-it-works and results pages to represent the score concept.
 *
 * Purely decorative. aria-hidden="true".
 * Size-controlled by the consumer via the `size` prop.
 */

export function ScorecardGlyph({
  size = 120,
  aiPct = 0.58,
  perfPct = 0.71,
  brandPct = 0.49,
}: {
  size?: number;
  aiPct?: number;
  perfPct?: number;
  brandPct?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;

  // Helper: SVG arc path for a partial circle
  function arc(
    r: number,
    pct: number,
    strokeWidth: number,
    color: string,
    opacity: number,
    dashOffset: number = 0
  ) {
    const circumference = 2 * Math.PI * r;
    const filled = circumference * pct;
    const gap = circumference - filled;
    // Rotate so arc starts at the top (-90 deg)
    const rotation = -90 + dashOffset;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${gap}`}
        strokeLinecap="round"
        strokeOpacity={opacity}
        transform={`rotate(${rotation} ${cx} ${cy})`}
      />
    );
  }

  const outerR = size * 0.42;
  const midR = size * 0.32;
  const innerR = size * 0.22;
  const trackW = size * 0.065;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="sg-em" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#27c98a" />
          <stop offset="100%" stopColor="#0c7d54" />
        </linearGradient>
        <linearGradient id="sg-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e6a93f" />
          <stop offset="100%" stopColor="#b9791f" />
        </linearGradient>
      </defs>

      {/* Track rings (background) */}
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--color-border)" strokeWidth={trackW} strokeOpacity="0.5" />
      <circle cx={cx} cy={cy} r={midR} fill="none" stroke="var(--color-border)" strokeWidth={trackW} strokeOpacity="0.5" />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="var(--color-border)" strokeWidth={trackW} strokeOpacity="0.5" />

      {/* Filled arcs */}
      {/* AI — outer, emerald */}
      {arc(outerR, aiPct, trackW, "#27c98a", 0.9)}
      {/* Performance — middle, emerald (slightly deeper) */}
      {arc(midR, perfPct, trackW, "#0c7d54", 0.85)}
      {/* Brand — inner, gold */}
      {arc(innerR, brandPct, trackW, "#e6a93f", 0.9)}

      {/* Centre label */}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text)"
        fontSize={size * 0.18}
        fontWeight="800"
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="-1"
      >
        {Math.round(((aiPct + perfPct + brandPct) / 3) * 100)}
      </text>
    </svg>
  );
}
