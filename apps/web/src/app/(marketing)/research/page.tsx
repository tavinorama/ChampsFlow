/**
 * /research — "The Shift", the sourced-stats research page.
 *
 * Every stat here is a plain-English condensation of a number already
 * published, with its citation, in
 * ./resources/what-is-geo-search/page.tsx (the Understanding GEO Search
 * whitepaper). Nothing here is a new claim — where the whitepaper carried a
 * source, we kept it; nothing without a named source made it onto this page
 * (audit-integrity rule, postmortem PR#90: never fabricate a number).
 *
 * One counterpoint stat (Amsive, 2026) is included on purpose — the
 * whitepaper's "honest counterweight" section — so this page doesn't read as
 * one-sided cherry-picking.
 *
 * Server component, SSR, no client JS needed.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The AI Search Shift — Research & Sources | Ozvor",
  description:
    "Why AI search changes who gets found: sourced numbers on AI's reach, the disappearing click, AI-visitor value, the science behind getting cited, and the local-business gap.",
  alternates: { canonical: "https://ozvor.com/research" },
  openGraph: {
    title: "The AI Search Shift — Research & Sources",
    description: "Sourced numbers behind the shift to AI search — every stat, cited.",
    url: "https://ozvor.com/research",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "The AI Search Shift" }],
  },
};

interface Stat {
  headline: string;
  detail?: string;
  source: string;
  counterpoint?: boolean;
}

interface StatGroup {
  title: string;
  stats: Stat[];
}

const GROUPS: StatGroup[] = [
  {
    title: "AI search already has an audience the size of a country",
    stats: [
      {
        headline: "900 million weekly ChatGPT users",
        detail: "Up from about 400 million a year earlier.",
        source: "OpenAI, via TechCrunch and Search Engine Land — Feb 2026",
      },
      {
        headline: "2 billion+ people see Google's AI Overviews every month",
        source: "Alphabet Q2 2025 earnings, via TechCrunch and Search Engine Journal",
      },
      {
        headline: "750 million monthly users on Google's Gemini app",
        source: "Alphabet earnings, via TechCrunch and 9to5Google — early 2026",
      },
    ],
  },
  {
    title: "Buyers already start their search in AI",
    stats: [
      {
        headline: "37% of consumers now start searches with AI, not Google",
        source: "Eight Oh Two consumer study — Nov 2025",
      },
      {
        headline: "44% of buyers now start or split their research inside AI",
        source: "Bain & Company — 2026",
      },
      {
        headline: "70% say they use AI for search more than a year ago",
        source: "Fractl, via Search Engine Land — 2026",
      },
    ],
  },
  {
    title: "The click to your website is disappearing",
    stats: [
      {
        headline: "68% of US Google searches end with no click to a website",
        detail: "Up from about 60% in 2024.",
        source: "SparkToro / Rand Fishkin — Jun 2026",
      },
      {
        headline: "AI summaries cut clicks to a normal result to 8%, from 15%",
        source: "Pew Research Center — Jul 2025",
      },
      {
        headline: "Only 16% of brands track their AI-search visibility at all",
        source: "HubSpot — 2025",
      },
    ],
  },
  {
    title: "AI visitors are buyers, not tourists",
    stats: [
      {
        headline: "Visitors from AI sign up 11x more often than search visitors",
        detail: "1.66% sign-up rate vs 0.15%, across 1,277 sites.",
        source: "Microsoft Clarity — Nov 2025",
      },
      {
        headline: "AI-referred shoppers convert 42% better and drive 37% more revenue per visit",
        source: "Adobe Analytics, over 1 trillion US retail visits, via TechCrunch — Q1 2026",
      },
      {
        headline: "Brands cited inside a Google AI Overview get 120% more organic clicks",
        source: "Seer Interactive, 5.47M queries across 53 brands — Apr 2026",
      },
      {
        headline: "Not every study agrees — one found no overall conversion gap",
        detail: "4.87% vs 4.60% conversion, not statistically significant, across 54 sites.",
        source: "Amsive — 2026",
        counterpoint: true,
      },
    ],
  },
  {
    title: "Getting cited is a science, not luck",
    stats: [
      {
        headline: "The right content lifts AI visibility by up to 40% overall",
        source: "Aggarwal et al., \"GEO: Generative Engine Optimization,\" KDD 2024 (arXiv:2311.09735)",
      },
      {
        headline: "Quoting a credible source: +41% AI visibility — the single best move",
        source: "Princeton, Georgia Tech, Allen Institute for AI & IIT Delhi — KDD 2024",
      },
      {
        headline: "Adding a real statistic: +33% AI visibility",
        source: "Princeton, Georgia Tech, Allen Institute for AI & IIT Delhi — KDD 2024",
      },
      {
        headline: "Keyword stuffing is the only tactic that backfires: −8.7%",
        source: "Princeton, Georgia Tech, Allen Institute for AI & IIT Delhi — KDD 2024",
      },
    ],
  },
  {
    title: "Local businesses are mostly invisible to AI",
    stats: [
      {
        headline: "ChatGPT names about 1 local business per search — 98.8% never appear",
        source: "SOCi Local Visibility Index, ~350,000 locations across 2,751 brands — Jan 2026",
      },
      {
        headline: "45% now use AI to find local businesses, up from 6% a year ago",
        source: "BrightLocal Local Consumer Review Survey — Mar 2026",
      },
    ],
  },
];

const CSS = `
  .rs-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .rs-group-title { font-size: var(--font-size-h3); font-weight: 800; letter-spacing: -0.01em; margin: 0 0 var(--space-5); max-width: 640px; }
  .rs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); }
  @media (max-width: 860px) { .rs-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .rs-grid { grid-template-columns: 1fr; } }
  .rs-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: var(--space-2); }
  .rs-card.rs-counter { border-left: 3px solid var(--color-accent-ink); }
  .rs-headline { margin: 0; font-size: var(--font-size-body); font-weight: 700; color: var(--color-text); line-height: 1.4; }
  .rs-detail { margin: 0; font-size: var(--font-size-body-sm); color: var(--color-muted); line-height: 1.5; }
  .rs-source { margin: var(--space-1) 0 0; font-family: var(--font-mono); font-size: 0.6875rem; color: var(--color-muted); line-height: 1.4; }
`;

export default function ResearchPage() {
  return (
    <main
      style={{
        maxWidth: "1120px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{CSS}</style>

      <span className="rs-eyebrow">Research</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        The shift to AI search, in the numbers.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "660px",
          margin: 0,
        }}
      >
        For 20 years, Google gave you ten links to compete for. Now AI gives
        a customer 2 or 3 named businesses. If you&rsquo;re not one of them,
        you&rsquo;re invisible in that conversation — and you&rsquo;ll never
        see the lead you lost.
      </p>
      <p
        style={{
          marginTop: "var(--space-4)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          maxWidth: "660px",
        }}
      >
        Below are the numbers behind that claim. Every one carries its
        source. Read the full breakdown in the{" "}
        <Link href="/resources/what-is-geo-search" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
          Understanding GEO Search whitepaper
        </Link>
        .
      </p>

      {GROUPS.map((group, groupIndex) => (
        <section key={group.title} style={{ marginTop: groupIndex === 0 ? "var(--space-12)" : "var(--space-14)" }}>
          <h2 className="rs-group-title">{group.title}</h2>
          <div className="rs-grid">
            {group.stats.map((stat) => (
              <div key={stat.headline} className={`rs-card${stat.counterpoint ? " rs-counter" : ""}`}>
                <p className="rs-headline">{stat.headline}</p>
                {stat.detail ? <p className="rs-detail">{stat.detail}</p> : null}
                <p className="rs-source">{stat.source}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          See where you stand in these numbers.
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)", maxWidth: "480px", marginInline: "auto" }}>
          The free test shows how AI answers name your brand right now.
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
