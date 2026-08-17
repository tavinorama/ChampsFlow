/**
 * /how-it-works — "From invisible to cited, in four moves."
 *
 * Server shell. The four moves are told as a scroll film (HowItWorksFilm.tsx)
 * so this page speaks the same language as the home page — the founder asked
 * for every sales and product page to carry the landing's dynamic, and a
 * visitor who clicks How it works should not fall out of the story.
 *
 * What stays server rendered here, on purpose:
 *  - metadata and the HowTo JSON-LD
 *  - the score breakdown, which is the method, not decoration
 *  - the CTA links, so they work with JavaScript off
 */

import type { Metadata } from "next";
import Link from "next/link";
import { safeJsonLd } from "../../../lib/safe-json-ld";
import { HowItWorksFilm } from "./HowItWorksFilm";
import { AiAuditCta } from "../../../components/marketing/AiAuditCta";

export const metadata: Metadata = {
  title: "How Ozvor Works — From invisible to cited in four moves",
  description:
    "We check ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews, live. Results can vary by engine and day. See who AI recommends instead of you. Get your GEO plan, publish the fix, then monitor, or hand it to OrganicPosts.",
  alternates: { canonical: "https://ozvor.com/how-it-works" },
  openGraph: {
    title: "How Ozvor Works — From invisible to cited in four moves",
    description:
      "Audit → Benchmark → Plan & publish → Monitor. The loop that gets small businesses cited by AI.",
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
    { "@type": "HowToStep", position: 1, name: "Audit", text: "Run real buyer prompts across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews, live. Results can vary by engine and day. Record whether you're cited." },
    { "@type": "HowToStep", position: 2, name: "Benchmark", text: "See who AI recommends instead of you, and the sources it trusts." },
    { "@type": "HowToStep", position: 3, name: "Plan & publish", text: "Get a GEO content plan. Content Studio drafts the fix you publish." },
    { "@type": "HowToStep", position: 4, name: "Monitor", text: "Re-run weekly. Track your Ozvor AI Visibility Score — or hand the engagement to OrganicPosts." },
  ],
};

/**
 * The same four moves the film tells, in plain server-rendered text.
 *
 * This is not a duplicate for its own sake: the film needs JavaScript and a
 * scroll, and a crawler has neither. Keeping the moves here means the page
 * still explains itself to a reader, a screen reader, and an AI engine.
 */
const STEPS: { num: string; title: string; body: string }[] = [
  {
    num: "01",
    title: "Audit",
    body: "We ask the real buyer questions your customers ask. We check ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews, live. Results can vary by engine and day. Then we record whether you're named, where you rank, and how you're described.",
  },
  {
    num: "02",
    title: "Benchmark",
    body: "See exactly who AI recommends instead of you, and on which prompts. See the high-authority sources — Reddit, G2, Wikipedia — it trusts to make that call.",
  },
  {
    num: "03",
    title: "Plan & publish",
    body: "Get a GEO content plan, ranked by impact. Content Studio drafts posts and schema built to earn citations. Results are not guaranteed. You review and publish. Nothing goes live without your say-so.",
  },
  {
    num: "04",
    title: "Monitor, or hand it to us",
    body: "Growth and Agency re-run your audit every week and track your Ozvor AI Visibility Score over time. Don't want to run it yourself? OrganicPosts handles the whole thing for you.",
  },
];

const VECTORS: { label: string; score: number; body: string }[] = [
  { label: "Visibility", score: 58, body: "How often AI engines name you, where you rank in the answer, and how positively you're described." },
  { label: "Citation Readiness", score: 71, body: "Whether engines can read and trust your site. Schema coverage, AI-crawler access, and source authority." },
  { label: "Execution", score: 49, body: "How many ranked fixes from your GEO plan you have shipped." },
];

const PAGE_CSS = `
  .hiw-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .hiw-wrap { max-width: 880px; margin: 0 auto; padding: var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16)); }
  .hiw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 860px) { .hiw-grid { grid-template-columns: 1fr; } }
  .hiw-moves { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); margin-top: var(--space-8); }
  @media (max-width: 720px) { .hiw-moves { grid-template-columns: 1fr; } }
  .hiw-move { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-card); }
  .hiw-move h3 { margin: var(--space-2) 0 0; font-size: var(--font-size-h3); font-weight: 800; letter-spacing: -0.01em; }
  .hiw-move p { margin: var(--space-3) 0 0; color: var(--color-muted); line-height: 1.7; font-size: var(--font-size-body-sm); }
  .hiw-move-num { font-family: var(--font-mono); font-weight: 700; font-size: 0.8125rem; color: var(--color-accent-ink); }
  .hiw-cta-primary { display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:#06140e; text-decoration:none; background:linear-gradient(135deg,#27c98a,#0c7d54); border-radius:var(--radius-md); padding:0.8rem 1.5rem; box-shadow:0 10px 32px rgba(39,201,138,0.32); }
  .hiw-cta-ghost { display:inline-flex; align-items:center; justify-content:center; font-weight:600; color:var(--color-accent-ink); text-decoration:none; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0.8rem 1.5rem; }
`;

export default function HowItWorksPage() {
  return (
    <>
      <style>{PAGE_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(howToJsonLd) }} />

      {/* The four moves, as four scenes. */}
      <HowItWorksFilm />

      {/* A plain div, not a <main>: (marketing)/layout.tsx already owns the
          main landmark, and nesting a second one breaks the page for screen
          readers that navigate by landmark. */}
      <div className="hiw-wrap" style={{ fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
        {/* The same four moves in text, for readers, screen readers and crawlers. */}
        <section aria-labelledby="four-moves">
          <span className="hiw-eyebrow">The short version</span>
          <h2 id="four-moves" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-3) 0 0" }}>
            From invisible to cited, in four moves.
          </h2>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "620px", margin: "var(--space-4) 0 0" }}>
            No GEO degree needed. You run the audit. We surface the gaps. The platform writes your fix, and you publish it.
          </p>
          <div className="hiw-moves">
            {STEPS.map((s) => (
              <div key={s.num} className="hiw-move">
                <span className="hiw-move-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
          <p style={{ margin: "var(--space-5) 0 0" }}>
            <Link href="/organicposts" style={{ color: "var(--color-gold-ink)", fontWeight: 700, textDecoration: "none", fontSize: "var(--font-size-body-sm)" }}>
              Meet OrganicPosts, done with you &rarr;
            </Link>
          </p>
        </section>

        {/* Score breakdown */}
        <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="score-made-of">
          <span className="hiw-eyebrow">The Ozvor method &middot; Visibility &times; Citation Readiness &times; Execution</span>
          <h2 id="score-made-of" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-3) 0 var(--space-6)" }}>
            What your Ozvor AI Visibility Score is made of.
          </h2>
          <div className="hiw-grid">
            {VECTORS.map((v) => (
              <div key={v.label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
                <h3 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, color: "var(--color-text)" }}>{v.label}</h3>
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
          <p style={{ margin: "var(--space-4) 0 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
            The numbers above are an example of the shape of a score, not anyone&apos;s result. Yours comes from a live check.{" "}
            <Link href="/how-we-measure" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>See how we measure</Link>.
          </p>
        </section>

        {/* CTA */}
        <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-5)" }}>
            See your own score in 60 seconds.
          </h2>
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/test" className="hiw-cta-primary">Check my brand, free &rarr;</Link>
            <Link href="/pricing" className="hiw-cta-ghost">See plans</Link>
          </div>
        </section>

        {/* AI Audit Stack — site-wide peer CTA (SPRINT-9) */}
        <div style={{ marginTop: "var(--space-12)" }}>
          <AiAuditCta
            headline="Not sure which AI tools you need?"
            subline="Answer a few questions. We pick your AI stack and email it."
          />
        </div>
      </div>
    </>
  );
}
