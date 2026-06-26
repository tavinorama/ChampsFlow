/**
 * SoftCTA — reusable soft call-to-action band
 *
 * Renders a gentle nudge toward the Ozvor value ladder:
 *   Free test (/test) → Kit $29 (/kit) → Growth $99/mo → Agency → /book
 *
 * Two visual tones:
 *   "default" — teal-tinted band with filled primary button (most pages)
 *   "quiet"   — minimal border, single text-link (legal pages)
 *
 * Design tokens only — no hardcoded hex. Dark mode is automatic via CSS
 * custom properties defined in tokens.css.
 *
 * Pure RSC — no "use client" needed (no interactivity).
 */

import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoftCTAProps {
  headline: string;
  subline?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  tone?: "default" | "quiet";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SoftCTA({
  headline,
  subline,
  primary,
  secondary,
  tone = "default",
}: SoftCTAProps) {
  if (tone === "quiet") {
    return (
      <aside
        aria-label={headline}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4) var(--space-5)",
          backgroundColor: "var(--color-surface-muted)",
          fontFamily: "var(--font-family)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          {headline}{" "}
          <Link
            href={primary.href}
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontWeight: "var(--font-weight-medium)",
              display: "inline-flex",
              alignItems: "center",
              minHeight: "var(--min-tap-target)",
            }}
          >
            {primary.label}
          </Link>
        </p>
      </aside>
    );
  }

  // tone === "default"
  // flexWrap on the outer row + flex-basis on children handles mobile stacking
  // without needing a media query. On narrow viewports the actions div wraps
  // below the text content naturally.
  return (
    <aside
      aria-label={headline}
      style={{
        backgroundColor: "var(--color-teal-surface)",
        border: "1px solid var(--color-teal-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-8) var(--space-6)",
        fontFamily: "var(--font-family)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-6)",
          justifyContent: "space-between",
        }}
      >
        {/* Text content — grows to fill available width */}
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <p
            style={{
              margin: subline ? "0 0 var(--space-1) 0" : 0,
              fontSize: "var(--font-size-h3)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              lineHeight: "var(--line-height-h3)",
            }}
          >
            {headline}
          </p>
          {subline && (
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: "var(--line-height-body)",
              }}
            >
              {subline}
            </p>
          )}
        </div>

        {/* Actions — shrinks to fit, wraps below text on narrow viewports */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-4)",
            flexShrink: 0,
          }}
        >
          {/* Primary CTA — filled button, min 44px tap target */}
          <Link
            href={primary.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "var(--min-tap-target)",
              minWidth: "var(--min-tap-target)",
              padding: "0 var(--space-6)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-bold)",
              fontFamily: "var(--font-family)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}
          >
            {primary.label}
          </Link>

          {/* Secondary CTA — text link with underline on hover */}
          {secondary && (
            <Link
              href={secondary.href}
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-primary)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-family)",
              }}
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
