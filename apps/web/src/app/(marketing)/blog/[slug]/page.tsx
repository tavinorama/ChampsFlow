/**
 * [slug]/page.tsx — data-driven renderer for GEO blog articles.
 *
 * Renders any post defined in ../_content.ts with one consistent, on-brand
 * template: cover, key-takeaways, auto table-of-contents (from h2 blocks),
 * prose blocks, a full Sources list, and the shared SoftCTA. New articles are
 * authored as data in _content.ts — no new page files.
 *
 * Static folders (e.g. /blog/why-small-businesses-stop-posting) take precedence
 * over this dynamic segment, so the two hand-built pillar posts are unaffected.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BLOG_CONTENT, findBlogContent, type Block } from "../_content";
import { SoftCTA } from "../../../../components/marketing/SoftCTA";
import { SITE_URL } from "../../../../lib/site";
import { safeJsonLd } from "../../../../lib/safe-json-ld";

export function generateStaticParams() {
  return BLOG_CONTENT.map((p) => ({ slug: p.slug }));
}

// Same guard as /blog/watch/[slug]: all valid slugs come from the static
// registry, so unknown slugs must 404 immediately. Without this, on-demand
// static generation of an unknown slug hits the layout's per-request
// CSP-nonce headers() and 500s with digest DYNAMIC_SERVER_USAGE (issue #261).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findBlogContent(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} | Ozvor`,
    description: post.dek,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: `${post.title} | Ozvor`,
      description: post.dek,
      url,
      siteName: "Ozvor",
      type: "article",
      publishedTime: post.datePublished,
      images: [{ url: `${SITE_URL}/og-default.png`, width: 1200, height: 630, alt: post.title }],
    },
    twitter: { card: "summary_large_image", images: [`${SITE_URL}/og-default.png`] },
  };
}

// ---------------------------------------------------------------------------
// Inline formatter — supports **bold**, *italic*, and [label](url).
// Content is first-party/trusted, so rendering via innerHTML is safe here.
// ---------------------------------------------------------------------------
function inlineHtml(text: string): string {
  let t = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safe = String(url).replace(/"/g, "&quot;");
    return `<a href="${safe}" style="color:var(--color-primary);text-decoration:underline" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return t;
}

const PROSE: Record<string, React.CSSProperties> = {
  h2: {
    fontSize: "var(--font-size-h2)",
    fontWeight: 800,
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    marginTop: "var(--space-10)",
    marginBottom: "var(--space-4)",
    scrollMarginTop: "84px",
  },
  h3: {
    fontSize: "var(--font-size-h3)",
    fontWeight: 700,
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    lineHeight: 1.3,
    marginTop: "var(--space-7)",
    marginBottom: "var(--space-3)",
  },
  p: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.8,
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    margin: "0 0 var(--space-4) 0",
    textAlign: "justify",
    hyphens: "auto",
  },
  cite: {
    fontSize: "var(--font-size-caption)",
    color: "var(--color-muted)",
    fontFamily: "var(--font-family)",
    display: "block",
    margin: "calc(-1 * var(--space-2)) 0 var(--space-5) 0",
    fontStyle: "italic",
  },
  li: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.7,
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    marginBottom: "var(--space-2)",
  },
  hr: { border: "none", borderTop: "1px solid var(--color-border)", margin: "var(--space-8) 0" },
};

function renderBlock(b: Block, i: number) {
  switch (b.t) {
    case "h2":
      return <h2 key={i} id={b.id} style={PROSE.h2}>{b.text}</h2>;
    case "h3":
      return <h3 key={i} style={PROSE.h3}>{b.text}</h3>;
    case "p":
      return <p key={i} style={PROSE.p} dangerouslySetInnerHTML={{ __html: inlineHtml(b.text) }} />;
    case "cite":
      return <span key={i} style={PROSE.cite}>{b.text}</span>;
    case "quote":
      return (
        <blockquote key={i} style={{ margin: "var(--space-5) 0", padding: "var(--space-3) var(--space-5)", borderLeft: "4px solid var(--color-primary)", background: "var(--color-surface-muted)", borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}>
          <p style={{ ...PROSE.p, margin: 0, fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: inlineHtml(b.text) }} />
          {b.cite && <span style={{ ...PROSE.cite, margin: "var(--space-2) 0 0 0" }}>{b.cite}</span>}
        </blockquote>
      );
    case "ul":
      return (
        <ul key={i} style={{ margin: "0 0 var(--space-5) 0", paddingLeft: "var(--space-6)" }}>
          {b.items.map((it, j) => <li key={j} style={PROSE.li} dangerouslySetInnerHTML={{ __html: inlineHtml(it) }} />)}
        </ul>
      );
    case "ol":
      return (
        <ol key={i} style={{ margin: "0 0 var(--space-5) 0", paddingLeft: "var(--space-6)" }}>
          {b.items.map((it, j) => <li key={j} style={PROSE.li} dangerouslySetInnerHTML={{ __html: inlineHtml(it) }} />)}
        </ol>
      );
    default:
      return null;
  }
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = findBlogContent(slug);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${post.slug}`;
  const toc = post.body.filter((b): b is Extract<Block, { t: "h2" }> => b.t === "h2");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.dek,
    author: { "@type": "Organization", name: "Ozvor" },
    publisher: {
      "@type": "Organization",
      name: "Ozvor",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    datePublished: post.datePublished,
    dateModified: post.datePublished,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: post.keywords,
    articleSection: post.category,
    inLanguage: "en",
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      <article style={{ maxWidth: "720px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-16)" }}>
        <Link href="/blog" style={{ color: "var(--color-primary)", textDecoration: "none", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}>← The Blog</Link>

        {/* Header */}
        <header style={{ margin: "var(--space-5) 0 var(--space-6)" }}>
          <span style={{ display: "inline-block", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-primary)", marginBottom: "var(--space-3)" }}>
            {post.category}
          </span>
          <h1 style={{ fontSize: "clamp(1.9rem, 4.5vw, 2.7rem)", fontWeight: 800, color: "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.12, letterSpacing: "-0.03em", margin: "0 0 var(--space-4)", textWrap: "balance" }}>
            {post.title}
          </h1>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-4)", maxWidth: "62ch" }}>
            {post.dek}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 600 }}>
            <span>Ozvor Research</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.datePublished}>{post.dateDisplay}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>
        </header>

        {/* Key takeaways */}
        <div style={{ backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)", borderLeft: "4px solid var(--color-primary)", borderRadius: "var(--radius-lg)", padding: "var(--space-5) var(--space-6)", margin: "0 0 var(--space-6)" }}>
          <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", margin: "0 0 var(--space-3)", fontFamily: "var(--font-family)" }}>
            Key takeaways
          </p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {post.takeaways.map((t, j) => <li key={j} style={PROSE.li} dangerouslySetInnerHTML={{ __html: inlineHtml(t) }} />)}
          </ul>
        </div>

        {/* Table of contents */}
        {toc.length > 1 && (
          <nav aria-label="What's inside" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-5) var(--space-6)", margin: "0 0 var(--space-6)" }}>
            <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)", margin: "0 0 var(--space-3)", fontFamily: "var(--font-family)" }}>
              What&rsquo;s inside
            </p>
            <ol style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {toc.map((h) => (
                <li key={h.id} style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                  <a href={`#${h.id}`} style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>{h.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <hr style={PROSE.hr} />

        {/* Body */}
        {post.body.map((b, i) => renderBlock(b, i))}

        {/* Sources */}
        <hr style={PROSE.hr} />
        <section aria-label="Sources">
          <h2 id="sources" style={PROSE.h2}>Sources</h2>
          <ul style={{ paddingLeft: "var(--space-4)", margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.7 }}>
            {post.sources.map((s, j) => (
              <li key={j} style={{ marginBottom: "var(--space-2)" }}>{s}</li>
            ))}
          </ul>
        </section>
      </article>

      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 var(--space-4) var(--space-8)" }}>
        <SoftCTA
          headline="Curious how AI describes your brand right now?"
          subline="Run the free 60-second AI Visibility Test — see if ChatGPT, Claude, and Perplexity recommend you or a competitor."
          primary={{ label: "Run the free test", href: "/test" }}
          secondary={{ label: "Prefer to DIY? The $29 Get-Cited Kit →", href: "/kit" }}
        />
      </div>
    </>
  );
}
