/**
 * CaliforniaBanner — dismissable informational banner for US users
 *
 * CI-2 spec: A prominent California state banner shown to US-detected users
 * (cf-ipcountry='US' OR any US indicator). Text: "California residents have
 * additional privacy rights." Link to /legal/california-privacy.
 *
 * Behavior:
 *   - Shown to US users (country prop = 'US' or undetected → show to all
 *     to be conservative; EU users shown GDPR-specific banner instead)
 *   - Dismissable per session (sessionStorage flag) — NOT permanently dismissed
 *   - Does not re-appear after dismiss until browser session ends
 *   - EU-detected users: do not show (they have GDPR protections, different context)
 *
 * Country detection:
 *   - Parent component passes `country` prop (read from cookie/context set at login,
 *     or from cf-ipcountry if available via a server component/API)
 *   - If country is 'US' or null/undefined (unknown), show the banner
 *   - If country is in EU set, hide the banner
 *
 * Accessibility (WCAG 2.2 AA):
 *   - role="region" aria-label="Privacy rights notice"
 *   - Dismiss button: aria-label="Dismiss California privacy notice"
 *   - Banner text color: var(--color-text) on --color-surface (16:1 — AAA)
 *   - Link: var(--color-primary) on surface (4.8:1 — AA)
 *
 * UX ref: docs/04-ux.md §6 CI-2
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const SESSION_KEY = "california_banner_dismissed";

// EU country codes — do NOT show CA banner to EU users
const EU_COUNTRY_CODES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
  "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
  "NL","PL","PT","RO","SE","SI","SK",
  "NO","IS","LI","CH","GB",
]);

interface CaliforniaBannerProps {
  /**
   * Two-letter country code from IP detection (e.g. "US", "DE").
   * If null/undefined, banner is shown (fail-open for US users).
   */
  country?: string | null;
}

export function CaliforniaBanner({ country }: CaliforniaBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Do not show to EU users
    if (country && EU_COUNTRY_CODES.has(country.toUpperCase())) {
      setVisible(false);
      return;
    }

    // Check session dismissal
    try {
      const dismissed = sessionStorage.getItem(SESSION_KEY);
      if (dismissed === "1") {
        setVisible(false);
        return;
      }
    } catch {
      // sessionStorage not available (SSR, private mode) — show banner
    }

    setVisible(true);
  }, [country]);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Best-effort
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="California privacy rights notice"
      style={{
        backgroundColor: "#eff6ff",   // blue-50 — visible, accessible
        borderBottom: "1px solid #bfdbfe",  // blue-200
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-text)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          California residents have additional privacy rights.{" "}
          <Link
            href="/legal/california-privacy"
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Learn more
          </Link>
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss California privacy rights notice"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-muted)",
            fontSize: "18px",
            lineHeight: 1,
            padding: "var(--space-1)",
            minWidth: "var(--min-tap-target)",
            minHeight: "var(--min-tap-target)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            flexShrink: 0,
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
            e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = "none";
          }}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </div>
  );
}
