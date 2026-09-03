/**
 * /resources — index for the free GEO resource library.
 *
 * The four sub-pages have been live (and in the sitemap) for a while, but the
 * root URL 404'd. This minimal index fixes that: one tile per existing
 * resource, then the shared AiAuditCta. Same tokens and tile pattern as
 * /compare — no new design. Server component, SSR, real links.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { AiAuditCta } from "../../../components/marketing/AiAuditCta";

export const metadata: Metadata = {
  title: "Free GEO Resources — Guides, Templates & Trackers",
  description:
    "Ozvor's free GEO library: the Understanding GEO Search whitepaper, the GEO Visibility Guide, 5 high-citation post templates, and the LLM Citation Tracker.",
  alternates: { canonical: "https://ozvor.com/resources" },
  openGraph: {
    title: "Free GEO Resources | Ozvor",
    description:
      "Guides, templates and trackers for getting your business cited by AI search.",
    url: "https://ozvor.com/resources",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor resources" }],
  },
};

/** The four live resource pages. Add here when a new resource ships. */
const RESOURCES: { href: string; title: string; kind: string; blurb: string }[] = [
  {
    href: "/resources/what-is-geo-search",
    title: "Understanding GEO Search",
    kind: "Whitepaper",
    blurb:
      "How AI engines decide which businesses to name. Plain English, real numbers, named sources.",
  },
  {
    href: "/resources/geo-visibility-guide",
    title: "The GEO Visibility Guide",
    kind: "Guide",
    blurb:
      "The step-by-step playbook for getting cited. From first audit to a moving score.",
  },
  {
    href: "/resources/5-high-citation-post-templates",
    title: "5 High-Citation Post Templates",
    kind: "Templates",
    blurb:
      "Five post formats AI engines love to cite. Fill in your details and publish.",
  },
  {
    href: "/resources/llm-citation-tracker",
    title: "LLM Citation Tracker",
    kind: "Spreadsheet",
    blurb:
      "Track when ChatGPT, Claude, and Perplexity name your business. Ten minutes a week.",
  },
];

const CSS = `
  .rs-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .rs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); margin-top: var(--space-10); }
  @media (max-width: 720px) { .rs-grid { grid-template-columns: 1fr; } }
  .rs-tile { display: block; text-decoration: none; color: inherit; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-card); transition: border-color 0.15s, transform 0.15s; }
  .rs-tile:hover { border-color: var(--color-accent-ink); transform: translateY(-2px); }
  .rs-tile:focus-visible { outline: var(--focus-outline-width) solid var(--color-focus-outline); outline-offset: 2px; }
`;

export default function ResourcesIndexPage() {
  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{CSS}</style>

      <span className="rs-eyebrow">Resources</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        Free GEO resources.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "620px",
          margin: 0,
        }}
      >
        Everything here is free to read. Guides, templates, and trackers for
        getting your business cited by AI search.
      </p>

      <div className="rs-grid">
        {RESOURCES.map((r) => (
          <Link key={r.href} href={r.href} className="rs-tile">
            <p
              style={{
                margin: "0 0 var(--space-1)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {r.kind}
            </p>
            <p style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.01em" }}>
              {r.title}
            </p>
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              {r.blurb}
            </p>
            <span
              aria-hidden="true"
              style={{ display: "inline-block", marginTop: "var(--space-3)", color: "var(--color-accent-ink)", fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}
            >
              Read it free →
            </span>
          </Link>
        ))}
      </div>

      {/* AI Audit Stack — site-wide peer CTA */}
      <div style={{ marginTop: "var(--space-16)" }}>
        <AiAuditCta
          headline="Reading is step one. Tools are step two."
          subline="Run the free test. Or get your AI stack picked for you."
        />
      </div>
    </main>
  );
}
