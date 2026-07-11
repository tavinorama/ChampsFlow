/**
 * Logo — Ozvor brand lockup.
 *
 * Mark: monochrome "O-ring" — a dashed orbit circle with a center dot.
 * Uses currentColor so it inherits the parent's color (works in nav, footer, etc.).
 *
 * Wordmark: "Ozvor" in Schibsted Grotesk 600, color var(--color-text).
 * No colored tile. No "Ozvor" wordmark here (that's a sub-brand badge elsewhere).
 *
 * Pure component — usable from server or client components.
 */

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="18.85 3.13"
        strokeLinecap="round"
        transform="rotate(-84 16 16)"
      />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({
  size = "1rem",
  className,
}: {
  size?: string;
  /** Optional class hook — e.g. the navbar hides the wordmark on very small
   *  screens (via `.mk-logo-word`) to leave room for the primary CTA. */
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-family)",
        fontSize: size,
        fontWeight: 600,
        letterSpacing: "0.04em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: "var(--color-text)",
      }}
    >
      Ozvor
    </span>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({
  markSize = 30,
  wordSize = "1.0625rem",
}: {
  markSize?: number;
  wordSize?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
      <LogoMark size={markSize} />
      <Wordmark size={wordSize} />
    </span>
  );
}
