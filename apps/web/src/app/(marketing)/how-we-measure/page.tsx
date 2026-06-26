/**
 * /how-we-measure — Methodology transparency page
 *
 * Server Component (no "use client"). Rendered inside the marketing layout
 * via the (marketing) route group, so no extra layout boilerplate needed.
 *
 * Content:
 *  - Hero: honest framing of what is and isn't measured
 *  - Three vector cards with exact weights from scoring.ts
 *  - Five AI engines table
 *  - Methodology commitment callout
 *  - Measured now vs roadmap table
 *  - SoftCTA
 */

import type { Metadata } from "next";
import { SoftCTA } from "../../../components/marketing/SoftCTA";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "How We Measure the TrustIndex Score | TrustIndex AI",
  description:
    "The exact methodology behind the TrustIndex Score: three vectors, five AI engines, and an honest account of what's measured vs. still on the roadmap.",
};

// ---------------------------------------------------------------------------
// Shared style helpers — tokens only, no magic numbers
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "var(--font-size-caption)",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--color-muted)",
  margin: "0 0 var(--space-1) 0",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "var(--font-size-h2)",
  fontWeight: 800,
  margin: "0 0 var(--space-6) 0",
  color: "var(--color-text)",
};

const inputRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "var(--space-3)",
  padding: "var(--space-2) 0",
  borderTop: "1px solid var(--color-border)",
  fontSize: "var(--font-size-body-sm)",
};

const weightBadgeStyle: React.CSSProperties = {
  fontSize: "var(--font-size-caption)",
  fontWeight: 700,
  color: "var(--color-primary)",
  backgroundColor: "var(--color-badge-ai-bg)",
  borderRadius: "var(--radius-pill)",
  padding: "2px var(--space-2)",
  whiteSpace: "nowrap" as const,
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function HowWeMeasurePage() {
  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "var(--space-12) var(--space-4) var(--space-16)",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      {/* ── Hero ── */}
      <header style={{ marginBottom: "var(--space-12)" }}>
        <h1
          style={{
            fontSize: "var(--font-size-h1)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            margin: "0 0 var(--space-4) 0",
            color: "var(--color-text)",
          }}
        >
          How we measure the TrustIndex Score
        </h1>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: 0,
            maxWidth: "600px",
          }}
        >
          Honest methodology — measured signals only, baselines labelled as such.
          Every number we show tells you whether it came from a live probe of your
          brand or from a neutral placeholder.
        </p>
      </header>

      {/* ── Three vectors ── */}
      <section aria-labelledby="vectors-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="vectors-heading" style={sectionHeadingStyle}>
          Three vectors, one score
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          The TrustIndex Score is a weighted average of three sub-scores. Each
          sub-score is an integer from 0 to 100. The overall formula is:
        </p>
        <div
          aria-label="Score formula"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4) var(--space-5)",
            fontFamily: "monospace",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-text)",
            marginBottom: "var(--space-8)",
            lineHeight: 1.6,
          }}
        >
          Overall = AI&nbsp;&times;&nbsp;0.35 + Performance&nbsp;&times;&nbsp;0.35 + Brand&nbsp;&times;&nbsp;0.30
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

          {/* AI Vector */}
          <article aria-labelledby="vector-ai-heading" style={cardStyle}>
            <p style={labelStyle}>35% of overall score</p>
            <h3
              id="vector-ai-heading"
              style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
            >
              AI Vector
            </h3>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              Are you cited in AI answers?
            </p>

            <div>
              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Citation Rate
                </span>
                <span style={weightBadgeStyle}>50% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Fraction of buyer prompts where an AI engine mentioned your brand. We
                run each prompt multiple times (repeat=3 in live mode) and compute a
                mention rate — not a single coin flip.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Position Score
                </span>
                <span style={weightBadgeStyle}>30% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                When you are cited, how high? Position 1 = full credit (1.0),
                position 2 = 0.5, position 3 = 0.33, and so on. Zero if never cited.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Sentiment
                </span>
                <span style={weightBadgeStyle}>20% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 0 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                We classify the text around each brand mention as positive, neutral,
                or negative using a deterministic phrase-matching classifier. Positive
                = 1.0, neutral = 0.5, negative = 0.
              </p>
            </div>

            <div
              aria-label="AI vector formula"
              style={{
                marginTop: "var(--space-4)",
                backgroundColor: "var(--color-surface-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
                fontFamily: "monospace",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              AI = clamp((citationRate&times;0.50 + positionScore&times;0.30 + sentiment&times;0.20) &times; 100, 0, 100)
            </div>
          </article>

          {/* Performance Vector */}
          <article aria-labelledby="vector-performance-heading" style={cardStyle}>
            <p style={labelStyle}>35% of overall score</p>
            <h3
              id="vector-performance-heading"
              style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
            >
              Performance Vector
            </h3>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              Technical visibility and citation share.
            </p>

            <div>
              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Citation share-of-voice vs competitors
                </span>
                <span style={weightBadgeStyle}>30% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Your citation rate relative to the brands you benchmarked against.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Schema.org coverage
                </span>
                <span style={weightBadgeStyle}>30% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Are your pages marked up with standard structured data? This is
                standard SEO hygiene — Google&rsquo;s 2026 documentation confirms no
                &ldquo;special AI schema&rdquo; is required.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  AI-crawler access
                </span>
                <span style={weightBadgeStyle}>25% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                What fraction of AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
                Google-Extended) can access your site?
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Google AI Overview presence
                </span>
                <span style={weightBadgeStyle}>15% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 0 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Are you cited in AI Overviews? Requires SERP data — shown as 0 when
                not configured.
              </p>
            </div>

            <div
              aria-label="Performance vector formula"
              style={{
                marginTop: "var(--space-4)",
                backgroundColor: "var(--color-surface-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
                fontFamily: "monospace",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              Performance = clamp((shareOfVoice&times;0.30 + schemaCoverage&times;0.30 + crawlerAccess&times;0.25 + aioPresence&times;0.15) &times; 100, 0, 100)
            </div>
          </article>

          {/* Brand Vector */}
          <article aria-labelledby="vector-brand-heading" style={cardStyle}>
            <p style={labelStyle}>30% of overall score</p>
            <h3
              id="vector-brand-heading"
              style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
            >
              Brand Vector
            </h3>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              Entity authority and off-site presence.
            </p>

            <div>
              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Entity completeness
                </span>
                <span style={weightBadgeStyle}>40% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                How complete is your brand&rsquo;s entry in Wikidata/Wikipedia? We
                check official website, industry, founding date, description, LinkedIn,
                and Crunchbase links.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  Citation volume
                </span>
                <span style={weightBadgeStyle}>40% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 var(--space-3) 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Raw mention count across the AI engines we probe, normalised to 0&ndash;1.
              </p>

              <div style={inputRowStyle}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  E-E-A-T signal
                </span>
                <span style={weightBadgeStyle}>20% of vector</span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                  margin: "var(--space-1) 0 0 0",
                  paddingLeft: "var(--space-1)",
                }}
              >
                Blends your Reddit footprint (threads, subreddits, sentiment),
                off-site authority (presence on the 7 highest-AI-cited sources:
                Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube),
                and on-site identity signals from a live crawl of your homepage.
              </p>
            </div>

            <div
              aria-label="Brand vector formula"
              style={{
                marginTop: "var(--space-4)",
                backgroundColor: "var(--color-surface-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
                fontFamily: "monospace",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              Brand = clamp((entityCompleteness&times;0.40 + citationVolume&times;0.40 + eeaSignal&times;0.20) &times; 100, 0, 100)
            </div>
          </article>
        </div>
      </section>

      {/* ── The 5 engines ── */}
      <section aria-labelledby="engines-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="engines-heading" style={sectionHeadingStyle}>
          The 5 engines we probe
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          We query each engine through its official API. We never scrape web
          interfaces or browser sessions.
        </p>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--color-surface-muted)",
                  textAlign: "left",
                }}
              >
                <th style={thStyle}>Engine</th>
                <th style={thStyle}>API used</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}><strong>ChatGPT (GPT-4o)</strong></td>
                <td style={tdStyle}>OpenAI Chat Completions API</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}><strong>Claude (claude-3-5-sonnet)</strong></td>
                <td style={tdStyle}>Anthropic Messages API</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}><strong>Perplexity</strong></td>
                <td style={tdStyle}>Perplexity API (returns citation URLs natively)</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}><strong>Gemini</strong></td>
                <td style={tdStyle}>Google Generative Language API</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}><strong>Google AI Overview</strong></td>
                <td style={tdStyle}>DataForSEO SERP API (captures real SERP results including AI Overviews)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Methodology commitment ── */}
      <section aria-labelledby="commitment-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="commitment-heading" style={sectionHeadingStyle}>
          Our methodology commitment
        </h2>

        <blockquote
          style={{
            backgroundColor: "var(--color-teal-surface)",
            border: "1px solid var(--color-teal-border)",
            borderLeft: "4px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            margin: 0,
          }}
        >
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
              lineHeight: 1.8,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            We query each AI engine through its official API and record whether your
            brand is cited, where in the answer it appears, and how it is described.
            We never scrape LLM web interfaces. We repeat each probe multiple times
            and report a mention rate — not a single test — so results are more
            reliable.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            Every score shows &ldquo;Measured&rdquo; (real signal from this audit) or
            &ldquo;Baseline&rdquo; (a neutral placeholder shown transparently when a
            data source is not yet connected) so you always know exactly how confident
            each number is.
          </p>
        </blockquote>
      </section>

      {/* ── Measured vs roadmap ── */}
      <section aria-labelledby="roadmap-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="roadmap-heading" style={sectionHeadingStyle}>
          What we measure vs. what&rsquo;s coming
        </h2>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-muted)", textAlign: "left" }}>
                <th style={{ ...thStyle, color: "var(--color-success)" }}>Measured now</th>
                <th style={{ ...thStyle, color: "var(--color-muted)" }}>Still on the roadmap</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "ChatGPT, Claude, Perplexity, Gemini citations",
                  "Real-time daily monitoring (requires API budget)",
                ],
                [
                  "Google AI Overview (via SERP API)",
                  "Bing AI, other emerging engines",
                ],
                [
                  "Reddit presence (threads, subreddits, sentiment)",
                  "Quora, niche forums",
                ],
                [
                  "Wikidata/Wikipedia entity consistency",
                  "Crunchbase, LinkedIn automated cross-check",
                ],
                [
                  "On-site schema, crawler access",
                  "Freshness / content age signals",
                ],
                [
                  "Multi-page content citation-worthiness",
                  "Auto-schema generation",
                ],
              ].map(([measured, roadmap], idx) => (
                <tr key={idx} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ ...tdStyle, color: "var(--color-success)", fontWeight: 500 }}>
                    {measured}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--color-muted)" }}>
                    {roadmap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── SoftCTA ── */}
      <SoftCTA
        headline="See how your brand actually scores"
        subline="Free AI visibility test — takes 30 seconds, no credit card."
        primary={{ label: "Run the free test", href: "/test" }}
        secondary={{ label: "View pricing", href: "/pricing" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table style helpers (local to this page)
// ---------------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  fontWeight: 700,
  color: "var(--color-muted)",
  whiteSpace: "nowrap",
  fontSize: "var(--font-size-caption)",
};

const tdStyle: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  color: "var(--color-text)",
  verticalAlign: "top",
  lineHeight: 1.5,
};
