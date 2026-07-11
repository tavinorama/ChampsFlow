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
  title: "Free AI Invisibility Test — Does AI Know Your Name?",
  description:
    "People ask AI who to buy from. We check ChatGPT, Claude, Perplexity, and Gemini. See if it says your name — free, in 60 seconds.",
  alternates: { canonical: "https://ozvor.com/test" },
  openGraph: {
    title: "Free AI Invisibility Test — Does AI Know Your Name?",
    description:
      "People ask AI who to buy from. We check ChatGPT, Claude, Perplexity, and Gemini. See if it says your name. Free.",
    url: "https://ozvor.com/test",
    siteName: "Ozvor",
    type: "website",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Free AI Invisibility Test — Ozvor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Invisibility Test — Does AI Know Your Name?",
    description:
      "See if AI says your name — or your competitor's. Free, in 60 seconds.",
    images: ["https://ozvor.com/og-default.png"],
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
    "Free tool. We check: ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews. See if AI recommends you or a competitor.",
  url: "https://ozvor.com/test",
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
      { "@type": "ListItem", position: 2, name: "Free AI Invisibility Test", item: "https://ozvor.com/test" },
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
        Find out if AI picks you &mdash; or your competitor.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          margin: "0 0 var(--space-6) 0",
        }}
      >
        People ask ChatGPT, Claude, Perplexity, and Gemini who to buy from. See what they say
        about <strong>you</strong>. Free &mdash; takes 60 seconds.
      </p>

      {/* Interactive form + scorecard — client component */}
      <InvisibilityTestClient />
    </main>
  );
}
