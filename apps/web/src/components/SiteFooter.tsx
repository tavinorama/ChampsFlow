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
  .mk-social-link { color: var(--color-muted); display: inline-flex; transition: color 0.15s; }
  .mk-social-link:hover { color: var(--color-text); }
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
            {/* Brand slogan — founder-approved (2026-07-11); the ONE deliberate
                "trust" wording exception to the visibility-frame cleanup. */}
            <p
              style={{
                margin: "0.9rem 0 0",
                fontSize: "1.1875rem",
                fontWeight: 800,
                letterSpacing: "-0.015em",
                lineHeight: 1.3,
                color: "var(--color-text)",
              }}
            >
              Know if AI trusts your brand.{" "}
              <span style={{ color: "var(--color-primary)" }}>Then fix it.</span>
            </p>
            <p
              style={{
                margin: "0.7rem 0 0",
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.55,
                color: "var(--color-muted)",
              }}
            >
              Ozvor checks how AI answers see your brand. You see why rivals
              win instead of you. Want a team to do it with you? That&rsquo;s{" "}
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
            <p
              style={{
                margin: "0.6rem 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--color-muted)",
              }}
            >
              We check: ChatGPT &middot; Claude &middot; Perplexity &middot; Gemini &middot; Google AI Overviews
            </p>
            <div
              style={{
                margin: "0.9rem 0 0",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <ClaudeMark size={16} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                }}
              >
                part of Claude for Startups!
              </span>
            </div>

            {/* Follow — social profiles */}
            <div style={{ margin: "1.2rem 0 0", display: "flex", alignItems: "center", gap: "0.85rem" }}>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={`Ozvor on ${s.label}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mk-social-link"
                >
                  <SocialIcon path={s.path} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
            <FooterCol
              title="Learn"
              links={[
                ["How it works", "/how-it-works"],
                ["Compare", "/compare"],
                ["Research", "/research"],
                ["FAQ", "/faq"],
                ["Blog", "/blog"],
              ]}
            />
            <FooterCol
              title="Product"
              links={[
                ["Free test", "/test"],
                ["Pricing", "/pricing"],
                ["Ozvor Pages", "/local-pages"],
                ["OrganicPosts", "/organicposts"],
                ["Support", "/support"],
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
                <FooterLink href="/refund">Refund Policy</FooterLink>
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
            &copy; {currentYear} Ozvor. All audit data comes from real queries on real engines.
          </p>
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            Serving SMBs in Brazil, the EU &amp; the United States.
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * ClaudeMark — small inline Claude sunburst mark (clay), for the
 * "part of Claude for Startups!" footer badge. Inlined (no external asset) so it
 * respects the site CSP and never 404s. Approximation of the Claude mark; swap
 * for the official SVG if/when the program provides a brand asset.
 */
function ClaudeMark({ size = 16 }: { size?: number }) {
  const c = size / 2;
  const inner = size * 0.13;
  const outer = size * 0.46;
  const rays = Array.from({ length: 11 }, (_, i) => {
    const rad = ((i * 360) / 11 - 90) * (Math.PI / 180);
    return (
      <line
        key={i}
        x1={c + inner * Math.cos(rad)}
        y1={c + inner * Math.sin(rad)}
        x2={c + outer * Math.cos(rad)}
        y2={c + outer * Math.sin(rad)}
        stroke="#D97757"
        strokeWidth={size * 0.11}
        strokeLinecap="round"
      />
    );
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Claude"
      style={{ flexShrink: 0, display: "block" }}
    >
      {rays}
    </svg>
  );
}

/**
 * Ozvor social profiles shown in the footer "Follow" row. Icons are inline
 * single-path brand glyphs (currentColor) — no external asset, CSP-safe. Links
 * open the real claimed profiles.
 */
const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/ozvor1/",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
  },
  {
    label: "X",
    href: "https://x.com/Ozvor1",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/ozvor1/",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@ozvor1",
    path: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    label: "Reddit",
    href: "https://www.reddit.com/user/Ozvor1/",
    path: "M24 11.779c0-1.459-1.192-2.645-2.657-2.645-.715 0-1.363.286-1.84.746-1.81-1.191-4.259-1.949-6.971-2.046l1.483-4.669 4.016.941-.006.058c0 1.193.975 2.163 2.174 2.163 1.198 0 2.172-.97 2.172-2.163s-.975-2.164-2.172-2.164c-.92 0-1.704.574-2.021 1.379l-4.329-1.015a.379.379 0 00-.44.279l-1.658 5.208c-2.759.087-5.25.842-7.087 2.04A2.643 2.643 0 002.657 9.134C1.192 9.134 0 10.32 0 11.779c0 1.058.629 1.964 1.531 2.383-.041.253-.063.51-.063.771 0 3.909 4.55 7.087 10.145 7.087 5.591 0 10.145-3.178 10.145-7.087 0-.26-.022-.517-.063-.77.905-.418 1.535-1.325 1.535-2.384zM6.594 13.883c0-.834.678-1.512 1.512-1.512.833 0 1.511.678 1.511 1.512 0 .833-.678 1.511-1.511 1.511-.834 0-1.512-.678-1.512-1.511zm8.144 4.353c-.774.774-2.242.83-2.672.83-.429 0-1.897-.056-2.671-.83a.286.286 0 010-.406.287.287 0 01.407 0c.489.49 1.535.663 2.264.663.73 0 1.776-.173 2.265-.663a.287.287 0 01.407 0 .288.288 0 010 .406zm-.31-2.842c-.833 0-1.511-.678-1.511-1.511 0-.834.678-1.512 1.511-1.512.834 0 1.512.678 1.512 1.512 0 .833-.678 1.511-1.512 1.511z",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@ozvor1",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
];

function SocialIcon({ path }: { path: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <path d={path} />
    </svg>
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
