/**
 * /learn — "Tutorials" hub (Ozvor mockup §11).
 *
 * Product education (how to USE the platform), kept SEPARATE from the Blog
 * (which is GEO acquisition). Each card pairs an Ozvor-produced tutorial video
 * (screen recording + voiceover) with a written-guide link.
 *
 * v2 changes:
 *  - Removed "Video Studio" / client-facing video creation feature.
 *  - All videos are OZvor-produced: screen recordings with voiceover showing
 *    the actual product, teaching customers how to use it.
 *  - Six how-to tutorials covering the full customer journey.
 *  - Product demo section linking back to the landing page.
 * Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tutorials — Learn to use Ozvor",
  description:
    "Watch Ozvor-produced tutorials: how to run your Free AI Visibility Test, read your score, benchmark competitors, use the Get-Cited Kit, generate content, and monitor weekly progress.",
  alternates: { canonical: "https://ozvor.com/learn" },
  openGraph: {
    title: "Tutorials — Learn to use Ozvor",
    description: "Step-by-step video tutorials showing how to use Ozvor: from your first audit to a moving AI Visibility Score.",
    url: "https://ozvor.com/learn",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor Tutorials" }],
  },
};

type Video = {
  id: string;
  title: string;
  dur: string;
  desc: string;
  audioSrc: string;
  guideHref: string;
};

const VIDEOS: Video[] = [
  {
    id: "free-test",
    title: "How to run your Free AI Visibility Test",
    dur: "3:00",
    desc: "Run a brand audit across all five AI engines in 60 seconds. See your Ozvor AI Visibility Score, competitor benchmarks, and recommended fixes.",
    audioSrc: "/videos/audio/02-free-test-tutorial.mp3",
    guideHref: "/test",
  },
  {
    id: "read-score",
    title: "How to read your AI Visibility Score",
    dur: "2:00",
    desc: "Understand the gauge and three sub-scores: AI citation rate, Performance factors, and Brand authority. Learn what a good score looks like.",
    audioSrc: "/videos/audio/03-score-tutorial.mp3",
    guideHref: "/how-it-works",
  },
  {
    id: "benchmark",
    title: "How to benchmark competitors",
    dur: "2:00",
    desc: "See which competitors AI recommends instead of you, why they win, and what content gaps you need to close to overtake them.",
    audioSrc: "/videos/audio/04-competitor-benchmark.mp3",
    guideHref: "/how-we-measure",
  },
  {
    id: "kit",
    title: "How to use the Get-Cited Kit",
    dur: "2:00",
    desc: "The Kit includes your full report, top 3 prioritized fixes, and 3 publish-ready content drafts — yours to keep forever.",
    audioSrc: "/videos/audio/05-kit-tutorial.mp3",
    guideHref: "/kit",
  },
  {
    id: "content-plan",
    title: "How to generate content with the platform",
    dur: "2:30",
    desc: "Turn every fix into a draft: blog posts, FAQ schemas, LinkedIn posts. Approve and publish — never auto-published without your OK.",
    audioSrc: "",
    guideHref: "/pricing",
  },
  {
    id: "weekly-monitor",
    title: "How to monitor your weekly progress",
    dur: "2:00",
    desc: "Every Monday, the platform recalculates your score. Watch trends, see if your fixes are working, and plan the next week.",
    audioSrc: "",
    guideHref: "/pricing",
  },
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
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .lrn-thumb:hover { border-color: var(--color-accent-ink); box-shadow: 0 0 0 2px rgba(39,201,138,0.2); }
  .lrn-play { width: 46px; height: 46px; border-radius: var(--radius-pill); background: linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e; display:grid; place-items:center; font-size: 18px; }
  .lrn-dur { position:absolute; right:8px; bottom:8px; font-family: var(--font-mono); font-size: 0.6875rem; color: var(--color-text); background: rgba(0,0,0,0.45); padding: 2px 7px; border-radius: var(--radius-sm); }
  .lrn-guide { color: var(--color-accent-ink); font-weight: 600; text-decoration: none; font-size: var(--font-size-body-sm); }
  .lrn-cta-primary { display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:#06140e; text-decoration:none; background:linear-gradient(135deg,#27c98a,#0c7d54); border-radius:var(--radius-md); padding:0.8rem 1.5rem; box-shadow:0 10px 32px rgba(39,201,138,0.32); }
  .lrn-demo-preview {
    position:relative; aspect-ratio:16/9; border-radius:var(--radius-lg); overflow:hidden;
    background:radial-gradient(80% 70% at 50% 40%, rgba(39,201,138,0.10), transparent 60%), var(--color-surface-muted);
    border:1px solid var(--color-border);
    display:grid; place-items:center;
  }
`;

export default function LearnPage() {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <span className="lrn-eyebrow">Tutorials</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        Watch and learn Ozvor.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        Step-by-step tutorials showing the actual product — how to run your first audit, read your score, benchmark competitors, generate content, and track your progress every week.
      </p>

      {/* Tutorial grid */}
      <div className="lrn-grid" style={{ marginTop: "var(--space-12)" }}>
        {VIDEOS.map((v) => (
          <article key={v.id} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="lrn-thumb" onClick={() => {
              const audio = document.getElementById(`audio-${v.id}`) as HTMLAudioElement;
              if (audio) { audio.currentTime = 0; audio.play(); }
            }}>
              <span className="lrn-play" aria-hidden="true">▶</span>
              <span className="lrn-dur">{v.dur}</span>
              {v.audioSrc && (
                <audio id={`audio-${v.id}`} preload="none" style={{ display: 'none' }}>
                  <source src={v.audioSrc} type="audio/mpeg" />
                </audio>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
              <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)" }}>{v.title}</h2>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.6, fontSize: "var(--font-size-body-sm)", flex: 1 }}>{v.desc}</p>
            <Link href={v.guideHref} className="lrn-guide">Try it now →</Link>
          </article>
        ))}
      </div>

      {/* Product demo highlight section */}
      <section style={{
        marginTop: "var(--space-16)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-6)",
        alignItems: "center",
      }}>
        <div style={{ flex: "1 1 360px" }}>
          <span className="lrn-eyebrow">Product demo</span>
          <h2 style={{ margin: "var(--space-3) 0 var(--space-3)", fontSize: "clamp(1.3rem, 3vw, 1.75rem)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            See Ozvor in 90 seconds.
          </h2>
          <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.65, fontSize: "var(--font-size-body-sm)" }}>
            Watch the full product walkthrough on the landing page: from AI audit to score to competitors to fixes. Then come back here for the detailed how-tos.
          </p>
          <Link href="/" className="lrn-guide" style={{ display: "inline-block", marginTop: "var(--space-4)" }}>Watch the demo →</Link>
        </div>
        <div className="lrn-demo-preview" style={{ flex: "0 0 320px" }}>
          <span className="lrn-play" aria-hidden="true">▶</span>
        </div>
      </section>

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
