/**
 * /book — GEO strategy call booking page.
 *
 * Behaviour:
 *   - If NEXT_PUBLIC_CALENDLY_URL is set:
 *       Renders an inline Calendly embed using the Calendly inline-widget
 *       approach. The Calendly widget script is loaded lazily via a
 *       <CalendlyInlineWidget> client component that appends the script
 *       only when the component mounts (post-hydration). This avoids
 *       blocking the initial page load and keeps the core page content
 *       server-rendered (accessible without JS).
 *   - If NEXT_PUBLIC_CALENDLY_URL is unset:
 *       Renders a graceful fallback message explaining the booking page
 *       is not yet configured, with a link to /test (the free audit CTA).
 *
 * JSON-LD: Event-like WebPage + BreadcrumbList.
 *
 * Accessibility:
 *   - <main> landmark via layout.tsx
 *   - The Calendly widget div is role="main" inside its own iframe — the outer
 *     container is a plain div with an aria-label for screen readers.
 *   - Reduced-motion: no animations in our code. Calendly is third-party.
 *   - Focus management: tab order is natural; the iframe is focusable.
 *
 * Privacy note: Calendly sets cookies. The embed is opt-in by visiting this
 * page — acceptable per GDPR soft-opt-in for functionality. The existing
 * CookieConsent.tsx already covers third-party embeds in the policy.
 *
 * Design system: all values from tokens.css.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CalendlyEmbedSection } from "./CalendlyEmbedSection";
import { SoftCTA } from "../../../components/marketing/SoftCTA";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";

export const metadata: Metadata = {
  title: "Book a GEO Strategy Call — Ozvor",
  description:
    "Book a 20-minute GEO strategy call with the Ozvor team. We'll review your AI search visibility gaps and walk you through a personalised action plan.",
  alternates: {
    canonical: "https://ozvor.com/book",
  },
  openGraph: {
    title: "Book a GEO Strategy Call — Ozvor",
    description:
      "20 minutes to understand your AI search visibility and get a personalised GEO action plan.",
    url: "https://ozvor.com/book",
    siteName: "Ozvor",
    type: "website",
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const bookPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Book a GEO Strategy Call — Ozvor",
  description:
    "Book a 20-minute GEO strategy call with the Ozvor team.",
  url: "https://ozvor.com/book",
  isPartOf: {
    "@type": "WebSite",
    name: "Ozvor",
    url: "https://ozvor.com",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://ozvor.com" },
      { "@type": "ListItem", position: 2, name: "Book a call", item: "https://ozvor.com/book" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Value bullets
// ---------------------------------------------------------------------------

const VALUE_POINTS = [
  "We review your brand's current AI search visibility — what AI says about you today.",
  "We identify the highest-impact GEO gaps specific to your category and location.",
  "You leave with a prioritised action plan you can start executing immediately.",
  "No pitch. If Ozvor is a good fit, we'll tell you — if not, we'll say so too.",
];

// ---------------------------------------------------------------------------
// Page component (server)
// ---------------------------------------------------------------------------

export default function BookPage() {
  const hasCalendly = Boolean(CALENDLY_URL);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(bookPageJsonLd) }}
      />

      {/* ── Hero section ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="book-hero-heading"
        className="mk-hero-bg"
        style={{
          padding: "var(--space-20) var(--space-4) var(--space-12)",
        }}
      >
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          {/* Badge */}
          <div
            className="mk-badge"
            style={{ marginBottom: "var(--space-5)", display: "inline-flex" }}
          >
            Free 20-minute call &middot; No pitch
          </div>

          <h1
            id="book-hero-heading"
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              margin: "0 0 var(--space-5) 0",
              textWrap: "balance",
            }}
          >
            Book a 20-minute{" "}
            <span style={{ color: "var(--color-primary)" }}>
              GEO strategy call
            </span>
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
              lineHeight: 1.75,
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              margin: "0 0 var(--space-8) 0",
              maxWidth: "58ch",
            }}
          >
            In 20 minutes we&rsquo;ll walk through your brand&rsquo;s AI
            search visibility, identify the gaps costing you citations, and
            map out the three actions with the biggest impact on your
            Ozvor AI Visibility Score.
          </p>

          {/* Value bullets */}
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 var(--space-8) 0",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {VALUE_POINTS.map((point) => (
              <li
                key={point}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-3)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  lineHeight: 1.65,
                }}
              >
                <CheckIcon />
                {point}
              </li>
            ))}
          </ul>

          {/* Pre-call tip */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: "4px solid var(--color-primary)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              <strong>Before the call:</strong> run your{" "}
              <Link
                href="/test"
                style={{
                  color: "var(--color-primary)",
                  textDecoration: "underline",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              >
                free Ozvor AI Visibility Audit
              </Link>{" "}
              — it takes 60 seconds and gives us something concrete to discuss
              on the call.
            </p>
          </div>
        </div>
      </section>

      {/* ── Calendly embed or fallback ─────────────────────────────── */}
      {hasCalendly ? (
        <CalendlyEmbedSection calendlyUrl={CALENDLY_URL} />
      ) : (
        <FallbackSection />
      )}

      {/* Soft CTA nudge — for visitors not yet ready to book */}
      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-8) var(--space-4) var(--space-12)" }}>
        <SoftCTA
          headline="Not ready to book? Start smaller."
          subline="Run the free AI Visibility Test first — takes 60 seconds and shows your exact gap."
          primary={{ label: "Run the free test", href: "/test" }}
          secondary={{ label: "Or get the $29 Get-Cited Kit", href: "/kit" }}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fallback — shown when NEXT_PUBLIC_CALENDLY_URL is not set
// ---------------------------------------------------------------------------

function FallbackSection() {
  return (
    <section
      aria-labelledby="book-fallback-heading"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        borderTop: "1px solid var(--color-border)",
        padding: "var(--space-20) var(--space-4)",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <h2
          id="book-fallback-heading"
          style={{
            fontSize: "var(--font-size-h2)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-4)",
          }}
        >
          Booking coming soon
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            lineHeight: "var(--line-height-body)",
            marginBottom: "var(--space-6)",
          }}
        >
          The booking calendar is not yet configured. In the meantime, run your
          free Ozvor AI Visibility Audit to get your AI search visibility score
          instantly.
        </p>
        <Link
          href="/test"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "var(--min-button-height)",
            padding: "0 var(--space-6)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-bold)",
            fontFamily: "var(--font-family)",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Run your free AI Visibility Test
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CheckIcon — decorative
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: "2px" }}
    >
      <circle cx="12" cy="12" r="10" fill="var(--color-success)" opacity="0.15" />
      <polyline
        points="8 12 11 15 16 9"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
