/**
 * BlogCover — the on-brand cover for every Ozvor blog post (founder-approved
 * 2026-07-14). Always DARK — a fixed brand asset like the footer, independent
 * of the site's light/dark toggle. Rendered from post data (title + category),
 * so every existing and future article gets a consistent branded cover with no
 * image files to generate or store.
 *
 *  - variant="hero" → full cover at the top of an article; renders the <h1>.
 *  - variant="card" → compact cover for the /blog index list; renders an <h2>.
 *
 * Visual: warm green-charcoal ground (#0E1A14) + subtle emerald/amber radial
 * tints + a dot grid, an emerald accent rail, category eyebrow, the title in
 * the brand grotesk, and (hero only) the Ozvor O-ring mark + wordmark.
 */

const OZVOR_INK = "#0E1A14";
const OZVOR_EMERALD = "#34d399";
const OZVOR_RAIL = "#27c98a";
const OZVOR_TEXT = "#F3F1E8";
const OZVOR_MUTED = "#9db3a8";
const OZVOR_FAINT = "#6f8a7f";

// Layered background: emerald tint (top-right) + amber tint (bottom-left) +
// dot grid. One declaration so it paints in a single flat pass.
const COVER_BG = {
  backgroundColor: OZVOR_INK,
  backgroundImage: [
    "radial-gradient(ellipse at 88% 12%, rgba(10,126,90,0.20), transparent 55%)",
    "radial-gradient(ellipse at 6% 94%, rgba(224,152,47,0.10), transparent 55%)",
    "radial-gradient(circle, rgba(52,211,153,0.11) 1.2px, transparent 1.3px)",
  ].join(", "),
  backgroundSize: "auto, auto, 22px 22px",
} as const;

function OzvorRing({ size = 26 }: { size?: number }) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <circle cx={c} cy={c} r={size * 0.42} fill="none" stroke={OZVOR_EMERALD} strokeWidth={size * 0.12} />
      <circle cx={c} cy={c} r={size * 0.15} fill={OZVOR_EMERALD} />
    </svg>
  );
}

export function BlogCover({
  category,
  title,
  dek,
  variant = "hero",
}: {
  category: string;
  title: string;
  dek?: string;
  variant?: "hero" | "card";
}) {
  const isHero = variant === "hero";

  const eyebrow = (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: isHero ? "0.8125rem" : "0.6875rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: OZVOR_EMERALD,
        marginBottom: isHero ? "var(--space-4)" : "var(--space-2)",
      }}
    >
      {category}
    </span>
  );

  const titleStyle: React.CSSProperties = {
    margin: 0,
    color: OZVOR_TEXT,
    fontFamily: "var(--font-family)",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    lineHeight: 1.12,
    textWrap: "balance",
    fontSize: isHero ? "clamp(1.9rem, 4.2vw, 2.9rem)" : "clamp(1.15rem, 2.4vw, 1.5rem)",
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
        borderLeft: `6px solid ${OZVOR_RAIL}`,
        padding: isHero ? "clamp(1.75rem, 4.5vw, 3.25rem)" : "var(--space-6)",
        minHeight: isHero ? undefined : "150px",
        display: "flex",
        flexDirection: "column",
        justifyContent: isHero ? "flex-start" : "space-between",
        gap: isHero ? "var(--space-4)" : "var(--space-3)",
        ...COVER_BG,
      }}
    >
      <div>
        {eyebrow}
        {isHero ? <h1 style={titleStyle}>{title}</h1> : <h2 style={titleStyle}>{title}</h2>}
        {isHero && dek && (
          <p
            style={{
              margin: "var(--space-4) 0 0",
              color: OZVOR_MUTED,
              fontFamily: "var(--font-family)",
              fontSize: "clamp(1rem, 1.6vw, 1.1875rem)",
              lineHeight: 1.6,
              maxWidth: "56ch",
            }}
          >
            {dek}
          </p>
        )}
      </div>

      {isHero && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginTop: "var(--space-5)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid rgba(39,201,138,0.22)",
          }}
        >
          <OzvorRing size={26} />
          <span style={{ color: OZVOR_TEXT, fontFamily: "var(--font-family)", fontWeight: 800, fontSize: "1.35rem", letterSpacing: "-0.01em" }}>
            Ozvor
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ color: OZVOR_FAINT, fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem" }}>
            ozvor.com
          </span>
        </div>
      )}
    </div>
  );
}
