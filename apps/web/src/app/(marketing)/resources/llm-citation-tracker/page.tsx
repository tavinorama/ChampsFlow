/**
 * /resources/llm-citation-tracker — Download landing for the tracker.
 *
 * Summarises PART A methodology only (PART B — internal spreadsheet build spec
 * — is deliberately NOT exposed). Two download buttons:
 *   - LLM-Citation-Tracker.xlsx  (the spreadsheet)
 *   - LLM-Citation-Tracker-Methodology.pdf  (the methodology)
 *
 * JSON-LD: TechArticle + BreadcrumbList.
 * Server component — no client interactivity needed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SoftCTA } from "../../../../components/marketing/SoftCTA";

export const metadata: Metadata = {
  title:
    "LLM Citation Tracker — Monitor When ChatGPT, Claude & Perplexity Name Your Business | Ozvor",
  description:
    "A spreadsheet template and methodology for tracking when AI answer engines cite your business. 10 minutes a week, no tools required. The .xlsx template and 7-page methodology are included with every Ozvor Growth and Agency plan.",
  alternates: {
    canonical: "https://ozvor.com/resources/llm-citation-tracker",
  },
  openGraph: {
    title:
      "LLM Citation Tracker — the spreadsheet to monitor your AI search visibility | Ozvor",
    description:
      "Track when ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview name your business. 10 minutes a week. Free .xlsx template and methodology PDF.",
    url: "https://ozvor.com/resources/llm-citation-tracker",
    siteName: "Ozvor",
    type: "article",
  },
};

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

const ENGINES = [
  {
    name: "ChatGPT",
    note: "~900M weekly users (OpenAI, Feb 2026). Runs a live search on only ~34.5% of queries — the rest answer from training memory.",
    pull: "Wikipedia, Reddit, homepages, news; live search results when triggered.",
  },
  {
    name: "Perplexity",
    note: "Built answer-first; almost always shows its sources with visible citations. Your fastest feedback loop.",
    pull: "Reddit is its #1 cited domain; heavy on fresh web sources (Profound, 2026).",
  },
  {
    name: "Claude",
    note: "Increasingly used for research and B2B decisions. Searches the live web only when the question needs current info.",
    pull: "Authoritative, well-structured sources; cites less visibly than Perplexity.",
  },
  {
    name: "Gemini",
    note: "Over 750M monthly users (Alphabet, Q4 2025). Grounded in Google's index and Maps for local questions.",
    pull: "Google Search results and Google Business Profile data (most accurate for local).",
  },
  {
    name: "Google AI Overview",
    note: "The AI answer box above normal Google results — 2B+ monthly users (Alphabet, Jul 2025). Worth tracking as a 5th engine.",
    pull: "The live Google index; favours content that already ranks.",
  },
];

const WHAT_TO_RECORD = [
  {
    signal: "Cited? (Y/N)",
    why: "The primary signal. 'Cited' means your business is named in the prose or your content is linked as a source. Be strict.",
  },
  {
    signal: "Position (1 / 2 / 3 / list / none)",
    why: "Being named first is worth far more than being buried fourth. Position trend over weeks tells you whether you're climbing.",
  },
  {
    signal: "Sentiment (positive / neutral / negative / inaccurate)",
    why: "'Inaccurate' is the most actionable flag. Business-profile info was only ~68% accurate on ChatGPT and Perplexity in one large study (SOCi, 2026).",
  },
  {
    signal: "Source URL cited",
    why: "When an engine links a URL (Perplexity and ChatGPT Search do this most), record it. This tells you exactly which content the AI is retrieving.",
  },
  {
    signal: "Competitor cited",
    why: "Knowing who was cited instead of you — and from where — tells you what 'winning' looks like in your category.",
  },
];

const HONEST_CAVEATS = [
  "You only see the queries you think to run — test the questions customers actually ask, not your business name.",
  "Answers vary run to run. Ask ChatGPT the same thing 100 times and it surfaces ~44 different brands, but only ~5 appear 80%+ of the time (Search Engine Land / Fishkin, Feb 2026). The trend over weeks is the signal.",
  "Log out and use a fresh/incognito session so results are not personalised to you.",
  '"Mentioned" and "cited with a link" are different things. Track both.',
];

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const TRACKER_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://ozvor.com/resources/llm-citation-tracker",
      headline:
        "LLM Citation Tracker — Monitor When ChatGPT, Claude, Perplexity & Gemini Mention Your Business",
      description:
        "A manual methodology and spreadsheet template for tracking AI citation visibility. 10 minutes per week, no tools or subscriptions required.",
      author: { "@type": "Organization", name: "Ozvor" },
      publisher: {
        "@type": "Organization",
        name: "Ozvor",
        url: "https://ozvor.com",
      },
      datePublished: "2026-06-01",
      dateModified: "2026-06-24",
      inLanguage: "en",
      url: "https://ozvor.com/resources/llm-citation-tracker",
      about: {
        "@type": "Thing",
        name: "AI citation monitoring for small businesses",
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://ozvor.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Resources",
          item: "https://ozvor.com/resources",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "LLM Citation Tracker",
          item: "https://ozvor.com/resources/llm-citation-tracker",
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LlmCitationTrackerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: TRACKER_LD }}
      />

      <article
        aria-labelledby="tracker-heading"
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-20)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        {/* Hero */}
        <header style={{ marginBottom: "var(--space-10)" }}>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-primary)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "var(--space-3)",
            }}
          >
            Free resource &middot; Spreadsheet template + methodology PDF
          </p>

          <h1
            id="tracker-heading"
            style={{
              fontSize: "clamp(1.9rem, 4.5vw, 2.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            The LLM Citation Tracker
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
              color: "var(--color-muted)",
              lineHeight: 1.5,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Monitor when ChatGPT, Claude, Perplexity &amp; Gemini mention your
            business — in 10 minutes a week
          </p>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              marginBottom: "var(--space-6)",
            }}
          >
            by Ozvor &middot; 2026 &middot; Included with paid plans
          </p>

          {/* Download buttons */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <Link
              href="/pricing"
              aria-label="Get the LLM Citation Tracker spreadsheet with a Growth or Agency plan"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "52px",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
                fontFamily: "var(--font-family)",
              }}
            >
              Get the tracker with Growth or Agency →
            </Link>
            <Link
              href="/kit"
              aria-label="Start with the $29 Get-Cited Kit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "52px",
                padding: "0 var(--space-6)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
                fontFamily: "var(--font-family)",
              }}
            >
              Or start with the $29 Kit →
            </Link>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            The spreadsheet and methodology are included with every Growth
            ($99/mo) and Agency ($249/mo) plan.
          </p>
        </header>

        {/* What this is */}
        <section
          aria-label="What this is"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            What this is — and why it matters
          </h2>

          <blockquote
            style={{
              margin: "0 0 var(--space-5) 0",
              padding: "var(--space-4)",
              borderLeft: "4px solid var(--color-primary)",
              backgroundColor: "var(--color-surface-muted)",
              borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontStyle: "italic",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              <strong>The one-sentence version:</strong> AI answer engines now hand
              customers two or three business names instead of ten blue links — and
              if yours isn&rsquo;t one of them, you lost the customer before they
              knew you existed. This tracker is the cheapest, most honest way to
              find out whether you&rsquo;re on that shortlist, starting this week,
              with nothing but a spreadsheet and ten minutes.
            </p>
          </blockquote>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            This document describes a manual methodology for tracking when
            ChatGPT, Claude, Perplexity, Gemini, and Google&rsquo;s AI Overviews
            cite your business or your published content in their answers. It
            also provides a spreadsheet template you can copy and begin using
            this week.
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            The methodology takes roughly <strong>10 minutes per week</strong>. It
            requires no tools, no subscriptions, and no technical setup. It gives
            you the most direct feedback available on whether your GEO efforts are
            producing results. Most businesses have no idea whether they&rsquo;re
            being cited or not — only around{" "}
            <strong>16% of brands systematically track AI search performance</strong>{" "}
            (HubSpot, citing Sep 2025 data). You&rsquo;re about to be in the
            minority that actually knows.
          </p>

          {/* Hard numbers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--space-3)",
              marginBottom: "var(--space-5)",
            }}
          >
            {[
              {
                n: "1.2%",
                l: "Local businesses ChatGPT recommends when asked",
                s: "SOCi 2026 Local Visibility Index",
              },
              {
                n: "98.8%",
                l: "Local businesses never mentioned at all",
                s: "SOCi 2026, ~350k locations",
              },
              {
                n: "+120%",
                l: "More clicks earned by cited brands in AI Overviews",
                s: "Seer Interactive, Apr 2026",
              },
            ].map((item) => (
              <div
                key={item.n}
                style={{
                  padding: "var(--space-4)",
                  backgroundColor: "var(--color-teal-surface)",
                  border: "1px solid var(--color-teal-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <p
                  style={{
                    fontSize: "clamp(1.6rem, 4vw, 2rem)",
                    fontWeight: 800,
                    color: "var(--color-primary)",
                    margin: "0 0 var(--space-1) 0",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {item.n}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-1) 0",
                    lineHeight: 1.4,
                  }}
                >
                  {item.l}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    margin: 0,
                  }}
                >
                  {item.s}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* The honest caveat */}
        <section
          aria-label="Honest caveats"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            The honest caveat
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            There is no public API that tells you when an AI names your business.
            ChatGPT does not notify you. Perplexity sends no alerts. The only way
            to know is to ask the engines yourself, manually, using the questions
            your customers would actually type. Running 10 queries across four AI
            platforms takes about 10 minutes. Do it once a week, record the results
            in the tracker, and review the pattern after four weeks.
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 600,
              color: "var(--color-text)",
              margin: "0 0 var(--space-2) 0",
            }}
          >
            Real limits to read your data correctly:
          </p>
          <ul
            style={{
              margin: "0 0 var(--space-4) 0",
              paddingLeft: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {HONEST_CAVEATS.map((caveat, i) => (
              <li
                key={i}
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.65,
                  color: "var(--color-text)",
                }}
              >
                {caveat}
              </li>
            ))}
          </ul>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              color: "var(--color-muted)",
              fontStyle: "italic",
            }}
          >
            This is not a perfect instrument. It is the best free, honest,
            do-it-yourself instrument that exists — and it gives you genuine,
            unmediated feedback no dashboard can fake. Run it with discipline and
            the pattern becomes undeniable within a month.
          </p>
        </section>

        {/* The four engines */}
        <section
          aria-label="The four AI engines to track"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            The engines — and why you test all of them
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            Each engine pulls from different places and updates on its own clock.
            Being named in one tells you little about the others. SOCi&rsquo;s 2026
            Local Visibility Index found only{" "}
            <strong>45% of the top-20 traditional local-search brands also appear
            in the top-20 AI recommendations</strong> (SOCi, ~350,000 locations).
            Different engines, different doors, different winners.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {ENGINES.map((eng) => (
              <div
                key={eng.name}
                style={{
                  padding: "var(--space-4)",
                  backgroundColor: "var(--color-surface-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: "var(--space-4)",
                  alignItems: "start",
                }}
              >
                <p
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 800,
                    color: "var(--color-primary)",
                    margin: 0,
                    paddingTop: "2px",
                  }}
                >
                  {eng.name}
                </p>
                <div>
                  <p
                    style={{
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-text)",
                      margin: "0 0 var(--space-1) 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {eng.note}
                  </p>
                  <p
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                      margin: 0,
                    }}
                  >
                    Pulls from: {eng.pull}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What to record */}
        <section
          aria-label="What to record each week"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            What to record — 5 signals per query
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {WHAT_TO_RECORD.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "var(--space-4)",
                  backgroundColor:
                    i % 2 === 0
                      ? "var(--color-surface)"
                      : "var(--color-surface-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
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
                  {item.signal}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {item.why}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Weekly cadence */}
        <section
          aria-label="The weekly routine"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            The weekly routine — 10 minutes, same day, every week
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            Weekly is the right rhythm. Retrieval indexes change constantly — in
            one study, Reddit&rsquo;s share of ChatGPT citations swung from ~60% of
            responses to ~10% inside six weeks (Semrush, 230k+ prompts). Monthly
            testing is too coarse to act on; daily testing is noise.
          </p>

          <ol
            style={{
              margin: "0 0 var(--space-5) 0",
              paddingLeft: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {[
              "Open a fresh/incognito browser session (so results are not personalised to you). Log out of AI accounts where you can.",
              "Run your live queries across the engines that matter to your audience — a sustainable default is your top 8–10 queries across ChatGPT + Perplexity + Gemini, rotating Claude and Google AI Overview in.",
              "Log each result as one row in the Weekly Log: query, engine, Cited Y/N, position, source URL, sentiment, competitor cited, a one-line note.",
              "Glance at the Dashboard. Your citation rate, per-engine breakdown, share-of-voice vs competitors, and sentiment mix update automatically.",
              "Done. Close the laptop. Ten minutes.",
            ].map((step, i) => (
              <li
                key={i}
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.65,
                  color: "var(--color-text)",
                }}
              >
                {step}
              </li>
            ))}
          </ol>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              color: "var(--color-muted)",
              fontStyle: "italic",
            }}
          >
            After <strong>four weeks</strong>, you have a trend you can trust. A
            realistic, healthy pattern: nothing for the first couple of weeks, then
            a first appearance once your content gets indexed and trusted —
            climbing from &ldquo;none&rdquo; to &ldquo;list&rdquo; to a named
            position.
          </p>
        </section>

        {/* Upgrade nudge */}
        <section
          aria-label="When to upgrade to automated monitoring"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            When to automate — and where Ozvor fits
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            This spreadsheet is genuinely useful, and for a single-location
            business testing a handful of queries it may be all you need for a
            while. But it has a ceiling you&rsquo;ll hit:
          </p>

          <ul
            style={{
              margin: "0 0 var(--space-5) 0",
              paddingLeft: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {[
              "Coverage: 10 minutes covers ~10 queries. Real categories have hundreds of phrasings.",
              "Memory and consistency: one person eyeballing answers is subject to mood, fatigue, and missed incognito sessions.",
              "Competitors and benchmarking: tracking share-of-voice by hand across multiple rivals and engines gets unmanageable fast.",
              "Scoring and content: the spreadsheet tells you that you're invisible. It doesn't tell you your overall standing or exactly what to publish next.",
            ].map((limit, i) => (
              <li
                key={i}
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.65,
                  color: "var(--color-text)",
                }}
              >
                {limit}
              </li>
            ))}
          </ul>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-5)",
            }}
          >
            That&rsquo;s the line where you graduate to{" "}
            <strong>Ozvor</strong> — the AI Search Visibility
            platform this tracker comes from. Ozvor automates everything
            above, computes your <strong>Ozvor AI Visibility Score</strong> (Brand 30% /
            Performance 35% / AI 35%), benchmarks you against your competitors,
            and builds a <strong>GEO content plan</strong> so you&rsquo;re not
            guessing what to publish.
          </p>
        </section>

        {/* Soft CTA nudge — free test */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <SoftCTA
            headline="Put this guide to work on your own brand"
            subline="The free AI Visibility Test shows your real citation rate across ChatGPT, Claude, and Perplexity in 60 seconds."
            primary={{ label: "Run the free test", href: "/test" }}
            secondary={{ label: "Or get the full $29 Kit with ready-to-publish content →", href: "/kit" }}
          />
        </div>

        {/* Plans CTA */}
        <section
          style={{
            padding: "var(--space-6)",
            border: "2px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "var(--color-surface)",
            marginBottom: "var(--space-6)",
          }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-3) 0",
            }}
          >
            Included with paid plans — or automate it entirely
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              margin: "0 0 var(--space-5) 0",
            }}
          >
            The tracker and methodology are free to download. When you&rsquo;re
            ready to scale:
          </p>

          <ul
            style={{
              margin: "0 0 var(--space-5) 0",
              paddingLeft: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <li
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.65,
              }}
            >
              <strong>Free</strong> — 1 brand, 1 competitor, a 10-prompt snapshot
              audit and Ozvor AI Visibility Score. No credit card.
            </li>
            <li
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.65,
              }}
            >
              <strong>Growth — $99/mo</strong> (or $831/yr with founder pricing) —
              1 brand, 10 competitors, 250 prompts, weekly automated monitoring,
              citation tracking, and GEO content. This is the automated version of
              this spreadsheet at 25× the coverage.
            </li>
            <li
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.65,
              }}
            >
              <strong>Agency — $249/mo</strong> (or $2,091/yr founder) — up to 25
              brands, white-label reports, client workflow.
            </li>
          </ul>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
            }}
          >
            <Link
              href="/#pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
              }}
            >
              See plans &amp; pricing →
            </Link>
            <Link
              href="/kit"
              aria-label="Start with the $29 Get-Cited Kit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-5)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
              }}
            >
              Or start with the $29 Kit →
            </Link>
          </div>
        </section>

        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
          }}
        >
          by Ozvor · ozvor.com · hello@ozvor.com
          <br />
          Research anchor: Aggarwal et al., &ldquo;GEO: Generative Engine
          Optimization,&rdquo; KDD 2024, arXiv:2311.09735. All figures attributed
          inline and current as of mid-2026.
        </p>
      </article>
    </>
  );
}
