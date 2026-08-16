/**
 * /ai-audit — the AI Audit Stack free entry check (lead magnet).
 *
 * Server component shell — exports metadata + JSON-LD and the hero (the pitch
 * plus the three promised KPIs), then delegates all interactive state to
 * AiAuditClient. Same structure as /test (InvisibilityTestPage).
 *
 * Questionnaire -> POST /api/ai-audit/entry -> ONE niche tool + honest
 * limitation + the upsell ladder into OrganicPosts (full audit) + GEO Search.
 */

import type { Metadata } from "next";
import { AiAuditClient } from "./AiAuditClient";
import { COPY } from "./ai-audit-copy";
import { safeJsonLd } from "../../../lib/safe-json-ld";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: { canonical: "https://ozvor.com/ai-audit" },
  openGraph: {
    title: COPY.metaTitle,
    description: COPY.metaDescription,
    url: "https://ozvor.com/ai-audit",
    siteName: "Ozvor",
    type: "website",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Free AI Stack Check by Ozvor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: COPY.metaTitle,
    description: COPY.metaDescription,
    images: ["https://ozvor.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — WebApplication representing the free tool
// ---------------------------------------------------------------------------

const auditJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Free AI Stack Check",
  description: COPY.metaDescription,
  url: "https://ozvor.com/ai-audit",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  provider: {
    "@type": "Organization",
    name: "Ozvor",
    url: "https://ozvor.com",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://ozvor.com" },
      { "@type": "ListItem", position: 2, name: "Free AI Stack Check", item: "https://ozvor.com/ai-audit" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Hero — the pitch + the three promised KPIs (Time, Effort, Money)
// ---------------------------------------------------------------------------

function KpiStrip() {
  return (
    <section aria-label={COPY.hero.kpiTitle} style={{ margin: "0 0 var(--space-6)" }}>
      <p
        style={{
          margin: "0 0 var(--space-3)",
          fontSize: "var(--font-size-caption)",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-muted)",
        }}
      >
        {COPY.hero.kpiTitle}
      </p>
      <ul
        style={{
          listStyle: "none",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-3)",
          margin: 0,
          padding: 0,
        }}
      >
        {COPY.hero.kpis.map((kpi) => (
          <li
            key={kpi.label}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              background: "var(--color-surface)",
            }}
          >
            <p
              style={{
                margin: "0 0 var(--space-1)",
                fontSize: "var(--font-size-body)",
                fontWeight: 800,
                color: "var(--color-primary)",
              }}
            >
              {kpi.label}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
              }}
            >
              {kpi.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiAuditPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(auditJsonLd) }}
      />

      <main
        id="start"
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-20)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
          scrollMarginTop: "72px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "var(--font-size-caption)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-primary)",
            marginBottom: "var(--space-2)",
          }}
        >
          {COPY.hero.kicker}
        </span>
        <h1
          style={{
            fontSize: "clamp(1.75rem, 4.5vw, 2.5rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            margin: "0 0 var(--space-3) 0",
          }}
        >
          {COPY.hero.title}
        </h1>
        <p
          style={{
            fontSize: "var(--font-size-body)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          {COPY.hero.lead}
        </p>

        <KpiStrip />

        {/* Interactive questionnaire + result — client component */}
        <AiAuditClient />
      </main>
    </>
  );
}
