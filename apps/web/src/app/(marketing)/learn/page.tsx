/**
 * /learn — "Tutorials" hub (Ozvor mockup §11).
 *
 * Product education (how to USE the platform), kept SEPARATE from the Blog
 * (which is GEO acquisition). A single 6-step getting-started path; each card
 * pairs a video (16:9 thumb + play + duration) with a written-guide link.
 * Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tutorials — Learn to use Ozvor",
  description:
    "A 6-step getting-started path: create your workspace, run your first audit, read your Ozvor AI Visibility Score, benchmark competitors, build your content plan, then publish & monitor. Watch or read.",
  alternates: { canonical: "https://ozvor.com/learn" },
  openGraph: {
    title: "Tutorials — Learn to use Ozvor",
    description: "Watch or read: the 6-step path from sign-up to a moving Ozvor AI Visibility Score.",
    url: "https://ozvor.com/learn",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor Tutorials" }],
  },
};

const STEPS: { n: string; dur: string; title: string; desc: string }[] = [
  { n: "1", dur: "3:10", title: "Getting started", desc: "Create your workspace, add your brand and the competitors you want to track." },
  { n: "2", dur: "4:05", title: "Run your first audit", desc: "Fire a portfolio of real buyer prompts across ChatGPT, Claude, Perplexity, Gemini and Google AI." },
  { n: "3", dur: "5:20", title: "Read your Ozvor AI Visibility Score", desc: "What the AI, Performance and Brand sub-scores mean — and which one to move first." },
  { n: "4", dur: "4:30", title: "Benchmark competitors", desc: "See exactly who AI names instead of you, on which prompts, and the sources it trusts." },
  { n: "5", dur: "6:15", title: "Build your content plan", desc: "Turn the gaps into prioritized GEO briefs for your website and LinkedIn." },
  { n: "6", dur: "5:00", title: "Publish & monitor", desc: "Approve drafts with draft-and-confirm, then watch your score move every week." },
];

const PAGE_CSS = `
  .lrn-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .lrn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 920px) { .lrn-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .lrn-grid { grid-template-columns: 1fr; } }
  .lrn-thumb {
    position: relative; aspect-ratio: 16 / 9; border-radius: var(--radius-md);
    background-color: var(--color-surface-muted);
    background-image: repeating-linear-gradient(135deg, rgba(180,214,198,0.05) 0 10px, transparent 10px 20px);
    display: grid; place-items: center; overflow: hidden;
    border: 1px solid var(--color-border);
  }
  .lrn-play { width: 46px; height: 46px; border-radius: var(--radius-pill); background: linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e; display:grid; place-items:center; font-size: 18px; }
  .lrn-dur { position:absolute; right:8px; bottom:8px; font-family: var(--font-mono); font-size: 0.6875rem; color: var(--color-text); background: rgba(0,0,0,0.45); padding: 2px 7px; border-radius: var(--radius-sm); }
  .lrn-guide { color: var(--color-accent-ink); font-weight: 600; text-decoration: none; font-size: var(--font-size-body-sm); }
  .lrn-cta-primary { display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:#06140e; text-decoration:none; background:linear-gradient(135deg,#27c98a,#0c7d54); border-radius:var(--radius-md); padding:0.8rem 1.5rem; box-shadow:0 10px 32px rgba(39,201,138,0.32); }
`;

export default function LearnPage() {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <span className="lrn-eyebrow">Tutorials</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        Learn Ozvor in one short path.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        Six steps from sign-up to a moving Ozvor AI Visibility Score. Watch the video or read the guide — whatever fits how you work.
      </p>

      {/* 6-step grid */}
      <div className="lrn-grid" style={{ marginTop: "var(--space-12)" }}>
        {STEPS.map((s) => (
          <article key={s.n} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="lrn-thumb">
              <span className="lrn-play" aria-hidden="true">▶</span>
              <span className="lrn-dur">{s.dur}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-accent-ink)", fontSize: "0.8125rem" }}>{s.n.padStart(2, "0")}</span>
              <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)" }}>{s.title}</h2>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.6, fontSize: "var(--font-size-body-sm)", flex: 1 }}>{s.desc}</p>
            <Link href="/blog" className="lrn-guide">Read the guide →</Link>
          </article>
        ))}
      </div>

      {/* Tutorials ↔ Blog cross-link */}
      <section style={{ marginTop: "var(--space-16)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>Tutorials teach the platform. The Blog explains AI search.</h2>
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, maxWidth: "560px" }}>
            Want the strategy behind GEO — why ChatGPT cites who it cites, and what's changing? That lives on the blog.
          </p>
        </div>
        <Link href="/blog" className="lrn-guide" style={{ whiteSpace: "nowrap" }}>Read the blog →</Link>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-16)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-5)" }}>
          Best way to learn? Run your own audit.
        </h2>
        <Link href="/test" className="lrn-cta-primary">Run the free AI test →</Link>
      </section>
    </main>
  );
}
