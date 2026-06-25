"use client";

/**
 * Footer — site-wide footer for TrustIndex AI
 *
 * v2: Added CookieConsentTrigger link ("Cookie preferences") alongside the
 * existing legal links so authenticated-app users can re-open the consent
 * panel at any time.
 *
 * CI-2 requirement: "Do Not Sell or Share My Personal Information" link
 * must appear in the footer of ALL pages (authenticated + public).
 *
 * Placement spec (docs/04-ux.md §6 CI-2):
 *   - Present on all authenticated pages AND the public privacy policy page
 *   - Text: "Do Not Sell or Share My Personal Information"
 *   - Same 14px size and visual weight as other footer links
 *   - Equal prominence — NOT hidden, NOT light gray on white
 *
 * UX §8 Dark Patterns Check:
 *   - "Hidden opt-out" — PASS: link has identical font size and color as all
 *     other footer links; no reduced opacity, no smaller font
 *
 * Accessibility (WCAG 2.2 AA):
 *   - <footer> landmark
 *   - All links keyboard-focusable with visible :focus-visible outline
 *   - External links announce target with aria-label suffix
 *
 * Routing:
 *   - "Do Not Sell" links to /legal/do-not-sell (public form, no auth needed)
 *     OR /account/data-privacy/do-not-sell (if user is authenticated — handled
 *     at the page level; this component links to public route for simplicity)
 *   - Both forms accept submissions without login (CCPA requirement)
 */

import Link from "next/link";
import { CookieConsentTrigger } from "./CookieConsent";

// ---------------------------------------------------------------------------
// Footer link styles — all links must share identical visual weight
// Spec: 14px, var(--color-text) or a single consistent muted color.
// Using var(--color-muted) (#6b7280 on white = 4.6:1 — passes WCAG AA).
// ---------------------------------------------------------------------------

const FOOTER_LINK_STYLE: React.CSSProperties = {
  color: "var(--color-muted)",
  textDecoration: "none",
  fontSize: "var(--font-size-body-sm)",  // 14px
  fontFamily: "var(--font-family)",
  lineHeight: "var(--line-height-body)",
  outline: "none",
  borderRadius: "var(--radius-sm)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      aria-label="Site footer"
      style={{
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        padding: "var(--space-6) var(--space-4)",
        // Ensure footer does not overlap BottomNav on mobile (BottomNav is 56px)
        // On pages WITH BottomNav, page content already has paddingBottom: 80px;
        // footer sits above the nav in document flow when not position:fixed.
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Primary compliance link — equal visual weight to all other links */}
        <nav
          aria-label="Privacy rights"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            alignItems: "center",
          }}
        >
          {/*
           * CCPA/CPRA required link — Cal. Civ. Code § 1798.135(a)
           * Must be present on all pages. Same 14px weight as all other links.
           * Links to the public (no-auth-required) form.
           */}
          <FooterLink href="/legal/do-not-sell">
            Do Not Sell or Share My Personal Information
          </FooterLink>

          <FooterLink href="/legal/california-privacy">
            Your California Privacy Rights
          </FooterLink>

          {/* Re-opens the CookieConsent panel — dispatches ti:open-cookie-prefs */}
          <CookieConsentTrigger
            style={{
              ...FOOTER_LINK_STYLE,
              // Override <button> resets to match FooterLink appearance
              display: "inline",
              outline: "none",
              borderRadius: "var(--radius-sm)",
            }}
          >
            Cookie preferences
          </CookieConsentTrigger>
        </nav>

        {/* Secondary legal links */}
        <nav
          aria-label="Legal and policy links"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            alignItems: "center",
          }}
        >
          <FooterLink href="/privacy-policy">Privacy Policy</FooterLink>
          <FooterLink href="/terms-of-service">Terms of Service</FooterLink>
          <FooterLink href="/legal/dpa" external>
            Data Processing Agreement
          </FooterLink>
        </nav>

        {/* Copyright */}
        <p
          style={{
            ...FOOTER_LINK_STYLE,
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          &copy; {currentYear} TrustIndex AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// FooterLink helper — all links share the same visual treatment
// ---------------------------------------------------------------------------

function FooterLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const externalProps = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Link
      href={href}
      {...externalProps}
      aria-label={
        external
          ? `${typeof children === "string" ? children : ""} (opens in new tab)`
          : undefined
      }
      style={FOOTER_LINK_STYLE}
      onFocus={(e) => {
        e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
        e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
      }}
    >
      {children}
      {external && (
        <span aria-hidden="true" style={{ marginLeft: "2px" }}>
          ↗
        </span>
      )}
    </Link>
  );
}
