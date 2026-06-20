/**
 * Resource preview: LLM Citation Tracker
 * Route: /resources/llm-citation-tracker
 *
 * Shows methodology preview + spreadsheet column structure.
 * Gated: Google Sheet template requires waitlist signup (email deliverable).
 *
 * Design system: all values from tokens.css.
 * Static rendering: no dynamic data.
 */

import type { Metadata } from "next";
import { WaitlistForm } from "../../../../components/marketing/WaitlistForm";

export const metadata: Metadata = {
  title: "LLM Citation Tracker — Monitor Your AI Search Visibility | TrustIndex AI",
  description:
    "A free Google Sheets template for monitoring when ChatGPT, Claude, Perplexity, and Gemini cite your business. Preview the methodology — sign up to get the template.",
  alternates: {
    canonical: "https://trustindexai.com/resources/llm-citation-tracker",
  },
  openGraph: {
    title:
      "LLM Citation Tracker — Monitor Your AI Search Visibility | TrustIndex AI",
    description:
      "A free Google Sheets template for monitoring when ChatGPT, Claude, Perplexity, and Gemini cite your business.",
    url: "https://trustindexai.com/resources/llm-citation-tracker",
    siteName: "TrustIndex AI",
    type: "website",
  },
};

const SPREADSHEET_COLUMNS = [
  { name: "Week", desc: "Week number for trend comparison" },
  { name: "Date", desc: "Date the query was run" },
  { name: "Query", desc: "The exact query text submitted to the AI" },
  { name: "Platform", desc: "ChatGPT / Claude / Perplexity / Gemini" },
  { name: "Cited (Y/N)", desc: "Was your business named or content quoted?" },
  {
    name: "Position",
    desc: "Where in the response (first, second, in a list, etc.)",
  },
  { name: "Source URL cited", desc: "Which URL was linked, if any" },
  { name: "Sentiment", desc: "How the AI described your business" },
  { name: "Notes", desc: "Observations for that week's pattern" },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function LlmCitationTrackerPage() {
  return (
    <>
      <article
        aria-labelledby="tracker-heading"
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
            Free resource &middot; Google Sheets template
          </p>
          <h1
            id="tracker-heading"
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.2,
              marginBottom: "var(--space-4)",
            }}
          >
            The LLM Citation Tracker
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
            How to Monitor When ChatGPT, Claude, and Perplexity Mention Your
            Business
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

        {/* Methodology preview */}
        <section aria-label="Methodology preview">
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            What this is
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
            This document describes a manual methodology for tracking when
            ChatGPT, Claude, Perplexity, and Gemini cite your business or your
            published content in their answers. It also provides a spreadsheet
            template structure you can copy into Google Sheets today and begin
            using this week.
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
            The methodology takes roughly 10 minutes per week. It requires no
            tools, no subscriptions, and no technical setup. It gives you the
            most direct feedback available on whether your GEO posting efforts
            are producing results.
          </p>

          <div
            style={{
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-6)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                marginBottom: "var(--space-2)",
                marginTop: 0,
              }}
            >
              The honest caveat
            </p>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                margin: 0,
              }}
            >
              There is no public API for monitoring AI citations. ChatGPT does
              not offer a notification when it names your business in an answer.
              Perplexity does not send alerts. This means the only way to know
              whether your business is being cited is to ask the AI systems
              yourself, manually, using queries that match what your prospective
              customers are likely to type. Running 10 queries across four AI
              platforms takes about 10 minutes. Do it once a week, record the
              results in the tracker, and review the pattern after four weeks.
            </p>
          </div>

          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            Spreadsheet structure (preview)
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: "var(--line-height-body)",
              marginBottom: "var(--space-4)",
            }}
          >
            Copy the following columns into a Google Sheet. Add one row per
            query per week.
          </p>

          {/* Column preview table */}
          <div
            style={{ overflowX: "auto", marginBottom: "var(--space-6)" }}
            role="region"
            aria-label="Spreadsheet column structure"
            tabIndex={0}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--color-surface-muted)",
                    borderBottom: "2px solid var(--color-border)",
                  }}
                >
                  <th
                    scope="col"
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      textAlign: "left",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--color-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Column
                  </th>
                  <th
                    scope="col"
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      textAlign: "left",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--color-text)",
                    }}
                  >
                    What to record
                  </th>
                </tr>
              </thead>
              <tbody>
                {SPREADSHEET_COLUMNS.map((col, i) => (
                  <tr
                    key={col.name}
                    style={{
                      backgroundColor:
                        i % 2 === 0
                          ? "var(--color-surface)"
                          : "var(--color-surface-muted)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: "var(--font-weight-medium)",
                        color: "var(--color-text)",
                        whiteSpace: "nowrap",
                        verticalAlign: "top",
                      }}
                    >
                      {col.name}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        color: "var(--color-muted)",
                        verticalAlign: "top",
                      }}
                    >
                      {col.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
            Get the Google Sheets template
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
            Join the TrustIndex AI waitlist and receive the complete LLM
            Citation Tracker template by email &mdash; including customisable
            query examples for five business types and the four-week review
            methodology. Free with your waitlist signup.
          </p>
          <div style={{ maxWidth: "400px", margin: "0 auto" }}>
            <WaitlistForm compact />
          </div>
        </div>
      </article>
    </>
  );
}
