/**
 * /pricing — Dedicated pricing page
 *
 * Standalone route for direct link-sharing, ads, and SEO.
 * Reuses the same pricing card layout as the landing page.
 * CTAs route to /login?plan=… (self-serve checkout) or /test (free tier).
 *
 * Static rendering: no dynamic data.
 */

import type { Metadata } from "next";
import { GeoGraphBackdrop } from "../../../components/marketing/GeoGraphBackdrop";
import { SoftCTA } from "../../../components/marketing/SoftCTA";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Pricing — Ozvor",
  description:
    "Ozvor pricing: Free audit, $99/mo Growth, $249/mo Agency. 30-day money-back guarantee. Founding members get 30% off annual plans.",
  alternates: { canonical: "https://ozvor.com/pricing" },
  openGraph: {
    title: "Pricing — Ozvor",
    description:
      "Free audit, $99/mo Growth, $249/mo Agency. 30-day money-back. Founding member discount on annual plans.",
    url: "https://ozvor.com/pricing",
    siteName: "Ozvor",
    type: "website",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Ozvor pricing — Free, Growth $99/mo, Agency $249/mo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Ozvor",
    description:
      "Free audit, $99/mo Growth, $249/mo Agency. 30-day money-back guarantee.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Ozvor — Pricing",
  description:
    "Pricing for Ozvor: Free (0$), Growth ($99/mo), Agency ($249/mo). 30-day money-back guarantee.",
  url: "https://ozvor.com/pricing",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://ozvor.com" },
      { "@type": "ListItem", position: 2, name: "Pricing", item: "https://ozvor.com/pricing" },
    ],
  },
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Growth", price: "99", priceCurrency: "USD", billingIncrement: "P1M" },
    { "@type": "Offer", name: "Agency", price: "249", priceCurrency: "USD", billingIncrement: "P1M" },
  ],
};

// ---------------------------------------------------------------------------
// Pricing card data
// ---------------------------------------------------------------------------

const PLANS = [
  {
    name: "Free",
    subtitle: "Run your first AI visibility audit.",
    price: "$0",
    period: "forever",
    annual: "No credit card required",
    features: [
      "1 brand",
      "3 competitors benchmarked",
      "50 buyer prompts / audit",
      "Monthly audit + TrustIndex Score",
      "Basic GEO content plan",
    ],
    ctaLabel: "Run the free test",
    ctaHref: "/test",
    featured: false,
  },
  {
    name: "Growth",
    subtitle: "For SMBs actively investing in AI visibility.",
    price: "$99",
    period: "/mo",
    annual: "Annual: $831/year — 30% founder discount ($69/mo)",
    features: [
      "1 brand",
      "10 competitors benchmarked",
      "250 buyer prompts / audit",
      "Weekly monitoring + answer-drift alerts",
      "Citation share tracking",
      "GEO content briefs (LinkedIn + website)",
      "Annual: free 5-page website (week 1)",
    ],
    ctaLabel: "Start Growth — $99/mo",
    ctaHref: "/login?plan=growth&next=checkout",
    featured: true,
  },
  {
    name: "Agency",
    subtitle: "For agencies managing multiple SMB clients.",
    price: "$249",
    period: "/mo",
    annual: "Annual: $2,091/year — 30% founder discount ($174/mo)",
    features: [
      "Multi-client dashboard (up to 25 brands)",
      "10 competitors per brand",
      "Weekly monitoring on every client",
      "White-label reports",
      "Client approval workflow",
      "Priority support · 4h SLA",
      "Annual: website + 3 client landings",
    ],
    ctaLabel: "Start Agency — $249/mo",
    ctaHref: "/login?plan=agency&next=checkout",
    featured: false,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  return (
    <main
      style={{ fontFamily: "var(--font-family)", color: "var(--color-text)" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />

      {/* Hero */}
      <section
        aria-labelledby="pricing-page-heading"
        className="mk-hero-bg"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "var(--space-20) var(--space-4) var(--space-16)",
          textAlign: "center",
        }}
      >
        <GeoGraphBackdrop opacity={0.35} />
        <div
          style={{
            maxWidth: "680px",
            margin: "0 auto",
            position: "relative",
            zIndex: 1,
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
              marginBottom: "var(--space-3)",
            }}
          >
            Simple, transparent pricing
          </span>
          <h1
            id="pricing-page-heading"
            style={{
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.08,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Replace a $30k/year specialist{" "}
            <span style={{ color: "var(--color-primary)" }}>
              for less than $100/month.
            </span>
          </h1>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.75,
              maxWidth: "54ch",
              margin: "0 auto",
            }}
          >
            30-day money-back guarantee &middot; Cancel any time &middot; No lock-in
            contracts
          </p>
        </div>
      </section>

      {/* Founder discount callout */}
      <section
        aria-label="Founder discount details"
        style={{
          padding: "var(--space-8) var(--space-4) 0",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div
          style={{
            maxWidth: "880px",
            margin: "0 auto",
            padding: "var(--space-5) var(--space-6)",
            background:
              "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
            border: "1.5px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            gap: "var(--space-4)",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flexShrink: 0, color: "var(--color-primary)" }}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ flex: "1 1 320px" }}>
            <p
              style={{
                margin: "0 0 var(--space-1) 0",
                fontSize: "var(--font-size-caption)",
                fontWeight: 700,
                color: "var(--color-primary)",
                fontFamily: "var(--font-family)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              Annual only &middot; 30% founder discount + free website
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-body)",
                fontWeight: 600,
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                lineHeight: 1.5,
              }}
            >
              Pay annually and you unlock the{" "}
              <strong style={{ fontWeight: 800 }}>30% founder discount</strong>{" "}
              &mdash; plus we&rsquo;ll{" "}
              <strong style={{ fontWeight: 800 }}>build you a professional website</strong>,
              delivered in week 1 of your onboarding. 5 pages, your copy, our
              design. Yours to keep.
            </p>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section
        aria-labelledby="plan-cards-heading"
        style={{
          backgroundColor: "var(--color-surface)",
          padding: "var(--space-10) var(--space-4) var(--space-20)",
        }}
      >
        <h2
          id="plan-cards-heading"
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Available plans
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-6)",
            maxWidth: "1120px",
            margin: "0 auto var(--space-8)",
            alignItems: "start",
          }}
        >
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            maxWidth: "60ch",
            margin: "0 auto",
            lineHeight: 1.7,
          }}
        >
          First 100 subscribers get the{" "}
          <strong style={{ color: "var(--color-success)", fontWeight: 700 }}>
            30% founder discount
          </strong>{" "}
          on annual plans ($831 Growth / $2,091 Agency per year) &mdash; applied
          only when you pay annually. All plans include a 30-day money-back guarantee.{" "}
          <a
            href="/book"
            style={{
              color: "var(--color-primary)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            book a personal onboarding call
          </a>{" "}
          with the founder.
        </p>
      </section>

      {/* FAQ teaser */}
      <section
        aria-labelledby="pricing-faq-heading"
        style={{
          padding: "var(--space-16) var(--space-4)",
          backgroundColor: "var(--color-surface-muted)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}>
          <h2
            id="pricing-faq-heading"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "0 0 var(--space-3) 0",
            }}
          >
            Questions?
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              margin: "0 0 var(--space-6) 0",
            }}
          >
            We have detailed answers about how billing works, what&rsquo;s included,
            cancellation, and the founder discount.
          </p>
          <a
            href="/#faq-heading"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 48,
              padding: "0 var(--space-6)",
              backgroundColor: "transparent",
              color: "var(--color-primary)",
              border: "1.5px solid var(--color-primary)",
              borderRadius: "var(--radius-md)",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            Read the FAQ
          </a>
        </div>
      </section>

      {/* Soft CTA nudge — free test for undecided visitors */}
      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 var(--space-4) var(--space-12)" }}>
        <SoftCTA
          headline="Not sure which plan? Start with the free test."
          subline="See your AI visibility score first — then the right tier becomes obvious."
          primary={{ label: "Run the free test →", href: "/test" }}
        />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PricingCard (local, self-contained)
// ---------------------------------------------------------------------------

function PricingCard({
  name,
  subtitle,
  price,
  period,
  annual,
  features,
  featured = false,
  ctaLabel,
  ctaHref,
}: {
  name: string;
  subtitle: string;
  price: string;
  period: string;
  annual: string;
  features: string[];
  featured?: boolean;
  ctaLabel: string;
  ctaHref: string;
}) {
  const textColor = featured ? "#f1f5f9" : "var(--color-text)";
  const mutedColor = featured ? "#94a3b8" : "var(--color-muted)";
  const checkColor = featured ? "#34d399" : "var(--color-success)";

  return (
    <article
      aria-label={`${name} plan — ${price}${period}`}
      className={featured ? "mk-featured-card" : "mk-regular-card"}
      style={{
        padding: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
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
            fontWeight: 700,
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

      <p
        style={{
          margin: "0 0 var(--space-2) 0",
          fontSize: "var(--font-size-caption)",
          fontWeight: 700,
          color: mutedColor,
          fontFamily: "var(--font-family)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {subtitle}
      </p>
      <h3
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: 800,
          color: textColor,
          fontFamily: "var(--font-family)",
          marginBottom: "var(--space-2)",
          marginTop: 0,
          letterSpacing: "-0.03em",
        }}
      >
        {name}
      </h3>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-1)",
          marginBottom: "var(--space-1)",
        }}
      >
        <span
          style={{
            fontSize: "clamp(2.25rem, 4vw, 3rem)",
            fontWeight: 800,
            color: textColor,
            fontFamily: "var(--font-family)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {price}
        </span>
        <span
          style={{
            fontSize: "var(--font-size-body)",
            color: mutedColor,
            fontFamily: "var(--font-family)",
          }}
        >
          {period}
        </span>
      </div>

      <p
        style={{
          fontSize: "var(--font-size-caption)",
          color: featured ? "#34D399" : "var(--color-muted)",
          fontFamily: "var(--font-family)",
          marginBottom: "var(--space-6)",
          marginTop: 0,
          fontWeight: 500,
        }}
      >
        {annual}
      </p>

      <ul
        aria-label={`${name} plan features`}
        style={{
          listStyle: "none",
          margin: "0 0 var(--space-8) 0",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          flexGrow: 1,
        }}
      >
        {features.map((f) => (
          <li
            key={f}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              fontSize: "var(--font-size-body-sm)",
              color: featured ? "#e2e8f0" : "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.6,
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: checkColor, fontWeight: 700, flexShrink: 0, lineHeight: 1.6 }}
            >
              &#10003;
            </span>
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
          fontWeight: 700,
          fontFamily: "var(--font-family)",
          textDecoration: "none",
          minHeight: "var(--min-button-height)",
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}
      >
        {ctaLabel}
      </a>
    </article>
  );
}
