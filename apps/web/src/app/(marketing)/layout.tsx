/**
 * Marketing layout — TrustIndex AI
 *
 * v5 changes:
 *  - ThemeToggle added to navbar (manual light/dark switch)
 *  - MARKETING_STYLES extended to cover html[data-theme="dark"] in addition
 *    to @media (prefers-color-scheme: dark) — so both OS and manual toggle
 *    activate all dark-mode CSS classes correctly.
 *  - mk-hero-bg / mk-cta-bg use flat, on-brand warm radial tints in BOTH light
 *    and dark mode (no photo backgrounds). The earlier dark-only Unsplash photo
 *    was removed for visual consistency + to avoid an external request.
 *  - mk-navbar dark mode covers [data-theme="dark"] explicitly.
 *  - mk-price-pill dark mode shadow covered.
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
import { Inter } from "next/font/google";
import "../../styles/tokens.css";
import { SkipToMainContent } from "../../components/marketing/SkipToMainContent";
import { ThemeToggle } from "../../components/marketing/ThemeToggle";
import { Logo } from "../../components/brand/Logo";
import { orgJsonLd, websiteJsonLd } from "../../lib/structured-data";
import { CookieConsentTrigger } from "../../components/CookieConsent";
import { ChatWidget } from "../../components/ChatWidget";

// ---------------------------------------------------------------------------
// Font — Plus Jakarta Sans (self-hosted at build time, GDPR friendly)
// ---------------------------------------------------------------------------

const jakarta = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

// ---------------------------------------------------------------------------
// Marketing CSS classes
// Rules that need hover, pseudo-selectors, media queries, or data-theme
// selectors must live here — they cannot be expressed as inline styles.
//
// Dark mode pattern:
//   @media (prefers-color-scheme: dark) { html:not([data-theme]) .cls {} }
//   html[data-theme="dark"] .cls {}
// Both rules carry the same declarations so ThemeToggle only sets data-theme.
// ---------------------------------------------------------------------------

// Dark hero/CTA: flat warm-green-charcoal surfaces with subtle on-brand radial
// tints — consistent with the light mode (both flat, no photos). The previous
// external Unsplash "Earth from space" photo was removed (off-brand stock look +
// external request); both modes now share the same flat, warm treatment.
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
  /* ── Font override ───────────────────────────────────────────────── */
  .mk-root {
    --font-family: var(--font-jakarta, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

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
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .mk-hero-bg {
      ${DARK_HERO_BG}
    }
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
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .mk-cta-bg {
      ${DARK_CTA_BG}
    }
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
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .mk-price-pill {
      box-shadow: 0 2px 12px rgba(52,211,153,0.15);
    }
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
    background: rgba(255,255,255,0.88);
    border-bottom: 1px solid var(--color-border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .mk-navbar {
      background: rgba(15,23,42,0.88);
    }
  }
  html[data-theme="dark"] .mk-navbar {
    background: rgba(15,23,42,0.88);
  }

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
    font-size: 0.75rem;
    color: var(--color-muted);
    text-decoration: none;
    font-family: var(--font-family);
    transition: color 0.15s;
  }
  .mk-footer-link:hover { color: var(--color-text); }

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
    font-size: 0.8125rem;
    font-weight: 700;
    font-family: var(--font-family);
    color: var(--color-primary);
    text-decoration: none;
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-pill);
    padding: 0.375rem 0.875rem;
    white-space: nowrap;
    min-height: var(--min-tap-target);
    transition: background 0.15s, color 0.15s;
  }
  .mk-nav-free:hover {
    background: var(--color-primary);
    color: #fff;
  }

  /* Kit pill — filled/amber accent to signal "paid, entry" */
  .mk-nav-kit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8125rem;
    font-weight: 700;
    font-family: var(--font-family);
    color: #fff;
    text-decoration: none;
    background: var(--color-accent-amber);
    border: 1.5px solid transparent;
    border-radius: var(--radius-pill);
    padding: 0.375rem 0.875rem;
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
    .mk-nav-free { padding: 0.375rem 0.625rem; font-size: 0.75rem; }
    .mk-nav-kit  { padding: 0.375rem 0.625rem; font-size: 0.75rem; }
    .mk-signin   { padding: 0.375rem 0.75rem;  font-size: 0.75rem; }
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
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .mk-sticky-bar { background: #0E1A14; }
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
    <div className={`${jakarta.variable} mk-root`}>
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
        {/* Logo */}
        <Link
          href="/"
          aria-label="TrustIndex AI — home"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          <Logo markSize={28} wordSize="1.0625rem" />
        </Link>

        {/* Right: sales value-ladder CTAs + secondary links + sign in
              Order (left → right): secondary links (hidden sm) | Free | Kit | Pricing | ThemeToggle | Sign in
              On mobile ≤480px: only Free + Kit + ThemeToggle + Sign in are visible. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          {/* ── Secondary nav links (hidden on ≤700px) ────────────────── */}
          <Link
            href="/blog"
            className="mk-navlink mk-navlink-hide-sm"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            Blog
          </Link>
          <Link
            href="/how-it-works"
            className="mk-navlink mk-navlink-hide-sm"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            How it works
          </Link>
          <Link
            href="/results"
            className="mk-navlink mk-navlink-hide-sm"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            Results
          </Link>
          <Link
            href="/organicposts"
            className="mk-navlink mk-navlink-hide-sm"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            OrganicPosts
          </Link>

          {/* ── Sales ladder: Free → Kit → Pricing ────────────────────── */}
          {/* 1. Free AI Test — always visible (entry offer, no cost) */}
          <Link
            href="/test"
            className="mk-nav-free"
            aria-label="Try the free AI visibility test"
          >
            Free
          </Link>

          {/* 2. Kit $29 — always visible (first paid, low-friction) */}
          <Link
            href="/kit"
            className="mk-nav-kit"
            aria-label="Get the GEO Starter Kit for $29"
          >
            Kit $29
          </Link>

          {/* 3. Plans / Pricing — hidden on ≤700px (StickyBuyBar carries Growth on mobile) */}
          <Link
            href="/pricing"
            className="mk-navlink mk-navlink-hide-sm"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            Plans
          </Link>

          {/* ── Utility: theme toggle + sign in ───────────────────────── */}
          <ThemeToggle />
          <Link href="/login" className="mk-signin" aria-label="Sign in to your account">
            Sign in
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
      style={{
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        padding: "var(--space-10) var(--space-4)",
        marginTop: "var(--space-16)",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {/* Legal links */}
        <nav
          aria-label="Legal links"
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}
        >
          <FooterLink href="/terms-of-service">Terms of Service</FooterLink>
          <FooterLink href="/privacy-policy">Privacy Policy</FooterLink>
          <FooterLink href="/legal/cookies">Cookie Policy</FooterLink>
          <FooterLink href="/legal/sub-processors">Sub-processors</FooterLink>
          <FooterLink href="/legal/dsr-request">DSR Request</FooterLink>
          <FooterLink href="/legal/do-not-sell">
            Do Not Sell or Share My Personal Information
          </FooterLink>
          {/* Cookie preferences re-opens the consent panel (client-side event) */}
          <CookieConsentTrigger className="mk-footer-link">
            Cookie preferences
          </CookieConsentTrigger>
          <FooterLink href="mailto:hello@trustindexai.com">
            hello@trustindexai.com
          </FooterLink>
        </nav>

        {/* Entity + social */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: "var(--line-height-caption)",
            }}
          >
            &copy; {currentYear} TrustIndex&nbsp;AI &mdash; AI Search Trust
            Intelligence. Serving SMBs in Brazil, the EU, and the United States.
          </p>
          <span
            aria-label="LinkedIn — link coming soon"
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
            }}
          >
            LinkedIn
          </span>
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
