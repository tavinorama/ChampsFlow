/**
 * posts.ts — Blog post registry for Ozvor content hub.
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
    title: "Ozvor Audit Walkthrough — See Your Brand Through AI's Eyes",
    excerpt:
      "A product demo walking through a live Ozvor audit: running the brand scan across ChatGPT, Claude, Perplexity, and Gemini; reading the TrustIndex Score; and understanding the GEO action plan.",
    publishedAt: "2026-05-25",
    publishedAtDisplay: "25 May 2026",
    youtubeId: "PLACEHOLDER_VIDEO_2", // TODO: replace with real YouTube video ID
    duration: "12:30",
    durationIso: "PT12M30S",
  },

  // ── Articles ─────────────────────────────────────────────────────────────
  // GEO series — rendered by the data-driven [slug] route from _content.ts
  {
    type: "article",
    slug: "what-is-generative-engine-optimization",
    title: "What Is Generative Engine Optimization (GEO)? A Plain-English 2026 Field Guide",
    excerpt:
      "SEO got you ranked. GEO gets you named. What changed, why it matters for small businesses, and what actually moves the needle — without the hype.",
    readTime: "9 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
    isPillar: true,
  },
  {
    type: "article",
    slug: "ai-search-replacing-google-local-discovery",
    title: "AI Search Is Quietly Replacing Google for Local Discovery — Here's the Data",
    excerpt:
      "\"Find me a good plumber near here\" used to mean a map and ten links. Now it means three names. If you run a local business, that shift is already costing you leads you'll never see.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "how-ai-engines-choose-which-brands-to-name",
    title: "How ChatGPT, Claude, Perplexity & Gemini Decide Which Brands to Name",
    excerpt:
      "AI recommendations feel like magic. They're not. Two mechanisms — training and retrieval — decide who gets named, and understanding them tells you exactly where to spend your effort.",
    readTime: "9 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "most-cited-sources-in-ai-search-2026",
    title: "Where AI Gets Its Answers: The Most-Cited Sources in AI Search (2026)",
    excerpt:
      "If you want to be quoted by AI, it helps to know where AI looks. The answer is surprisingly concentrated — and most of it isn't your website.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "online-reviews-are-an-ai-ranking-factor",
    title: "Your Star Rating Is Now an AI Ranking Factor",
    excerpt:
      "Reviews were always good for conversion. In 2026 they do something else: they help decide whether an AI recommends you at all.",
    readTime: "7 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "schema-markup-for-ai-search",
    title: "Schema Markup: How to Speak the Language AI Engines Read",
    excerpt:
      "Schema markup is the unglamorous, high-leverage GEO move most small businesses skip. It's how you tell an AI exactly what you are, what you offer, and why it can trust the answer.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "how-to-measure-ai-visibility",
    title: "How to Measure Whether AI Actually Mentions Your Brand",
    excerpt:
      "You can't improve what you don't measure — and \"I asked ChatGPT once and it mentioned us\" isn't measurement. Here's how to build a real AI-visibility baseline.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "zero-click-search-and-ai-traffic",
    title: "Zero-Click Search Is Here. Does AI Traffic Still Convert?",
    excerpt:
      "AI answers questions without sending a click — which sounds like a disaster for businesses. The data is more interesting (and more hopeful) than the panic suggests.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "geo-vs-seo-where-to-spend-2026",
    title: "GEO vs SEO: What's the Same, What's New, and Where to Spend in 2026",
    excerpt:
      "GEO didn't kill SEO — it built a second floor on top of it. An honest map of what overlaps, what's genuinely new, and how a small business should split its effort.",
    readTime: "8 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
  {
    type: "article",
    slug: "30-day-geo-plan-small-business",
    title: "A 30-Day GEO Starter Plan for Small Businesses",
    excerpt:
      "No agency, no big budget, an hour or two a week. A concrete four-week plan to go from invisible in AI answers to showing up — and knowing it.",
    readTime: "9 min read",
    publishedAt: "2026-06-26",
    publishedAtDisplay: "26 June 2026",
  },
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

/**
 * A video is a placeholder (not yet published) when its youtubeId is empty or
 * still carries the PLACEHOLDER sentinel. Placeholder videos are hidden from the
 * live site (no broken embeds/thumbnails) and light up automatically the moment
 * a real 11-char YouTube ID is filled in above.
 */
export function isPlaceholderVideo(youtubeId: string): boolean {
  return !youtubeId || youtubeId.startsWith("PLACEHOLDER");
}

/**
 * The posts shown on the live site: all articles + only videos with a real
 * YouTube ID. Use THIS in the blog index and the video route — never raw POSTS.
 */
export const PUBLISHED_POSTS: Post[] = POSTS.filter(
  (p) => p.type !== "video" || !isPlaceholderVideo(p.youtubeId)
);

/** Return a YouTube thumbnail URL for a given video ID. */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/** Return the privacy-enhanced YouTube embed URL for a given video ID. */
export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

/**
 * Find a PUBLISHED video post by slug. Returns undefined if not found, not a
 * video, or still a placeholder (so /blog/watch/<slug> 404s instead of showing
 * a broken embed until a real YouTube ID is added).
 */
export function findVideoPost(slug: string): VideoPost | undefined {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post || post.type !== "video") return undefined;
  if (isPlaceholderVideo(post.youtubeId)) return undefined;
  return post;
}
