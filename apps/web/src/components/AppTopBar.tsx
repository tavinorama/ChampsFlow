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
import { useState } from "react";
import { ThemeToggle } from "./marketing/ThemeToggle";
import { getSupabase } from "../lib/supabase-browser";

export function AppTopBar() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await getSupabase().auth.signOut();
    } catch {
      /* even if the network call fails, send them to the public site */
    }
    // Full reload to clear any client state + land on the marketing home.
    window.location.href = "/";
  }

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
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Log out of your account"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            minHeight: "var(--min-tap-target, 44px)",
            padding: "0 var(--space-3)",
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: loggingOut ? "default" : "pointer",
            color: "var(--color-text)",
            fontWeight: 600,
            fontSize: "var(--font-size-body-sm)",
            fontFamily: "var(--font-family)",
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
        <ThemeToggle showLabel />
      </div>
    </div>
  );
}
