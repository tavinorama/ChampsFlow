/**
 * /results — "See your real TrustIndex Score"
 *
 * Landing page for WHY to run the free AI Invisibility Test.
 * Honest + confident — no hypotheticals, no invented trajectories.
 *
 * Sections:
 *  1. Hero: "See your real TrustIndex Score" + run test CTA
 *  2. How we measure success (the real metrics the product tracks)
 *  3. Prominent /test CTA card
 *  4. GEO Sprint upsell (Book call + DIY Kit)
 */

import type { Metadata } from "next";
import { GeoGraphBackdrop } from "../../../components/marketing/GeoGraphBackdrop";

export const metadata: Metadata = {
  title: "Your Real TrustIndex Score — Ozvor",
  description:
    "Run the free AI Invisibility Test and see your real TrustIndex Score — how AI engines see your brand right now.",
  alternates: { canonical: "https://ozvor.com/results" },
  openGraph: {
    title: "Your Real TrustIndex Score — Ozvor",
    description:
      "Run the free AI Invisibility Test and see your real TrustIndex Score — how AI engines see your brand right now.",
    url: "https://ozvor.com/results",
    siteName: "Ozvor",
    type: "website",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Your Real TrustIndex Score — Ozvor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Real TrustIndex Score — Ozvor",
    description:
      "Run the free AI Invisibility Test and see your real TrustIndex Score — how AI engines see your brand right now.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const resultsJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Run the free AI Invisibility Test and see your real TrustIndex Score — how AI engines see your brand right now.",
  description:
    "Run the free AI Invisibility Test and see your real TrustIndex Score — how AI engines see your brand right now.",
  url: "https://ozvor.com/results",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://ozvor.com" },
      { "@type": "ListItem", position: 2, name: "Results", item: "https://ozvor.com/results" },
    ],
  },
  isPartOf: {
    "@type": "WebSite",
    name: "Ozvor",
    url: "https://ozvor.com",
  },
};

// ---------------------------------------------------------------------------
// Data — real metrics the product tracks
// ---------------------------------------------------------------------------

const METRICS: Array<[string, string]> = [
  [
    "TrustIndex Score over time",
    "Your 0–100 score, re-measured weekly, so progress is a line — not a vibe.",
  ],
  [
    "Citation rate",
    "Of the buyer prompts we run, the share where an AI engine actually names you.",
  ],
  [
    "Competitor displacement",
    "How often a rival gets recommended on prompts where you're absent — and whether that gap closes.",
  ],
  [
    "AI Overview & answer position",
    "Whether you appear in Google's AI Overview, and how high you rank inside AI answers.",
  ],
];

// ---------------------------------------------------------------------------
// Shared style
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-xl)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResultsPage() {
  return (
    <main style={{ fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resultsJsonLd) }}
      />

      {/* 1. Hero */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "var(--space-20) var(--space-4) var(--space-12)",
        }}
        className="mk-hero-bg"
        aria-labelledby="results-hero-heading"
      >
        <GeoGraphBackdrop opacity={0.4} />
        <div
          style={{
            maxWidth: "820px",
            margin: "0 auto",
            position: "relative",
            zIndex: 1,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-primary)",
            }}
          >
            Free AI Invisibility Test
          </span>
          <h1
            id="results-hero-heading"
            style={{
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              margin: "var(--space-3) 0",
            }}
          >
            See your real TrustIndex Score
          </h1>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              maxWidth: "60ch",
              margin: "0 auto var(--space-8)",
            }}
          >
            The free AI Invisibility Test runs across ChatGPT, Claude, Perplexity and Gemini
            and returns your actual scores &mdash; no hypotheticals.
          </p>
          <a
            href="/test"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "52px",
              padding: "0 var(--space-8)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontWeight: 800,
              fontSize: "var(--font-size-body)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
              letterSpacing: "-0.01em",
            }}
          >
            Run my free AI test &rarr;
          </a>
        </div>
      </section>

      {/* 2. How we measure success */}
      <section
        style={{
          padding: "var(--space-16) var(--space-4)",
          backgroundColor: "var(--color-surface-muted)",
        }}
        aria-labelledby="metrics-heading"
      >
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <h2
            id="metrics-heading"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "0 0 var(--space-6) 0",
            }}
          >
            How we measure success
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {METRICS.map(([title, description]) => (
              <div key={title} style={card}>
                <div style={{ fontWeight: 800, marginBottom: "var(--space-2)" }}>{title}</div>
                <div
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Prominent /test CTA card */}
      <section
        style={{ padding: "var(--space-16) var(--space-4)" }}
        aria-labelledby="test-cta-heading"
      >
        <div
          style={{
            maxWidth: "760px",
            margin: "0 auto",
            background:
              "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
            border: "2px solid var(--color-primary)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-10)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-5)",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-primary)",
            }}
          >
            Free &middot; 60 seconds &middot; no credit card
          </span>
          <h2
            id="test-cta-heading"
            style={{
              margin: 0,
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              color: "var(--color-text)",
            }}
          >
            Find out if AI sees your brand &mdash; right now
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: "54ch",
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
            }}
          >
            Enter your brand, category, and email. We run real API calls across ChatGPT,
            Claude, Perplexity and Gemini and return your TrustIndex Score in under a minute.
          </p>
          <a
            href="/test"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "52px",
              padding: "0 var(--space-8)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontWeight: 800,
              fontSize: "var(--font-size-body)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            Run my free AI test &rarr;
          </a>
        </div>
      </section>

      {/* 4. GEO Sprint upsell */}
      <section
        style={{ padding: "var(--space-16) var(--space-4)" }}
        aria-labelledby="geo-sprint-heading"
      >
        <div
          style={{
            maxWidth: "820px",
            margin: "0 auto",
            background:
              "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
            border: "1.5px solid var(--color-primary)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-10)",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "var(--color-primary)",
            }}
          >
            Done-for-you &middot; OrganicPosts GEO Sprint
          </span>
          <h2
            id="geo-sprint-heading"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "var(--space-2) 0 var(--space-3) 0",
            }}
          >
            Want this fixed for you? Get Cited in 30 Days.
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              margin: "0 0 var(--space-5) 0",
            }}
          >
            The OrganicPosts GEO Sprint is a founder-led, done-for-you engagement &mdash; full
            audit, citation-optimised content written and published, knowledge-graph entity setup,
            and a 30-day re-measure. You talk directly to the person doing the work.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
            }}
          >
            <a
              href="/book"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                textDecoration: "none",
                fontSize: "var(--font-size-body-sm)",
                fontFamily: "var(--font-family)",
              }}
            >
              Book a free 20-min call &rarr;
            </a>
            <a
              href="/kit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-6)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "1.5px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "var(--font-size-body-sm)",
                fontFamily: "var(--font-family)",
              }}
            >
              Or DIY with the $29 Kit
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
