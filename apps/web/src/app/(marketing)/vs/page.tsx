/**
 * /vs — comparison hub. Links to each /vs/[competitor] page and states the
 * one true category difference up front: everyone else stops at the dashboard;
 * Ozvor turns the audit into a plan, content and (optionally) done-for-you
 * execution. Server component, SSR.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { COMPETITORS, OZVOR_ONELINE } from "./_data";

export const metadata: Metadata = {
  title: "Ozvor vs the AI-visibility tools — an honest comparison",
  description:
    "Ozvor compared to Profound, Peec AI, Otterly, AthenaHQ, Semrush AI Toolkit and Ahrefs Brand Radar. Where we win, where they win, and the one difference that matters: turning the audit into content.",
  alternates: { canonical: "https://ozvor.com/vs" },
  openGraph: {
    title: "Ozvor vs the AI-visibility tools — honest comparisons",
    description: "Profound, Peec, Otterly, AthenaHQ, Semrush, Ahrefs — where each wins, where we do.",
    url: "https://ozvor.com/vs",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor comparisons" }],
  },
};

const CSS = `
  .vs-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .vs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); margin-top: var(--space-10); }
  @media (max-width: 720px) { .vs-grid { grid-template-columns: 1fr; } }
  .vs-tile { display: block; text-decoration: none; color: inherit; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-card); transition: border-color 0.15s, transform 0.15s; }
  .vs-tile:hover { border-color: var(--color-accent-ink); transform: translateY(-2px); }
  .vs-tile:focus-visible { outline: var(--focus-outline-width) solid var(--color-focus-outline); outline-offset: 2px; }
`;

export default function VsIndexPage() {
  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding:
          "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{CSS}</style>

      <span className="vs-eyebrow">Honest comparisons</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        How Ozvor compares.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "660px",
          margin: 0,
        }}
      >
        Most AI-visibility tools stop at the dashboard: they measure how AI sees you, then hand you
        a chart. Ozvor is the one that turns the audit into an evidence-backed plan, ready-to-review
        content drafts, and — if you want — done-for-you execution. Below, honestly: where we win,
        and where each competitor is the better call.
      </p>
      <p
        style={{
          marginTop: "var(--space-4)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-accent-ink)",
          fontWeight: 600,
        }}
      >
        Ozvor in one line: {OZVOR_ONELINE}
      </p>

      <div className="vs-grid">
        {COMPETITORS.map((c) => (
          <Link key={c.slug} href={`/vs/${c.slug}`} className="vs-tile">
            <p style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.01em" }}>
              Ozvor vs {c.name}
            </p>
            <p style={{ margin: "var(--space-1) 0 var(--space-3)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {c.category}
            </p>
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              {c.thesis}
            </p>
            <span
              aria-hidden="true"
              style={{ display: "inline-block", marginTop: "var(--space-3)", color: "var(--color-accent-ink)", fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}
            >
              See the comparison →
            </span>
          </Link>
        ))}
      </div>

      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          Skip the comparison. Get your own number.
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)", maxWidth: "540px", marginInline: "auto" }}>
          The fastest way to compare is on your own brand. The free test takes 60 seconds and shows
          exactly where AI cites you — and where it cites your competitors instead.
        </p>
        <Link
          href="/test"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            color: "#06140e",
            textDecoration: "none",
            background: "linear-gradient(135deg,#27c98a,#0c7d54)",
            borderRadius: "var(--radius-md)",
            padding: "0.8rem 1.5rem",
            boxShadow: "0 10px 32px rgba(39,201,138,0.32)",
            minHeight: "44px",
          }}
        >
          Run the free AI test →
        </Link>
      </section>
    </main>
  );
}
