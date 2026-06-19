/**
 * Resource preview: 5 High-Citation Post Templates
 * Route: /resources/5-high-citation-post-templates
 *
 * Shows Template 1 in full (The Data Story).
 * Gated: remaining 4 templates require waitlist signup (email deliverable).
 *
 * Design system: all values from tokens.css.
 * Static rendering: no dynamic data.
 */

import type { Metadata } from "next";
import { WaitlistForm } from "../../../../components/marketing/WaitlistForm";

export const metadata: Metadata = {
  title:
    "5 High-Citation LinkedIn Post Templates (GEO-Backed) | TrustIndex AI",
  description:
    "Fill-in-the-blank LinkedIn post templates derived from Princeton GEO research. Preview Template 1 — sign up to get all five.",
  alternates: {
    canonical:
      "https://trustindexai.com/resources/5-high-citation-post-templates",
  },
  openGraph: {
    title: "5 High-Citation LinkedIn Post Templates (GEO-Backed) | TrustIndex AI",
    description:
      "Fill-in-the-blank LinkedIn post templates derived from Princeton GEO research.",
    url: "https://trustindexai.com/resources/5-high-citation-post-templates",
    siteName: "TrustIndex AI",
    type: "website",
  },
};

const ALL_TEMPLATES = [
  "Template 1: The Data Story (preview below)",
  "Template 2: The Expert Recommendation",
  "Template 3: The How-To Answer",
  "Template 4: The Opinionated Take",
  "Template 5: The Before and After",
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PostTemplatesPage() {
  return (
    <>
      <article
        aria-labelledby="templates-heading"
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
            Free resource &middot; 5 fill-in-the-blank templates
          </p>
          <h1
            id="templates-heading"
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.2,
              marginBottom: "var(--space-4)",
            }}
          >
            5 LinkedIn Post Templates That ChatGPT and Perplexity Cite
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
            Backed by Princeton GEO Research
          </p>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
            }}
          >
            by TrustIndex AI &middot; 2026
          </p>
        </header>

        {/* Why these work */}
        <section aria-label="Research basis">
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            Why these templates work
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
            These five templates are derived from the findings of the GEO
            research paper published at KDD 2024 by researchers at Princeton
            University, Georgia Tech, the Allen Institute for AI, and IIT
            Delhi. The paper tested nine content optimization methods and
            measured their effect on AI citation visibility. The
            highest-performing methods were statistics addition, quotation
            addition, and citing sources &mdash; each improving
            position-adjusted visibility by 30&ndash;40% relative to baseline.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              fontStyle: "italic",
              marginBottom: "var(--space-6)",
            }}
          >
            Source: Aggarwal et al., &ldquo;GEO: Generative Engine
            Optimization,&rdquo; KDD 2024, arxiv.org/abs/2311.09735.
          </p>
        </section>

        {/* All 5 templates list */}
        <section aria-label="Templates overview">
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            The 5 templates
          </h2>
          <ol
            style={{
              padding: "0 0 0 var(--space-6)",
              margin: "0 0 var(--space-8) 0",
            }}
          >
            {ALL_TEMPLATES.map((t) => (
              <li
                key={t}
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: "var(--line-height-body)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t}
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

        {/* Template 1 — full preview */}
        <section aria-labelledby="template-1-heading">
          <h2
            id="template-1-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-2)",
            }}
          >
            Template 1: The Data Story
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-6)",
              fontStyle: "italic",
            }}
          >
            GEO principle: Statistics addition. The Princeton GEO paper found
            that adding specific numerical data to content is among the most
            effective methods for improving AI citation visibility.
          </p>

          {/* Fill-in-the-blank */}
          <div
            style={{
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-6)",
              marginBottom: "var(--space-6)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-primary)",
                fontFamily: "var(--font-family)",
                marginBottom: "var(--space-3)",
                marginTop: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Fill-in-the-blank format
            </p>
            <pre
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-text)",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {`[NUMBER OR PERCENTAGE] of [YOUR AUDIENCE TYPE] [SPECIFIC OUTCOME OR FINDING].

I [saw / measured / read this in] [SOURCE OR CONTEXT].

What it means for [YOUR NICHE]:

[INTERPRETATION IN 1–2 SENTENCES — specific, not generic.]

What to do with this: [1 SPECIFIC ACTION tied to the finding.]

[Optional: "In our work with [type of client], we have seen [corroborating observation]."]`}
            </pre>
          </div>

          {/* Worked example */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: "4px solid var(--color-success)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-6)",
              marginBottom: "var(--space-4)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-success)",
                fontFamily: "var(--font-family)",
                marginBottom: "var(--space-3)",
                marginTop: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Worked example &mdash; independent accountant, freelancer niche
            </p>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                margin: 0,
              }}
            >
              68% of freelancers in Portugal who miss the home office deduction
              do so because they assume it requires a dedicated room. It does
              not.
              <br />
              <br />
              I see this every January &mdash; clients who have been working
              from a corner of their living room for three years and have never
              claimed it.
              <br />
              <br />
              What it means for freelancers: The deduction applies to any
              consistent use of a home space for professional work, up to €250
              per year. You need to be able to describe the space and the
              regularity of use if asked. You do not need a separate room.
              <br />
              <br />
              What to do with this: check your last three tax returns. If you
              worked from home consistently and did not claim this deduction,
              ask your accountant about an amendment.
              <br />
              <br />
              In our practice, catching this alone recovers an average of
              €200&ndash;€400 per client.
            </p>
          </div>
        </section>

        {/* Gate: remaining 4 templates */}
        <div
          style={{
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            textAlign: "center",
            marginTop: "var(--space-8)",
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
            Get all 5 templates
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
            Join the TrustIndex AI waitlist and receive all five GEO-backed
            LinkedIn post templates by email &mdash; each with a fill-in-the-blank
            format, a worked example for a realistic small business niche, and
            two variation prompts to help you apply it to your own sector. Free
            with your waitlist signup.
          </p>
          <div style={{ maxWidth: "400px", margin: "0 auto" }}>
            <WaitlistForm compact />
          </div>
        </div>
      </article>
    </>
  );
}
