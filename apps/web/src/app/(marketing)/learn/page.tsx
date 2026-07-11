/**
 * /learn — "Tutorials" hub (Ozvor mockup §11).
 *
 * Product education (how to USE the platform), kept SEPARATE from the Blog
 * (which is GEO acquisition).
 *
 * v3 (honesty pass): removed the placeholder video thumbnails / play buttons /
 * audio players and the missing product-demo.mp4. Tutorials are written,
 * step-by-step how-tos of the REAL product, each linking to the actual feature
 * page. Video walkthroughs will be added later and slotted in per tutorial — we
 * do not ship a fake player or invented numbers.
 * Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tutorials — Learn to use Ozvor",
  description:
    "Step-by-step guides to using Ozvor: run your Free AI Visibility Test, read your score, benchmark competitors, use the Get-Cited Kit, generate content, and monitor weekly progress.",
  alternates: { canonical: "https://ozvor.com/learn" },
  openGraph: {
    title: "Tutorials — Learn to use Ozvor",
    description: "Written, step-by-step how-tos for Ozvor: from your first audit to a moving AI Visibility Score.",
    url: "https://ozvor.com/learn",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor Tutorials" }],
  },
};

type Tutorial = {
  id: string;
  title: string;
  desc: string;
  steps: string[];
  cta: string;
  guideHref: string;
};

const TUTORIALS: Tutorial[] = [
  {
    id: "free-test",
    title: "Run your Free AI Visibility Test",
    desc: "A real audit of your brand across all five AI engines — no card, about 60 seconds.",
    steps: [
      "Enter your website, brand, category, and a competitor.",
      "Add your email — your results are saved to it so you can pick up where you left off.",
      "Click Run. Ozvor queries ChatGPT, Claude, Perplexity, Gemini and Google AI Overview live.",
      "Read your Ozvor AI Visibility Score, the exact buyer prompt asked, and which engines cited you vs your competitor.",
    ],
    cta: "Run the free test →",
    guideHref: "/test",
  },
  {
    id: "read-score",
    title: "Read your AI Visibility Score",
    desc: "Understand the overall score and the three sub-scores behind it.",
    steps: [
      "The headline score (0–100) is how likely AI engines are to name you for buyer questions.",
      "Visibility / AI: your citation rate, position, and sentiment across engines.",
      "Citation Readiness / Performance: schema, crawlability, and AI-crawler access on your site.",
      "Execution / Brand: your authority on the sources AI leans on. Every number is labelled measured or baseline — never guessed.",
    ],
    cta: "See how it works →",
    guideHref: "/how-it-works",
  },
  {
    id: "benchmark",
    title: "Benchmark your competitors",
    desc: "See exactly where AI recommends someone else instead of you.",
    steps: [
      "Add up to three competitors to your brand.",
      "Per engine, see whether AI cited you, a competitor, or neither — and at what position.",
      "The gap is where they win: that is what the recommended fixes target first.",
    ],
    cta: "See our methodology →",
    guideHref: "/how-we-measure",
  },
  {
    id: "kit",
    title: "Use the Get-Cited Kit",
    desc: "Turn one audit into publish-ready content you keep forever.",
    steps: [
      "Get the $29 Kit (or upgrade straight from your free-test results).",
      "You get the full audit, your top-3 prioritized fixes, and 3 publish-ready drafts (blog, LinkedIn, FAQ — with schema).",
      "Download the Kit PDF and the companion guide from your Kit page.",
      "Publish the drafts, then re-test in 30 days to see the movement.",
    ],
    cta: "Get the Kit — $29 →",
    guideHref: "/kit",
  },
  {
    id: "content-plan",
    title: "Generate content with the platform",
    desc: "On Growth, every gap becomes a draft you approve — never auto-published.",
    steps: [
      "Each recommended fix turns into a draft: a comparison page, LinkedIn proof post, or FAQ/schema update.",
      "Review the draft and replace any [PLACEHOLDER] with your real facts — we never invent numbers.",
      "Approve it. Nothing publishes without your OK.",
      "Schedule or publish, then let the weekly re-audit show whether it moved your score.",
    ],
    cta: "See the plans →",
    guideHref: "/pricing",
  },
  {
    id: "weekly-monitor",
    title: "Monitor your weekly progress",
    desc: "AI answers move every week — Growth keeps score so you don't have to.",
    steps: [
      "Growth re-runs your full audit every week automatically.",
      "Watch your score trend and citation-share change over time.",
      "Get alerted when your score or a competitor's position moves.",
      "Pull the next week's work from the Fix queue and repeat.",
    ],
    cta: "See the plans →",
    guideHref: "/pricing",
  },
];

const PAGE_CSS = `
  .lrn-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .lrn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 920px) { .lrn-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .lrn-grid { grid-template-columns: 1fr; } }
  .lrn-step { display: flex; gap: var(--space-2); font-size: var(--font-size-body-sm); color: var(--color-muted); line-height: 1.5; }
  .lrn-step-n { flex: 0 0 auto; width: 20px; height: 20px; border-radius: var(--radius-pill); background: rgba(39,201,138,0.14); color: var(--color-accent-ink); font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700; display: grid; place-items: center; margin-top: 1px; }
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
        Learn Ozvor, step by step.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        Plain, written how-tos for the real product — run your first audit, read your score, benchmark competitors, generate content, and track progress every week. Video walkthroughs are on the way.
      </p>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, maxWidth: "640px", margin: "var(--space-3) 0 0" }}>
        Looking for quick answers?{" "}
        <Link href="/faq" className="lrn-guide">→ /faq</Link>
        {" "}&middot; The research:{" "}
        <Link href="/research" className="lrn-guide">→ /research</Link>
      </p>

      {/* Tutorial grid */}
      <div className="lrn-grid" style={{ marginTop: "var(--space-12)" }}>
        {TUTORIALS.map((t) => (
          <article key={t.id} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)" }}>{t.title}</h2>
            <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.6, fontSize: "var(--font-size-body-sm)" }}>{t.desc}</p>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
              {t.steps.map((s, i) => (
                <li key={i} className="lrn-step">
                  <span className="lrn-step-n" aria-hidden="true">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <Link href={t.guideHref} className="lrn-guide">{t.cta}</Link>
          </article>
        ))}
      </div>

      {/* Tutorials ↔ Blog cross-link */}
      <section style={{ marginTop: "var(--space-16)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>Tutorials teach the platform. The Blog explains AI search.</h2>
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, maxWidth: "560px" }}>
            Want the strategy behind GEO — why ChatGPT cites who it cites, and what&apos;s changing? That lives on the blog.
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
