/**
 * Blog post 1 — Why Small Businesses Stop Posting on Social Media
 * Route: /blog/why-small-businesses-stop-posting
 *
 * Content: docs/marketing/copy/blog-1-problem-statement.md
 *
 * Features:
 *  - Reading-friendly prose (max-width ~65ch)
 *  - JSON-LD Article schema (from copy file)
 *  - Waitlist CTA component at end of article
 *  - Internal link placeholders noted as comments
 *  - Static rendering (no dynamic data)
 *
 * Design system: all values from tokens.css.
 * Typography: body text at 16px/1.5 line-height for reading comfort.
 *
 * Note: The slug in the JSON-LD schema mainEntityOfPage uses the URL
 * from the copy file: /blog/why-small-businesses-stop-posting-social-media
 * The actual route is /blog/why-small-businesses-stop-posting (shorter).
 * The canonical URL in metadata uses the actual route.
 */

import type { Metadata } from "next";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title:
    "Why Small Businesses Stop Posting on Social Media | TrustIndex AI",
  description:
    "Most small businesses don't have a social media consistency problem. They have a starting problem. Here's why typical fixes fail — and what actually works.",
  alternates: {
    canonical:
      "https://trustindexai.com/blog/why-small-businesses-stop-posting",
  },
  openGraph: {
    title:
      "Why Small Businesses Stop Posting on Social Media | TrustIndex AI",
    description:
      "Most small businesses don't have a social media consistency problem. They have a starting problem. Here's why typical fixes fail — and what actually works.",
    url: "https://trustindexai.com/blog/why-small-businesses-stop-posting",
    siteName: "TrustIndex AI",
    type: "article",
    publishedTime: "2026-05-11",
    images: [
      {
        url: "https://trustindexai.com/blog/why-small-businesses-stop-posting/og-image.png",
        width: 1200,
        height: 630,
        alt: "Why Small Businesses Stop Posting on Social Media",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — Article schema (from blog-1-problem-statement.md)
// ---------------------------------------------------------------------------

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Why Small Businesses Stop Posting on Social Media (And What Actually Fixes It)",
  description:
    "Most small businesses don't have a social media consistency problem. They have a starting problem. Here's why typical fixes fail — and what actually works.",
  datePublished: "2026-05-11",
  dateModified: "2026-05-11",
  author: {
    "@type": "Organization",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
  publisher: {
    "@type": "Organization",
    name: "TrustIndex AI",
    logo: {
      "@type": "ImageObject",
      url: "https://trustindexai.com/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id":
      "https://trustindexai.com/blog/why-small-businesses-stop-posting-social-media",
  },
  image: {
    "@type": "ImageObject",
    url: "https://trustindexai.com/blog/why-small-businesses-stop-posting/og-image.png",
    width: 1200,
    height: 630,
  },
  keywords: [
    "how to post consistently on social media",
    "social media scheduling tool for small business",
    "AI social media post generator",
    "social media consistency small business",
  ],
  articleSection: "Social Media Marketing",
  inLanguage: "en",
};

// ---------------------------------------------------------------------------
// Prose styles (reusable token-based values)
// ---------------------------------------------------------------------------

const PROSE_STYLES = {
  h2: {
    fontSize: "var(--font-size-h2)",
    fontWeight: "var(--font-weight-semibold)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    lineHeight: "var(--line-height-h2)",
    marginTop: "var(--space-10)",
    marginBottom: "var(--space-4)",
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
    lineHeight: "var(--line-height-body)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    marginTop: 0,
    marginBottom: "var(--space-4)",
  },
  pMuted: {
    fontSize: "var(--font-size-body)",
    lineHeight: "var(--line-height-body)",
    color: "var(--color-muted)",
    fontFamily: "var(--font-family)",
    marginTop: 0,
    marginBottom: "var(--space-4)",
  },
  cite: {
    fontSize: "var(--font-size-caption)",
    color: "var(--color-muted)",
    fontFamily: "var(--font-family)",
    display: "block",
    marginTop: "var(--space-1)",
    fontStyle: "italic",
  },
  strong: {
    fontWeight: "var(--font-weight-semibold)",
    color: "var(--color-text)",
  },
  hr: {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "var(--space-8) 0",
  },
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
    { "@type": "ListItem", position: 2, name: "Blog", item: "https://trustindexai.com/blog" },
    {
      "@type": "ListItem",
      position: 3,
      name: "Why Small Businesses Stop Posting on Social Media",
      item: "https://trustindexai.com/blog/why-small-businesses-stop-posting",
    },
  ],
};

export default function BlogPost1Page() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <article
        aria-labelledby="blog-post-1-heading"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-16) var(--space-4)",
        }}
      >
        {/* Article header */}
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
            Social Media Marketing
          </p>
          <h1
            id="blog-post-1-heading"
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.2,
              marginBottom: "var(--space-4)",
            }}
          >
            Why Small Businesses Stop Posting on Social Media (And What
            Actually Fixes It)
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
            }}
          >
            <span>TrustIndex AI</span>
            <span aria-hidden="true">&middot;</span>
            <time dateTime="2026-05-11">11 May 2026</time>
            <span aria-hidden="true">&middot;</span>
            <span>6 min read</span>
          </div>
        </header>

        {/* Article body — content from blog-1-problem-statement.md */}

        <h2 style={PROSE_STYLES.h2}>
          The blank box wins more often than you think
        </h2>

        <p style={PROSE_STYLES.p}>
          You know you should post. You sat down three weeks ago intending to
          write something for LinkedIn. You opened a new tab, typed a sentence,
          deleted it, checked your email, and closed the tab. That was three
          weeks ago.
        </p>

        <p style={PROSE_STYLES.p}>
          This is not a discipline failure. It is not a time management problem.
          It is a specific, structural issue — and the tools most people reach
          for were not built to solve it.
        </p>

        <hr style={PROSE_STYLES.hr} />

        <h2 style={PROSE_STYLES.h2}>Why typical solutions don&rsquo;t work</h2>

        <h3 style={PROSE_STYLES.h3}>
          Scheduling tools assume you already have something to say
        </h3>

        <p style={PROSE_STYLES.p}>
          Buffer, Hootsuite, Later &mdash; these are excellent at one thing:
          taking content you have already written and putting it in a queue. The
          problem is that for most small business owners, writing the content is
          the entire problem. A scheduling tool does not help you stare at a
          blank caption box any less. It just adds one more piece of software to
          manage.
        </p>

        <p style={PROSE_STYLES.p}>
          According to one 2026 market survey, 43% of small businesses identify
          consistent content creation as a top challenge. Scheduling
          infrastructure is not what they are missing. The bottleneck is
          earlier &mdash; it is the words themselves.
        </p>
        <cite style={PROSE_STYLES.cite}>
          Source: Small Business Social Media Statistics, gitnux.org, 2026. The
          survey methodology and sample size are not publicly disclosed &mdash;
          treat as directional, not precise.
        </cite>

        <h3 style={PROSE_STYLES.h3}>
          AI generators that train on your data create a different problem
        </h3>

        <p style={PROSE_STYLES.p}>
          There is now no shortage of tools that will write your post for you.
          The challenge is understanding what happens to your content when you
          use them.
        </p>

        <p style={PROSE_STYLES.p}>
          Most AI writing tools retain your inputs &mdash; the topics you give
          them, the copy they generate, the context you provide about your
          business &mdash; and use that data to improve their models. For a
          business owner, this creates a reasonable concern: are your client
          relationships, your pricing strategies, your internal positioning
          becoming training data for a model that your competitors might also
          use?
        </p>

        <p style={PROSE_STYLES.p}>
          This is not hypothetical. Under GDPR, EU businesses using AI tools
          from US-based providers face data transfer obligations that many tools
          have not addressed clearly. The absence of a clear data retention
          policy in a tool&rsquo;s documentation is not reassurance &mdash; it
          is a gap. When you cannot find the answer, the safest assumption is
          that your data is being used.
        </p>

        {/* Internal link placeholder: [link: future-zdr-post] */}
        {/* Week 2: "What does it mean when an AI trains on your data?" → /blog/ai-trains-on-your-data-explainer */}

        <h3 style={PROSE_STYLES.h3}>
          Agencies solve the problem by removing you from it
        </h3>

        <p style={PROSE_STYLES.p}>
          A good social media agency will produce consistent, on-brand content.
          It will also cost between &euro;1,000 and &euro;3,000 per month for a
          small business, involve a three-day turnaround for revisions, and
          produce content that may or may not sound like you.
        </p>

        <p style={PROSE_STYLES.p}>
          For a business where the founder&rsquo;s voice is part of the value
          &mdash; which is most 1&ndash;10 person businesses &mdash; outsourcing
          the writing entirely often makes the content feel detached from the
          brand. The posts go out. They are grammatically correct. But they do
          not sound like the person who built the business.
        </p>

        <p style={PROSE_STYLES.pMuted}>
          Agencies are a reasonable solution if you have the budget and are
          comfortable handing over creative control. Most small business owners
          are not in that position.
        </p>

        <h3 style={PROSE_STYLES.h3}>
          Doing it yourself loses to running the business &mdash; every time
        </h3>

        <p style={PROSE_STYLES.p}>
          The most honest answer to why small businesses stop posting is this:
          when your attention is genuinely required somewhere urgent &mdash; a
          client call, a deadline, a cash-flow decision &mdash; the LinkedIn
          post does not get written. And then another week passes. And then it
          has been a month.
        </p>

        <p style={PROSE_STYLES.p}>
          One 2026 survey found that 56% of small businesses identify time
          management as their primary social media challenge. This is not
          surprising. For a business owner, every hour spent on marketing is an
          hour not spent on the thing that generates the revenue that pays for
          the marketing. The trade-off is real.
        </p>
        <cite style={PROSE_STYLES.cite}>
          Source: gitnux.org, 2026 &mdash; same caveats as above on methodology.
        </cite>

        <p style={PROSE_STYLES.p}>
          The issue is not willpower. It is that &ldquo;write and post
          consistently on social media&rdquo; is a task with high friction, low
          immediate feedback, and no external deadline. In the competition for
          your attention, it will usually lose.
        </p>

        <hr style={PROSE_STYLES.hr} />

        <h2 style={PROSE_STYLES.h2}>What actually works</h2>

        <p style={PROSE_STYLES.p}>
          The root problem is not scheduling. It is not even time. It is the gap
          between &ldquo;I have something to say&rdquo; and &ldquo;I have
          something ready to post.&rdquo;
        </p>

        <p style={PROSE_STYLES.p}>
          That gap &mdash; the starting gap &mdash; is what causes the
          blank-box paralysis. And it is the specific problem that
          draft-and-confirm tools are designed to close.
        </p>

        <p style={PROSE_STYLES.p}>Here is the framework:</p>

        <p style={PROSE_STYLES.p}>
          <strong style={PROSE_STYLES.strong}>
            Step 1: Separate ideation from execution.
          </strong>{" "}
          You do not need a finished post. You need a direction &mdash; a
          topic, a thought, a link you found interesting. That takes thirty
          seconds. The hard part is not having the idea. It is turning the idea
          into formatted, platform-appropriate copy.
        </p>

        <p style={PROSE_STYLES.p}>
          <strong style={PROSE_STYLES.strong}>
            Step 2: Let the first draft be imperfect and generated.
          </strong>{" "}
          If an AI can produce a 90% draft from your prompt &mdash; correct
          tone, right length for LinkedIn, hashtags included for Instagram
          &mdash; your job is not to write. Your job is to review, adjust, and
          approve. That is a fundamentally different cognitive task, and it takes
          three minutes instead of thirty.
        </p>

        <p style={PROSE_STYLES.p}>
          <strong style={PROSE_STYLES.strong}>
            Step 3: Keep a confirm step that you own.
          </strong>{" "}
          This is where most AI automation tools fail their users. Auto-publish
          features remove the starting friction but also remove your editorial
          control. If you are not reading what goes out under your brand name,
          you are not managing your brand &mdash; you are delegating it to a
          model that does not know your clients, your current situation, or your
          tone on a given day.
        </p>

        <p style={PROSE_STYLES.p}>
          The confirm step is not bureaucracy. It is the mechanism that keeps
          the content yours.
        </p>

        <p style={PROSE_STYLES.p}>
          <strong style={PROSE_STYLES.strong}>
            Step 4: Choose a tool that is honest about what it does with your
            content.
          </strong>{" "}
          If you are going to hand your business context to an AI tool
          regularly, you need to know what happens to it. Look for explicit data
          retention documentation. Look for a named AI model &mdash; not
          &ldquo;advanced AI,&rdquo; but a specific model from a named provider.
          Look for a clear statement about whether your content is used for
          training.
        </p>

        <p style={PROSE_STYLES.p}>
          For EU-based businesses specifically, look for a tool that is
          transparent about which AI providers process your content and whether
          those providers are contractually restricted from training on it.
          EU-region inference is something to ask about directly and verify
          against documentation &mdash; not just marketing claims.
        </p>

        {/* Internal link placeholder: [link: future-draft-confirm-post] */}
        {/* Week 4: "Why every small business needs a social media draft-and-approve workflow" → /blog/social-media-draft-approve-workflow */}

        <hr style={PROSE_STYLES.hr} />

        <h2 style={PROSE_STYLES.h2}>The honest summary</h2>

        <p style={PROSE_STYLES.p}>
          Most small businesses stop posting because the barrier to starting is
          higher than the time cost suggests. Scheduling tools do not fix that.
          AI tools that train on your data create a new problem while solving
          the old one. Agencies fix consistency but remove your voice. Doing it
          yourself loses to real work.
        </p>

        <p style={PROSE_STYLES.p}>
          The version of this that works is: AI-generated first draft, human
          review and approval, no auto-publishing, transparent data handling.
          That combination is not common in the current market &mdash; but it is
          what the problem actually requires.
        </p>

        <p style={PROSE_STYLES.p}>
          If you want a tool built around this, we are building it. Run the free AI Visibility Test and see where you stand today.
        </p>
      </article>

      {/* CTA section */}
      <section
        aria-labelledby="article-cta-heading"
        style={{
          backgroundColor: "var(--color-surface-muted)",
          padding: "var(--space-12) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
          <h2
            id="article-cta-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-3)",
            }}
          >
            We are building it.
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
            Run the free AI Visibility Test &mdash; see if ChatGPT, Claude, and Perplexity recommend you or your competitor.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <Link
              href="/test"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "52px",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontSize: "1rem",
                fontWeight: 700,
                fontFamily: "var(--font-family)",
                textDecoration: "none",
              }}
            >
              Run free test &mdash; no credit card
            </Link>
            <Link
              href="/login?plan=growth&next=checkout"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "52px",
                padding: "0 var(--space-6)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "1.5px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontSize: "1rem",
                fontWeight: 700,
                fontFamily: "var(--font-family)",
                textDecoration: "none",
              }}
            >
              See Growth plan &mdash; $99/mo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
