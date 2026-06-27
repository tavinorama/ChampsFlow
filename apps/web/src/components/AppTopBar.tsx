"use client";

/**
 * AppTopBar — shared chrome for every authenticated app page.
 *
 * Rendered once in the authenticated branch of the root layout, so EVERY
 * dashboard/account/brand page gets a consistent top bar with:
 *  - a Back button (history back) — the user asked for a back control on all pages
 *  - the Light/Dark theme toggle — previously only on marketing pages
 *
 * In-flow (not fixed) so it never stacks with a page's own sticky header and
 * needs no content offset.
 */

import { useRouter } from "next/navigation";
import { ThemeToggle } from "./marketing/ThemeToggle";

export function AppTopBar() {
  const router = useRouter();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-4)",
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        fontFamily: "var(--font-family)",
      }}
    >
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-1)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-primary)",
          fontWeight: 600,
          fontSize: "var(--font-size-body-sm)",
          fontFamily: "var(--font-family)",
          minHeight: "var(--min-tap-target, 44px)",
        }}
      >
        <span aria-hidden="true">←</span> Back
      </button>
      <ThemeToggle />
    </div>
  );
}
