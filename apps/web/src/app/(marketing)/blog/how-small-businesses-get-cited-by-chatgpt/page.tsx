/**
 * Pillar page — How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity
 * Route: /blog/how-small-businesses-get-cited-by-chatgpt
 *
 * Content: docs/marketing/copy/pillar-geo-explained.md
 * Week 3 content calendar item — pillar page for GEO pivot.
 *
 * Features:
 *  - Reading time estimate at top (word count / 200 wpm)
 *  - JSON-LD Article schema from copy file
 *  - Internal links: blog-1 (live) + week-2 and week-4 placeholders (commented)
 *  - Inline waitlist CTA at end (WaitlistForm compact variant)
 *  - Comparison table: Traditional SEO vs GEO
 *  - Sources list at end
 *
 * Design system: all values from tokens.css.
 * Typography: same PROSE_STYLES pattern as blog post 1.
 * Static rendering: no dynamic data.
 *
 * Reading time: ~2510 words / 200 wpm ≈ 13 min read.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "../../../../components/marketing/WaitlistForm";
import { GeoGraphBackdrop } from "../../../../components/marketing/GeoGraphBackdrop";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title:
    "How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity | TrustIndex AI",
  description:
    "Learn how small businesses get cited by ChatGPT, Claude, and Perplexity. GEO (Generative Engine Optimization) explained with research, examples, and practical steps.",
  alternates: {
    canonical:
      "https://trustindexai.com/blog/how-small-businesses-get-cited-by-chatgpt",
  },
  openGraph: {
    title:
      "How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity | TrustIndex AI",
    description:
      "Learn how small businesses get cited by ChatGPT, Claude, and Perplexity. GEO (Generative Engine Optimization) explained with research, examples, and practical steps.",
    url: "https://trustindexai.com/blog/how-small-businesses-get-cited-by-chatgpt",
    siteName: "TrustIndex AI",
    type: "article",
    publishedTime: "2026-05-19",
    images: [
      {
        url: "https://trustindexai.com/blog/how-small-businesses-get-cited-by-chatgpt/og-image.png",
        width: 1200,
        height: 630,
        alt: "How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — Article schema (from pillar-geo-explained.md)
// ---------------------------------------------------------------------------

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity (and Why It Matters in 2026)",
  description:
    "A research-backed guide to Generative Engine Optimization (GEO) for small businesses — what it is, why it matters, and how consistent social media posting feeds AI citation systems.",
  author: {
    "@type": "Organization",
    name: "TrustIndex AI",
  },
  publisher: {
    "@type": "Organization",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
    logo: {
      "@type": "ImageObject",
      url: "https://trustindexai.com/logo.png",
    },
  },
  datePublished: "2026-05-19",
  dateModified: "2026-05-19",
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id":
      "https://trustindexai.com/blog/generative-engine-optimization-small-business",
  },
  keywords: [
    "generative engine optimization small business",
    "GEO",
    "AI search citation",
    "ChatGPT visibility",
    "LinkedIn AI citation",
  ],
  articleSection: "GEO / AI Search",
  inLanguage: "en",
};

// ---------------------------------------------------------------------------
// Prose styles — mirrors blog post 1 pattern
// ---------------------------------------------------------------------------

const PROSE: Record<string, React.CSSProperties> = {
  h2: {
    fontSize: "var(--font-size-h2)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    lineHeight: "var(--line-height-h2)",
    letterSpacing: "-0.02em",
    marginTop: "var(--space-10)",
    marginBottom: "var(--space-4)",
    scrollMarginTop: "84px",
  },
  h3: {
    fontSize: "var(--font-size-h3)",
    fontWeight: "var(--font-weight-semibold)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    lineHeight: "var(--line-height-h3)",
    marginTop: "var(--space-8)",
    marginBottom: "var(--space-3)",
  },
  p: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.8,
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    marginTop: 0,
    marginBottom: "var(--space-4)",
    textAlign: "justify",
    textJustify: "inter-word",
    hyphens: "auto",
  },
  pMuted: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.8,
    color: "var(--color-muted)",
    fontFamily: "var(--font-family)",
    marginTop: 0,
    marginBottom: "var(--space-4)",
    textAlign: "justify",
    textJustify: "inter-word",
    hyphens: "auto",
  },
  cite: {
    fontSize: "var(--font-size-caption)",
    color: "var(--color-muted)",
    fontFamily: "var(--font-family)",
    display: "block",
    marginTop: "var(--space-1)",
    marginBottom: "var(--space-4)",
    fontStyle: "italic",
  },
  hr: {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "var(--space-8) 0",
  },
  strong: {
    fontWeight: "var(--font-weight-semibold)",
    color: "var(--color-text)",
  },
  li: {
    fontSize: "var(--font-size-body)",
    lineHeight: "var(--line-height-body)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    marginBottom: "var(--space-3)",
  },
};

// ---------------------------------------------------------------------------
// Reading time helper
// Word count / 200 wpm. Called once — no state or side effects.
// ---------------------------------------------------------------------------

function computeReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min read`;
}

const READING_TIME = computeReadingTime(2510);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PillarGeoPage() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article
        aria-labelledby="pillar-heading"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-16) var(--space-4)",
        }}
      >
        {/* Whitepaper cover */}
        <header
          style={{
            position: "relative",
            overflow: "hidden",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-10) var(--space-8)",
            marginBottom: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <GeoGraphBackdrop opacity={0.4} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: "var(--font-size-caption)",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--color-primary)",
                border: "1px solid var(--color-highlight-border)",
                backgroundColor: "var(--color-badge-ai-bg)",
                borderRadius: "var(--radius-pill)",
                padding: "4px 12px",
                marginBottom: "var(--space-4)",
              }}
            >
              Whitepaper · GEO / AI Search
            </span>
            <h1
              id="pillar-heading"
              style={{
                fontSize: "clamp(1.75rem, 4.5vw, 2.6rem)",
                fontWeight: 800,
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                margin: "0 0 var(--space-4) 0",
                textWrap: "balance",
              }}
            >
              How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity
              <span style={{ color: "var(--color-primary)" }}> (and Why It Matters in 2026)</span>
            </h1>
            <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-5) 0", maxWidth: "60ch" }}>
              A research-backed guide to how AI answer engines decide which businesses to name —
              and the practical, honest playbook for earning those citations.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "var(--space-3)",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                fontWeight: 600,
              }}
            >
              <span>TrustIndex AI Research</span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-05-19">19 May 2026</time>
              <span aria-hidden="true">·</span>
              <span>{READING_TIME}</span>
            </div>
          </div>
        </header>

        {/* Hook */}
        <p style={PROSE.p}>
          Your potential customer in Lisboa types into ChatGPT: &ldquo;best
          independent dentist for cosmetic work in city centre.&rdquo; The AI
          answers with three names. One of them has posted on LinkedIn every week
          for the past three months with specific, useful content. The other two
          have not posted anywhere in over a year. Guess which name appears first.
          The question for your business is not whether this is happening. It is
          whether your name is in the answer when it does.
        </p>

        {/* Key takeaways */}
        <div
          style={{
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderLeft: "4px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-5) var(--space-6)",
            margin: "var(--space-6) 0",
          }}
        >
          <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", margin: "0 0 var(--space-3) 0", fontFamily: "var(--font-family)" }}>
            Key takeaways
          </p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <li style={PROSE.li}>Buyers increasingly ask AI before they search — and AI answers with a short list of names. If you&rsquo;re not on it, you&rsquo;re invisible.</li>
            <li style={PROSE.li}>AI engines cite sources they can find, parse, and trust — drawn from training data <em>and</em> live retrieval from places like Reddit, Wikipedia, LinkedIn, and your own site.</li>
            <li style={PROSE.li}>Citation-worthy content shares five traits: it&rsquo;s specific, sourced, answer-shaped, statistic-rich, and consistently published.</li>
            <li style={PROSE.li}>No tool can <em>guarantee</em> a citation — AI is non-deterministic — but you can measurably increase the probability, and track it.</li>
          </ul>
        </div>

        {/* Table of contents */}
        <nav
          aria-label="What's inside"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-5) var(--space-6)",
            margin: "0 0 var(--space-6) 0",
          }}
        >
          <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)", margin: "0 0 var(--space-3) 0", fontFamily: "var(--font-family)" }}>
            What&rsquo;s inside
          </p>
          <ol style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {[
              ["numbers", "The numbers behind the shift"],
              ["how-llms-cite", "How LLMs decide what to cite"],
              ["sources", "Where citations actually come from"],
              ["what-gets-cited", "What content gets cited"],
              ["five-traits", "Five traits of citation-worthy posts"],
              ["where-we-fit", "Where TrustIndex AI fits"],
              ["start", "Start building your GEO presence"],
            ].map(([id, label]) => (
              <li key={id} style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                <a href={`#${id}`} style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <hr style={PROSE.hr} />

        {/* Section: Numbers */}
        <h2 id="numbers" style={PROSE.h2}>The numbers behind the shift</h2>

        <p style={PROSE.p}>
          The way people find businesses is changing at a pace most small
          business owners have not caught up with yet.
        </p>

        <p style={PROSE.p}>
          Gartner predicted in February 2024 that traditional search engine
          volume would drop 25% by 2026 as customers shift to AI tools for
          recommendations and answers. That shift is well underway. ChatGPT
          reached 200 million weekly active users by August 2024 &mdash; double
          its count from November 2023. Perplexity, which launched in 2022,
          crossed 10 million monthly active users by January 2024 and reached 30
          million monthly active users by early 2025.
        </p>
        <cite style={PROSE.cite}>
          Sources: Gartner press release, February 2024; OpenAI / Axios, August
          2024; Backlinko Perplexity statistics, citing Perplexity data.
        </cite>

        <p style={PROSE.p}>
          When those users ask a question that overlaps with your business
          &mdash; &ldquo;best accountant for freelancers in Berlin,&rdquo;
          &ldquo;which social media tool should I use for my
          restaurant,&rdquo; &ldquo;reliable plumber in Lisbon city
          centre&rdquo; &mdash; ChatGPT, Claude, Perplexity, and Gemini
          generate an answer with names and sources. They do not show ten blue
          links. They give a recommendation.
        </p>

        <p style={PROSE.p}>
          Marketers are paying attention. A BrightEdge survey of more than 750
          search, content, and digital marketing professionals, conducted in June
          2025, found that 68% of organisations are actively changing their
          strategies to account for AI search, and that more than half have
          tasked their SEO or digital marketing teams with leading those
          efforts.
        </p>
        <cite style={PROSE.cite}>
          Source: BrightEdge press release, &ldquo;BrightEdge Survey Reveals
          68% of Marketers Are Embracing AI Search Shift,&rdquo; brightedge.com.
        </cite>

        {/* Internal link: blog-1 */}
        <p style={PROSE.pMuted}>
          For a scenario-driven look at why most businesses are falling
          behind on social media consistency, read:{" "}
          <Link
            href="/blog/why-small-businesses-stop-posting"
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontFamily: "var(--font-family)",
            }}
          >
            Why Small Businesses Stop Posting on Social Media
          </Link>
          .
        </p>

        {/* Internal link placeholder: Week 2 */}
        {/* INTERNAL LINK (pending publish): /blog/your-customer-asked-chatgpt — Week 2 post */}

        <hr style={PROSE.hr} />

        {/* Section: What is GEO */}
        <h2 style={PROSE.h2}>
          What is Generative Engine Optimization (GEO)?
        </h2>

        <p style={PROSE.p}>
          Generative Engine Optimization, or GEO, is the practice of structuring
          your content so that large language models are more likely to cite it
          when answering relevant questions.
        </p>

        <p style={PROSE.p}>
          The term was formally defined in a research paper by academics at
          Princeton University, Georgia Tech, the Allen Institute for AI, and
          IIT Delhi, published at KDD 2024 &mdash; one of the most competitive
          academic conferences in data science. The paper introduced a benchmark
          of 10,000 diverse user queries and tested nine content optimization
          methods against AI search systems to measure what drives citation
          visibility.
        </p>
        <cite style={PROSE.cite}>
          Source: Aggarwal et al., &ldquo;GEO: Generative Engine
          Optimization,&rdquo; Proceedings of the 30th ACM SIGKDD Conference on
          Knowledge Discovery and Data Mining, 2024, arxiv.org/abs/2311.09735,
          doi.org/10.1145/3637528.3671900.
        </cite>

        <p style={PROSE.p}>
          Traditional SEO is about ranking in Google&rsquo;s index. GEO is about
          being cited in AI-generated answers. The mechanisms overlap but are not
          the same.
        </p>

        {/* Comparison table: SEO vs GEO */}
        <div
          style={{ overflowX: "auto", marginBottom: "var(--space-6)" }}
          role="region"
          aria-label="Traditional SEO vs Generative Engine Optimization comparison"
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
                  }}
                >
                  Dimension
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
                  Traditional SEO
                </th>
                <th
                  scope="col"
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    textAlign: "left",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-primary)",
                  }}
                >
                  Generative Engine Optimization (GEO)
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Goal",
                  "Rank on page 1 of Google",
                  "Be cited in AI-generated answers",
                ],
                [
                  "Primary signal",
                  "Backlinks + keyword relevance",
                  "Structured, authoritative, specific content",
                ],
                [
                  "Key platforms",
                  "Google, Bing",
                  "ChatGPT, Claude, Perplexity, Gemini",
                ],
                [
                  "Content format",
                  "Keyword-optimised pages",
                  "Specific, data-backed posts and articles",
                ],
                [
                  "Timescale to impact",
                  "Months to years",
                  "Weeks to months (retrieval-based systems)",
                ],
                [
                  "Citation mechanism",
                  "Blue link in SERP",
                  "Named source embedded in AI response",
                ],
              ].map(([dim, seo, geo], i) => (
                <tr
                  key={dim}
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
                      verticalAlign: "top",
                    }}
                  >
                    {dim}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      color: "var(--color-muted)",
                      verticalAlign: "top",
                    }}
                  >
                    {seo}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      color: "var(--color-text)",
                      fontWeight: "var(--font-weight-medium)",
                      verticalAlign: "top",
                    }}
                  >
                    {geo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={PROSE.p}>
          Neither replaces the other. Businesses that want to be visible in 2026
          benefit from doing both. But GEO is where most small businesses have
          done nothing yet &mdash; which means the field is still open.
        </p>

        <hr style={PROSE.hr} />

        {/* Section: How LLMs decide */}
        <h2 id="how-llms-cite" style={PROSE.h2}>How LLMs decide what to cite</h2>

        <p style={PROSE.p}>
          To understand GEO, you need to understand how different AI systems
          actually pull in content when answering questions. There are two
          distinct mechanisms at work.
        </p>

        <h3 style={PROSE.h3}>Training data</h3>
        <p style={PROSE.p}>
          When a language model is trained, it processes a large slice of the
          internet. Content that appears frequently, from sources that appear
          frequently, gets encoded into the model&rsquo;s weights. This is why
          Wikipedia, Reddit, and LinkedIn are heavily represented in AI answers
          &mdash; they have been indexed at scale. For small businesses, this
          path to visibility is slow: content you publish today will not appear
          in a model&rsquo;s training data until the next major training run,
          which can take a year or more.
        </p>

        <h3 style={PROSE.h3}>Live retrieval (real-time search)</h3>
        <p style={PROSE.p}>
          This is where the faster opportunity lies. ChatGPT has offered Browse
          with Bing since 2023, allowing the model to fetch and synthesise live
          web content in response to queries. Perplexity was built from the
          ground up as a retrieval-augmented AI &mdash; every answer it generates
          includes real-time web search, with clickable citations for each
          source. Claude (Anthropic) has offered web search capability since
          2024. Gemini is deeply integrated with Google&rsquo;s live index.
        </p>

        <p style={PROSE.p}>
          For small businesses, the practical implication is this: content you
          publish on LinkedIn today can be retrieved and cited by Perplexity or
          ChatGPT Search within days or weeks &mdash; not after a model
          retraining cycle. The path to AI citation is faster than most people
          assume, if the content is structured correctly.
        </p>

        <p style={PROSE.p}>
          The caveat is phrasing. Retrieval-based systems match your content to
          queries by semantic relevance. If a customer asks &ldquo;best dentist
          for invisalign in city centre&rdquo; and your LinkedIn post says
          &ldquo;we offer Invisalign consultations at our city-centre
          clinic,&rdquo; those words need to be there. Vague posts
          (&ldquo;we love helping our clients smile&rdquo;) do not get retrieved
          because they do not match any specific query.
        </p>

        <hr style={PROSE.hr} />

        {/* Section: Where citations come from */}
        <h2 id="sources" style={PROSE.h2}>Where citations actually come from</h2>

        <p style={PROSE.p}>
          Not all content is cited equally. Semrush conducted a three-month
          study of the most-cited domains across AI search systems. Reddit leads
          with a citation frequency of 40.1%. Wikipedia follows. LinkedIn ranks
          as the second most-cited domain overall, and the top-cited domain for
          professional queries.
        </p>
        <cite style={PROSE.cite}>
          Source: Semrush, &ldquo;The Most-Cited Domains in AI: A 3-Month
          Study,&rdquo; semrush.com.
        </cite>

        <p style={PROSE.p}>
          In a separate study of 89,000 LinkedIn URLs cited by ChatGPT Search,
          Google AI Mode, and Perplexity &mdash; analysed across 325,000 unique
          prompts &mdash; LinkedIn appeared in 11% of AI responses on average.
        </p>
        <cite style={PROSE.cite}>
          Source: Semrush, &ldquo;We Analyzed 89K LinkedIn URLs Cited in AI
          Search: Here&rsquo;s What Drives Visibility,&rdquo; semrush.com.
        </cite>

        <p style={PROSE.p}>
          For B2B businesses and professional services, LinkedIn is the clearest
          opportunity. For consumer-facing local businesses, Reddit and Quora
          threads about your niche, as well as blog posts on your own domain,
          are the most reachable citation sources.
        </p>

        <p style={{ ...PROSE.p, fontWeight: "var(--font-weight-semibold)" }}>
          The practical hierarchy for most small businesses:
        </p>
        <ol
          style={{
            padding: "0 0 0 var(--space-6)",
            marginBottom: "var(--space-6)",
          }}
        >
          {[
            "LinkedIn — highest practical impact for professional services and B2B",
            "Reddit and Quora — effective for businesses in consumer niches with active communities",
            "Blog posts on your own domain — slower to build authority but owned by you",
            "Industry directories and press — high trust, harder to produce at volume",
          ].map((item) => (
            <li key={item} style={PROSE.li}>
              {item}
            </li>
          ))}
        </ol>

        {/* Internal link placeholder: Week 4 */}
        {/* INTERNAL LINK (pending publish): /blog/5-linkedin-post-types-chatgpt-cites — Week 4 */}

        <hr style={PROSE.hr} />

        {/* Section: What content gets cited */}
        <h2 id="what-gets-cited" style={PROSE.h2}>What content gets cited</h2>

        <p style={PROSE.p}>
          The Princeton GEO paper did not just name the problem. It tested
          solutions. The researchers evaluated nine optimization methods and
          measured their effect on citation visibility across AI search systems.
          The two strongest individual techniques were statistics addition
          (adding specific numerical data to content) and quotation addition
          (adding authoritative quotes or attributed statements). These methods
          improved position-adjusted citation visibility by up to 40&ndash;41%
          relative to baseline.
        </p>
        <cite style={PROSE.cite}>
          Source: Aggarwal et al., KDD 2024, arxiv.org/abs/2311.09735.
          Specific figures: 41% for quotation addition, ~40% for statistics
          addition on Position-Adjusted Word Count metric.
        </cite>

        <p style={PROSE.p}>
          The Semrush LinkedIn study adds granular data on what gets cited in
          practice. LinkedIn articles dominate citations across all three AI
          platforms, accounting for 50&ndash;66% of cited LinkedIn content.
          Feed posts account for 15&ndash;28%. Critically, the median cited
          LinkedIn post has only 15&ndash;25 reactions &mdash; AI search does
          not reward the most-liked posts, it rewards the most relevant answers.
        </p>
        <cite style={PROSE.cite}>
          Source: Semrush, &ldquo;We Analyzed 89K LinkedIn URLs Cited in AI
          Search,&rdquo; semrush.com.
        </cite>

        <hr style={PROSE.hr} />

        {/* Section: Five traits */}
        <h2 id="five-traits" style={PROSE.h2}>Five traits of citation-worthy posts</h2>

        <p style={PROSE.p}>
          Research points to five consistent traits in content that AI systems
          cite, across both the GEO academic literature and observed citation
          patterns in practice:
        </p>

        <ol
          style={{
            padding: "0 0 0 var(--space-6)",
            marginBottom: "var(--space-6)",
          }}
        >
          {[
            {
              label: "Specific over general.",
              body: "A post about 'three things to check before signing a commercial lease in Portugal' will be cited for a narrow query. A post about 'the importance of understanding your lease' will not match any query specifically enough.",
            },
            {
              label: "Data-backed.",
              body: "Content that includes specific numbers, statistics, or attributed findings performs significantly better in AI citation studies than content with only qualitative claims. Even approximate figures help.",
            },
            {
              label: "Opinionated, not bland.",
              body: "AI systems drawing on search results prefer content with a clear stance — not inflammatory, but not hedged into meaninglessness. 'We recommend X over Y for small retailers because of Z' is more useful than 'there are many options to consider.'",
            },
            {
              label: "One clear idea per post.",
              body: "Content that tries to cover everything gets cited for nothing. A post that thoroughly addresses one question gets retrieved when that question is asked.",
            },
            {
              label: "Consistent cadence.",
              body: "A single excellent post is not a citation strategy. AI systems that retrieve live content see freshness as a relevance signal. Posting consistently — not daily, but regularly — builds the content base that retrieval systems can draw on.",
            },
          ].map((item) => (
            <li key={item.label} style={PROSE.li}>
              <strong style={PROSE.strong}>{item.label}</strong> {item.body}
            </li>
          ))}
        </ol>

        <hr style={PROSE.hr} />

        {/* Section: Anatomy of a post */}
        <h2 style={PROSE.h2}>
          The anatomy of a citation-worthy LinkedIn post
        </h2>

        <p style={PROSE.p}>
          The difference between content that gets cited and content that does
          not often comes down to a few structural choices. Here are three
          examples.
        </p>

        <PostExample
          title="Example 1 — The accountant"
          bad="Tax season is here. Make sure you stay on top of your accounts. We're here to help."
          good="Three expenses most freelancers in Portugal miss at tax time: (1) home office deduction — up to €250 per year if you work from home consistently; (2) professional training costs — courses directly related to your activity are fully deductible; (3) equipment depreciation — laptops and software over €300 can be depreciated rather than expensed fully in year one. Each one requires documented receipts. Most of our clients recover between €400–€900 by catching these three."
          note="The second version will be retrieved when someone asks ChatGPT 'what can freelancers deduct in Portugal.' The first will not be retrieved for any query."
        />

        <PostExample
          title="Example 2 — The dentist"
          bad="We offer a wide range of dental services for the whole family. Book your appointment today."
          good="Cosmetic consultations in our Lisbon city-centre clinic: Invisalign assessments take 20 minutes. We assess bite alignment, spacing, and the likely treatment length — typically 6–18 months depending on complexity. We see 3–4 new cosmetic patients per week; most found us through a recommendation. If you have been told by another clinic that your case is complex, it is usually worth a second opinion."
          note="The second version is specific enough to be retrieved for 'invisalign consultation Lisbon' or 'cosmetic dentist city centre.'"
        />

        <PostExample
          title="Example 3 — The social media agency"
          bad="We help businesses grow their online presence. Let us tell your story."
          good="The LinkedIn posts that get the most organic reach from our clients' accounts: (1) a single specific insight, not a list of seven; (2) first line that states an outcome or counter-intuitive fact; (3) no more than one link, placed in the first comment. Accounts that post twice per week consistently outperform accounts that post five times in a burst and then nothing. We have seen this pattern across 40+ client accounts over 18 months."
          note="The third version earns citations because it answers the specific question 'what makes LinkedIn posts perform well' with attributed, testable claims."
        />

        <hr style={PROSE.hr} />

        {/* Section: Where TrustIndex AI fits */}
        <h2 id="where-we-fit" style={PROSE.h2}>Where TrustIndex AI fits</h2>

        <p style={PROSE.p}>
          The research is clear on what builds GEO visibility: consistent posting
          of specific, structured, useful content. The difficulty for most small
          business owners is not understanding that &mdash; it is doing it, week
          after week, without a dedicated marketing hire.
        </p>

        <p style={PROSE.p}>
          TrustIndex AI is built to handle the consistency problem. You tell it
          what you want to say &mdash; a topic, a link, a brief &mdash; and
          Anthropic Claude Sonnet drafts a post shaped for the platform you are
          posting to and structured for the specific, direct style that AI
          citation research identifies as most effective. You review the draft,
          edit if needed, and approve it. Nothing posts without your sign-off.
          The AI disclosure badge on every draft is visible and non-dismissable
          &mdash; you always know what is AI-generated before it goes to your
          audience.
        </p>

        <p style={PROSE.p}>
          The Zero Data Retention (ZDR) arrangement between TrustIndex AI and
          Anthropic means your content is not stored by Anthropic after the AI
          call ends and is never used to train any model. For EU users, inference
          runs on AWS Bedrock in Frankfurt &mdash; your content does not leave
          the EU during processing.
        </p>

        <p style={PROSE.p}>
          The product does not guarantee AI citations. No tool can. What it gives
          you is the consistent posting cadence and the structured, specific
          content that the research identifies as the best-documented inputs to
          citation visibility.
        </p>

        <hr style={PROSE.hr} />

        {/* Section: CTA */}
        <h2 id="start" style={PROSE.h2}>Start building your GEO presence</h2>

        <p style={PROSE.p}>
          The businesses that show up in AI answers in 2026 and 2027 are the
          ones posting consistently now. Not every week is perfect. Not every
          post gets cited. But the content base accumulates, and AI retrieval
          systems have something to find and cite when a relevant query comes in.
        </p>

        <p style={PROSE.p}>
          Join the TrustIndex AI waitlist. The first 100 waitlist members who
          convert at launch receive a 30% founder discount &mdash; applied only
          when you pay annually (&euro;831 per year for Growth, &euro;1,251 per
          year for Agency) &mdash; plus a 30-day money-back guarantee.
        </p>

        {/* Sources */}
        <hr style={PROSE.hr} />
        <section aria-label="Sources">
          <h3 style={PROSE.h3}>Sources used in this article</h3>
          <ul
            style={{
              padding: "0 0 0 var(--space-4)",
              margin: 0,
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: "var(--line-height-body)",
            }}
          >
            {[
              "Gartner, \"Gartner Predicts Search Engine Volume Will Drop 25% by 2026,\" February 2024",
              "OpenAI / Axios, ChatGPT 200 million weekly active users announcement, August 2024",
              "Backlinko, Perplexity AI statistics, citing Perplexity data through 2025",
              "BrightEdge, \"BrightEdge Survey Reveals 68% of Marketers Are Embracing AI Search Shift,\" June 2025",
              "Aggarwal et al., \"GEO: Generative Engine Optimization,\" KDD 2024 (arxiv.org/abs/2311.09735)",
              "Semrush, \"The Most-Cited Domains in AI: A 3-Month Study,\" semrush.com",
              "Semrush, \"We Analyzed 89K LinkedIn URLs Cited in AI Search: Here's What Drives Visibility,\" semrush.com",
            ].map((s) => (
              <li
                key={s}
                style={{ marginBottom: "var(--space-2)", fontStyle: "italic" }}
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      </article>

      {/* Inline waitlist CTA — compact variant per spec */}
      <section
        aria-labelledby="pillar-waitlist-heading"
        style={{
          backgroundColor: "var(--color-surface-muted)",
          padding: "var(--space-12) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
          <h2
            id="pillar-waitlist-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-3)",
            }}
          >
            Join the waitlist &mdash; founding member pricing
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
            First 100 waitlist members who convert at launch receive a 30%
            founder discount on annual plans. 30-day money-back guarantee.
          </p>
          <WaitlistForm compact />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Post example component — before / after layout
// ---------------------------------------------------------------------------

function PostExample({
  title,
  bad,
  good,
  note,
}: {
  title: string;
  bad: string;
  good: string;
  note: string;
}) {
  return (
    <div style={{ marginBottom: "var(--space-8)" }}>
      <h3 style={PROSE.h3}>{title}</h3>

      <div
        style={{
          backgroundColor: "var(--color-surface-muted)",
          border: "1px solid var(--color-border)",
          borderLeft: "4px solid var(--color-error)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-error)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
            marginTop: 0,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Not citation-worthy
        </p>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            lineHeight: "var(--line-height-body)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          &ldquo;{bad}&rdquo;
        </p>
      </div>

      <div
        style={{
          backgroundColor: "var(--color-surface-muted)",
          border: "1px solid var(--color-border)",
          borderLeft: "4px solid var(--color-success)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-3)",
        }}
      >
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-success)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
            marginTop: 0,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Citation-worthy
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
          &ldquo;{good}&rdquo;
        </p>
      </div>

      <p
        style={{
          ...PROSE.pMuted,
          fontSize: "var(--font-size-caption)",
          fontStyle: "italic",
        }}
      >
        {note}
      </p>
    </div>
  );
}
