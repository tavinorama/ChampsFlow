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

export function ThemeToggle() {
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

  return (
    <button
      type="button"
      onClick={toggle}
      className="mk-theme-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        width: "40px",
        height: "40px",
        cursor: "pointer",
        color: "var(--color-muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span suppressHydrationWarning style={{ display: "inline-flex" }}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
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
