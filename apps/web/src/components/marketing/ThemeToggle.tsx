"use client";

/**
 * ThemeToggle — light/dark switcher for marketing pages.
 *
 * Dark-first strategy (v2):
 *  - Dark is the DEFAULT — no data-theme attribute on <html>.
 *  - Light is explicit opt-in: sets data-theme="light".
 *  - On mount: resolve stored preference; dark = remove attribute, light = set attribute.
 *  - On click: flip between the two states.
 *  - SSR renders the moon icon (dark default) — no hydration flash.
 */

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "op-theme";

function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light") return "light";
  } catch {
    /* localStorage blocked */
  }
  // Dark is default — no OS preference check needed
  return "dark";
}

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean } = {}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // On mount: resolve stored preference and sync DOM + state.
  useEffect(() => {
    const t = resolveTheme();
    setTheme(t);
    setMounted(true);
    applyTheme(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  // When not mounted (SSR), show moon because dark is the default.
  const isDark = !mounted || theme === "dark";
  const actionLabel = isDark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className="mk-theme-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={actionLabel}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        // Labeled variant (app top bar): pill with text so it's unmistakable.
        // Icon-only variant (marketing nav): square 40×40.
        width: showLabel ? "auto" : "40px",
        height: "40px",
        minHeight: "var(--min-tap-target, 44px)",
        padding: showLabel ? "0 var(--space-3)" : 0,
        gap: showLabel ? "var(--space-2)" : 0,
        cursor: "pointer",
        // Higher-contrast text color so it stands out on dark app surfaces.
        color: showLabel ? "var(--color-text)" : "var(--color-muted)",
        fontFamily: "var(--font-family)",
        fontSize: "var(--font-size-body-sm)",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
        flexShrink: 0,
      }}
    >
      <span suppressHydrationWarning style={{ display: "inline-flex" }}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      {showLabel && <span suppressHydrationWarning>{actionLabel}</span>}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
