/**
 * Blog index — TrustIndex AI content hub
 * Route: /blog (within (marketing) route group)
 *
 * Renders all published articles and videos in one chronological list.
 * Article cards link to /blog/<slug> (individual page folders).
 * Video cards show a YouTube thumbnail + play badge, link to /blog/watch/<slug>.
 *
 * Static rendering: no dynamic data.
 * Design system: all values from tokens.css.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  POSTS,
  youtubeThumbnailUrl,
  type Post,
  type ArticlePost,
  type VideoPost,
} from "./posts";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Blog — TrustIndex AI",
  description:
    "Articles and videos about AI search visibility, GEO (Generative Engine Optimization), and building a brand that AI systems cite and recommend.",
  alternates: {
    canonical: "https://trustindexai.com/blog",
  },
  openGraph: {
    title: "Blog — TrustIndex AI",
    description:
      "Articles and videos about AI search visibility, GEO, and building a brand that AI systems cite and recommend.",
    url: "https://trustindexai.com/blog",
    siteName: "TrustIndex AI",
    type: "website",
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — CollectionPage with articles and video objects
// ---------------------------------------------------------------------------

const articlePosts = POSTS.filter((p) => p.type === "article") as ArticlePost[];
const videoPosts = POSTS.filter((p) => p.type === "video") as VideoPost[];

const blogIndexJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Blog — TrustIndex AI",
  description:
    "Articles and videos about AI search visibility, GEO (Generative Engine Optimization), and building a brand that AI systems cite and recommend.",
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
  hasPart: [
    ...articlePosts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `https://trustindexai.com/blog/${post.slug}`,
      datePublished: post.publishedAt,
    })),
    ...videoPosts.map((post) => ({
      "@type": "VideoObject",
      name: post.title,
      description: post.excerpt,
      url: `https://trustindexai.com/blog/watch/${post.slug}`,
      thumbnailUrl: youtubeThumbnailUrl(post.youtubeId),
      uploadDate: post.publishedAt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${post.youtubeId}`,
    })),
  ],
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

      {/* Page header */}
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
        Articles and videos about AI search visibility, GEO, and building a
        brand that AI systems understand and recommend.
      </p>

      {/* Post list */}
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
        {POSTS.map((post) =>
          post.type === "video" ? (
            <li key={post.slug}>
              <VideoCard post={post} />
            </li>
          ) : (
            <li key={post.slug}>
              <ArticleCard post={post} />
            </li>
          )
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article card
// ---------------------------------------------------------------------------

function ArticleCard({ post }: { post: ArticlePost }) {
  const href = `/blog/${post.slug}`;

  return (
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
      }}
    >
      {/* Type tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        {post.isPillar && (
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-primary)",
              fontFamily: "var(--font-family)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Pillar article &middot; GEO guide
          </span>
        )}
        {!post.isPillar && (
          <span
            style={{
              display: "inline-block",
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Article
          </span>
        )}
      </div>

      <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
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
        <time dateTime={post.publishedAt}>{post.publishedAtDisplay}</time>
        <span aria-hidden="true">&middot;</span>
        <span>{post.readTime}</span>
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Link
          href={href}
          style={{
            color: "var(--color-primary)",
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-medium)",
            fontFamily: "var(--font-family)",
          }}
          aria-label={`Read article: ${post.title}`}
        >
          Read article &rarr;
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Video card
// ---------------------------------------------------------------------------

function VideoCard({ post }: { post: VideoPost }) {
  const href = `/blog/watch/${post.slug}`;
  const thumbnailUrl = youtubeThumbnailUrl(post.youtubeId);

  return (
    <article
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Thumbnail */}
      <Link href={href} aria-label={`Watch video: ${post.title}`} tabIndex={-1} aria-hidden="true">
        <div
          style={{
            position: "relative",
            aspectRatio: "16 / 9",
            backgroundColor: "var(--color-surface-muted)",
            overflow: "hidden",
          }}
        >
          <Image
            src={thumbnailUrl}
            alt={`Thumbnail for video: ${post.title}`}
            fill
            sizes="(max-width: 720px) 100vw, 720px"
            style={{ objectFit: "cover" }}
            unoptimized={post.youtubeId.startsWith("PLACEHOLDER")}
          />
          {/* Play badge overlay */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              }}
            >
              {/* Triangle play icon */}
              <svg
                aria-hidden="true"
                focusable="false"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="#fff"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>

          {/* Duration badge */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: "var(--space-2)",
              right: "var(--space-2)",
              backgroundColor: "rgba(0,0,0,0.75)",
              color: "#fff",
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-semibold)",
              fontFamily: "var(--font-family)",
              padding: "2px 6px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {post.duration}
          </div>
        </div>
      </Link>

      {/* Card body */}
      <div style={{ padding: "var(--space-5) var(--space-6)" }}>
        {/* Type tag */}
        <div style={{ marginBottom: "var(--space-2)" }}>
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
            }}
          >
            <PlayCircleIcon />
            Video
          </span>
        </div>

        <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
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
          <time dateTime={post.publishedAt}>{post.publishedAtDisplay}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{post.duration}</span>
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <Link
            href={href}
            style={{
              color: "var(--color-primary)",
              textDecoration: "none",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              fontFamily: "var(--font-family)",
            }}
            aria-label={`Watch video: ${post.title}`}
          >
            Watch video &rarr;
          </Link>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlayCircleIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <polygon points="9,7 19,12 9,17" fill="currentColor" />
    </svg>
  );
}
