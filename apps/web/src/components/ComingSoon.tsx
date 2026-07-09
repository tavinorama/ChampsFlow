/**
 * ComingSoon — reusable in-app placeholder for features on the roadmap.
 *
 * Honest teaser: names what's coming and why it's valuable, without faking a
 * working feature or any data. Themed via CSS tokens (follows light/dark).
 */

import type { ReactNode } from "react";

export interface ComingSoonProps {
  eyebrow?: string;
  title: string;
  description: string;
  /** What the feature will do — shown as a short "what to expect" list. */
  bullets?: string[];
  /** Optional CTA (e.g. link back to a live feature). */
  cta?: ReactNode;
}

export function ComingSoon({ eyebrow = "Coming soon", title, description, bullets, cta }: ComingSoonProps) {
  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height, 64px) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-accent-ink)",
          border: "1px solid rgba(39,201,138,0.28)",
          borderRadius: "var(--radius-pill)",
          padding: "4px 12px",
          marginBottom: "var(--space-4)",
        }}
      >
        {eyebrow}
      </span>
      <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 var(--space-4)" }}>
        {title}
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "620px", margin: 0 }}>
        {description}
      </p>

      {bullets && bullets.length > 0 && (
        <div
          style={{
            marginTop: "var(--space-8)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)",
            padding: "var(--space-6)",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "var(--space-3)" }}>
            What to expect
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.55 }}>
                <span aria-hidden="true" style={{ color: "var(--color-accent-ink)", fontWeight: 700, flexShrink: 0 }}>›</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cta && <div style={{ marginTop: "var(--space-8)" }}>{cta}</div>}
    </main>
  );
}
