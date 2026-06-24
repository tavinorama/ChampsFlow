/**
 * Blog index — TrustIndex AI
 * Route: /blog (within (marketing) route group)
 *
 * Lists all published blog posts. Order: newest first.
 * Each card shows: title, excerpt, read time, publication date.
 *
 * Static rendering: no dynamic data. Content hard-coded from finalised copy.
 *
 * Design system: all values from tokens.css.
 *
 * Posts:
 *  1. Pillar: How Small Businesses Get Cited by ChatGPT (Week 3, 2026-05-19) — newest
 *  2. Blog 1: Why Small Businesses Stop Posting (Week 1, 2026-05-11)
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — TrustIndex AI",
  description:
    "Practical advice for small businesses on social media, AI tools, GEO (Generative Engine Optimization), and content strategy.",
  alternates: {
    canonical: "https://trustindexai.com/blog",
  },
  openGraph: {
    title: "Blog — TrustIndex AI",
    description:
      "Practical advice for small businesses on social media, AI tools, GEO, and content strategy.",
    url: "https://trustindexai.com/blog",
    siteName: "TrustIndex AI",
    type: "website",
  },
};

// ---------------------------------------------------------------------------
// Blog post index data — newest first
// ---------------------------------------------------------------------------

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  readTime: string;
  publishedAt: string;
  publishedAtDisplay: string;
  isPillar?: boolean;
}

const POSTS: BlogPost[] = [
  {
    slug: "how-small-businesses-get-cited-by-chatgpt",
    title:
      "How Small Businesses Get Cited by ChatGPT, Claude, and Perplexity (and Why It Matters in 2026)",
    excerpt:
      "A research-backed guide to Generative Engine Optimization (GEO) — what it is, why it matters for small businesses, and how consistent social media posting builds the content base AI systems can find and cite.",
    readTime: "13 min read",
    publishedAt: "2026-05-19",
    publishedAtDisplay: "19 May 2026",
    isPillar: true,
  },
  {
    slug: "why-small-businesses-stop-posting",
    title:
      "Why Small Businesses Stop Posting on Social Media (And What Actually Fixes It)",
    excerpt:
      "Most small businesses don't have a social media consistency problem. They have a starting problem. Here's why typical fixes fail — and what actually works.",
    readTime: "6 min read",
    publishedAt: "2026-05-11",
    publishedAtDisplay: "11 May 2026",
  },
];

// ---------------------------------------------------------------------------
// JSON-LD — CollectionPage listing published articles
// ---------------------------------------------------------------------------

const blogIndexJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Blog — TrustIndex AI",
  description:
    "Practical advice for small businesses on social media, AI tools, GEO (Generative Engine Optimization), and content strategy.",
  url: "https://trustindexai.com/blog",
  isPartOf: {
    "@type": "WebSite",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://trustindexai.com/blog" },
    ],
  },
  hasPart: POSTS.map((post) => ({
    "@type": "BlogPosting",
    headline: post.title,
    url: `https://trustindexai.com/blog/${post.slug}`,
    datePublished: post.publishedAt,
  })),
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function BlogIndexPage() {
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "var(--space-12) var(--space-4)",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogIndexJsonLd) }}
      />
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-text)",
          fontFamily: "var(--font-family)",
          marginBottom: "var(--space-3)",
        }}
      >
        Blog
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-family)",
          marginBottom: "var(--space-8)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        Practical advice on social media consistency, GEO, and AI tools for
        small businesses.
      </p>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
        aria-label="Blog posts"
      >
        {POSTS.map((post) => (
          <li key={post.slug}>
            <article
              style={{
                backgroundColor: "var(--color-surface)",
                border: post.isPillar
                  ? "2px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
                boxShadow: post.isPillar
                  ? "var(--shadow-modal)"
                  : "var(--shadow-card)",
                transition: "box-shadow 0.15s",
              }}
            >
              {post.isPillar && (
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-primary)",
                    fontFamily: "var(--font-family)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "var(--space-2)",
                    marginTop: 0,
                  }}
                >
                  Pillar article &middot; GEO guide
                </p>
              )}

              <Link
                href={`/blog/${post.slug}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <h2
                  style={{
                    fontSize: "var(--font-size-h2)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-text)",
                    fontFamily: "var(--font-family)",
                    marginBottom: "var(--space-3)",
                    lineHeight: "var(--line-height-h2)",
                    marginTop: 0,
                  }}
                >
                  {post.title}
                </h2>
              </Link>

              <p
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: "var(--line-height-body)",
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-family)",
                  marginBottom: "var(--space-4)",
                }}
              >
                {post.excerpt}
              </p>

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
                <time dateTime={post.publishedAt}>
                  {post.publishedAtDisplay}
                </time>
                <span aria-hidden="true">&middot;</span>
                <span>{post.readTime}</span>
              </div>

              <div style={{ marginTop: "var(--space-4)" }}>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{
                    color: "var(--color-primary)",
                    textDecoration: "none",
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: "var(--font-weight-medium)",
                    fontFamily: "var(--font-family)",
                  }}
                  aria-label={`Read: ${post.title}`}
                >
                  Read article &rarr;
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
