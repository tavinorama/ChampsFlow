"use client";

/**
 * SkipToMainContent
 * WCAG 2.4.1 — Bypass Blocks
 *
 * Visually hidden until the link receives keyboard focus, then slides into view.
 * Lives as a Client Component so the focus/blur handlers can run in the browser
 * without forcing the entire marketing layout to be a Client Component.
 */
export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      style={{
        position: "absolute",
        top: "-40px",
        left: 0,
        padding: "var(--space-2) var(--space-4)",
        backgroundColor: "var(--color-primary)",
        color: "var(--color-surface)",
        textDecoration: "none",
        fontFamily: "var(--font-family)",
        fontSize: "var(--font-size-body-sm)",
        fontWeight: "var(--font-weight-semibold)",
        zIndex: 9999,
        borderRadius: "var(--radius-sm)",
        transition: "top 0.1s",
      }}
      onFocus={(e) => {
        e.currentTarget.style.top = "var(--space-2)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = "-40px";
      }}
    >
      Skip to main content
    </a>
  );
}
