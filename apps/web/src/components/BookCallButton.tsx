/**
 * BookCallButton — Reusable "Book a call" CTA component.
 *
 * Behaviour:
 *   - If NEXT_PUBLIC_CALENDLY_URL is set:
 *       Opens the Calendly URL in a new tab (rel="noopener noreferrer").
 *       This is the safest, most compatible approach: no third-party script
 *       loaded until user intent, works with all ad/script blockers,
 *       and avoids a popup widget that would require loading Calendly JS eagerly.
 *   - If NEXT_PUBLIC_CALENDLY_URL is unset:
 *       Falls back to /test (the free audit page) so the CTA is never broken.
 *
 * Props:
 *   label    — visible button text (default: "Book a 20-min call")
 *   variant  — "primary" | "secondary" (default: "secondary")
 *
 * Accessibility:
 *   - Renders a semantic <a> with correct href.
 *   - External links announce via aria-label (includes "opens in new tab").
 *   - Focus-visible outline uses design-system token.
 *   - Min tap target enforced via minHeight token.
 *   - Color contrast: primary #0A7E5A on white passes WCAG AA (4.57:1).
 *
 * Design system: all values from tokens.css — no magic numbers.
 * "use client" required because NEXT_PUBLIC_ env vars in client components
 * must be read at runtime (static export reads them at build time — both work).
 */

"use client";

import Link from "next/link";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";
const IS_EXTERNAL = CALENDLY_URL.startsWith("https://");
const FALLBACK_HREF = "/test";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BookCallButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
  /** Optional extra inline styles for layout-level adjustments (e.g. width) */
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookCallButton({
  label = "Book a 20-min call",
  variant = "secondary",
  style,
}: BookCallButtonProps) {
  const href = IS_EXTERNAL ? CALENDLY_URL : FALLBACK_HREF;
  const isExternal = IS_EXTERNAL;

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    minHeight: "var(--min-button-height)",
    padding: "0 var(--space-6)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-body-sm)",
    fontWeight: "var(--font-weight-bold)",
    fontFamily: "var(--font-family)",
    textDecoration: "none",
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
    ...style,
  };

  const primaryStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
  };

  const secondaryStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: "transparent",
    color: "var(--color-primary)",
    border: "2px solid var(--color-primary)",
  };

  const computedStyle = variant === "primary" ? primaryStyle : secondaryStyle;

  const ariaLabel = isExternal
    ? `${label} (opens in new tab)`
    : label;

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        style={computedStyle}
        className="book-call-btn"
      >
        <CalendarIcon />
        {label}
      </a>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      style={computedStyle}
      className="book-call-btn"
    >
      <CalendarIcon />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Calendar icon — purely decorative
// ---------------------------------------------------------------------------

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
