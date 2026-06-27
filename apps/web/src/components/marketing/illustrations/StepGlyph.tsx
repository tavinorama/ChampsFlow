/**
 * StepGlyph — small step-icon illustration for how-it-works walkthrough.
 *
 * Four variants, one per step: Audit / Benchmark / Plan / Monitor.
 * Each is a 64×64 viewBox monoline SVG icon with an emerald or gold tint.
 * Purely decorative. aria-hidden="true".
 */

type StepVariant = "audit" | "benchmark" | "plan" | "monitor";

function AuditIcon({ color }: { color: string }) {
  return (
    <>
      {/* Magnifying glass over a brain/circuit */}
      <circle cx="27" cy="27" r="14" stroke={color} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />
      <line x1="37" y1="37" x2="52" y2="52" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" />
      {/* Inner sparkle/AI node lines */}
      <circle cx="27" cy="27" r="5" fill={color} fillOpacity="0.25" />
      <circle cx="27" cy="27" r="2" fill={color} fillOpacity="0.9" />
      <line x1="27" y1="20" x2="27" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="27" y1="37" x2="27" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="20" y1="27" x2="17" y2="27" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="37" y1="27" x2="34" y2="27" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
    </>
  );
}

function BenchmarkIcon({ color }: { color: string }) {
  return (
    <>
      {/* Three bars — competitor comparison */}
      <rect x="10" y="38" width="11" height="18" rx="2.5" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      <rect x="26.5" y="24" width="11" height="32" rx="2.5" fill={color} fillOpacity="0.50" stroke={color} strokeWidth="1.5" strokeOpacity="0.90" />
      <rect x="43" y="31" width="11" height="25" rx="2.5" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      {/* Trend arrow overlay on middle bar */}
      <polyline points="16,30 32,18 48,24" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" fill="none" />
      <circle cx="32" cy="18" r="2.5" fill={color} fillOpacity="0.9" />
      {/* Baseline */}
      <line x1="8" y1="58" x2="56" y2="58" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
    </>
  );
}

function PlanIcon({ color }: { color: string }) {
  return (
    <>
      {/* Document with lines + check → editorial calendar / plan */}
      <rect x="14" y="10" width="36" height="44" rx="5" stroke={color} strokeWidth="2" fill="none" strokeOpacity="0.85" />
      {/* Header bar */}
      <rect x="14" y="10" width="36" height="10" rx="5" fill={color} fillOpacity="0.18" />
      {/* Lines */}
      <line x1="20" y1="30" x2="44" y2="30" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
      <line x1="20" y1="37" x2="38" y2="37" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
      <line x1="20" y1="44" x2="34" y2="44" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.35" />
      {/* Checkmark bottom right */}
      <circle cx="42" cy="44" r="7" fill={color} fillOpacity="0.18" />
      <polyline points="38.5,44 41,46.5 45.5,41" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" fill="none" />
    </>
  );
}

function MonitorIcon({ color }: { color: string }) {
  return (
    <>
      {/* Trend line up on a simple chart frame */}
      <rect x="8" y="14" width="48" height="36" rx="5" stroke={color} strokeWidth="2" fill="none" strokeOpacity="0.80" />
      {/* Sparkline */}
      <polyline
        points="14,42 22,34 30,38 38,24 50,18"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeOpacity="0.9"
      />
      {/* Filled area under sparkline */}
      <polygon
        points="14,42 22,34 30,38 38,24 50,18 50,50 14,50"
        fill={color}
        fillOpacity="0.08"
      />
      {/* Terminal dot at tip */}
      <circle cx="50" cy="18" r="3" fill={color} fillOpacity="0.85" />
      {/* Screen stand */}
      <line x1="32" y1="50" x2="32" y2="56" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
      <line x1="24" y1="56" x2="40" y2="56" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
    </>
  );
}

export function StepGlyph({
  variant,
  size = 64,
}: {
  variant: StepVariant;
  size?: number;
}) {
  const isGold = variant === "monitor";
  const color = isGold ? "#e6a93f" : "#27c98a";
  const bgColor = isGold ? "rgba(230,169,63,0.10)" : "rgba(39,201,138,0.10)";
  const borderColor = isGold ? "rgba(230,169,63,0.35)" : "rgba(39,201,138,0.30)";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "block",
        flexShrink: 0,
        background: bgColor,
        borderRadius: "14px",
        border: `1px solid ${borderColor}`,
      }}
    >
      {variant === "audit" && <AuditIcon color={color} />}
      {variant === "benchmark" && <BenchmarkIcon color={color} />}
      {variant === "plan" && <PlanIcon color={color} />}
      {variant === "monitor" && <MonitorIcon color={color} />}
    </svg>
  );
}
