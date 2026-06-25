/**
 * Video post page — /blog/watch/[slug]
 *
 * Renders a video post from the posts registry. Reads the slug from params,
 * looks up the VideoPost in POSTS, and renders:
 *   1. VideoObject + BreadcrumbList JSON-LD
 *   2. Title + metadata header
 *   3. Responsive 16:9 YouTube embed (privacy-enhanced, youtube-nocookie.com)
 *   4. Excerpt / description body
 *   5. CTA strip (free test + book a call)
 *
 * Route uses generateStaticParams so all video slugs are pre-rendered at build
 * time (static rendering, no dynamic server usage).
 *
 * Accessibility:
 *   - <iframe> has title prop (describes embedded content for screen readers)
 *   - Keyboard: iframe is focusable, tabIndex default (YouTube UI is keyboard-
 *     accessible within the embed)
 *   - Focus management: page has standard scroll-to-top on navigation
 *   - 16:9 wrapper via padding-bottom trick — CSS only, no magic px
 *
 * Privacy: uses youtube-nocookie.com — no cookies set before consent.
 * No Calendly inline widget on this page (the /book page has the full embed).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  PUBLISHED_POSTS,
  youtubeThumbnailUrl,
  youtubeEmbedUrl,
  findVideoPost,
  type VideoPost,
} from "../../posts";
import { BookCallButton } from "../../../../../components/BookCallButton";

// ---------------------------------------------------------------------------
// Static params — pre-render all video slugs
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  // Only pre-render videos with a real YouTube ID (placeholders are hidden).
  return PUBLISHED_POSTS.filter((p) => p.type === "video").map((p) => ({
    slug: p.slug,
  }));
}

// ---------------------------------------------------------------------------
// Dynamic metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findVideoPost(slug);

  if (!post) {
    return {
      title: "Video not found — TrustIndex AI",
    };
  }

  return {
    title: `${post.title} | TrustIndex AI`,
    description: post.excerpt,
    alternates: {
      canonical: `https://trustindexai.com/blog/watch/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | TrustIndex AI`,
      description: post.excerpt,
      url: `https://trustindexai.com/blog/watch/${post.slug}`,
      siteName: "TrustIndex AI",
      type: "website",
      images: [
        {
          url: youtubeThumbnailUrl(post.youtubeId),
          width: 480,
          height: 360,
          alt: `Thumbnail for: ${post.title}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | TrustIndex AI`,
      description: post.excerpt,
      images: [youtubeThumbnailUrl(post.youtubeId)],
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD builders
// ---------------------------------------------------------------------------

function buildVideoObjectJsonLd(post: VideoPost) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: post.title,
    description: post.excerpt,
    thumbnailUrl: youtubeThumbnailUrl(post.youtubeId),
    uploadDate: post.publishedAt,
    embedUrl: youtubeEmbedUrl(post.youtubeId),
    ...(post.durationIso ? { duration: post.durationIso } : {}),
    publisher: {
      "@type": "Organization",
      name: "TrustIndex AI",
      url: "https://trustindexai.com",
      logo: {
        "@type": "ImageObject",
        url: "https://trustindexai.com/logo.png",
      },
    },
    inLanguage: "en",
  };
}

function buildBreadcrumbJsonLd(post: VideoPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://trustindexai.com/blog" },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `https://trustindexai.com/blog/watch/${post.slug}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function VideoPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = findVideoPost(slug);

  if (!post) {
    notFound();
  }

  const videoObjectJsonLd = buildVideoObjectJsonLd(post);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(post);

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoObjectJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <article
        aria-labelledby="video-post-heading"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-16)",
        }}
      >
        {/* Breadcrumb nav */}
        <nav aria-label="Breadcrumb" style={{ marginBottom: "var(--space-6)" }}>
          <ol
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "var(--space-2)",
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: "var(--font-size-caption)",
              fontFamily: "var(--font-family)",
              color: "var(--color-muted)",
            }}
          >
            <li>
              <Link
                href="/"
                style={{ color: "var(--color-primary)", textDecoration: "none" }}
              >
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/blog"
                style={{ color: "var(--color-primary)", textDecoration: "none" }}
              >
                Blog
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" style={{ color: "var(--color-muted)" }}>
              Video
            </li>
          </ol>
        </nav>

        {/* Video type badge */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-primary)",
              fontFamily: "var(--font-family)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              border: "1px solid var(--color-highlight-border)",
              backgroundColor: "var(--color-badge-ai-bg)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 10px",
            }}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="5,3 19,12 5,21" />
            </svg>
            Video &middot; {post.duration}
          </span>
        </div>

        {/* Heading */}
        <h1
          id="video-post-heading"
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            lineHeight: 1.2,
            marginBottom: "var(--space-4)",
            marginTop: 0,
          }}
        >
          {post.title}
        </h1>

        {/* Date */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-8)",
          }}
        >
          <span>TrustIndex AI</span>
          <span aria-hidden="true">&middot;</span>
          <time dateTime={post.publishedAt}>{post.publishedAtDisplay}</time>
        </div>

        {/* ── YouTube embed — responsive 16:9 wrapper ───────────────────── */}
        {/* Privacy-enhanced: youtube-nocookie.com sets no tracking cookies.  */}
        {/* The outer div uses padding-bottom to maintain aspect ratio.       */}
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingBottom: "56.25%", /* 9/16 = 0.5625 = 56.25% */
            height: 0,
            overflow: "hidden",
            borderRadius: "var(--radius-lg)",
            marginBottom: "var(--space-8)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          <iframe
            src={youtubeEmbedUrl(post.youtubeId)}
            title={post.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: "var(--radius-lg)",
            }}
          />
        </div>

        {/* Description / transcript area */}
        <section aria-labelledby="video-description-heading">
          <h2
            id="video-description-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: "var(--line-height-h2)",
              marginBottom: "var(--space-4)",
              marginTop: 0,
            }}
          >
            About this video
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: 1.75,
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-4)",
            }}
          >
            {post.excerpt}
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: "var(--line-height-body)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-8)",
            }}
          >
            TrustIndex AI is an AI Search Trust Intelligence platform for small
            and medium businesses. We audit how your brand appears across
            ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview — then
            give you the TrustIndex Score and a GEO content plan to improve
            your visibility.
          </p>
        </section>

        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--color-border)",
            margin: "var(--space-8) 0",
          }}
        />

        {/* Related content link */}
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-8)",
          }}
        >
          Want to go deeper?{" "}
          <Link
            href="/blog/how-small-businesses-get-cited-by-chatgpt"
            style={{ color: "var(--color-primary)", textDecoration: "underline" }}
          >
            Read the pillar guide on GEO for small businesses
          </Link>
          {" "}or{" "}
          <Link
            href="/blog"
            style={{ color: "var(--color-primary)", textDecoration: "underline" }}
          >
            browse all articles and videos
          </Link>
          .
        </p>
      </article>

      {/* ── Bottom CTA strip ─────────────────────────────────────────── */}
      <section
        aria-labelledby="video-cta-heading"
        style={{
          backgroundColor: "var(--color-surface-muted)",
          borderTop: "1px solid var(--color-border)",
          padding: "var(--space-12) var(--space-4)",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2
            id="video-cta-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              marginBottom: "var(--space-3)",
            }}
          >
            See how your brand appears in AI search
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
            Run a free TrustIndex Audit and find out if AI recommends your
            business — or a competitor. Takes 60 seconds. No credit card
            required.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              justifyContent: "center",
            }}
          >
            <a
              href="/test"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "var(--min-button-height)",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-bold)",
                fontFamily: "var(--font-family)",
                textDecoration: "none",
                letterSpacing: "-0.01em",
              }}
            >
              Run your free AI Visibility Test
            </a>
            <BookCallButton label="Book a strategy call" variant="secondary" />
          </div>
        </div>
      </section>
    </>
  );
}
