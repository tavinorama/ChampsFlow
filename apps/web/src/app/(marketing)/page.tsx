/**
 * Landing page v5 — TrustIndex AI
 * Route: / (within (marketing) route group)
 *
 * v5 changes:
 *  - Hero: fully centred layout (single column, max-width 720px), form
 *    centred below headline, mockup drops as a full-width element below.
 *  - All emoji replaced with clean monoline SVG icon components.
 *  - Background images handled in (marketing)/layout.tsx MARKETING_STYLES
 *    (mk-hero-bg dark mode = 4K Unsplash photo + overlay).
 *  - Trust signals centred below the compact form.
 *  - TheShift "Then/Now" search/AI icons are now SVG.
 *
 * Static rendering: no dynamic data.
 */

import type { Metadata } from "next";
import { WaitlistForm } from "../../components/marketing/WaitlistForm";
import { GeoGraphBackdrop } from "../../components/marketing/GeoGraphBackdrop";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "TrustIndex AI — Know if AI trusts your brand",
  description:
    "AI Search Trust Intelligence for SMBs. TrustIndex AI audits how your brand appears across AI search, benchmarks competitors, and builds the GEO content plan you need to get cited organically.",
  alternates: { canonical: "https://trustindexai.com/" },
  openGraph: {
    title: "TrustIndex AI — Know if AI trusts your brand",
    description:
      "AI Search Trust Intelligence for SMBs. TrustIndex AI audits how your brand appears across AI search, benchmarks competitors, and builds the GEO content plan you need to get cited organically.",
    url: "https://trustindexai.com/",
    siteName: "TrustIndex AI",
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "TrustIndex AI — Know if AI trusts your brand",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrustIndex AI — Know if AI trusts your brand",
    description:
      "When your customer asks ChatGPT for a recommendation, be the answer.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "TrustIndex AI",
  description:
    "AI Search Trust Intelligence platform for SMBs. Audits brand visibility across ChatGPT, Perplexity, Gemini, and Google AI; benchmarks competitor citations; computes a TrustIndex Score; and builds a GEO content plan for organic AI-search visibility.",
  url: "https://trustindexai.com",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "EUR",
      billingIncrement: "P1M",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "99",
      priceCurrency: "EUR",
      billingIncrement: "P1M",
    },
    {
      "@type": "Offer",
      name: "Agency",
      price: "149",
      priceCurrency: "EUR",
      billingIncrement: "P1M",
    },
  ],
  creator: {
    "@type": "Organization",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* FAQPage structured data — standard SEO schema (the practice we sell). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
      <HeroSection />
      <EnginesCoverageSection />
      <StatBarSection />
      <TheShiftSection />
      <HowItWorksSection />
      <WhoItsForSection />
      <StartHereSection />
      <PrivacyAISection />
      <ComparisonSection />
      <FoundingMemberSection />
      <PricingSection />
      <FAQSection />
      <WaitlistSection />
    </>
  );
}

// ---------------------------------------------------------------------------
// SVG icon library — all 18×18, monoline, currentColor
// ---------------------------------------------------------------------------

function IconLink() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconPenSparkle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 7l-1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconShieldCheck() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="9 12 11 14 15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconHandStop() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="6" y1="1" x2="6" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="1" x2="14" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconCpu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
      <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="1" x2="9" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="15" y1="1" x2="15" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="9" y1="20" x2="9" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="15" y1="20" x2="15" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="9" x2="23" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="1" y1="9" x2="4" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="1" y1="14" x2="4" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ① Hero — centred single-column + full-width mockup below
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mk-hero-bg"
      style={{ padding: "var(--space-24) var(--space-4) var(--space-20)", position: "relative", overflow: "hidden" }}
    >
      <GeoGraphBackdrop opacity={0.45} />
      {/* Copy — centred narrow column */}
      <div
        style={{
          maxWidth: "680px",
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Pre-headline badge */}
        <div
          className="mk-badge"
          style={{ marginBottom: "var(--space-6)", display: "inline-flex" }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--color-primary)",
              flexShrink: 0,
            }}
          />
          AI Search Trust Intelligence &middot; Built for SMBs
        </div>

        <h1
          id="hero-heading"
          style={{
            fontSize: "clamp(2.5rem, 5.5vw, 4rem)",
            fontWeight: "800",
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            margin: "0 0 var(--space-5) 0",
            textWrap: "balance",
          }}
        >
          Know if AI{" "}
          <span style={{ color: "var(--color-primary)" }}>
            trusts your brand.
          </span>
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
            lineHeight: 1.75,
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            margin: "0 0 var(--space-8) 0",
            maxWidth: "54ch",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Buyers now ask ChatGPT, Perplexity, Gemini, and Google AI before they
          visit your site. TrustIndex AI audits how your brand appears in those
          answers, benchmarks the competitors being recommended instead, and
          builds the GEO content plan you need to get cited organically.
        </p>

        {/* Compact form — centred */}
        <div style={{ maxWidth: "480px", margin: "0 auto var(--space-3)" }}>
          <WaitlistForm compact />
        </div>

        {/* Secondary CTA — the free lead magnet (instant, no waitlist) */}
        <p style={{ margin: "0 auto var(--space-6)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          Or see it now —{" "}
          <a href="/test" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
            run the free AI Invisibility Test &rarr;
          </a>
        </p>

        {/* Trust signals — centred */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-5)",
            justifyContent: "center",
          }}
        >
          {[
            "30-day money-back guarantee",
            "No auto-publish, ever",
            "EU data residency",
          ].map((t) => (
            <span
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                fontWeight: "500",
              }}
            >
              <CheckIcon />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Mockup — full width below the copy */}
      <div
        style={{
          maxWidth: "960px",
          margin: "var(--space-16) auto 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          role="img"
          aria-label="Product mockup — the TrustIndex Score audit screen with the 3-vector breakdown and competitor benchmark"
          style={{
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            boxShadow:
              "0 32px 80px -16px rgba(10,126,90,0.16), 0 4px 20px rgba(0,0,0,0.08)",
            border: "1px solid var(--color-border)",
          }}
        >
          <AppMockupSVG />
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--color-success)" opacity="0.15"/>
      <polyline points="8 12 11 15 16 9" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** On-brand GEO mockup: the TrustIndex Score audit screen. */
function AppMockupSVG() {
  const vectors = [
    { label: "AI", val: 58, color: "#2563eb" },
    { label: "Performance", val: 71, color: "#7c3aed" },
    { label: "Brand", val: 49, color: "#0fb488" },
  ];
  const R = 54;
  const C = 2 * Math.PI * R;
  const overall = 64;
  return (
    <svg
      viewBox="0 0 840 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height: "auto" }}
      aria-hidden="true"
    >
      <rect width="840" height="480" fill="#f8fafc" />

      {/* Browser chrome */}
      <rect width="840" height="48" fill="#f1f5f9" />
      <circle cx="22" cy="24" r="6" fill="#fca5a5" />
      <circle cx="40" cy="24" r="6" fill="#fcd34d" />
      <circle cx="58" cy="24" r="6" fill="#86efac" />
      <rect x="90" y="14" width="420" height="20" rx="5" fill="#e2e8f0" />
      <text x="100" y="27.5" fontSize="9.5" fill="#94a3b8" fontFamily="monospace">
        app.trustindexai.com/brands/acme-crm
      </text>

      {/* Sidebar */}
      <rect x="0" y="48" width="180" height="432" fill="#f8fafc" />
      <line x1="180" y1="48" x2="180" y2="480" stroke="#e2e8f0" strokeWidth="1" />
      <text x="24" y="91" fontSize="12" fill="#94a3b8" fontFamily="system-ui,sans-serif">Dashboard</text>
      <rect x="14" y="110" width="152" height="34" rx="7" fill="#eff6ff" />
      <text x="24" y="131" fontSize="12" fill="#0A7E5A" fontFamily="system-ui,sans-serif" fontWeight="700">Brands</text>
      <text x="24" y="168" fontSize="12" fill="#94a3b8" fontFamily="system-ui,sans-serif">Content Plan</text>
      <text x="24" y="202" fontSize="12" fill="#94a3b8" fontFamily="system-ui,sans-serif">Monitoring</text>

      {/* Header */}
      <text x="208" y="84" fontSize="17" fill="#0f172a" fontFamily="system-ui,sans-serif" fontWeight="800" letterSpacing="-0.5">
        Acme CRM — TrustIndex Score
      </text>
      <rect x="208" y="96" width="150" height="22" rx="11" fill="#ecfdf5" stroke="#a7f3d0" strokeWidth="1" />
      <circle cx="222" cy="107" r="4" fill="#0fb488" />
      <text x="232" y="111" fontSize="9.5" fill="#047857" fontFamily="system-ui,sans-serif" fontWeight="700">
        50 AI probes · 5 engines
      </text>

      {/* Score ring card */}
      <rect x="208" y="134" width="232" height="180" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <circle cx="324" cy="212" r={R} fill="none" stroke="#eef2f7" strokeWidth="14" />
      <circle
        cx="324" cy="212" r={R} fill="none" stroke="#0A7E5A" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(overall / 100) * C} ${C}`} transform="rotate(-90 324 212)"
      />
      <text x="324" y="206" fontSize="38" fill="#0f172a" fontFamily="system-ui,sans-serif" fontWeight="800" textAnchor="middle">{overall}</text>
      <text x="324" y="228" fontSize="11" fill="#94a3b8" fontFamily="system-ui,sans-serif" textAnchor="middle">/ 100</text>
      <text x="324" y="292" fontSize="11.5" fill="#64748b" fontFamily="system-ui,sans-serif" fontWeight="600" textAnchor="middle">Overall TrustIndex Score</text>

      {/* 3 vectors card */}
      <rect x="456" y="134" width="352" height="180" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      {vectors.map((v, i) => {
        const y = 168 + i * 48;
        return (
          <g key={v.label}>
            <text x="478" y={y} fontSize="12" fill="#334155" fontFamily="system-ui,sans-serif" fontWeight="600">{v.label}</text>
            <text x="786" y={y} fontSize="12" fill="#0f172a" fontFamily="system-ui,sans-serif" fontWeight="800" textAnchor="end">{v.val}</text>
            <rect x="478" y={y + 8} width="308" height="9" rx="4.5" fill="#eef2f7" />
            <rect x="478" y={y + 8} width={(v.val / 100) * 308} height="9" rx="4.5" fill={v.color} />
          </g>
        );
      })}

      {/* Competitor benchmark card */}
      <rect x="208" y="330" width="600" height="118" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="228" y="358" fontSize="12.5" fill="#0f172a" fontFamily="system-ui,sans-serif" fontWeight="800">
        Who AI recommends instead of you
      </text>
      <text x="228" y="386" fontSize="11" fill="#dc2626" fontFamily="system-ui,sans-serif" fontWeight="600">Competitor A</text>
      <rect x="360" y="378" width="320" height="9" rx="4.5" fill="#fee2e2" />
      <rect x="360" y="378" width="216" height="9" rx="4.5" fill="#ef4444" />
      <text x="788" y="386" fontSize="11" fill="#64748b" fontFamily="system-ui,sans-serif" fontWeight="700" textAnchor="end">6 / 10</text>
      <text x="228" y="414" fontSize="11" fill="#d97706" fontFamily="system-ui,sans-serif" fontWeight="600">Competitor B</text>
      <rect x="360" y="406" width="320" height="9" rx="4.5" fill="#fef3c7" />
      <rect x="360" y="406" width="144" height="9" rx="4.5" fill="#f59e0b" />
      <text x="788" y="414" fontSize="11" fill="#64748b" fontFamily="system-ui,sans-serif" fontWeight="700" textAnchor="end">4 / 10</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ② Stat Bar — 3 numbers with sparklines
// ---------------------------------------------------------------------------

const STATS = [
  {
    number: "200M",
    label: "Weekly active ChatGPT users",
    source: "OpenAI / Axios, Aug 2024",
    sparkline: "M0,28 L8,22 L16,18 L24,14 L32,8 L40,4",
  },
  {
    number: "40%",
    label: "Citation visibility lift from GEO content",
    source: "Princeton, Georgia Tech & Allen AI — KDD 2024",
    sparkline: "M0,28 L8,26 L16,22 L24,16 L32,10 L40,4",
  },
  {
    number: "#2",
    label: "LinkedIn's rank in AI search citations",
    source: "Semrush — 89,000 URL study, 2025",
    sparkline: "M0,28 L8,24 L16,20 L24,16 L32,10 L40,6",
  },
];

function StatBarSection() {
  return (
    <section
      aria-label="Key statistics on AI search growth"
      className="mk-stat-bar"
      style={{ padding: "var(--space-12) var(--space-4)" }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--space-8)",
          alignItems: "start",
        }}
      >
        {STATS.map((s) => (
          <div key={s.number}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                  fontWeight: "800",
                  color: "#34D399",
                  fontFamily: "var(--font-family)",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                {s.number}
              </p>
              <svg
                width="44"
                height="32"
                viewBox="0 0 44 32"
                fill="none"
                aria-hidden="true"
                style={{ marginBottom: "8px", flexShrink: 0 }}
              >
                <path
                  d={s.sparkline}
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="40" cy="4" r="3" fill="#34d399" />
              </svg>
            </div>
            <p
              style={{
                margin: "0 0 var(--space-1) 0",
                fontSize: "var(--font-size-body-sm)",
                color: "#e2e8f0",
                fontFamily: "var(--font-family)",
                lineHeight: 1.5,
                fontWeight: "600",
              }}
            >
              {s.label}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-caption)",
                color: "#64748b",
                fontFamily: "var(--font-family)",
              }}
            >
              {s.source}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ③ The Shift
// ---------------------------------------------------------------------------

function TheShiftSection() {
  return (
    <section
      aria-labelledby="shift-heading"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        padding: "var(--space-20) var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        <h2
          id="shift-heading"
          style={{
            fontSize: "clamp(1.875rem, 4vw, 3rem)",
            fontWeight: "800",
            letterSpacing: "-0.03em",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            lineHeight: 1.1,
            marginBottom: "var(--space-10)",
          }}
        >
          Search moved.
          <br />
          Most businesses haven&rsquo;t noticed yet.
        </h2>

        {/* Then / Now split */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "var(--space-4)",
            alignItems: "center",
            marginBottom: "var(--space-10)",
          }}
        >
          {/* Then */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-5)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p
              style={{
                margin: "0 0 var(--space-2) 0",
                fontSize: "var(--font-size-caption)",
                fontWeight: "700",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              2 years ago
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-3)",
                color: "var(--color-muted)",
              }}
            >
              <IconSearch />
              <span
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: "700",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                }}
              >
                Google
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                lineHeight: 1.5,
              }}
            >
              &ldquo;best accountant for freelancers berlin&rdquo; → 10 blue
              links
            </p>
          </div>

          {/* Arrow */}
          <div
            aria-hidden="true"
            style={{
              fontSize: "1.25rem",
              color: "var(--color-muted)",
              textAlign: "center",
            }}
          >
            →
          </div>

          {/* Now */}
          <div
            style={{
              backgroundColor: "var(--color-badge-ai-bg)",
              border: "1px solid var(--color-highlight-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-5)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p
              style={{
                margin: "0 0 var(--space-2) 0",
                fontSize: "var(--font-size-caption)",
                fontWeight: "700",
                color: "var(--color-primary)",
                fontFamily: "var(--font-family)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Today
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-3)",
                color: "var(--color-badge-ai-text)",
              }}
            >
              <IconCpu />
              <span
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: "700",
                  color: "var(--color-badge-ai-text)",
                  fontFamily: "var(--font-family)",
                }}
              >
                ChatGPT · Claude · Perplexity · Gemini
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-caption)",
                color: "var(--color-badge-ai-text)",
                fontFamily: "var(--font-family)",
                lineHeight: 1.5,
              }}
            >
              &ldquo;The best accountant for Berlin freelancers is{" "}
              <strong>Muster GmbH</strong> — they specialize in digital nomads
              and post weekly LinkedIn guides.&rdquo;
            </p>
          </div>
        </div>

        {/* And now Google too — Google's own search is now AI-first */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderLeft: "4px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-5) var(--space-6)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "var(--space-10)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <IconSearch />
            <span style={{ fontSize: "var(--font-size-caption)", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", fontFamily: "var(--font-family)" }}>
              And now — Google too
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-text)", fontFamily: "var(--font-family)", textAlign: "justify", textJustify: "inter-word", hyphens: "auto" }}>
            This isn&rsquo;t just the new AI tools — <strong>Google itself changed how search works.</strong> Its
            new <strong>AI Mode</strong> answers your question directly, and <strong>AI Overviews</strong> sit above
            the old blue links. The same query now returns an AI answer that names a few businesses — not a page of
            links you scroll. By Google I/O 2026, AI Mode had passed <strong>1 billion monthly users</strong> and AI
            Overviews appeared in <strong>over 25% of searches</strong>.{" "}
            <Cite>Google I/O 2026.</Cite>{" "}
            The channel everyone already trusts is now an answer engine — so the question is simply whether that
            answer includes you.
          </p>
        </div>

        {/* Body text */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", textAlign: "justify", textJustify: "inter-word", hyphens: "auto" }}>
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-text)", fontFamily: "var(--font-family)" }}>
            ChatGPT reached 200 million weekly active users by August 2024.{" "}
            <Cite>OpenAI / Axios, August 2024.</Cite>{" "}
            Perplexity crossed 15 million monthly active users within two years of launch.{" "}
            <Cite>Backlinko, citing Perplexity data.</Cite>{" "}
            When those users ask for a recommendation, the AI answers with names. Those names come from content it has indexed and evaluated.
          </p>

          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-text)", fontFamily: "var(--font-family)" }}>
            Research published at KDD 2024 by Princeton, Georgia Tech, and the Allen Institute for AI defined Generative Engine Optimization (GEO) and found that applying structured, specific, citation-worthy content techniques can lift a source&rsquo;s visibility in AI-generated answers by up to 40%.{" "}
            <Cite>Aggarwal et al., KDD 2024, arxiv.org/abs/2311.09735.</Cite>
          </p>

          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-text)", fontFamily: "var(--font-family)" }}>
            The businesses getting cited are posting consistently on LinkedIn. A 2025 Semrush study of 89,000 LinkedIn URLs found LinkedIn is the second most-cited source in AI search — and the top source for professional queries.{" "}
            <Cite>Semrush, &ldquo;We Analyzed 89K LinkedIn URLs Cited in AI Search,&rdquo; semrush.com.</Cite>{" "}
            TrustIndex AI handles the consistency.
          </p>

          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-text)", fontFamily: "var(--font-family)" }}>
            In June 2026, Google&rsquo;s official Search documentation formally recognized Generative Engine Optimization — confirming the durable levers are unique, useful, crawlable content and genuine authority, not gimmicks like special &ldquo;AI files&rdquo;.{" "}
            <Cite>Google Search Central, developers.google.com, June 2026.</Cite>{" "}
            TrustIndex AI is built to that guidance — and unlike Google&rsquo;s own Search Console AI report (Google-only, your site only), it measures you across <strong>every</strong> major AI engine, against your competitors, with the reasons and the fix.
          </p>
        </div>

        {/* Callout */}
        <div className="mk-callout" style={{ marginTop: "var(--space-8)", marginBottom: "var(--space-6)" }}>
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-badge-ai-text)", fontFamily: "var(--font-family)", lineHeight: 1.65, fontWeight: "500" }}>
            GEO is not marketing terminology. It was defined in peer-reviewed research at one of the most competitive venues in data science. We will tell you what is substantiated and what is not.
          </p>
        </div>

        <a
          href="/blog/how-small-businesses-get-cited-by-chatgpt"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            color: "var(--color-primary)",
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "700",
            fontFamily: "var(--font-family)",
          }}
        >
          Read the full GEO research guide →
        </a>
      </div>
    </section>
  );
}

function Cite({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "0.7rem",
        color: "var(--color-muted)",
        fontFamily: "var(--font-family)",
        fontStyle: "italic",
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Engines coverage — the multi-engine moat (honest: these are the engines we
// actually query + the sources we actually check). Borrowed UX pattern from
// review/SaaS sites' "integrations" strip; reframed for GEO.
// ---------------------------------------------------------------------------

const ENGINES = ["ChatGPT", "Claude", "Perplexity", "Gemini", "Google AI Overview"];
const SOURCES = ["Reddit", "Wikipedia", "LinkedIn", "G2", "Trustpilot", "Crunchbase", "YouTube"];

function EnginesCoverageSection() {
  return (
    <section aria-label="Coverage" style={{ padding: "var(--space-12) var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ margin: "0 0 var(--space-5) 0", fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          We measure every AI engine your buyers use
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "center", marginBottom: "var(--space-5)" }}>
          {ENGINES.map((e) => (
            <span key={e} style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              padding: "8px 16px", borderRadius: "var(--radius-pill)",
              border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)",
              fontSize: "var(--font-size-body-sm)", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family)",
            }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--color-primary)" }} />
              {e}
            </span>
          ))}
        </div>
        <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          …and the high-authority sources they cite most:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "center" }}>
          {SOURCES.map((s) => (
            <span key={s} style={{
              padding: "5px 12px", borderRadius: "var(--radius-pill)",
              backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-caption)", fontWeight: 600, color: "var(--color-muted)", fontFamily: "var(--font-family)",
            }}>{s}</span>
          ))}
        </div>
        <p style={{ margin: "var(--space-5) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          Google&rsquo;s own report covers Google only. We cover the whole AI-answer surface.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Who it's for — ICP segments (honest, no fabricated proof)
// ---------------------------------------------------------------------------

const SEGMENTS: Array<{ tag: string; who: string; pain: string; help: string }> = [
  {
    tag: "Local & professional services",
    who: "Law firms, clinics, accountants, agencies — businesses won on trust.",
    pain: "“A client said they asked ChatGPT and a competitor came up, not us.”",
    help: "See exactly which rival AI names in your city/category — and publish the proof that earns the citation.",
  },
  {
    tag: "Boutique agencies",
    who: "SEO, content & PR shops whose clients are asking about AI search.",
    pain: "“Clients want an AI-search answer and I’m improvising.”",
    help: "A white-label, multi-brand audit you can resell — Score → Plan → drafts, with your logo.",
  },
  {
    tag: "Funded B2B SaaS & DTC",
    who: "Seed–Series A teams who live and die by efficient pipeline.",
    pain: "“AI recommends a competitor tool by name — and I can’t show a number.”",
    help: "One trackable KPI (your TrustIndex Score) across every engine, plus the content plan to move it.",
  },
];

function WhoItsForSection() {
  return (
    <section aria-labelledby="who-heading" style={{ padding: "var(--space-20) var(--space-4)", backgroundColor: "var(--color-surface-muted)" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", fontFamily: "var(--font-family)" }}>
          Who it&rsquo;s for
        </p>
        <h2 id="who-heading" style={{ fontSize: "clamp(1.875rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-8) 0" }}>
          Built for businesses that win on trust.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-5)" }}>
          {SEGMENTS.map((s) => (
            <div key={s.tag} style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <span style={{ fontSize: "var(--font-size-h4)", fontWeight: 800, color: "var(--color-text)", fontFamily: "var(--font-family)" }}>{s.tag}</span>
              <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, fontFamily: "var(--font-family)" }}>{s.who}</span>
              <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.6, fontStyle: "italic", fontFamily: "var(--font-family)", borderLeft: "3px solid var(--color-border)", paddingLeft: "var(--space-3)" }}>{s.pain}</span>
              <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.6, fontFamily: "var(--font-family)", marginTop: "auto" }}>
                <strong style={{ color: "var(--color-primary)" }}>→ </strong>{s.help}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Start Here — the two entry products (free Invisibility Test + $29 Kit)
// ---------------------------------------------------------------------------

function StartHereSection() {
  return (
    <section
      aria-labelledby="start-here-heading"
      style={{ padding: "var(--space-20) var(--space-4)" }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", fontFamily: "var(--font-family)" }}>
          Start here
        </p>
        <h2 id="start-here-heading" style={{ fontSize: "clamp(1.875rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-3) 0" }}>
          See the gap free. Fix it for $29.
        </h2>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, fontFamily: "var(--font-family)", margin: "0 0 var(--space-8) 0", maxWidth: "62ch" }}>
          You don&rsquo;t have to commit to a subscription to start. Two steps get you from
          &ldquo;am I invisible?&rdquo; to publishing your first AI-citable content today.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-5)" }}>
          {/* Free test */}
          <div style={ladderCard(false)}>
            <span style={ladderTag("var(--color-surface-muted)", "var(--color-muted)")}>Step 1 · Free</span>
            <h3 style={ladderTitle}>The AI Invisibility Test</h3>
            <p style={ladderBody}>
              In 60 seconds, see whether ChatGPT, Claude, Perplexity and Gemini recommend
              <strong> you</strong> or your competitor — across the real engines buyers use.
            </p>
            <ul style={ladderList}>
              <li>One buyer prompt, every major AI engine</li>
              <li>Head-to-head vs one competitor</li>
              <li>Instant scorecard — no credit card</li>
            </ul>
            <a href="/test" style={ladderBtn(false)}>Run my free test &rarr;</a>
          </div>

          {/* $29 Kit */}
          <div style={ladderCard(true)}>
            <span style={ladderTag("var(--color-badge-ai-bg)", "var(--color-badge-ai-text)")}>Step 2 · $29 one-time</span>
            <h3 style={ladderTitle}>The Get-Cited Kit</h3>
            <p style={ladderBody}>
              Know <em>why</em> you&rsquo;re invisible — and leave with content ready to publish.
              No subscription, no GEO degree required.
            </p>
            <ul style={ladderList}>
              <li>Full audit + your TrustIndex Score</li>
              <li>Your top 3 highest-impact fixes</li>
              <li><strong>3 ready-to-publish drafts</strong> (blog + LinkedIn + FAQ, with schema)</li>
              <li>Publish checklist + 30-day re-test</li>
            </ul>
            <a href="/kit" style={ladderBtn(true)}>Get the Kit — $29</a>
          </div>
        </div>

        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)", margin: "var(--space-5) 0 0 0", lineHeight: 1.6 }}>
          Ready for ongoing monitoring? The <a href="#pricing" style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}>Growth plan</a> re-runs your audit weekly and tracks your score over time.
        </p>
      </div>
    </section>
  );
}

const ladderCard = (highlight: boolean): React.CSSProperties => ({
  backgroundColor: "var(--color-surface)",
  border: highlight ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
  borderRadius: "var(--radius-xl)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
});
const ladderTag = (bg: string, color: string): React.CSSProperties => ({
  alignSelf: "flex-start",
  fontSize: "0.7rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "3px 10px",
  borderRadius: "var(--radius-pill)",
  backgroundColor: bg,
  color,
});
const ladderTitle: React.CSSProperties = { fontSize: "var(--font-size-h3)", fontWeight: 800, margin: 0, color: "var(--color-text)", fontFamily: "var(--font-family)" };
const ladderBody: React.CSSProperties = { fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0, fontFamily: "var(--font-family)" };
const ladderList: React.CSSProperties = { margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.5 };
function ladderBtn(primary: boolean): React.CSSProperties {
  return {
    marginTop: "auto",
    display: "inline-block",
    textAlign: "center",
    textDecoration: "none",
    height: "46px",
    lineHeight: "46px",
    padding: "0 var(--space-5)",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body-sm)",
    fontFamily: "var(--font-family)",
    backgroundColor: primary ? "var(--color-primary)" : "transparent",
    color: primary ? "#fff" : "var(--color-primary)",
    border: primary ? "none" : "1px solid var(--color-primary)",
  };
}

// ---------------------------------------------------------------------------
// ④ How It Works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    Icon: IconSearch,
    title: "Audit",
    body: "TrustIndex AI runs a portfolio of real buyer prompts across ChatGPT, Perplexity, Gemini, and Google AI Overview, then measures whether your brand is mentioned, cited, and recommended — your baseline TrustIndex Score.",
    accent: false,
    iconColor: "var(--color-muted)",
  },
  {
    n: "02",
    Icon: IconCpu,
    title: "Benchmark",
    body: "See exactly which competitors AI systems recommend instead of you, on which prompts, and what sources they trust. Your category ownership and displacement, made measurable.",
    accent: true,
    iconColor: "var(--color-primary)",
  },
  {
    n: "03",
    Icon: IconShieldCheck,
    title: "Plan & publish",
    body: "TrustIndex AI turns the gaps into a prioritized GEO content plan. OrganicPosts by TrustIndex AI helps you publish the proof, pages, and posts AI needs — then monitors your score over time.",
    accent: false,
    iconColor: "var(--color-success)",
  },
];

function HowItWorksSection() {
  return (
    <section
      aria-labelledby="how-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        padding: "var(--space-20) var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          <h2
            id="how-heading"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 3rem)",
              fontWeight: "800",
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.1,
              marginBottom: "var(--space-4)",
            }}
          >
            Audit. Benchmark.
            <br />
            Plan &amp; publish.
          </h2>
          <p
            style={{
              fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.7,
              maxWidth: "44ch",
              margin: "0 auto",
            }}
          >
            From &ldquo;are we even in AI answers?&rdquo; to a published plan
            that gets you cited.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-6)",
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="mk-step-card"
              style={{
                padding: "var(--space-8)",
                position: "relative",
                overflow: "hidden",
                ...(step.accent
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
                      borderColor: "var(--color-highlight-border)",
                    }
                  : {}),
              }}
            >
              {/* Decorative large number */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "var(--space-4)",
                  fontSize: "6rem",
                  fontWeight: "800",
                  lineHeight: 1,
                  color: step.accent
                    ? "rgba(10,126,90,0.07)"
                    : "var(--color-border)",
                  fontFamily: "var(--font-family)",
                  userSelect: "none",
                  letterSpacing: "-0.04em",
                }}
              >
                {step.n}
              </span>

              {/* SVG Icon tile */}
              <div
                aria-hidden="true"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: step.accent
                    ? "var(--color-badge-ai-bg)"
                    : "var(--color-surface-muted)",
                  border: `1px solid ${step.accent ? "var(--color-highlight-border)" : "var(--color-border)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: step.iconColor,
                  marginBottom: "var(--space-5)",
                }}
              >
                <step.Icon />
              </div>

              <h3
                style={{
                  fontSize: "var(--font-size-h2)",
                  fontWeight: "700",
                  letterSpacing: "-0.02em",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  marginBottom: "var(--space-3)",
                  marginTop: 0,
                }}
              >
                {step.title}
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.7,
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-family)",
                  margin: 0,
                }}
              >
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ⑤ Privacy & AI
// ---------------------------------------------------------------------------

const PRIVACY_BLOCKS = [
  {
    Icon: IconLock,
    iconColor: "var(--color-primary)",
    title: "Zero Data Retention",
    body: "We use Anthropic Claude Sonnet under a Zero Data Retention agreement — Anthropic cannot store your content after the AI call ends. The moment your draft is returned, your input is gone from Anthropic's systems. Not archived. Not anonymised. Not used for training.",
  },
  {
    Icon: IconHandStop,
    iconColor: "#d97706",
    title: "Draft-and-confirm is a design decision, not a toggle",
    body: "The AI produces a draft. You read it, edit it, and click Approve and Schedule. Nothing is published automatically. There is no setting to bypass this step. We have not built one and do not plan to.",
  },
  {
    Icon: IconGlobe,
    iconColor: "var(--color-success)",
    title: "EU data residency for AI inference",
    body: "For EU users, AI inference runs on AWS Bedrock in Frankfurt (eu-central-1). Your content does not leave the EU during AI processing. We act as a data processor under GDPR Article 28 — you remain the data controller.",
  },
];

function PrivacyAISection() {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="mk-teal-surface"
      style={{ padding: "var(--space-20) var(--space-4)" }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ marginBottom: "var(--space-10)" }}>
          <h2
            id="privacy-heading"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 3rem)",
              fontWeight: "800",
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.1,
              marginBottom: "var(--space-4)",
            }}
          >
            How your data is protected.
          </h2>
          <p
            style={{
              fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.7,
              maxWidth: "48ch",
            }}
          >
            Privacy-first is not a marketing badge. It is built into the
            architecture and the contracts.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {PRIVACY_BLOCKS.map((b) => (
            <div
              key={b.title}
              className="mk-privacy-card"
              style={{
                padding: "var(--space-6)",
                display: "flex",
                gap: "var(--space-5)",
                alignItems: "flex-start",
              }}
            >
              {/* SVG icon tile */}
              <div
                aria-hidden="true"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-teal-surface)",
                  border: "1px solid var(--color-teal-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: b.iconColor,
                  flexShrink: 0,
                }}
              >
                <b.Icon />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "var(--font-size-h3)",
                    fontWeight: "700",
                    letterSpacing: "-0.01em",
                    color: "var(--color-text)",
                    fontFamily: "var(--font-family)",
                    marginBottom: "var(--space-2)",
                    marginTop: 0,
                  }}
                >
                  {b.title}
                </h3>
                <p
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    lineHeight: 1.7,
                    color: "var(--color-muted)",
                    fontFamily: "var(--font-family)",
                    margin: 0,
                  }}
                >
                  {b.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ⑥ Comparison Table — visual indicators ✓ / ✗ / ~ / ?
// ---------------------------------------------------------------------------

const COMPARISON_ROWS = [
  {
    feature: "Content drafted for LLM visibility (GEO)",
    buffer: "no", hootsuite: "no", later: "no", predis: "no",
    op: "Yes — structured, specific drafts shaped for AI citation",
  },
  {
    feature: "Zero Data Retention / no AI training on your content",
    buffer: "unknown", hootsuite: "unknown", later: "unknown", predis: "unknown",
    op: "Yes — ZDR (US) / Bedrock no-training default (EU)",
  },
  {
    feature: "EU data residency for AI inference",
    buffer: "partial", hootsuite: "partial", later: "unknown", predis: "unknown",
    op: "Yes — AWS Bedrock eu-central-1 at launch",
  },
  {
    feature: "Draft-and-confirm (no autonomous posting)",
    buffer: "no", hootsuite: "no", later: "no", predis: "no",
    op: "Yes — always, by design",
  },
  {
    feature: "AI disclosure (EU AI Act Art. 50 transparency)",
    buffer: "unknown", hootsuite: "unknown", later: "unknown", predis: "unknown",
    op: "Yes — named model + visible badge on every draft",
  },
];

type CellValue = "no" | "partial" | "unknown" | string;

function CompCell({ value, isOP = false }: { value: CellValue; isOP?: boolean }) {
  if (isOP) {
    return (
      <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center", verticalAlign: "top", backgroundColor: "rgba(22,163,74,0.06)" }}>
        <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: "var(--space-1)" }}>
          <span style={{ color: "var(--color-success)", fontWeight: "700", flexShrink: 0, fontSize: "1rem" }} aria-hidden="true">✓</span>
          <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-success)", fontWeight: "600", fontFamily: "var(--font-family)", lineHeight: 1.5, textAlign: "left" }}>{value}</span>
        </span>
      </td>
    );
  }

  if (value === "no") {
    return (
      <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center", verticalAlign: "middle" }}>
        <span aria-label="No" style={{ display: "inline-flex", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "rgba(220,38,38,0.08)", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: "700", color: "var(--color-error)" }}>✗</span>
      </td>
    );
  }

  if (value === "partial") {
    return (
      <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center", verticalAlign: "middle" }}>
        <span aria-label="Partial" style={{ display: "inline-flex", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "rgba(217,119,6,0.1)", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "700", color: "#d97706" }}>~</span>
      </td>
    );
  }

  return (
    <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center", verticalAlign: "middle" }}>
      <span aria-label="Not publicly disclosed" style={{ display: "inline-flex", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "var(--color-surface-muted)", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: "700", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>?</span>
    </td>
  );
}

function ComparisonSection() {
  return (
    <section
      aria-labelledby="comparison-heading"
      style={{ padding: "var(--space-20) var(--space-4)", backgroundColor: "var(--color-surface-muted)" }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
          <h2
            id="comparison-heading"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 3rem)",
              fontWeight: "800",
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.1,
              marginBottom: "var(--space-4)",
            }}
          >
            How TrustIndex AI compares.
          </h2>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", fontFamily: "var(--font-family)", maxWidth: "50ch", margin: "0 auto", lineHeight: 1.7 }}>
            GEO visibility and privacy-first AI are new categories. No competitor has made either a core part of their product.
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "var(--space-5)", marginBottom: "var(--space-4)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          {[
            { icon: "✓", bg: "rgba(22,163,74,0.08)", color: "var(--color-success)", label: "Yes" },
            { icon: "✗", bg: "rgba(220,38,38,0.08)", color: "var(--color-error)", label: "No" },
            { icon: "~", bg: "rgba(217,119,6,0.1)", color: "#d97706", label: "Partial" },
            { icon: "?", bg: "var(--color-surface-muted)", color: "var(--color-muted)", label: "Not disclosed" },
          ].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ display: "inline-flex", width: "22px", height: "22px", borderRadius: "50%", backgroundColor: l.bg, alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: "700", color: l.color, border: l.label === "Not disclosed" ? "1px solid var(--color-border)" : "none" }}>{l.icon}</span>
              <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div
          className="mk-comparison-table"
          style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}
          role="region"
          aria-label="Comparison table"
          tabIndex={0}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-family)", fontSize: "var(--font-size-body-sm)" }}>
            <caption style={{ captionSide: "bottom", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-4)", textAlign: "left", padding: "var(--space-2) 0" }}>
              &ldquo;Not disclosed&rdquo; means no public documentation found as of 2026-05-11. VP Legal verifies all competitor rows before this table goes live.
            </caption>
            <thead>
              <tr className="mk-table-header">
                <th scope="col" style={{ padding: "var(--space-4)", textAlign: "left", fontWeight: "700", color: "#e2e8f0", fontSize: "var(--font-size-caption)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Feature</th>
                {["Buffer", "Hootsuite", "Later", "Predis.ai"].map((col) => (
                  <th key={col} scope="col" style={{ padding: "var(--space-4)", textAlign: "center", fontWeight: "600", color: "#64748b", whiteSpace: "nowrap", fontSize: "var(--font-size-body-sm)" }}>{col}</th>
                ))}
                <th scope="col" style={{ padding: "var(--space-4)", textAlign: "center", fontWeight: "700", color: "#34D399", whiteSpace: "nowrap", fontSize: "var(--font-size-body-sm)" }}>TrustIndex AI</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={row.feature} style={{ backgroundColor: i % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-muted)", borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontWeight: "600", color: "var(--color-text)", verticalAlign: "middle", maxWidth: "240px" }}>{row.feature}</td>
                  <CompCell value={row.buffer} />
                  <CompCell value={row.hootsuite} />
                  <CompCell value={row.later} />
                  <CompCell value={row.predis} />
                  <CompCell value={row.op} isOP />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mk-comparison-cards" style={{ display: "none", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-4)" }} aria-hidden="true">
          {COMPARISON_ROWS.map((row) => (
            <div key={row.feature} style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
              <p style={{ fontWeight: "700", marginBottom: "var(--space-3)", marginTop: 0, color: "var(--color-text)", fontFamily: "var(--font-family)", fontSize: "var(--font-size-body-sm)" }}>{row.feature}</p>
              {[["Buffer", row.buffer], ["Hootsuite", row.hootsuite], ["Later", row.later], ["Predis.ai", row.predis], ["TrustIndex AI", row.op]].map(([tool, val]) => (
                <div key={tool} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-1) 0", fontSize: "var(--font-size-caption)", fontFamily: "var(--font-family)", borderBottom: "1px solid var(--color-border)", gap: "var(--space-3)" }}>
                  <span style={{ color: "var(--color-muted)" }}>{tool}</span>
                  <span style={{ color: tool === "TrustIndex AI" ? "var(--color-success)" : "var(--color-muted)", fontWeight: tool === "TrustIndex AI" ? "600" : undefined, textAlign: "right", maxWidth: "60%" }}>{val}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ⑦ Founding Member Offer
// ---------------------------------------------------------------------------

const BONUS_CARDS = [
  {
    n: "01",
    title: "GEO Visibility Guide",
    desc: "30-page PDF covering the Princeton GEO research, five traits of citation-worthy posts, and a four-week posting schedule you can start this week.",
    note: "Included free in Growth plan",
    parts: ["Part 1: The AI Search Shift", "Part 2: How LLMs Decide What to Cite", "Part 3: The Anatomy of a Citation-Worthy Post"],
  },
  {
    n: "02",
    title: "LLM Citation Tracker",
    desc: "Google Sheets template + methodology for monitoring when ChatGPT, Claude, Perplexity, and Gemini mention your business. 10 minutes per week.",
    note: "Included free in Growth plan",
    parts: ["10 customisable weekly queries", "Spreadsheet with 9 tracking columns", "How to interpret citation positions"],
  },
  {
    n: "03",
    title: "5 High-Citation Post Templates",
    desc: "Fill-in-the-blank LinkedIn post structures derived from Princeton GEO research. Each template maps to a research-backed principle.",
    note: "Included free in Growth plan",
    parts: ["Template 1: The Data Story", "Template 2: The Expert Recommendation", "+ 3 more templates"],
  },
];

function FoundingMemberSection() {
  return (
    <section
      aria-labelledby="founding-heading"
      className="mk-teal-surface"
      style={{ padding: "var(--space-20) var(--space-4)" }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-teal-border)", borderRadius: "var(--radius-pill)", padding: "var(--space-1) var(--space-4)", marginBottom: "var(--space-6)" }}>
            <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "var(--color-success)", flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontSize: "var(--font-size-caption)", fontWeight: "700", color: "var(--color-success)", fontFamily: "var(--font-family)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Founding Member Offer</span>
          </div>

          <h2
            id="founding-heading"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 3rem)",
              fontWeight: "800",
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.1,
              marginBottom: "var(--space-4)",
            }}
          >
            First 100 members.
            <br />
            30% founder discount. Personal onboarding.
          </h2>
          <p style={{ fontSize: "clamp(1rem, 1.5vw, 1.125rem)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.7, maxWidth: "56ch", margin: "0 auto var(--space-8)" }}>
            Pricing is <strong style={{ color: "var(--color-text)", fontWeight: "700" }}>$99/month Growth</strong> and <strong style={{ color: "var(--color-text)", fontWeight: "700" }}>$149/month Agency</strong>. Founding members get a <strong style={{ color: "var(--color-success)", fontWeight: "700" }}>30% founder discount</strong> — applied <strong style={{ color: "var(--color-text)", fontWeight: "700" }}>only when you pay annually</strong>.
          </p>

          {/* Price pills with strike-through public price */}
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
            {[
              { plan: "Growth plan", original: "$99/mo", price: "$69/mo", suffix: "billed annually · 30% off" },
              { plan: "Agency plan", original: "$149/mo", price: "$104/mo", suffix: "billed annually · 30% off" },
            ].map((p) => (
              <div key={p.plan} className="mk-price-pill" style={{ padding: "var(--space-4) var(--space-6)", textAlign: "center", minWidth: "220px" }}>
                <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-caption)", fontWeight: "700", color: "var(--color-success)", fontFamily: "var(--font-family)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{p.plan}</p>
                <p style={{ margin: 0, fontSize: "var(--font-size-h2)", fontWeight: "800", color: "var(--color-text)", fontFamily: "var(--font-family)", letterSpacing: "-0.02em", display: "flex", alignItems: "baseline", justifyContent: "center", gap: "var(--space-2)" }}>
                  <span style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", textDecoration: "line-through", fontWeight: "500" }}>{p.original}</span>
                  <span>{p.price}</span>
                </p>
                <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>{p.suffix}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.7, maxWidth: "52ch", margin: "0 auto" }}>
            No countdown timer. No fake scarcity. When the cohort fills, it fills. If the product is not what we said, we offer a <strong style={{ fontWeight: "700" }}>30-day money-back guarantee</strong> — no forms, no friction.
          </p>
        </div>

        {/* Bonus cards */}
        <h3 style={{ fontSize: "var(--font-size-h2)", fontWeight: "700", color: "var(--color-text)", fontFamily: "var(--font-family)", textAlign: "center", marginBottom: "var(--space-6)", letterSpacing: "-0.02em" }}>
          Founding members also receive
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)" }}>
          {BONUS_CARDS.map((card) => (
            <article
              key={card.title}
              className="mk-bonus-card"
              aria-label={`Bonus ${card.n}: ${card.title}`}
              style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column" }}
            >
              <span
                aria-hidden="true"
                style={{ fontSize: "2.75rem", fontWeight: "800", color: "var(--color-teal-border)", fontFamily: "var(--font-family)", lineHeight: 1, marginBottom: "var(--space-3)", letterSpacing: "-0.04em" }}
              >
                {card.n}
              </span>
              <h4 style={{ fontSize: "var(--font-size-h3)", fontWeight: "700", color: "var(--color-text)", fontFamily: "var(--font-family)", marginBottom: "var(--space-3)", marginTop: 0 }}>{card.title}</h4>
              <p style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.7, color: "var(--color-muted)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-4) 0", flexGrow: 1 }}>{card.desc}</p>
              <ul aria-label={`${card.title} contents`} style={{ margin: "0 0 var(--space-4) 0", padding: "0 0 0 var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.7 }}>
                {card.parts.map((p) => <li key={p} style={{ marginBottom: "var(--space-1)" }}>{p}</li>)}
              </ul>
              <p style={{ margin: 0, fontSize: "var(--font-size-caption)", fontWeight: "700", color: "var(--color-success)", fontFamily: "var(--font-family)" }}>✓ {card.note}</p>
            </article>
          ))}
        </div>

        <p style={{ textAlign: "center", marginTop: "var(--space-8)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          Founding members also receive personal onboarding from the founder. Bonuses delivered by email after signup.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ⑧ Pricing
// ---------------------------------------------------------------------------

function PricingSection() {
  return (
    <section
      aria-labelledby="pricing-heading"
      style={{ backgroundColor: "var(--color-surface)", padding: "var(--space-20) var(--space-4)" }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
          <h2
            id="pricing-heading"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 3rem)",
              fontWeight: "800",
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.1,
              marginBottom: "var(--space-3)",
            }}
          >
            Replace a $30k/year specialist for less than $100/month.
          </h2>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", fontFamily: "var(--font-family)", maxWidth: "60ch", margin: "0 auto", lineHeight: 1.7 }}>
            30-day money-back guarantee · Cancel any time · No lock-in contracts
          </p>
        </div>

        {/* Annual website bonus callout — the Hormozi anchor */}
        <div
          style={{
            maxWidth: "880px",
            margin: "0 auto var(--space-10)",
            padding: "var(--space-5) var(--space-6)",
            background: "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
            border: "1.5px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            gap: "var(--space-4)",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flexShrink: 0, color: "var(--color-primary)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: "1 1 320px" }}>
            <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-caption)", fontWeight: "700", color: "var(--color-primary)", fontFamily: "var(--font-family)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Annual only · 30% founder discount + free website
            </p>
            <p style={{ margin: 0, fontSize: "var(--font-size-body)", fontWeight: "600", color: "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.5 }}>
              Pay annually and you unlock the <strong style={{ fontWeight: "800" }}>30% founder discount</strong> — plus we&rsquo;ll <strong style={{ fontWeight: "800" }}>build you a professional website</strong>, delivered in week 1 of your onboarding. 5 pages, your copy, our design. Yours to keep. (The 30% founder discount applies to annual plans only.)
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-6)",
            maxWidth: "1120px",
            margin: "0 auto",
            alignItems: "start",
          }}
        >
          <PricingCard
            name="Free"
            subtitle="Run your first AI visibility audit."
            price="$0"
            period="forever"
            annual="No credit card required"
            features={[
              "1 brand",
              "3 competitors benchmarked",
              "50 buyer prompts / audit",
              "Monthly audit + TrustIndex Score",
              "Basic GEO content plan",
            ]}
            ctaLabel="Start free"
            ctaHref="#waitlist-cta"
          />
          <PricingCard
            name="Growth"
            subtitle="For SMBs actively investing in AI visibility."
            price="$99"
            period="/mo"
            annual="Annual: $831/year — 30% founder discount ($69/mo)"
            features={[
              "1 brand",
              "10 competitors benchmarked",
              "250 buyer prompts / audit",
              "Weekly monitoring + answer-drift alerts",
              "Citation share tracking",
              "GEO content briefs (LinkedIn + website)",
              "🎁 Annual: free 5-page website (week 1)",
            ]}
            featured
            ctaLabel="Join Growth waitlist"
            ctaHref="#waitlist-cta"
          />
          <PricingCard
            name="Agency"
            subtitle="For agencies managing multiple SMB clients."
            price="$149"
            period="/mo"
            annual="Annual: $1,251/year — 30% founder discount ($104/mo)"
            features={[
              "Multi-client dashboard (up to 25 brands)",
              "10 competitors per brand",
              "Weekly monitoring on every client",
              "White-label reports",
              "Client approval workflow",
              "Priority support · 4h SLA",
              "🎁 Annual: website + 3 client landings",
            ]}
            ctaLabel="Join Agency waitlist"
            ctaHref="#waitlist-cta"
          />
        </div>

        <p style={{ textAlign: "center", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)", marginTop: "var(--space-8)", maxWidth: "60ch", margin: "var(--space-8) auto 0", lineHeight: 1.7 }}>
          First 100 waitlist members get the <strong style={{ color: "var(--color-success)", fontWeight: "700" }}>30% founder discount</strong> on annual plans ($831 Growth / $1,251 Agency per year) — applied only when you pay annually.
        </p>
      </div>
    </section>
  );
}

function PricingCard({
  name, subtitle, price, period, annual, features, featured = false,
  ctaLabel = "Join waitlist — founding member pricing",
  ctaHref = "#waitlist-cta",
}: {
  name: string; subtitle: string; price: string; period: string;
  annual: string; features: string[]; featured?: boolean;
  ctaLabel?: string; ctaHref?: string;
}) {
  const textColor = featured ? "#f1f5f9" : "var(--color-text)";
  const mutedColor = featured ? "#94a3b8" : "var(--color-muted)";
  const checkColor = featured ? "#34d399" : "var(--color-success)";

  return (
    <div
      className={featured ? "mk-featured-card" : "mk-regular-card"}
      style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", position: "relative" }}
    >
      {featured && (
        <div
          aria-label="Most popular"
          style={{
            position: "absolute",
            top: "-14px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            fontSize: "var(--font-size-caption)",
            fontWeight: "700",
            fontFamily: "var(--font-family)",
            padding: "3px 16px",
            borderRadius: "var(--radius-pill)",
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          Most popular
        </div>
      )}

      <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: "700", color: mutedColor, fontFamily: "var(--font-family)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{subtitle}</p>
      <h3 style={{ fontSize: "var(--font-size-h1)", fontWeight: "800", color: textColor, fontFamily: "var(--font-family)", marginBottom: "var(--space-2)", marginTop: 0, letterSpacing: "-0.03em" }}>{name}</h3>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
        <span style={{ fontSize: "clamp(2.25rem, 4vw, 3rem)", fontWeight: "800", color: textColor, fontFamily: "var(--font-family)", letterSpacing: "-0.04em", lineHeight: 1 }}>{price}</span>
        <span style={{ fontSize: "var(--font-size-body)", color: mutedColor, fontFamily: "var(--font-family)" }}>{period}</span>
      </div>

      <p style={{ fontSize: "var(--font-size-caption)", color: featured ? "#34D399" : "var(--color-muted)", fontFamily: "var(--font-family)", marginBottom: "var(--space-6)", marginTop: 0, fontWeight: "500" }}>{annual}</p>

      <ul aria-label={`${name} plan features`} style={{ listStyle: "none", margin: "0 0 var(--space-8) 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)", flexGrow: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: featured ? "#e2e8f0" : "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.6 }}>
            <span aria-hidden="true" style={{ color: checkColor, fontWeight: "700", flexShrink: 0, lineHeight: 1.6 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      <a
        href={ctaHref}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          boxSizing: "border-box",
          padding: "var(--space-4)",
          backgroundColor: featured ? "var(--color-primary)" : "transparent",
          color: featured ? "#fff" : "var(--color-primary)",
          border: featured ? "none" : "2px solid var(--color-primary)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: "700",
          fontFamily: "var(--font-family)",
          textDecoration: "none",
          minHeight: "var(--min-button-height)",
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}
      >
        {ctaLabel}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ⑨ FAQ
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  { q: "How does showing up in ChatGPT actually work?", a: "ChatGPT, Claude, Perplexity, and Gemini generate answers by drawing on content they have indexed or can retrieve in real time. Platforms like LinkedIn are heavily indexed by AI systems — Semrush's analysis of 89,000 LinkedIn URLs found it is the second most-cited source in AI search overall. When you post consistently on LinkedIn with specific, structured, useful content, you increase the probability that those systems have something to find and cite when a relevant query comes in. There is no guaranteed path to citation — but consistent, quality posting is the best-documented input." },
  { q: "Is GEO real or marketing hype?", a: "Generative Engine Optimization is a legitimate emerging field. The term was formally defined in a paper by researchers at Princeton, Georgia Tech, and the Allen Institute for AI, published at KDD 2024. The paper demonstrated up to 40% improvements in AI citation visibility through structured content techniques. In June 2026, Google's official Search documentation formally recognized GEO/AEO as well. It is an early field, and not every claim made under the 'GEO' banner is well-founded — Google itself notes that llms.txt files and special 'AI schema' are not required. We follow Google's official guidance, do not score those gimmicks, and tell you what is substantiated and what is not." },
  { q: "Isn't this just Google's free Search Console AI report?", a: "No — they answer different questions. Google's Search Console AI performance report (launched June 2026) tells you that your own pages appeared in Google's AI features. It covers Google only, your own site only, and at launch shows no click data and no competitors. TrustIndex AI measures your brand across every major AI engine — ChatGPT, Claude, Perplexity, and Gemini as well as Google AI Overview — shows which competitors get recommended instead of you, how AI describes you (sentiment), and gives you a prioritized plan to fix the gaps. Use Search Console as your Google thermometer; use TrustIndex AI for the full diagnosis and treatment, across the whole AI-answer surface. We're built to Google's official guidance and pass the three vendor-vetting questions Google published." },
  { q: "How long until I appear in LLM answers?", a: "There is no fixed timeline. Based on the GEO research and observed patterns in how AI systems refresh their data, consistent posting over 4–8 weeks is a reasonable starting point. Individual citation frequency varies by niche, competition, and the specificity of your content." },
  { q: "Can you guarantee my business will be cited?", a: "No, and anyone who says they can guarantee AI citations is overstating what the research supports. GEO research shows that specific, structured, data-backed, consistently published content is cited more frequently than vague or irregular content. We give you the tools to produce that kind of content at scale. The AI systems make their own decisions about what to cite." },
  { q: "How much does it cost?", a: "Four tiers. Free: 1 brand, 3 competitors, 50 prompts, monthly audit + TrustIndex Score, no credit card. Growth: $99/month — 1 brand, 10 competitors, 250 prompts, weekly monitoring, citation tracking, GEO content briefs. Agency: $149/month — multi-client dashboard (up to 25 brands), white-label reports, client approval workflow. Founding members (the first 100 waitlist signups) get a 30% founder discount — applied only when you pay annually ($831/year Growth and $1,251/year Agency, vs $99/$149 per month). Annual plans also include a free 5-page website (Growth) or website + 3 client landing pages (Agency). 30-day money-back guarantee on all paid plans." },
  { q: "How do I get access?", a: "Join the waitlist below. We are inviting early users manually, in order of signup. When your spot opens, we will email you with a personal onboarding from the founder." },
  { q: "Which platforms does it support?", a: "Launching with LinkedIn, Instagram, and Facebook. X and TikTok are on the roadmap. Join the waitlist to hear when they go live." },
  { q: "What data do you store?", a: "We store your account information (name and email), encrypted OAuth tokens for the social accounts you connect, and the post drafts you create and approve. OAuth tokens are encrypted at rest using AES-256-GCM. You can request deletion of all your data at any time." },
  { q: "Does the AI learn from my posts?", a: "No. For US-based inference, we use Anthropic Claude Sonnet under Anthropic's Zero Data Retention agreement — your content is not stored by Anthropic after the AI call ends and is never used to train any AI model. For EU users, AI inference runs on AWS Bedrock eu-central-1, which does not store your prompts or use them for training by default." },
  { q: "Can I cancel at any time?", a: "Yes. No lock-in. Cancel your subscription, disconnect your social accounts, or request deletion of all your data from account settings at any time. Cancellation takes effect at end of billing period." },
];

function FAQSection() {
  return (
    <section
      aria-labelledby="faq-heading"
      style={{ backgroundColor: "var(--color-surface-muted)", padding: "var(--space-20) var(--space-4)" }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2
          id="faq-heading"
          style={{
            fontSize: "clamp(1.875rem, 4vw, 3rem)",
            fontWeight: "800",
            letterSpacing: "-0.03em",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            lineHeight: 1.1,
            marginBottom: "var(--space-10)",
            textAlign: "center",
          }}
        >
          Questions we get asked.
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="mk-faq-item">
              <summary
                style={{
                  padding: "var(--space-4) var(--space-5)",
                  fontSize: "var(--font-size-body)",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  minHeight: "var(--min-tap-target)",
                }}
              >
                {item.q}
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: "var(--font-size-h3)",
                    color: "var(--color-primary)",
                    marginLeft: "var(--space-4)",
                    flexShrink: 0,
                    fontWeight: "300",
                  }}
                >
                  +
                </span>
              </summary>
              <p
                style={{
                  margin: 0,
                  padding: "var(--space-4) var(--space-5) var(--space-5)",
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.75,
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-family)",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ⑩ Waitlist CTA
// ---------------------------------------------------------------------------

function WaitlistSection() {
  return (
    <section
      aria-labelledby="waitlist-cta-heading"
      id="waitlist-cta"
      className="mk-cta-bg"
      style={{ padding: "var(--space-24) var(--space-4)", position: "relative", overflow: "hidden" }}
    >
      <GeoGraphBackdrop opacity={0.35} />
      <div style={{ maxWidth: "520px", margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <h2
          id="waitlist-cta-heading"
          style={{
            fontSize: "clamp(2rem, 4vw, 3.25rem)",
            fontWeight: "800",
            letterSpacing: "-0.035em",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            lineHeight: 1.1,
            marginBottom: "var(--space-4)",
          }}
        >
          Your competitors aren&rsquo;t doing this yet.
        </h2>
        <p
          style={{
            fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            lineHeight: 1.75,
            marginBottom: "var(--space-10)",
          }}
        >
          TrustIndex AI is in pre-launch. Join the waitlist to secure founding
          member pricing and start building your GEO presence before they notice
          the shift.
        </p>

        <div style={{ textAlign: "left" }}>
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
