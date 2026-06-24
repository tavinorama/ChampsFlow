/**
 * /test — "The AI Invisibility Test" (free lead magnet)
 *
 * Server component shell — exports metadata + JSON-LD, delegates all
 * interactive state (form, results, scorecard) to InvisibilityTestClient.
 *
 * One buyer prompt × your brand vs one competitor → instant scorecard.
 * Step 1 (SEE) of the value ladder; CTA into the $29 Get-Cited Kit.
 */

import type { Metadata } from "next";
import { InvisibilityTestClient } from "./InvisibilityTestClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Free AI Invisibility Test — Are You Visible in AI Search?",
  description:
    "In 60 seconds, see whether ChatGPT, Claude, Perplexity, and Gemini recommend your brand or a competitor — across the real AI engines your buyers use. Free. No credit card.",
  alternates: { canonical: "https://trustindexai.com/test" },
  openGraph: {
    title: "Free AI Invisibility Test — Are You Visible in AI Search?",
    description:
      "In 60 seconds, see whether ChatGPT, Claude, Perplexity, and Gemini recommend your brand or a competitor. Free. No credit card.",
    url: "https://trustindexai.com/test",
    siteName: "TrustIndex AI",
    type: "website",
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Free AI Invisibility Test — TrustIndex AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Invisibility Test — Are You Visible in AI Search?",
    description:
      "In 60 seconds, see whether ChatGPT, Claude, Perplexity, and Gemini recommend your brand or a competitor. Free.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — WebApplication representing the free tool
// ---------------------------------------------------------------------------

const testJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "AI Invisibility Test",
  description:
    "Free tool: see whether ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview recommend your brand or a competitor when buyers ask about your category.",
  url: "https://trustindexai.com/test",
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
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "Free AI Invisibility Test", item: "https://trustindexai.com/test" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvisibilityTestPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "var(--space-12) var(--space-4) var(--space-20)",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(testJsonLd) }}
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
        Free &middot; 60 seconds &middot; no credit card
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
        Are you invisible to AI?
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          margin: "0 0 var(--space-6) 0",
        }}
      >
        When buyers ask ChatGPT, Claude, Perplexity and Gemini for the best option in your
        category, does AI name <strong>you</strong> &mdash; or your competitor? Find out now.
      </p>

      {/* Interactive form + scorecard — client component */}
      <InvisibilityTestClient />
    </main>
  );
}
