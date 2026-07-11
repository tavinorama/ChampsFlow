/**
 * /compare — friendly comparison index.
 *
 * Simpler, shorter sibling of /vs (which stays live — see its file header).
 * This page explains, in plain sentences, how Ozvor differs from six named
 * alternatives, then links out to the detailed /vs/[competitor] pages for
 * anyone who wants the full feature table.
 *
 * Every line below is a simplified paraphrase of the sourced facts already in
 * ./vs/_data.ts (entry prices, gaps, pricingNote) — no new claims are made
 * here. Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { COMPETITORS } from "../vs/_data";

export const metadata: Metadata = {
  title: "Compare Ozvor to other AI-visibility tools | Ozvor",
  description:
    "How Ozvor compares to Profound, Peec AI, Otterly, AthenaHQ, Semrush AI Toolkit, and Ahrefs Brand Radar — in plain English, with links to the full comparison.",
  alternates: { canonical: "https://ozvor.com/compare" },
  openGraph: {
    title: "Compare Ozvor to other AI-visibility tools",
    description: "Plain-English comparisons — where we win, where they win.",
    url: "https://ozvor.com/compare",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Compare Ozvor" }],
  },
};

/**
 * One short, honest sentence pair per competitor — a plain-English digest of
 * the sourced facts in ./vs/_data.ts (entryPrice / pricingNote / gaps). Keyed
 * by slug; if a new competitor is added to _data.ts without an entry here,
 * the tile falls back to that competitor's full `thesis` rather than
 * rendering blank copy.
 */
const SIMPLE_TAKE: Record<string, string> = {
  profound:
    "Profound is built for big companies. Real features start at $399 a month. Ozvor starts at $99.",
  peec:
    "Peec tracks your mentions. It does not write content. Ozvor gives you a score and ready drafts.",
  otterly:
    "Otterly checks your pages for $29 a month. It cannot write content. Our $29 Kit includes a plan too.",
  athenahq:
    "AthenaHQ automates content fixes. Its starter plan costs $295 a month. Ozvor's Growth plan is $99.",
  "semrush-ai":
    "Semrush bolts AI checks onto its SEO suite. Ozvor is built for AI search from day one.",
  "ahrefs-brand-radar":
    "Ahrefs adds AI tracking to its SEO tool. Full coverage runs about $828 a month combined.",
};

const CSS = `
  .cp-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .cp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); margin-top: var(--space-10); }
  @media (max-width: 720px) { .cp-grid { grid-template-columns: 1fr; } }
  .cp-tile { display: block; text-decoration: none; color: inherit; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-card); transition: border-color 0.15s, transform 0.15s; }
  .cp-tile:hover { border-color: var(--color-accent-ink); transform: translateY(-2px); }
  .cp-tile:focus-visible { outline: var(--focus-outline-width) solid var(--color-focus-outline); outline-offset: 2px; }
`;

export default function ComparePage() {
  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{CSS}</style>

      <span className="cp-eyebrow">Compare</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        See how Ozvor compares.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "620px",
          margin: 0,
        }}
      >
        Other tools check where you stand. Ozvor does that too. Then it turns
        the gaps into a plan and real content drafts. Here is how we compare
        to six tools, in plain English.
      </p>
      <p
        style={{
          marginTop: "var(--space-4)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          maxWidth: "620px",
        }}
      >
        This is not a sales pitch. We link the full facts on every page,
        including where each tool beats us.
      </p>

      <div className="cp-grid">
        {COMPETITORS.map((c) => (
          <Link key={c.slug} href={`/vs/${c.slug}`} className="cp-tile">
            <p style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.01em" }}>
              Ozvor vs {c.name}
            </p>
            <p
              style={{
                margin: "var(--space-1) 0 var(--space-3)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {c.category}
            </p>
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              {SIMPLE_TAKE[c.slug] ?? c.thesis}
            </p>
            <span
              aria-hidden="true"
              style={{ display: "inline-block", marginTop: "var(--space-3)", color: "var(--color-accent-ink)", fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}
            >
              See the full comparison →
            </span>
          </Link>
        ))}
      </div>

      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          Want the real answer? Check your brand.
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)", maxWidth: "480px", marginInline: "auto" }}>
          It&rsquo;s free, and it takes about 60 seconds. You see exactly who
          AI names instead of you.
        </p>
        <Link
          href="/test"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            color: "#06140e",
            textDecoration: "none",
            background: "linear-gradient(135deg,#27c98a,#0c7d54)",
            borderRadius: "var(--radius-md)",
            padding: "0.8rem 1.5rem",
            boxShadow: "0 10px 32px rgba(39,201,138,0.32)",
            minHeight: "44px",
          }}
        >
          Check my brand — free →
        </Link>
      </section>
    </main>
  );
}
