/**
 * /how-we-measure — Methodology transparency page
 *
 * Server Component (no "use client"). Rendered inside the marketing layout
 * via the (marketing) route group, so no extra layout boilerplate needed.
 *
 * Content:
 *  - Hero: three distinct scores under one umbrella
 *  - Section 1: Visibility Score
 *  - Section 2: Citation Readiness Score
 *  - Section 3: Execution Progress
 *  - Section 4: Five AI engines table
 *  - Section 5: Methodology commitment callout
 *  - Measured now vs roadmap table
 *  - SoftCTA
 */

import type { Metadata } from "next";
import { SoftCTA } from "../../../components/marketing/SoftCTA";
import { THREE_SCORE_COLORS } from "../../../components/TrustIndexScorecard";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "How We Measure the Ozvor AI Visibility Score | Ozvor",
  description:
    "The exact methodology behind the Ozvor AI Visibility Score: three distinct sub-scores (Visibility, Citation Readiness, Execution), five AI engines, and an honest account of what's measured.",
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

const formulaBoxStyle: React.CSSProperties = {
  marginTop: "var(--space-4)",
  backgroundColor: "var(--color-surface-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3) var(--space-4)",
  fontFamily: "monospace",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-muted)",
};

const honestNoteStyle: React.CSSProperties = {
  marginTop: "var(--space-4)",
  padding: "var(--space-3) var(--space-4)",
  backgroundColor: "var(--color-teal-surface)",
  border: "1px solid var(--color-teal-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text)",
  lineHeight: 1.7,
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
          How we measure the Ozvor AI Visibility Score
        </h1>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-4) 0",
            maxWidth: "600px",
          }}
        >
          The Ozvor AI Visibility Score is one umbrella number made up of{" "}
          <strong style={{ color: "var(--color-text)" }}>three distinct sub-scores</strong>:{" "}
          Visibility, Citation Readiness, and Execution. Each measures something different,
          and each is something you can act on. Here is exactly how each is computed.
        </p>
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
          Every number tells you whether it came from a live probe of your brand
          or from a neutral placeholder.
        </p>
      </header>

      {/* ── Three scores umbrella ── */}
      <section aria-labelledby="umbrella-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="umbrella-heading" style={sectionHeadingStyle}>
          Three sub-scores, one umbrella
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          The three sub-scores are not replacements for each other — they answer
          three different questions about your brand&rsquo;s position in AI search.
        </p>
        <div
          aria-label="Three scores overview"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-8)",
          }}
        >
          {[
            {
              label: "Visibility",
              color: THREE_SCORE_COLORS.visibility,
              tagline: "What AI engines see",
              desc: "Based on real AI probes — how often, how high, how well.",
            },
            {
              label: "Citation Readiness",
              color: THREE_SCORE_COLORS.citationReadiness,
              tagline: "How ready you are to be cited",
              desc: "Site signals + entity authority you can directly improve.",
            },
            {
              label: "Execution",
              color: THREE_SCORE_COLORS.executionProgress,
              tagline: "How much you've done",
              desc: "Live progress on your prioritised action plan.",
            },
          ].map(({ label, color, tagline, desc }) => (
            <div
              key={label}
              style={{
                ...cardStyle,
                borderTop: `3px solid ${color}`,
              }}
            >
              <p
                style={{
                  margin: "0 0 var(--space-1) 0",
                  fontWeight: 800,
                  fontSize: "var(--font-size-body-sm)",
                  color,
                }}
              >
                {label}
              </p>
              <p
                style={{
                  margin: "0 0 var(--space-2) 0",
                  fontWeight: 600,
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                }}
              >
                {tagline}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 1: Visibility Score ── */}
      <section aria-labelledby="score-visibility-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="score-visibility-heading" style={sectionHeadingStyle}>
          1. Visibility Score
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          What AI engines actually do with your brand when a buyer asks about
          your category. This is the only score that requires real AI API calls
          and cannot be gamed by changing your website.
        </p>

        <article aria-labelledby="visibility-detail-heading" style={cardStyle}>
          <p style={{ ...labelStyle, color: THREE_SCORE_COLORS.visibility }}>Visibility</p>
          <h3
            id="visibility-detail-heading"
            style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
          >
            What AI engines see when asked about your brand
          </h3>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Sourced entirely from live probes across 5 AI engines.
          </p>

          <div>
            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Citation Rate
              </span>
              <span style={weightBadgeStyle}>50% of score</span>
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
              Fraction of buyer prompts where an AI engine mentioned your brand.
              We run each prompt 3&times; per engine and compute a{" "}
              <em>mention rate</em> — not a single coin flip — so results are more
              reliable despite AI non-determinism.
            </p>

            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Average Position Score
              </span>
              <span style={weightBadgeStyle}>30% of score</span>
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
              When cited, how high in the AI answer? Position&nbsp;1&nbsp;=&nbsp;1.0,
              position&nbsp;2&nbsp;=&nbsp;0.5, position&nbsp;3&nbsp;=&nbsp;0.33, and so on.
              Zero if never cited.
            </p>

            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Sentiment Score
              </span>
              <span style={weightBadgeStyle}>20% of score</span>
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
              or negative using a deterministic phrase-matching classifier.
              Positive&nbsp;=&nbsp;1.0, neutral&nbsp;=&nbsp;0.5, negative&nbsp;=&nbsp;0.
            </p>
          </div>

          <div aria-label="Visibility score formula" style={formulaBoxStyle}>
            Visibility = clamp((citationRate&times;0.50 + avgPositionScore&times;0.30 + sentimentScore&times;0.20)&times;100, 0, 100)
          </div>

          <p style={honestNoteStyle}>
            <strong>Honest note:</strong> AI outputs are non-deterministic — the same
            prompt can produce different answers on different days. We probe 3&times;
            per engine and use mention <em>rates</em> for confidence, but this is
            still a directional snapshot. Re-audit weekly to track trends rather than
            treating any single score as absolute.
          </p>
        </article>
      </section>

      {/* ── Section 2: Citation Readiness Score ── */}
      <section aria-labelledby="score-citation-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="score-citation-heading" style={sectionHeadingStyle}>
          2. Citation Readiness Score
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          How ready your brand is to be cited by AI engines. Unlike the Visibility
          Score, these are signals you can directly control and improve — your site,
          your entity presence, your off-site authority.
        </p>

        <article aria-labelledby="citation-detail-heading" style={cardStyle}>
          <p style={{ ...labelStyle, color: THREE_SCORE_COLORS.citationReadiness }}>Citation Readiness</p>
          <h3
            id="citation-detail-heading"
            style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
          >
            How ready your content and presence is to be cited
          </h3>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Derived from two internal vectors: <strong>Performance</strong> (60%) and{" "}
            <strong>Brand</strong> (40%).
          </p>

          <div aria-label="Citation Readiness composition formula" style={formulaBoxStyle}>
            CitationReadiness = round(Performance&times;0.60 + Brand&times;0.40)
          </div>

          <div style={{ marginTop: "var(--space-6)" }}>
            <h4 style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>
              Performance vector (60% of Citation Readiness)
            </h4>
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              Technical visibility and citation share — things AI crawlers look at before they
              decide whether to cite you.
            </p>

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
              Are your pages marked up with standard structured data? Standard SEO hygiene
              — Google&rsquo;s 2026 documentation confirms no &ldquo;special AI schema&rdquo;
              is required.
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
              What fraction of AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
              can access your site?
            </p>

            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Multi-page content citation-worthiness
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
              Do your pages use statistics, sourced claims, quotations, and question-answer
              structure that AI engines are trained to cite?
            </p>
          </div>

          <div style={{ marginTop: "var(--space-6)" }}>
            <h4 style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>
              Brand vector (40% of Citation Readiness)
            </h4>
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              Entity authority and off-site presence — how the broader web and knowledge
              graphs represent your brand.
            </p>

            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Entity completeness (Wikidata/Wikipedia)
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
              How complete is your brand&rsquo;s entry in Wikidata/Wikipedia? We check
              official website, industry, founding date, description, LinkedIn, and
              Crunchbase links.
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
                E-E-A-T signal (Reddit, G2, LinkedIn, off-site authority)
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
              Blends your Reddit footprint (threads, subreddits, sentiment), off-site
              authority (presence on the 7 highest-AI-cited sources: Reddit, Wikipedia,
              LinkedIn, G2, Trustpilot, Crunchbase, YouTube), and on-site identity
              signals from a live crawl of your homepage.
            </p>
          </div>

          <p style={honestNoteStyle}>
            <strong>Honest note:</strong> these are the signals you can directly control
            and improve. Schema, crawler access, entity records, and off-site presence
            are all editable. The Execution score tracks how many of the recommended
            fixes you have completed.
          </p>
        </article>
      </section>

      {/* ── Section 3: Execution Progress ── */}
      <section aria-labelledby="score-execution-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="score-execution-heading" style={sectionHeadingStyle}>
          3. Execution Progress
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-6) 0",
          }}
        >
          After your audit, Ozvor generates a prioritised action plan of tasks
          (plan_task cards). Execution tracks how far through that plan you are.
          It is the only score that is fully in your hands.
        </p>

        <article aria-labelledby="execution-detail-heading" style={cardStyle}>
          <p style={{ ...labelStyle, color: THREE_SCORE_COLORS.executionProgress }}>Execution Progress</p>
          <h3
            id="execution-detail-heading"
            style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
          >
            % of your recommended action cards completed
          </h3>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            After the audit is complete, Ozvor generates a prioritised list of
            action cards — one per gap identified. Execution is the percentage of
            non-rejected cards you have marked done.
          </p>

          <div aria-label="Execution Progress formula" style={formulaBoxStyle}>
            Execution = (done cards / total non-rejected cards) &times; 100
          </div>

          <div style={{ marginTop: "var(--space-6)" }}>
            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                No cards yet
              </span>
              <span
                style={{
                  ...weightBadgeStyle,
                  color: "var(--color-muted)",
                  backgroundColor: "var(--color-surface-muted)",
                }}
              >
                Not started
              </span>
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
              If no action cards exist yet, we show &ldquo;Not started&rdquo; — not a
              0% bar. We never fabricate a number. Run an audit and generate your
              plan to start tracking.
            </p>

            <div style={inputRowStyle}>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                Cards in progress
              </span>
              <span style={weightBadgeStyle}>0&ndash;100%</span>
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
              As you mark cards done, the percentage updates live. Rejected cards
              are excluded from the denominator so declining a low-priority fix
              doesn&rsquo;t punish your score.
            </p>
          </div>

          <p style={honestNoteStyle}>
            <strong>Honest note:</strong> this is a live counter, not an audit snapshot.
            It updates immediately when you complete or reject action cards. A high
            Execution score means you have done the work — and a re-audit will confirm
            whether Visibility improved as a result.
          </p>
        </article>
      </section>

      {/* ── Section 4: The 5 engines ── */}
      <section aria-labelledby="engines-heading" style={{ marginBottom: "var(--space-12)" }}>
        <h2 id="engines-heading" style={sectionHeadingStyle}>
          The 5 AI engines we probe
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
                <th scope="col" style={thStyle}>Engine</th>
                <th scope="col" style={thStyle}>API used</th>
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

      {/* ── Section 5: Methodology commitment ── */}
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
            and report a mention rate — not a single test — so results are more reliable.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
              lineHeight: 1.8,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Every score shows &ldquo;Measured&rdquo; (real signal from this audit) or
            &ldquo;Baseline&rdquo; (a neutral placeholder shown transparently when a
            data source is not yet connected) so you always know exactly how confident
            each number is.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            The Execution Progress score is the one number we will never estimate or
            interpolate — it is always the exact ratio of completed cards to total
            non-rejected cards, and is shown as &ldquo;Not started&rdquo; (not 0%)
            until your first action plan exists.
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
                <th scope="col" style={{ ...thStyle, color: "var(--color-success)" }}>Measured now</th>
                <th scope="col" style={{ ...thStyle, color: "var(--color-muted)" }}>Still on the roadmap</th>
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
                [
                  "Action plan execution tracking (live counter)",
                  "Automated verification of completed fixes",
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
