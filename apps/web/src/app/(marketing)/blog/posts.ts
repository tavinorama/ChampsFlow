/**
 * posts.ts — Blog post registry for TrustIndex AI content hub.
 *
 * Single source of truth for all published articles and videos.
 * Used by the blog index page and individual post/video pages.
 *
 * Article posts: link to /blog/<slug>   (individual static page folders)
 * Video posts:   link to /blog/watch/<slug>   (dynamic template)
 *
 * Order: newest first (blog index renders in this order).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostType = "article" | "video";

interface BasePost {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;       // ISO date string "YYYY-MM-DD"
  publishedAtDisplay: string; // Human-readable display date
  type: PostType;
  isPillar?: boolean;
}

export interface ArticlePost extends BasePost {
  type: "article";
  readTime: string; // e.g. "13 min read"
}

export interface VideoPost extends BasePost {
  type: "video";
  youtubeId: string;   // YouTube video ID (11 characters)
  duration: string;    // Human-readable duration, e.g. "8:42"
  durationIso?: string; // ISO 8601 duration for VideoObject schema, e.g. "PT8M42S"
}

export type Post = ArticlePost | VideoPost;

// ---------------------------------------------------------------------------
// Registry — newest first
// ---------------------------------------------------------------------------

export const POSTS: Post[] = [
  // ── Video placeholders ──────────────────────────────────────────────────
  // TODO: replace the youtubeId values below with real YouTube video IDs
  // once the videos are published. The ID is the 11-character string after
  // "?v=" in the YouTube URL, e.g. for https://youtu.be/dQw4w9WgXcQ the ID
  // is "dQw4w9WgXcQ".
  {
    type: "video",
    slug: "what-is-geo-and-why-it-matters",
    title: "What Is GEO and Why It Matters for Small Businesses in 2026",
    excerpt:
      "A short walkthrough of Generative Engine Optimization — what it is, how ChatGPT and Perplexity decide what to cite, and the three things you can do this week to improve your AI search visibility.",
    publishedAt: "2026-06-01",
    publishedAtDisplay: "1 June 2026",
    youtubeId: "PLACEHOLDER_VIDEO_1", // TODO: replace with real YouTube video ID
    duration: "9:15",
    durationIso: "PT9M15S",
  },
  {
    type: "video",
    slug: "trustindex-ai-audit-walkthrough",
    title: "TrustIndex AI Audit Walkthrough — See Your Brand Through AI's Eyes",
    excerpt:
      "A product demo walking through a live TrustIndex AI audit: running the brand scan across ChatGPT, Claude, Perplexity, and Gemini; reading the TrustIndex Score; and understanding the GEO action plan.",
    publishedAt: "2026-05-25",
    publishedAtDisplay: "25 May 2026",
    youtubeId: "PLACEHOLDER_VIDEO_2", // TODO: replace with real YouTube video ID
    duration: "12:30",
    durationIso: "PT12M30S",
  },

  // ── Articles ─────────────────────────────────────────────────────────────
  {
    type: "article",
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
    type: "article",
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
// Helpers
// ---------------------------------------------------------------------------

/** Return a YouTube thumbnail URL for a given video ID. */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/** Return the privacy-enhanced YouTube embed URL for a given video ID. */
export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

/** Find a video post by slug. Returns undefined if not found or not a video. */
export function findVideoPost(slug: string): VideoPost | undefined {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post || post.type !== "video") return undefined;
  return post;
}
