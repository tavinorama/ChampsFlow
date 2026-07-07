"use client";

/**
 * SiteFooter — the single, shared footer for EVERY page (marketing + authed app).
 *
 * Previously the rich footer lived only inside (marketing)/layout.tsx and authed
 * pages got a stripped-down legal-only footer. The founder wants the same
 * polished footer everywhere, so this component is the one source of truth used
 * by both the marketing layout and the root (authed) layout.
 *
 * CSS is embedded so the footer renders identically on authed pages, which don't
 * load the marketing layout's <style> block. Only one footer renders per page,
 * so the embedded rules never duplicate visibly.
 *
 * Legal links (Do Not Sell, California, Cookie preferences) are kept here so the
 * CCPA/CPRA footer requirement holds on every route.
 */

import Link from "next/link";
import { LogoMark, Wordmark } from "./brand/Logo";
import { CookieConsentTrigger } from "./CookieConsent";

const FOOTER_CSS = `
  .mk-footer-link {
    font-size: 0.8125rem;
    color: var(--color-muted);
    text-decoration: none;
    font-family: var(--font-family);
    transition: color 0.15s;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-align: left;
    line-height: 1.3;
    font-weight: 400;
  }
  .mk-footer-link:hover { color: var(--color-text); }
  .mk-footer { background: #080d0b; }
  html[data-theme="light"] .mk-footer { background: #e7e4d8; }
  .mk-foot-head {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--color-muted);
  }
`;

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      aria-label="Site footer"
      role="contentinfo"
      className="mk-footer"
      style={{
        borderTop: "1px solid var(--color-border)",
        padding: "var(--space-16) var(--space-4) var(--space-10)",
        marginTop: "var(--space-16)",
      }}
    >
      <style>{FOOTER_CSS}</style>
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--space-10)",
            flexWrap: "wrap",
          }}
        >
          {/* Brand column */}
          <div style={{ maxWidth: "320px" }}>
            <Link
              href="/"
              aria-label="Ozvor — home"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                textDecoration: "none",
                color: "var(--color-text)",
              }}
            >
              <LogoMark size={24} />
              <Wordmark size="1.0625rem" />
            </Link>
            <p
              style={{
                margin: "0.9rem 0 0",
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.55,
                color: "var(--color-muted)",
              }}
            >
              The AI Search Visibility platform for SMBs. Ozvor shows how AI answers see
              your brand, why rivals win, and turns the gaps into publish-ready fixes
              &mdash; backed by{" "}
              <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>OrganicPosts</strong>,
              our done-with-you GEO content service.
            </p>
            <p
              style={{
                margin: "1rem 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--color-muted)",
              }}
            >
              hello@ozvor.com
            </p>
            {/* Associated domains — Ozvor also operates these; cold-outreach
                inboxes on them redirect here. Listed so the relationship is
                public + crawlable (helps domain reputation / brand trust). */}
            <p
              style={{
                margin: "0.5rem 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                color: "var(--color-muted)",
                lineHeight: 1.6,
              }}
            >
              Ozvor also operates{" "}
              <a href="https://trustindexai.com" rel="noopener" className="mk-footer-link" style={{ fontSize: "0.6875rem" }}>trustindexai.com</a>
              {" "}&middot;{" "}
              <a href="https://organicposts.com" rel="noopener" className="mk-footer-link" style={{ fontSize: "0.6875rem" }}>organicposts.com</a>
            </p>
          </div>

          {/* Link columns */}
          <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
            <FooterCol
              title="Product"
              links={[
                ["How it works", "/how-it-works"],
                ["For agencies", "/agencies"],
                ["Compare", "/vs"],
                ["Tutorials", "/learn"],
                ["Case study", "/results"],
                ["Plans", "/pricing"],
              ]}
            />
            <FooterCol
              title="Get started"
              links={[
                ["Free AI test", "/test"],
                ["Get-Cited Kit", "/kit"],
                ["OrganicPosts", "/organicposts"],
                ["Blog", "/blog"],
              ]}
            />
            <div>
              <div className="mk-foot-head">Legal</div>
              <div
                style={{
                  marginTop: "0.9rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  alignItems: "flex-start",
                }}
              >
                <FooterLink href="/privacy-policy">Privacy Policy</FooterLink>
                <FooterLink href="/terms-of-service">Terms of Service</FooterLink>
                <FooterLink href="/legal/dpa">DPA</FooterLink>
                <FooterLink href="/legal/sub-processors">Sub-processors</FooterLink>
                <FooterLink href="/how-we-measure">How we measure</FooterLink>
                <FooterLink href="/legal/do-not-sell">Do Not Sell or Share My Info</FooterLink>
                <CookieConsentTrigger className="mk-footer-link">
                  Cookie preferences
                </CookieConsentTrigger>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            marginTop: "var(--space-10)",
            paddingTop: "var(--space-6)",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            &copy; {currentYear} Ozvor &mdash; AI Search Trust Intelligence
          </p>
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            Serving SMBs in Brazil, the EU &amp; the United States.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <div className="mk-foot-head">{title}</div>
      <div
        style={{
          marginTop: "0.9rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          alignItems: "flex-start",
        }}
      >
        {links.map(([label, href]) => (
          <FooterLink key={href} href={href}>
            {label}
          </FooterLink>
        ))}
      </div>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="mk-footer-link">
      {children}
    </Link>
  );
}
