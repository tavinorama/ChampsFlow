/**
 * /kit — "The Get-Cited Kit" ($29 one-time) offer + checkout.
 *
 * Server component shell — exports metadata + JSON-LD, delegates all
 * interactive state (form, checkout) to the KitCheckoutForm client component.
 */

import type { Metadata } from "next";
import { KitCheckoutForm } from "./KitCheckoutForm";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "The Get-Cited Kit — Full AI Visibility Audit + 3 Ready Drafts ($29)",
  description:
    "One-time $29. Know exactly why you're invisible in AI search — get your full TrustIndex audit, your top 3 fixes, and 3 ready-to-publish content drafts. No subscription required.",
  alternates: { canonical: "https://trustindexai.com/kit" },
  openGraph: {
    title: "The Get-Cited Kit — Full AI Audit + 3 Ready Drafts for $29",
    description:
      "One-time $29. Know exactly why you're invisible in AI search — full TrustIndex audit, top 3 fixes, 3 ready-to-publish drafts. No subscription.",
    url: "https://trustindexai.com/kit",
    siteName: "TrustIndex AI",
    type: "website",
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "The Get-Cited Kit — Full AI Audit + 3 Ready Drafts for $29",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Get-Cited Kit — Full AI Audit + 3 Ready Drafts for $29",
    description:
      "One-time $29. Know exactly why you're invisible in AI search. No subscription.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — Product with Offer ($29)
// ---------------------------------------------------------------------------

const kitJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "The Get-Cited Kit",
  description:
    "Full AI Visibility Audit across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview — plus your TrustIndex Score, your top 3 highest-impact fixes, and 3 ready-to-publish content drafts (blog, LinkedIn, FAQ with schema.org markup). Includes a GEO guide PDF and a 30-day re-test voucher.",
  url: "https://trustindexai.com/kit",
  brand: {
    "@type": "Brand",
    name: "TrustIndex AI",
  },
  offers: {
    "@type": "Offer",
    price: "29",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: "https://trustindexai.com/kit",
    priceValidUntil: "2027-12-31",
    seller: {
      "@type": "Organization",
      name: "TrustIndex AI",
      url: "https://trustindexai.com",
    },
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "Get-Cited Kit", item: "https://trustindexai.com/kit" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KitPage() {
  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "var(--space-12) var(--space-4) var(--space-20)",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(kitJsonLd) }}
      />

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
        One-time &middot; $29 &middot; no subscription
      </span>
      <h1
        style={{
          fontSize: "clamp(2rem, 5vw, 3rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "0 0 var(--space-3) 0",
        }}
      >
        The Get-Cited Kit
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          margin: "0 0 var(--space-4) 0",
        }}
      >
        You know you&rsquo;re invisible. This is the first step out: the full picture of{" "}
        <em>why</em>, plus 3 pieces of content{" "}
        <strong>written for you</strong> and ready to publish today. No subscription, no
        GEO degree required.
      </p>
      <p
        style={{
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          margin: "0 0 var(--space-6) 0",
          padding: "var(--space-3) var(--space-4)",
          borderLeft: "4px solid var(--color-primary)",
          backgroundColor: "var(--color-surface-muted)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        The free test tells you <strong>if</strong> you&rsquo;re invisible. The Kit tells
        you <strong>why</strong>, on which questions, and{" "}
        <strong>what to publish</strong> to change it &mdash; then weekly Plans keep it
        from slipping back.
      </p>

      {/* Interactive checkout form — client component */}
      <KitCheckoutForm />
    </main>
  );
}
