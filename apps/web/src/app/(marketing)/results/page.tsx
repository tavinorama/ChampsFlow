/**
 * /results — "What results look like" (honest, pre-launch).
 *
 * We have no customers yet, so we do NOT fabricate case studies. Instead:
 *  1) How we measure success (the real metrics the product tracks).
 *  2) An EXPLICITLY-LABELLED illustrative trajectory, grounded in the cited KDD
 *     research (not a named customer, not a promise).
 *  3) A "be our first published case study" founding CTA.
 * FTC/GEO-A1 safe: clearly hypothetical, no guaranteed-citation claims.
 */

import type { Metadata } from "next";
import { GeoGraphBackdrop } from "../../../components/marketing/GeoGraphBackdrop";

export const metadata: Metadata = {
  title: "What Results Look Like — TrustIndex AI",
  description: "How TrustIndex AI measures GEO progress — your TrustIndex Score over time, citation rate, competitor displacement — and what an improvement trajectory looks like.",
  alternates: { canonical: "https://trustindexai.com/results" },
  openGraph: {
    title: "What Results Look Like — TrustIndex AI",
    description:
      "How TrustIndex AI measures GEO progress — your TrustIndex Score over time, citation rate, competitor displacement — and what an improvement trajectory looks like.",
    url: "https://trustindexai.com/results",
    siteName: "TrustIndex AI",
    type: "website",
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "What Results Look Like — TrustIndex AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "What Results Look Like — TrustIndex AI",
    description:
      "How TrustIndex AI measures GEO progress — your TrustIndex Score over time, citation rate, and competitor displacement.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const resultsJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "What Results Look Like — TrustIndex AI",
  description:
    "How TrustIndex AI measures GEO progress — your TrustIndex Score over time, citation rate, competitor displacement — and what an improvement trajectory looks like.",
  url: "https://trustindexai.com/results",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "Results", item: "https://trustindexai.com/results" },
    ],
  },
  isPartOf: {
    "@type": "WebSite",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
};

const METRICS = [
  ["TrustIndex Score over time", "Your 0–100 score, re-measured weekly, so progress is a line — not a vibe."],
  ["Citation rate", "Of the buyer prompts we run, the share where an AI engine actually names you."],
  ["Competitor displacement", "How often a rival gets recommended on prompts where you're absent — and whether that gap closes."],
  ["AI Overview & answer position", "Whether you appear in Google's AI Overview, and how high you rank inside AI answers."],
];

const PHASES = [
  ["Week 0 — Baseline", "Audit runs across every engine. Score 41/100. Cited on 2 of 10 buyer prompts; a competitor named on 6.", "41"],
  ["Weeks 1–3 — Fix the gaps", "Publish the 3 prioritized pieces (blog + LinkedIn + FAQ with schema), open AI-crawler access, complete the knowledge-graph entity.", "—"],
  ["Weeks 4–6 — Re-index", "Engines pick up the new, citation-worthy content. Citation rate and entity recognition begin to rise.", "—"],
  ["Week 8 — Re-measure", "Score 63/100. Cited on 6 of 10 prompts; competitor displacement down. The loop continues.", "63"],
];

const card: React.CSSProperties = {
  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-xl)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
};

export default function ResultsPage() {
  return (
    <main style={{ fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resultsJsonLd) }}
      />
      {/* Hero */}
      <section style={{ position: "relative", overflow: "hidden", padding: "var(--space-20) var(--space-4) var(--space-12)" }} className="mk-hero-bg">
        <GeoGraphBackdrop opacity={0.4} />
        <div style={{ maxWidth: "820px", margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)" }}>Results</span>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, margin: "var(--space-3) 0" }}>
            What results look like
          </h1>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "60ch", margin: "0 auto" }}>
            We&rsquo;re in pre-launch, so we won&rsquo;t show you invented customer numbers. Here&rsquo;s the honest version:
            exactly how we measure progress, and what a realistic improvement trajectory looks like.
          </p>
        </div>
      </section>

      {/* How we measure */}
      <section style={{ padding: "var(--space-16) var(--space-4)", backgroundColor: "var(--color-surface-muted)" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6) 0" }}>How we measure success</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
            {METRICS.map(([t, d]) => (
              <div key={t} style={card}>
                <div style={{ fontWeight: 800, marginBottom: "var(--space-2)" }}>{t}</div>
                <div style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Illustrative trajectory */}
      <section style={{ padding: "var(--space-16) var(--space-4)" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto" }}>
          <div style={{ display: "inline-block", fontSize: "var(--font-size-caption)", fontWeight: 700, color: "var(--color-accent-amber)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "4px 12px", marginBottom: "var(--space-4)" }}>
            Illustrative example — not a specific customer
          </div>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-3) 0" }}>A realistic 8-week trajectory</h2>
          <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-6) 0", textAlign: "justify", hyphens: "auto" }}>
            This is a hypothetical journey, grounded in peer-reviewed GEO research (Princeton/Georgia Tech/Allen Institute, KDD 2024,
            which found structured, citation-worthy content can lift AI-answer visibility by up to ~40%). It is <strong>not</strong> a
            promise — AI is non-deterministic and individual results vary by niche and competition.
          </p>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {PHASES.map(([t, d, score]) => (
              <li key={t} style={{ ...card, display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: "var(--radius-lg)", backgroundColor: score === "—" ? "var(--color-surface-muted)" : "var(--color-primary)", color: score === "—" ? "var(--color-muted)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: score === "—" ? "1rem" : "1.25rem" }}>{score}</div>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: "2px" }}>{t}</div>
                  <div style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Founding CTA */}
      <section style={{ padding: "var(--space-16) var(--space-4)", backgroundColor: "var(--color-surface-muted)" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-3) 0" }}>Be our first published case study</h2>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-5) 0" }}>
            Run the free test, fix the gaps, and we&rsquo;ll track your real numbers together. Founding members who share results get a permanent discount.
          </p>
          <a href="/test" style={{ display: "inline-block", height: 48, lineHeight: "48px", padding: "0 var(--space-6)", backgroundColor: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", fontWeight: 800, textDecoration: "none" }}>
            Run my free AI test &rarr;
          </a>
        </div>
      </section>
    </main>
  );
}
