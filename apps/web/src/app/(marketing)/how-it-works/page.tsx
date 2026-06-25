/**
 * /how-it-works — Sales-led buyer page (server component, static).
 *
 * Structure:
 *  0. Metadata + JSON-LD
 *  1. Hero — "Get recommended when AI answers your customers"
 *  2. Why AI search visibility matters now (3 stat cards)
 *  3. How TrustIndex AI gets you cited (5 numbered outcome steps)
 *  4. Google alignment proof (kept from previous page)
 *  5. Trust strip (customer-benefit framing of safety/compliance)
 *  6. Final CTA → /test
 *
 * Operational system status (tool cards, API keys, connection badges) has
 * moved to /account/system-status for authenticated users.
 */

import type { Metadata } from "next";
import { BookCallButton } from "../../../components/BookCallButton";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "How TrustIndex AI Works — Get Recommended by AI Search",
  description:
    "When someone asks ChatGPT, Claude, Perplexity, or Google who's the best in your category, TrustIndex AI shows you whether you're one of the named businesses — and exactly how to get there.",
  alternates: { canonical: "https://trustindexai.com/how-it-works" },
  openGraph: {
    title: "How TrustIndex AI Works — Get Recommended by AI Search",
    description:
      "Audit → Score → Plan → Publish → Monitor. The 5-step loop that gets SMBs cited by AI answer engines.",
    url: "https://trustindexai.com/how-it-works",
    siteName: "TrustIndex AI",
    type: "website",
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "How TrustIndex AI Works — Get Recommended by AI Search",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "How TrustIndex AI Works — Get Recommended by AI Search",
    description:
      "Audit → Score → Plan → Publish → Monitor. The 5-step loop that gets SMBs cited by AI answer engines.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — WebPage with a HowTo structure describing the 5-step process
// ---------------------------------------------------------------------------

const howItWorksJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "How TrustIndex AI Works — Get Recommended by AI Search",
  description:
    "Audit → Score → Plan → Publish → Monitor. The 5-step loop that gets SMBs cited by AI answer engines.",
  url: "https://trustindexai.com/how-it-works",
  isPartOf: {
    "@type": "WebSite",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "How it works", item: "https://trustindexai.com/how-it-works" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HowItWorksPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howItWorksJsonLd) }}
      />
      <HeroSection />
      <WhyItMattersSection />
      <HowWeGetYouCitedSection />
      <GoogleAlignmentSection />
      <TrustStripSection />
      <FinalCtaSection />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section
      aria-labelledby="hiw-hero-heading"
      className="mk-hero-bg"
      style={{
        padding: "var(--space-24) var(--space-4) var(--space-20)",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
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
          How TrustIndex AI works
        </div>

        <h1
          id="hiw-hero-heading"
          style={{
            fontSize: "clamp(2rem, 4.5vw, 3.25rem)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
            color: "var(--color-text)",
            margin: "0 0 var(--space-5) 0",
            textWrap: "balance",
          }}
        >
          Get recommended when AI{" "}
          <span style={{ color: "var(--color-primary)" }}>
            answers your customers.
          </span>
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
            color: "var(--color-muted)",
            lineHeight: 1.75,
            maxWidth: "60ch",
            margin: "0 auto var(--space-10) auto",
          }}
        >
          When someone asks ChatGPT, Claude, Perplexity, or Google &ldquo;who&rsquo;s the
          best [your category]?&rdquo;, the answer names two or three businesses — not
          ten links. TrustIndex AI shows you whether you&rsquo;re one of them, and
          exactly how to get there.
        </p>

        <a
          href="/test"
          style={{
            display: "inline-block",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "var(--font-size-body)",
            textDecoration: "none",
            padding: "0 var(--space-8)",
            height: "52px",
            lineHeight: "52px",
            borderRadius: "var(--radius-md)",
            letterSpacing: "-0.01em",
          }}
        >
          Run your free AI Visibility Test &#8594;
        </a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Why AI search visibility matters now
// ---------------------------------------------------------------------------

const STATS = [
  {
    figure: "~25%",
    label: "Projected drop in traditional search volume by 2026",
    source: "Gartner, Feb 2024",
  },
  {
    figure: "200M+",
    label: "ChatGPT weekly users by Aug 2024, and growing",
    source: "OpenAI / Axios, Aug 2024",
  },
  {
    figure: "68%",
    label: "Of marketers already changing strategy for AI search",
    source: "BrightEdge, June 2025",
  },
];

function WhyItMattersSection() {
  return (
    <section
      aria-labelledby="why-matters-heading"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        padding: "var(--space-20) var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <p
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "var(--font-size-caption)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-primary)",
          }}
        >
          The shift
        </p>
        <h2
          id="why-matters-heading"
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "var(--color-text)",
            margin: "0 0 var(--space-5) 0",
          }}
        >
          Why AI search visibility matters now
        </h2>

        <p
          style={{
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
            lineHeight: 1.75,
            maxWidth: "68ch",
            margin: "0 0 var(--space-10) 0",
          }}
        >
          AI answer engines increasingly reply with a short answer that names 2&ndash;3
          businesses instead of a page of links. There is no page 2 to scroll to
          &mdash; you&rsquo;re either in the answer or invisible.
        </p>

        {/* Stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--space-5)",
            marginBottom: "var(--space-10)",
          }}
        >
          {STATS.map((s) => (
            <div
              key={s.figure}
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <p
                style={{
                  margin: "0 0 var(--space-2) 0",
                  fontSize: "clamp(2rem, 4vw, 2.75rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  color: "var(--color-primary)",
                }}
              >
                {s.figure}
              </p>
              <p
                style={{
                  margin: "0 0 var(--space-1) 0",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  lineHeight: 1.5,
                }}
              >
                {s.label}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                }}
              >
                {s.source}
              </p>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            maxWidth: "68ch",
          }}
        >
          For a small business, being missing from the AI&rsquo;s answer means being
          invisible to a fast-growing share of buyers &mdash; and early presence
          compounds, because engines build on what&rsquo;s already established.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — How TrustIndex AI gets you cited (5 outcome steps)
// ---------------------------------------------------------------------------

const OUTCOME_STEPS = [
  {
    n: 1,
    title: "Audit",
    body: "We ask the real AI engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overview) the buyer-intent questions your customers actually ask — and capture whether your brand gets named, how it’s described, and which competitors are cited instead.",
  },
  {
    n: 2,
    title: "Score",
    body: "You get your TrustIndex Score across three vectors — Brand, Performance, and AI visibility — one number you can track over time.",
  },
  {
    n: 3,
    title: "Plan",
    body: "We turn every gap into a prioritized action plan, ranked by impact vs. effort, so you know exactly what to fix first.",
  },
  {
    n: 4,
    title: "Publish",
    body: "You get ready-to-publish content drafts (with schema.org markup) written to the traits that actually earn AI citations — specific, sourced, and focused.",
  },
  {
    n: 5,
    title: "Monitor",
    body: "On a paid plan we re-run your audit weekly and alert you when a competitor displaces you or an engine drops you, so your gains don’t go stale.",
  },
];

function HowWeGetYouCitedSection() {
  return (
    <section
      aria-labelledby="how-cited-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        padding: "var(--space-20) var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <p
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "var(--font-size-caption)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-primary)",
          }}
        >
          The process
        </p>
        <h2
          id="how-cited-heading"
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "var(--color-text)",
            margin: "0 0 var(--space-10) 0",
          }}
        >
          How TrustIndex AI gets you cited
        </h2>

        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-5)",
          }}
        >
          {OUTCOME_STEPS.map((step) => (
            <li
              key={step.n}
              style={{
                display: "flex",
                gap: "var(--space-5)",
                alignItems: "flex-start",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Number circle */}
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--font-size-body)",
                }}
              >
                {step.n}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3
                  style={{
                    fontSize: "var(--font-size-h2)",
                    fontWeight: 700,
                    margin: "0 0 var(--space-2) 0",
                    color: "var(--color-text)",
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Google alignment proof (kept from original page)
// ---------------------------------------------------------------------------

const GOOGLE_QA = [
  {
    q: "Does the advice cite official Google documentation?",
    a: "Yes. Our scoring and guidance reference Google’s official generative-AI guide. We score crawlability and genuine, useful content — the levers Google endorses.",
  },
  {
    q: "Is it aligned with Google’s guidance?",
    a: "Yes. We do NOT score llms.txt, ‘special AI schema’, or artificial mentions — Google says these aren’t required, so they don’t affect your score. Schema is treated as standard SEO hygiene.",
  },
  {
    q: "Does the tool admit it lacks Google’s internal ranking data?",
    a: "Yes — and we’re upfront about it. Our scores are evidence-based, directional estimates, never a claim of Google ‘approval’ or access to internal ranking signals. You always see what’s measured vs. our baseline.",
  },
];

const COMPARISON_ROWS = [
  ["AI engines covered", "Google only", "ChatGPT, Claude, Perplexity, Gemini + Google AI Overview"],
  ["Competitor benchmark", "—", "Who AI recommends instead of you"],
  ["What AI says about you", "—", "Citation evidence + sentiment per answer"],
  ["A plan to improve", "—", "Prioritized GEO plan + content drafts"],
  ["Scope", "Your own site only", "Your brand across the whole AI-answer surface"],
];

function GoogleAlignmentSection() {
  return (
    <section
      aria-labelledby="google-alignment-heading"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        padding: "var(--space-20) var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h2
            id="google-alignment-heading"
            style={{
              fontSize: "clamp(1.375rem, 2.5vw, 1.875rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 var(--space-2) 0",
              color: "var(--color-text)",
            }}
          >
            Aligned with Google&rsquo;s official AI-search guidance
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: "0 0 var(--space-6) 0",
              maxWidth: "64ch",
            }}
          >
            In 2026 Google published a{" "}
            <a
              href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-primary)", fontWeight: 600 }}
            >
              generative-AI optimization guide
            </a>{" "}
            and three questions to vet any GEO vendor. Here is how we answer them
            &mdash; and where we go beyond Google&rsquo;s own tools.
          </p>

          {/* Q&A */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
              marginBottom: "var(--space-8)",
            }}
          >
            {GOOGLE_QA.map(({ q, a }) => (
              <div
                key={q}
                style={{
                  borderLeft: "3px solid var(--color-success)",
                  paddingLeft: "var(--space-4)",
                }}
              >
                <p
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 700,
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-1) 0",
                  }}
                >
                  &#10003; {q}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {a}
                </p>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <h3
            style={{
              fontSize: "var(--font-size-body)",
              fontWeight: 700,
              margin: "0 0 var(--space-3) 0",
              color: "var(--color-text)",
            }}
          >
            Google Search Console vs. TrustIndex AI
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "var(--font-size-caption)",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "var(--color-muted)" }}>
                  <th
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    What you get
                  </th>
                  <th
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    Google Search Console AI report
                  </th>
                  <th
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    TrustIndex AI
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row[0]}>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid var(--color-border)",
                        fontWeight: 600,
                      }}
                    >
                      {row[0]}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      {row[1]}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-success)",
                        fontWeight: 600,
                      }}
                    >
                      {row[2]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: "var(--space-4) 0 0 0",
            }}
          >
            Search Console tells you that you appeared in Google&rsquo;s AI features.
            TrustIndex AI tells you why, against whom, across every major AI engine
            &mdash; and what to do next.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trust strip — customer-benefit framing
// ---------------------------------------------------------------------------

const TRUST_BULLETS = [
  "Your data is encrypted and never sold.",
  "We never fabricate claims — drafts use your real facts or flag placeholders.",
  "Every score is evidence-based and labeled, so you can trust the number.",
  "Built for GDPR, LGPD & CCPA from day one.",
];

function TrustStripSection() {
  return (
    <section
      aria-labelledby="trust-strip-heading"
      style={{ padding: "var(--space-16) var(--space-4)" }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div
          style={{
            backgroundColor: "var(--color-teal-surface)",
            border: "1px solid var(--color-teal-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
          }}
        >
          <h2
            id="trust-strip-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 700,
              color: "var(--color-text)",
              margin: "0 0 var(--space-5) 0",
            }}
          >
            Built on trust, not marketing promises
          </h2>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {TRUST_BULLETS.map((bullet) => (
              <li
                key={bullet}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-3)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                  lineHeight: 1.65,
                }}
              >
                <CheckCircleIcon />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CheckCircleIcon() {
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

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCtaSection() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="mk-cta-bg"
      style={{
        padding: "var(--space-20) var(--space-4)",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <h2
          id="final-cta-heading"
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "var(--color-text)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          See where you stand
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-8) 0",
          }}
        >
          Find out in 60 seconds whether AI search engines are naming your
          business or a competitor. No credit card required.
        </p>

        <a
          href="/test"
          style={{
            display: "inline-block",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "var(--font-size-body)",
            textDecoration: "none",
            padding: "0 var(--space-8)",
            height: "52px",
            lineHeight: "52px",
            borderRadius: "var(--radius-md)",
            letterSpacing: "-0.01em",
            marginBottom: "var(--space-4)",
          }}
        >
          Run your free AI Visibility Test &#8594;
        </a>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            justifyContent: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <a
            href="/#pricing"
            style={{
              color: "var(--color-primary)",
              fontWeight: 600,
              fontSize: "var(--font-size-body-sm)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Compare Growth &amp; Agency plans &#8594;
          </a>
          <BookCallButton label="Book a strategy call" variant="secondary" />
        </div>
      </div>
    </section>
  );
}
