/**
 * /ai-audit — the AI Audit Stack, PAID $49 one-time (founder 2026-08-15).
 *
 * Server component shell — exports metadata + JSON-LD (Product, Offer $49)
 * and the hero (the pitch, the price, what you get, the honest limit, the
 * three promised KPIs), then delegates all interactive state to
 * AiAuditClient. Same structure as /test (InvisibilityTestPage) + /kit.
 *
 * Email (mandatory) -> questionnaire -> POST /api/ai-audit/checkout ->
 * Stripe -> /ai-audit/[token] renders ONE niche tool + honest limitation +
 * the upsell ladder into OrganicPosts (full audit) + the free GEO test.
 */

import type { Metadata } from "next";
import { AiAuditClient } from "./AiAuditClient";
import { AI_AUDIT_PRICE_USD, COPY } from "./ai-audit-copy";
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
        alt: "AI Audit Stack by Ozvor",
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
// JSON-LD — Product with a $49 one-time Offer (same shape as /kit)
// ---------------------------------------------------------------------------

const auditJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "AI Audit Stack",
  description: COPY.metaDescription,
  url: "https://ozvor.com/ai-audit",
  brand: { "@type": "Brand", name: "Ozvor" },
  offers: {
    "@type": "Offer",
    price: String(AI_AUDIT_PRICE_USD),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: "https://ozvor.com/ai-audit",
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://ozvor.com" },
    { "@type": "ListItem", position: 2, name: "AI Audit Stack", item: "https://ozvor.com/ai-audit" },
  ],
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
// Offer — the price, what you get, the honest limit
// ---------------------------------------------------------------------------

function OfferBlock() {
  return (
    <section aria-label={COPY.hero.getTitle} style={{ margin: "0 0 var(--space-6)" }}>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-5)",
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 800, color: "var(--color-text)" }}>
          {COPY.hero.getTitle}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {COPY.hero.gets.map((g) => (
            <li key={g} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.6 }}>
              <span style={{ color: "var(--color-success)", fontWeight: 800 }}>&#10003;</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
        <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
          {COPY.hero.limitTitle}
        </p>
        <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>{COPY.hero.limit}</p>
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--font-size-body)", fontWeight: 800, color: "var(--color-primary)" }}>
          {COPY.hero.priceLine}
        </p>
      </div>
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
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
        <OfferBlock />

        {/* Email + questionnaire + $49 checkout — client component */}
        <AiAuditClient />
      </main>
    </>
  );
}
