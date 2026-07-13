/**
 * /resources/geo-visibility-guide — Download landing for the 30-page guide.
 *
 * Growth plan bonus. Prominent PDF download, "what's inside" with all 8 part
 * titles + key stats, rich excerpt of Part 1 for SEO/GEO crawlability, and
 * a Plans CTA.
 *
 * JSON-LD: Article + BreadcrumbList
 * No client components — server component only.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SoftCTA } from "../../../../components/marketing/SoftCTA";
import { safeJsonLd } from "../../../../lib/safe-json-ld";

export const metadata: Metadata = {
  title:
    "The GEO Visibility Guide — How Small Businesses Get Cited by ChatGPT in 2026 | Ozvor",
  description:
    "A 30-page guide on Generative Engine Optimization for small businesses: how AI engines decide who to cite, the 5 traits of citation-worthy content, a 4-week posting calendar, local & industry playbooks, and a 90-day GEO roadmap. Included with every Ozvor Growth and Agency plan.",
  alternates: {
    canonical: "https://ozvor.com/resources/geo-visibility-guide",
  },
  openGraph: {
    title:
      "The GEO Visibility Guide — 30 pages on getting cited by ChatGPT, Claude & Perplexity | Ozvor",
    description:
      "The complete small-business guide to Generative Engine Optimization: peer-reviewed science, concrete posting cadences, local playbooks, and a 90-day roadmap. Included with every Ozvor Growth and Agency plan.",
    url: "https://ozvor.com/resources/geo-visibility-guide",
    siteName: "Ozvor",
    type: "article",
  },
};

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

const PARTS = [
  {
    number: "Part 1",
    title: "The AI Search Shift",
    highlight:
      "Why your SEO wins are going hollow — and the numbers proving it is already here.",
    stat: "68% of US Google searches now end with no click (SparkToro, 2026)",
  },
  {
    number: "Part 2",
    title: "How LLMs Actually Decide What to Cite",
    highlight:
      "The two doors (training memory vs. live retrieval), semantic matching, and why magic markup is a myth.",
    stat: "ChatGPT runs a live search on only ~34.5% of queries (Siana Marketing, 2026)",
  },
  {
    number: "Part 3",
    title: "The Anatomy of a Citation-Worthy Post",
    highlight:
      "The 5 traits the Princeton research proves — with before/after examples in real SMB verticals.",
    stat: "Right tactics lift AI visibility by up to 40% (Princeton / KDD 2024)",
  },
  {
    number: "Part 4",
    title: "Where AI Looks — Choosing Your Battlegrounds",
    highlight:
      "Source-authority pecking order, the great equalizer (LinkedIn), and per-business-type priority stacks.",
    stat: "Median cited LinkedIn post had just 15–25 reactions (Semrush, 2026)",
  },
  {
    number: "Part 5",
    title: "The 4-Week Posting Cadence That Works",
    highlight:
      "A literal Monday-start calendar — posts, formats, and platforms — you can run this week.",
    stat: "AI-cited URLs are ~26% fresher than top organic results (Ahrefs, 2025)",
  },
  {
    number: "Part 6",
    title: "The Local & Industry Playbook",
    highlight:
      "Vertical mini-playbooks for local services, B2B SaaS, professional services, and e-commerce.",
    stat: "87% of independent HVAC/plumbing contractors have zero AI citation share (5WPR, 2026)",
  },
  {
    number: "Part 7",
    title: "What NOT to Do, and How to Measure",
    highlight:
      "The six anti-patterns that actively hurt you, plus a simple measurement plan.",
    stat: "Keyword stuffing backfires at −8.7% visibility (Princeton / KDD 2024)",
  },
  {
    number: "Part 8",
    title: "Your 90-Day GEO Roadmap",
    highlight:
      "A week-by-week action plan from first audit to compounding citation share — and when to automate.",
    stat: "Only ~16% of brands systematically track AI visibility (HubSpot, 2025)",
  },
];

const KEY_NUMBERS = [
  {
    number: "900M",
    label: "ChatGPT weekly users",
    source: "OpenAI, Feb 2026",
  },
  {
    number: "2B+",
    label: "People reached by Google AI Overviews monthly",
    source: "Alphabet Q2 2025",
  },
  {
    number: "+40%",
    label: "Max visibility lift from the right content tactics",
    source: "Princeton / KDD 2024",
  },
  {
    number: "1.2%",
    label: "Local businesses ChatGPT recommends when asked",
    source: "SOCi 2026 Local Visibility Index",
  },
  {
    number: "+120%",
    label: "More organic clicks earned by cited brands in AI Overviews",
    source: "Seer Interactive, Apr 2026",
  },
  {
    number: "11×",
    label: "Higher sign-up rate from AI traffic vs. search traffic",
    source: "Microsoft Clarity, 1,277 sites",
  },
];

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const GUIDE_LD_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://ozvor.com/resources/geo-visibility-guide",
      headline:
        "The GEO Visibility Guide — How Small Businesses Get Cited by ChatGPT, Claude, Perplexity & Gemini in 2026",
      description:
        "A 30-page guide on Generative Engine Optimization for small businesses: peer-reviewed science, 5-trait citation framework, 4-week posting calendar, local & industry playbooks, and a 90-day roadmap.",
      author: { "@type": "Organization", name: "Ozvor" },
      publisher: {
        "@type": "Organization",
        name: "Ozvor",
        url: "https://ozvor.com",
      },
      datePublished: "2026-06-01",
      dateModified: "2026-06-24",
      inLanguage: "en",
      url: "https://ozvor.com/resources/geo-visibility-guide",
      about: { "@type": "Thing", name: "Generative Engine Optimization" },
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
          name: "GEO Visibility Guide",
          item: "https://ozvor.com/resources/geo-visibility-guide",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GeoVisibilityGuidePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(GUIDE_LD_DATA) }}
      />

      <article
        aria-labelledby="geo-guide-heading"
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
            Free with Growth plan &middot; 30-page PDF guide
          </p>

          <h1
            id="geo-guide-heading"
            style={{
              fontSize: "clamp(1.9rem, 4.5vw, 2.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            The GEO Visibility Guide
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
              color: "var(--color-muted)",
              lineHeight: 1.5,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            How Small Businesses Get Cited by ChatGPT, Claude, Perplexity &amp;
            Gemini in 2026
          </p>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              marginBottom: "var(--space-6)",
            }}
          >
            by Ozvor &middot; Version 1.0 &middot; 2026 &middot; 30 pages
          </p>

          {/* Primary CTA */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
              marginBottom: "var(--space-5)",
            }}
          >
            <Link
              href="/pricing"
              aria-label="Get The GEO Visibility Guide with a Growth or Agency plan"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "52px",
                padding: "0 var(--space-7)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                fontSize: "var(--font-size-body)",
                textDecoration: "none",
                fontFamily: "var(--font-family)",
              }}
            >
              Get the 30-page guide with Growth →
            </Link>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            Included with every Growth ($99/mo) and Agency plan — yours to
            download the moment you subscribe.
          </p>
        </header>

        {/* Key numbers */}
        <section
          aria-label="Key statistics"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-5) 0",
              letterSpacing: "-0.01em",
            }}
          >
            Why this matters now
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {KEY_NUMBERS.map((kn) => (
              <div
                key={kn.number}
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
                  {kn.number}
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
                  {kn.label}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    margin: 0,
                  }}
                >
                  {kn.source}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* What's inside — all 8 parts */}
        <section
          aria-label="Table of contents"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-5) 0",
              letterSpacing: "-0.01em",
            }}
          >
            What&rsquo;s inside — 8 parts
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {PARTS.map((part, i) => (
              <div
                key={i}
                style={{
                  padding: "var(--space-4) var(--space-5)",
                  backgroundColor: "var(--color-surface-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "var(--space-4)",
                  alignItems: "start",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: "var(--font-size-caption)",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "var(--color-primary)",
                    whiteSpace: "nowrap",
                    paddingTop: "2px",
                  }}
                >
                  {part.number}
                </span>
                <div>
                  <p
                    style={{
                      fontSize: "var(--font-size-body-sm)",
                      fontWeight: 700,
                      color: "var(--color-text)",
                      margin: "0 0 var(--space-1) 0",
                    }}
                  >
                    {part.title}
                  </p>
                  <p
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                      margin: "0 0 var(--space-2) 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {part.highlight}
                  </p>
                  <p
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-primary)",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    &ldquo;{part.stat}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rich excerpt: Part 1 — for SEO/GEO crawlability */}
        <section
          aria-labelledby="excerpt-heading"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            id="excerpt-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-5) 0",
              letterSpacing: "-0.01em",
            }}
          >
            From Part 1: The AI Search Shift
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            For twenty years, the deal between small businesses and Google was
            simple. You earned a spot on page one, customers scrolled the ten
            blue links, and the click was yours to win. That world is not slowing
            down. It is closing.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            A new layer has been bolted on top of search. AI answer engines —
            ChatGPT, Google&rsquo;s AI Overviews, Gemini, Perplexity, and
            Claude — now read the web for your customer and hand back a finished
            answer <em>before</em> a single link is shown. The customer who used
            to type &ldquo;best plumber near me&rdquo; and scroll through a list
            now asks an AI the same question. And here is the part that should
            make you sit up:{" "}
            <strong>the AI does not return ten options. It returns two or
            three names.</strong>
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            There is no page two. There is barely a page one. There is a short
            list, and you are either on it or you are invisible.
          </p>

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
              The &ldquo;stable ranking, collapsing clicks&rdquo; reality: one
              publisher held a steady #1 position on Google and watched its
              click-through rate fall from{" "}
              <strong>5.1% to 0.6%</strong> (PPA). Same ranking. Almost no
              clicks. The dashboard still showed green. The traffic was gone.
            </p>
          </blockquote>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-5)",
            }}
          >
            This is why &ldquo;we&rsquo;re ranking great!&rdquo; has become a
            dangerous thing to believe. Your SEO scoreboard can show a win while
            the actual game is being played — and lost — one layer above it.
            The full guide — the complete picture, the 5 citation traits proven
            by peer-reviewed research, and a week-by-week plan to fix it — is
            included with every Growth and Agency plan.
          </p>

          {/* Mid-content plan CTA */}
          <Link
            href="/pricing"
            aria-label="Get the full 30-page GEO Visibility Guide with a Growth or Agency plan"
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
              fontFamily: "var(--font-family)",
            }}
          >
            Get the full guide with Growth or Agency →
          </Link>
        </section>

        {/* Who it is for */}
        <section
          aria-label="Who this guide is for"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            Who this is for
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            This guide is written for three types of people: the small business
            owner who manages their own social presence and has heard &ldquo;you
            should be on LinkedIn&rdquo; more times than they can count; the
            solo marketer stretched across email, ads, SEO, and social at a
            10–50 person company; and the freelance social media manager who
            runs accounts for three to eight clients and needs a framework they
            can actually use.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            You can run every step yourself, by hand. At the end of the guide
            we show you where Ozvor automates the parts that quietly get
            dropped — and how to start for free.
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              fontStyle: "italic",
              color: "var(--color-muted)",
            }}
          >
            If you are a solo founder with limited time, start with Parts 3 and
            4.
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
            This guide is included free with the Growth plan
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Growth ($99/mo, or $831/yr with founder pricing) includes weekly
            automated monitoring across ChatGPT, Claude, Perplexity, Gemini,
            and Google AI Overview — 1 brand, 10 competitors, 250 prompts per
            week, plus citation tracking and GEO content drafts. The guide is
            yours to keep either way.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
            }}
          >
            <Link
              href="/pricing"
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
              See Growth &amp; Agency plans →
            </Link>
            <Link
              href="/kit"
              aria-label="Start with the Get-Cited Kit for a one-time $29"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-6)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
              }}
            >
              Or get the $29 Get-Cited Kit →
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
          Research anchor: Aggarwal et al., &ldquo;GEO: Generative Engine
          Optimization,&rdquo; ACM SIGKDD 2024, arXiv:2311.09735. All statistics
          are attributed inline and current as of mid-2026.
        </p>
      </article>
    </>
  );
}
