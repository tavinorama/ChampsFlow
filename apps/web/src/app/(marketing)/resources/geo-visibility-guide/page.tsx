/**
 * Resource preview: GEO Visibility Guide
 * Route: /resources/geo-visibility-guide
 *
 * Shows Table of Contents + first ~500 words of the guide.
 * Gated: full content requires waitlist signup (email deliverable).
 *
 * Design system: all values from tokens.css.
 * Static rendering: no dynamic data.
 */

import type { Metadata } from "next";
import { WaitlistForm } from "../../../../components/marketing/WaitlistForm";

export const metadata: Metadata = {
  title: "GEO Visibility Guide — How to Get Cited by ChatGPT | TrustIndex AI",
  description:
    "A 30-page guide on Generative Engine Optimization for small businesses. Preview the table of contents and first section — sign up to get the full guide.",
  alternates: {
    canonical: "https://trustindexai.com/resources/geo-visibility-guide",
  },
  openGraph: {
    title:
      "GEO Visibility Guide — How to Get Cited by ChatGPT | TrustIndex AI",
    description:
      "A 30-page guide on Generative Engine Optimization for small businesses.",
    url: "https://trustindexai.com/resources/geo-visibility-guide",
    siteName: "TrustIndex AI",
    type: "website",
  },
};

const TOC = [
  "Part 1: The AI Search Shift",
  "Part 2: How LLMs Decide What to Cite",
  "Part 3: The Anatomy of a Citation-Worthy Post",
  "Part 4: A Four-Week GEO Posting Schedule",
  "Part 5: Platform-Specific Guidance (LinkedIn, Instagram, Facebook)",
  "Appendix: Research Sources and Further Reading",
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GeoVisibilityGuidePage() {
  return (
    <>
      <article
        aria-labelledby="geo-guide-heading"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4)",
        }}
      >
        {/* Header */}
        <header style={{ marginBottom: "var(--space-8)" }}>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Free resource &middot; 30-page PDF guide
          </p>
          <h1
            id="geo-guide-heading"
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.2,
              marginBottom: "var(--space-4)",
            }}
          >
            The GEO Visibility Guide
          </h1>
          <p
            style={{
              fontSize: "var(--font-size-h3)",
              lineHeight: "var(--line-height-h3)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity
            in 2026
          </p>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
            }}
          >
            by TrustIndex AI &middot; Version v1.0 &middot; 2026
          </p>
        </header>

        {/* Table of contents */}
        <section aria-label="Table of contents">
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            What&rsquo;s inside
          </h2>
          <ol
            style={{
              padding: "0 0 0 var(--space-6)",
              margin: "0 0 var(--space-8) 0",
            }}
          >
            {TOC.map((item) => (
              <li
                key={item}
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: "var(--line-height-body)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  marginBottom: "var(--space-2)",
                }}
              >
                {item}
              </li>
            ))}
          </ol>
        </section>

        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--color-border)",
            margin: "var(--space-8) 0",
          }}
        />

        {/* Preview: Who This Is For */}
        <section aria-label="Guide preview">
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            Who This Is For (preview)
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            This guide is written for three types of people: the small business
            owner who manages their own social presence and has heard &ldquo;you
            should be on LinkedIn&rdquo; more times than they can count; the
            solo marketer stretched across email, ads, SEO, and social at a
            10&ndash;50 person company; and the freelance social media manager
            who runs accounts for three to eight clients and needs a framework
            they can actually use.
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            What you get: a plain-English explanation of Generative Engine
            Optimization (GEO), why it matters for businesses that are not big
            brands, what the research says about which content gets cited by AI
            systems, and a specific four-week schedule you can start this week.
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            What you do not get: a guarantee that any of this will result in
            your business being cited by ChatGPT or Perplexity. No one can
            promise that. What the research shows &mdash; and what this guide
            covers &mdash; is that certain content practices are significantly
            more likely to earn citations than others. That is the honest version
            of what GEO offers.
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
              fontStyle: "italic",
            }}
          >
            If you are a solo founder with limited time, start with Parts 3
            and 4.
          </p>
        </section>

        {/* Gate: rest of guide requires signup */}
        <div
          style={{
            position: "relative",
            marginTop: "var(--space-6)",
          }}
        >
          {/* Fade out preview */}
          <div
            aria-hidden="true"
            style={{
              height: "80px",
              background:
                "linear-gradient(to bottom, transparent, var(--color-surface))",
              marginBottom: "calc(-1 * var(--space-4))",
            }}
          />

          {/* Gate card */}
          <div
            style={{
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-8)",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                fontSize: "var(--font-size-h2)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                marginBottom: "var(--space-3)",
                marginTop: 0,
              }}
            >
              Get the full 30-page guide
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
              Join the TrustIndex AI waitlist and receive the complete GEO
              Visibility Guide by email. Includes the four-week posting
              schedule, platform-specific guidance, and all research sources.
              Free with your waitlist signup.
            </p>
            <div style={{ maxWidth: "400px", margin: "0 auto" }}>
              <WaitlistForm compact />
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
