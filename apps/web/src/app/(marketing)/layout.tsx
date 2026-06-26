/**
 * Marketing layout — TrustIndex AI
 *
 * v6 changes:
 *  - Inter / Plus Jakarta Sans import removed; global Schibsted Grotesk
 *    (set via --font-family in tokens.css) now flows through unobstructed.
 *  - --font-family override block removed from MARKETING_STYLES so the dark-
 *    first global token is not clobbered.
 *  - @media (prefers-color-scheme: dark) blocks removed — the site is dark-
 *    first (dark = no data-theme attribute). The html[data-theme="dark"] rules
 *    are kept for the manual ThemeToggle; the OS-preference pattern conflicts
 *    with the no-attribute=dark contract and has been removed.
 *
 * Route group (marketing) gets its own layout WITHOUT the authenticated
 * app chrome (no BottomNav, no DpaGate, no CaliforniaBanner).
 *
 * Includes:
 *  - Skip-to-main-content link (WCAG 2.4.1 bypass blocks)
 *  - Public navbar: logo mark + name left, ThemeToggle + "Sign in" right
 *  - <main> landmark wrapping slot
 *  - Marketing footer with legal links
 */

import Link from "next/link";
import "../../styles/tokens.css";
import { SkipToMainContent } from "../../components/marketing/SkipToMainContent";
import { ThemeToggle } from "../../components/marketing/ThemeToggle";
import { LogoMark, Wordmark } from "../../components/brand/Logo";
import { orgJsonLd, websiteJsonLd } from "../../lib/structured-data";
import { CookieConsentTrigger } from "../../components/CookieConsent";
import { ChatWidget } from "../../components/ChatWidget";

// ---------------------------------------------------------------------------
// Marketing CSS classes
// Rules that need hover, pseudo-selectors, media queries, or data-theme
// selectors must live here — they cannot be expressed as inline styles.
//
// Dark mode pattern (v6 — dark-first):
//   No-attribute = dark (default). html[data-theme="dark"] covers the manual
//   toggle case. @media (prefers-color-scheme) is NOT used — removed entirely.
// ---------------------------------------------------------------------------

// Dark hero/CTA: flat warm-green-charcoal surfaces with subtle on-brand radial
// tints — consistent with the light mode (both flat, no photos).
const DARK_HERO_BG = `
  background:
    radial-gradient(ellipse at 10% 0%, rgba(52,211,153,0.10) 0%, transparent 55%),
    radial-gradient(ellipse at 90% 100%, rgba(224,152,47,0.06) 0%, transparent 55%),
    #0E1A14;
`;

const DARK_CTA_BG = `
  background:
    radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.10) 0%, transparent 60%),
    #0E1A14;
  border-top: 1px solid rgba(52,211,153,0.15);
`;

const MARKETING_STYLES = `
  /* ── Smooth anchor scrolling for in-page CTAs (#pricing, #faq-heading) ── */
  html { scroll-behavior: smooth; }

  /* ── Smooth theme transition (light ⇄ dark not jarring) ───────────── */
  .mk-root section,
  .mk-root .mk-step-card,
  .mk-root .mk-privacy-card,
  .mk-root .mk-bonus-card,
  .mk-root .mk-regular-card,
  .mk-root .mk-faq-item {
    transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .mk-root * { transition: none !important; }
  }

  /* ── Hero background ─────────────────────────────────────────────── */
  .mk-hero-bg {
    background:
      radial-gradient(ellipse at 10% 0%, rgba(10,126,90,0.08) 0%, transparent 55%),
      radial-gradient(ellipse at 90% 100%, rgba(224,152,47,0.07) 0%, transparent 55%),
      var(--color-bg, #FCFAF5);
  }
  html[data-theme="dark"] .mk-hero-bg {
    ${DARK_HERO_BG}
  }

  /* ── Stat bar ────────────────────────────────────────────────────── */
  .mk-stat-bar { background: var(--color-stat-bar); }

  /* ── Teal surface (founding/privacy) ────────────────────────────── */
  .mk-teal-surface { background: var(--color-teal-surface); }

  /* ── CTA gradient ────────────────────────────────────────────────── */
  .mk-cta-bg {
    background:
      radial-gradient(ellipse at 50% 100%, rgba(10,126,90,0.07) 0%, transparent 60%),
      var(--color-surface);
    border-top: 1px solid var(--color-border);
  }
  html[data-theme="dark"] .mk-cta-bg {
    ${DARK_CTA_BG}
  }

  /* ── Step cards (how it works) — hover lift ──────────────────────── */
  .mk-step-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    cursor: default;
  }
  .mk-step-card:hover {
    box-shadow: var(--shadow-card-hover);
    transform: translateY(-3px);
  }

  /* ── Privacy card — hover glow ───────────────────────────────────── */
  .mk-privacy-card {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    transition: box-shadow 0.2s ease;
  }
  .mk-privacy-card:hover {
    box-shadow: var(--shadow-card-hover);
  }

  /* ── Callout box (GEO research note) ────────────────────────────── */
  .mk-callout {
    background: var(--color-badge-ai-bg);
    border: 1px solid var(--color-highlight-border);
    border-left: 4px solid var(--color-primary);
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
  }

  /* ── Table header (dark) ─────────────────────────────────────────── */
  .mk-table-header { background: var(--color-stat-bar); }

  /* ── Bonus cards (founding section) ─────────────────────────────── */
  .mk-bonus-card {
    background: var(--color-surface);
    border: 1px solid var(--color-teal-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .mk-bonus-card:hover {
    box-shadow: var(--shadow-card-hover);
    transform: translateY(-2px);
  }

  /* ── Price pill (founding section) ──────────────────────────────── */
  .mk-price-pill {
    background: var(--color-surface);
    border: 2px solid var(--color-success);
    border-radius: var(--radius-lg);
    box-shadow: 0 2px 12px rgba(22,163,74,0.12);
  }
  html[data-theme="dark"] .mk-price-pill {
    box-shadow: 0 2px 12px rgba(52,211,153,0.15);
  }

  /* ── FAQ items ────────────────────────────────────────────────────── */
  .mk-faq-item {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .mk-faq-item[open] {
    border-color: var(--color-primary);
  }
  .mk-faq-item summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    transition: background 0.15s;
  }
  .mk-faq-item summary:hover {
    background: var(--color-surface-muted);
  }
  .mk-faq-item summary::-webkit-details-marker { display: none; }

  /* ── Pricing featured card ────────────────────────────────────────── */
  .mk-featured-card {
    background: var(--color-pricing-dark);
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-blue);
  }

  /* ── Pricing regular card ─────────────────────────────────────────── */
  .mk-regular-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  /* ── Navbar ───────────────────────────────────────────────────────── */
  .mk-navbar {
    background: rgba(11,17,15,0.72);
    border-bottom: 1px solid var(--color-border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  html[data-theme="light"] .mk-navbar {
    background: rgba(243,241,232,0.80);
  }

  /* ── Center nav ghost links ─────────────────────────────────────── */
  .mk-navlink:hover { color: var(--color-text) !important; }

  /* ── Primary CTA — emerald gradient, dark text, soft glow ───────── */
  .mk-cta-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family);
    font-size: 0.875rem;
    font-weight: 700;
    color: #06140e;
    text-decoration: none;
    background: linear-gradient(135deg, #27c98a, #0c7d54);
    border: none;
    border-radius: var(--radius-md);
    padding: 0.5rem 1.1rem;
    min-height: var(--min-tap-target);
    white-space: nowrap;
    box-shadow: 0 10px 32px rgba(39,201,138,0.32);
    transition: filter 0.15s, transform 0.15s;
  }
  .mk-cta-primary:hover { filter: brightness(1.06); transform: translateY(-1px); }

  /* ── Toggle button hover ──────────────────────────────────────────── */
  .mk-theme-toggle:hover {
    color: var(--color-text) !important;
    border-color: var(--color-text) !important;
  }

  /* ── Sign-in link hover ───────────────────────────────────────────── */
  .mk-signin {
    font-size: 0.875rem;
    font-weight: 600;
    font-family: var(--font-family);
    color: var(--color-primary);
    text-decoration: none;
    padding: 0.5rem 1.25rem;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-primary);
    min-height: var(--min-tap-target);
    display: inline-flex;
    align-items: center;
    transition: background 0.15s, color 0.15s;
  }
  .mk-signin:hover {
    background: var(--color-primary);
    color: #fff;
  }

  /* ── Badge pill ──────────────────────────────────────────────────── */
  .mk-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background: var(--color-badge-ai-bg);
    border: 1px solid var(--color-highlight-border);
    border-radius: var(--radius-pill);
    padding: 0.25rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-badge-ai-text);
    font-family: var(--font-family);
    letter-spacing: 0.02em;
  }

  /* ── Footer link hover ────────────────────────────────────────────── */
  .mk-footer-link {
    font-size: 0.8125rem;
    color: var(--color-muted);
    text-decoration: none;
    font-family: var(--font-family);
    transition: color 0.15s;
    /* reset so a <button> (Cookie preferences) matches the <a> links exactly */
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

  /* ── Footer — the one grounded (solid) element ──────────────────── */
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

  /* ── Responsive comparison table ─────────────────────────────────── */
  @media (max-width: 640px) {
    .mk-comparison-table { display: none; }
    .mk-comparison-cards { display: flex !important; }
  }

  /* ── Navbar entry-offer pills (Free + Kit) ───────────────────────── */
  /* Free pill — ghost/outlined style to signal "no cost" */
  .mk-nav-free {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 600;
    font-family: var(--font-family);
    color: var(--color-primary);
    text-decoration: none;
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-md);
    padding: 0.5rem 1rem;
    line-height: 1;
    white-space: nowrap;
    min-height: var(--min-tap-target);
    transition: background 0.15s, color 0.15s;
  }
  .mk-nav-free:hover {
    background: var(--color-primary);
    color: #fff;
  }

  /* Kit button — filled/amber accent to signal "paid, entry offer" */
  .mk-nav-kit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 700;
    font-family: var(--font-family);
    color: #fff;
    text-decoration: none;
    background: var(--color-accent-amber);
    border: 1.5px solid transparent;
    border-radius: var(--radius-md);
    padding: 0.5rem 1rem;
    line-height: 1;
    white-space: nowrap;
    min-height: var(--min-tap-target);
    transition: background 0.15s, opacity 0.15s;
  }
  .mk-nav-kit:hover { opacity: 0.88; }

  /* ── Responsive navbar: hide secondary links on small screens, keep the
        Free + Kit CTAs + theme toggle + Sign in. Prevents wrapping/overflow. */
  .mk-navlink, .mk-signin { white-space: nowrap; }
  @media (max-width: 700px) {
    .mk-navlink-hide-sm { display: none !important; }
  }
  /* On very small phones (≤480px): show only Free + Kit pills + ThemeToggle +
     Sign-in. All labels are already short ("Free" / "Kit $29"); tighten padding
     on Sign-in so nothing clips. StickyBuyBar carries Growth CTA on mobile. */
  @media (max-width: 480px) {
    .mk-nav-free { padding: 0.4375rem 0.75rem; font-size: 0.8125rem; }
    .mk-nav-kit  { padding: 0.4375rem 0.75rem; font-size: 0.8125rem; }
    .mk-signin   { padding: 0.4375rem 0.75rem; font-size: 0.8125rem; }
    /* On phones the brand wordmark is the space hog. Show the logo MARK only so
       Free + Kit $29 + theme toggle + Sign in all fit without clipping. The full
       "TrustIndex AI" wordmark returns on wider screens. */
    .mk-logo-word { display: none !important; }
  }

  /* ── Smooth focus outlines ────────────────────────────────────────── */
  .mk-root :focus-visible {
    outline: var(--focus-outline-width) solid var(--color-focus-outline);
    outline-offset: var(--focus-outline-offset);
  }

  /* ── Sticky buy bar — mobile only ──────────────────────────────────── */
  .mk-sticky-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 200;
    background: var(--color-surface);
    border-top: 1.5px solid var(--color-primary);
    padding: 0.75rem var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    box-shadow: 0 -4px 16px rgba(10,126,90,0.10);
  }
  @media (min-width: 769px) {
    .mk-sticky-bar { display: none !important; }
  }
  html[data-theme="dark"] .mk-sticky-bar { background: #0E1A14; }
`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mk-root">
      {/* Sitewide structured data — Organization + WebSite (injected once in this
          layout so every public marketing page inherits them automatically) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      <style dangerouslySetInnerHTML={{ __html: MARKETING_STYLES }} />

      {/* WCAG 2.4.1 — Skip to main content */}
      <SkipToMainContent />

      {/* Public navbar */}
      <PublicNavbar />

      {/* Page content */}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      {/* Marketing footer */}
      <MarketingFooter />

      {/* Floating chat widget — overlay, does not affect layout flow */}
      <ChatWidget />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public Navbar — logo + ThemeToggle + sign-in
// ---------------------------------------------------------------------------

function PublicNavbar() {
  return (
    <header role="banner" className="mk-navbar">
      <nav
        aria-label="Main navigation"
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "0 var(--space-4)",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        {/* Logo — monochrome (color:var(--color-text) so the O-ring mark inherits
            ink/near-white, never the default link blue) */}
        <Link
          href="/"
          aria-label="Ozvor — home"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
            color: "var(--color-text)",
          }}
        >
          <LogoMark size={28} />
          <Wordmark size="1.0625rem" />
        </Link>

        {/* Center nav (mockup): How it works · Results · OrganicPosts · Kit $29 · Plans */}
        <div
          className="mk-navlinks"
          style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}
        >
          {([
            ["How it works", "/how-it-works"],
            ["Results", "/results"],
            ["OrganicPosts", "/organicposts"],
            ["Tutorials", "/learn"],
            ["Blog", "/blog"],
            ["Kit $29", "/kit"],
            ["Plans", "/pricing"],
          ] as const).map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="mk-navlink mk-navlink-hide-sm"
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--color-muted)",
                textDecoration: "none",
                fontFamily: "var(--font-family)",
                padding: "0.4rem 0.55rem",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right: theme toggle + Sign in (ghost) + Free AI test (emerald gradient) */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
          <ThemeToggle />
          <Link
            href="/login"
            className="mk-signin mk-navlink-hide-sm"
            aria-label="Sign in to your account"
          >
            Sign in
          </Link>
          <Link
            href="/test"
            className="mk-cta-primary"
            aria-label="Run the free AI visibility test"
          >
            Free AI test
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Marketing footer
// ---------------------------------------------------------------------------

function MarketingFooter() {
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
          <div style={{ maxWidth: "300px" }}>
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
              Ozvor is the home of{" "}
              <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>TrustIndex AI</strong>{" "}
              &mdash; the method that combines AI, Brand &amp; Performance to earn your place in AI
              answers &mdash; and{" "}
              <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>OrganicPosts</strong>.
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
          </div>

          {/* Link columns */}
          <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
            <FooterCol
              title="Product"
              links={[
                ["How it works", "/how-it-works"],
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

// ---------------------------------------------------------------------------
// FooterLink helper
// ---------------------------------------------------------------------------

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
