/**
 * Logo — the TrustIndex AI brand lockup (mark + wordmark).
 *
 * Mark: a friendly rounded squircle in brand green with three ascending white
 * bars (the "rising index / score" — echoes the 3-vector TrustIndex Score) and a
 * warm amber spark (the AI signal). On-brand, legible at favicon size, and not a
 * generic shield/checkmark.
 *
 * Wordmark: two-tone weight — "Trust" (medium) + "Index" (extrabold) read as one
 * word with emphasis, and "AI" in brand green. Tight, modern tracking.
 *
 * Pure component (no hooks) — usable from server or client components.
 */

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      {/* rising index bars */}
      <rect x="8.5" y="18" width="4" height="6" rx="2" fill="#ffffff" opacity="0.7" />
      <rect x="14" y="14" width="4" height="10" rx="2" fill="#ffffff" opacity="0.85" />
      <rect x="19.5" y="9.5" width="4" height="14.5" rx="2" fill="#ffffff" />
      {/* AI signal spark */}
      <circle cx="21.5" cy="7" r="2.2" fill="var(--color-accent-amber)" />
    </svg>
  );
}

export function Wordmark({ size = "1rem" }: { size?: string }) {
  return (
    <span style={{ fontFamily: "var(--font-family)", fontSize: size, letterSpacing: "-0.015em", lineHeight: 1, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 600, color: "var(--color-text)" }}>Trust</span>
      <span style={{ fontWeight: 800, color: "var(--color-text)" }}>Index</span>
      <span style={{ fontWeight: 700, color: "var(--color-primary)", marginLeft: "0.28em" }}>AI</span>
    </span>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({ markSize = 30, wordSize = "1.0625rem" }: { markSize?: number; wordSize?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
      <LogoMark size={markSize} />
      <Wordmark size={wordSize} />
    </span>
  );
}
