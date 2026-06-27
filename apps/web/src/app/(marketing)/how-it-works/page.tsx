/**
 * /how-it-works — Ozvor mockup: "From invisible to cited, in four moves."
 *
 * Server component (static, SSR, real <a href>).
 *  1. Hero
 *  2. Four-move walkthrough — 01/02/03 emerald (Audit · Benchmark · Plan & publish)
 *     + 04 GOLD "Monitor — or hand it to us" → OrganicPosts (the ladder summit)
 *  3. "What your Ozvor AI Visibility Score is made of" — AI / Performance / Brand sub-scores
 *  4. CTA → free test
 */

import type { Metadata } from "next";
import Link from "next/link";
import { StepGlyph } from "../../../components/marketing/illustrations";

export const metadata: Metadata = {
  title: "How Ozvor Works — From invisible to cited in four moves",
  description:
    "Audit across ChatGPT, Claude, Perplexity, Gemini & Google AI; benchmark who AI recommends instead of you; get the plan and let the platform write the fix; then monitor — or hand it to OrganicPosts.",
  alternates: { canonical: "https://ozvor.com/how-it-works" },
  openGraph: {
    title: "How Ozvor Works — From invisible to cited in four moves",
    description:
      "Audit → Benchmark → Plan & publish → Monitor. The loop that gets SMBs cited by AI answer engines.",
    url: "https://ozvor.com/how-it-works",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "How Ozvor Works" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Ozvor Works — From invisible to cited in four moves",
    description: "Audit → Benchmark → Plan & publish → Monitor.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How Ozvor gets your brand cited by AI",
  step: [
    { "@type": "HowToStep", position: 1, name: "Audit", text: "Run real buyer prompts across ChatGPT, Claude, Perplexity, Gemini and Google AI Overview and record whether you're cited." },
    { "@type": "HowToStep", position: 2, name: "Benchmark", text: "See who AI recommends instead of you, and the sources it trusts." },
    { "@type": "HowToStep", position: 3, name: "Plan & publish", text: "Get a GEO content plan and let Content Studio draft the fix you publish." },
    { "@type": "HowToStep", position: 4, name: "Monitor", text: "Re-run weekly and track your Ozvor AI Visibility Score — or hand the engagement to OrganicPosts." },
  ],
};

const STEPS: { num: string; title: string; body: string }[] = [
  {
    num: "01",
    title: "Audit",
    body: "We ask the real buyer questions your customers ask — across ChatGPT, Claude, Perplexity, Gemini and Google AI Overview — and record whether you're named, where you rank in the answer, and how you're described.",
  },
  {
    num: "02",
    title: "Benchmark",
    body: "See exactly who AI recommends instead of you, on which prompts, and the high-authority sources (Reddit, G2, Wikipedia…) it trusts to make that call.",
  },
  {
    num: "03",
    title: "Plan & publish",
    body: "Get a prioritized GEO content plan, then let Content Studio draft the posts, schema and answers that earn the citation. You review and publish — nothing goes live without your say-so.",
  },
];

const VECTORS: { label: string; weight: string; score: number; body: string }[] = [
  { label: "AI", weight: "35%", score: 58, body: "How often AI engines cite you, where you rank in the answer, and how positively you're described." },
  { label: "Performance", weight: "35%", score: 71, body: "Citation share vs competitors, Google AI Overview presence, schema coverage, and AI-crawler access." },
  { label: "Brand", weight: "30%", score: 49, body: "Entity authority — Wikidata/Wikipedia consistency, off-site presence (Reddit, G2), and on-site E-E-A-T." },
];

const PAGE_CSS = `
  .hiw-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .hiw-num { font-family: var(--font-mono); font-weight: 700; font-size: 0.875rem; }
  .hiw-steps { position: relative; }
  .hiw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 860px) { .hiw-grid { grid-template-columns: 1fr; } }
  .hiw-cta-primary { display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:#06140e; text-decoration:none; background:linear-gradient(135deg,#27c98a,#0c7d54); border-radius:var(--radius-md); padding:0.8rem 1.5rem; box-shadow:0 10px 32px rgba(39,201,138,0.32); }
  .hiw-cta-ghost { display:inline-flex; align-items:center; justify-content:center; font-weight:600; color:var(--color-accent-ink); text-decoration:none; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0.8rem 1.5rem; }
`;

function StepRow({ num, title, body, gold = false, variant }: { num: string; title: string; body: string; gold?: boolean; variant: "audit" | "benchmark" | "plan" | "monitor" }) {
  const accent = gold ? "var(--color-gold)" : "var(--color-primary)";
  return (
    <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "flex-start" }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: "44px",
          height: "44px",
          borderRadius: "var(--radius-pill)",
          display: "grid",
          placeItems: "center",
          color: gold ? "#1a1206" : "#06140e",
          background: gold
            ? "linear-gradient(135deg,#e6a93f,#b9791f)"
            : "linear-gradient(135deg,#27c98a,#0c7d54)",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: "0.9375rem",
        }}
      >
        {num}
      </div>
      <div
        style={{
          flex: 1,
          background: "var(--color-surface)",
          border: `1px solid ${gold ? "var(--color-gold)" : "var(--color-border)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <StepGlyph variant={variant} size={40} />
          <h2 style={{ margin: 0, fontSize: "var(--font-size-h2)", fontWeight: 800, letterSpacing: "-0.02em", color: gold ? "var(--color-gold-ink)" : "var(--color-text)" }}>
            {title}
          </h2>
        </div>
        <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-muted)", lineHeight: 1.7, fontSize: "var(--font-size-body)" }}>{body}</p>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main style={{ maxWidth: "880px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />

      {/* Hero */}
      <span className="hiw-eyebrow">How it works</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        From invisible to cited, in four moves.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "620px", margin: 0 }}>
        No GEO degree required. You run the audit, we surface the gaps, and the platform writes the fix you publish.
      </p>

      {/* Four-move walkthrough */}
      <div className="hiw-steps" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-12)" }}>
        {STEPS.map((s, i) => (
          <StepRow key={s.num} num={s.num} title={s.title} body={s.body} variant={(["audit", "benchmark", "plan"] as const)[i] ?? "audit"} />
        ))}
        <StepRow
          num="04"
          gold
          variant="monitor"
          title="Monitor — or hand it to us"
          body="Growth and Agency re-run your audit weekly and track your Ozvor AI Visibility Score over time. When you'd rather not run it yourself, OrganicPosts does the whole engagement with you."
        />
        <div style={{ paddingLeft: "calc(44px + var(--space-5))" }}>
          <Link href="/organicposts" style={{ color: "var(--color-gold-ink)", fontWeight: 700, textDecoration: "none", fontSize: "var(--font-size-body-sm)" }}>
            Meet OrganicPosts — done with you →
          </Link>
        </div>
      </div>

      {/* Score breakdown */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="score-made-of">
        <span className="hiw-eyebrow">The Ozvor method · AI × Brand × Performance</span>
        <h2 id="score-made-of" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-3) 0 var(--space-6)" }}>
          What your Ozvor AI Visibility Score is made of.
        </h2>
        <div className="hiw-grid">
          {VECTORS.map((v) => (
            <div key={v.label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, color: "var(--color-text)" }}>{v.label}</h3>
                <span className="hiw-num" style={{ color: "var(--color-accent-ink)" }}>{v.weight}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", margin: "var(--space-3) 0" }}>
                <span style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em" }}>{v.score}</span>
                <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>/ 100</span>
              </div>
              <div role="presentation" style={{ height: "8px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-muted)", overflow: "hidden" }}>
                <div style={{ width: `${v.score}%`, height: "100%", background: "linear-gradient(90deg,#27c98a,#0c7d54)", borderRadius: "var(--radius-pill)" }} />
              </div>
              <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-muted)", lineHeight: 1.6, fontSize: "var(--font-size-body-sm)" }}>{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-5)" }}>
          See your own score in 60 seconds.
        </h2>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/test" className="hiw-cta-primary">Run the free AI test →</Link>
          <Link href="/pricing" className="hiw-cta-ghost">See plans</Link>
        </div>
      </section>
    </main>
  );
}
