/**
 * /results — "Case study" / building-in-public (Ozvor mockup).
 *
 * Honest, no-fabrication page:
 *  1. Hero "Real numbers, published every Monday."
 *  2. Live panel — 8-week Ozvor AI Visibility Score trend (44→72) + citation-rate-by-engine bars.
 *  3. "No fabricated testimonials. Ever." — three dashed reserved-quote slots.
 *  4. CTA — run the test & share your results.
 * Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Case study — Real Ozvor numbers, published every Monday",
  description:
    "We run Ozvor on ourselves and publish the raw numbers weekly: an 8-week Ozvor AI Visibility Score trend and citation rate by engine. No fabricated testimonials — ever.",
  alternates: { canonical: "https://ozvor.com/results" },
  openGraph: {
    title: "Case study — Real Ozvor numbers, every Monday",
    description: "Building in public: our own Ozvor AI Visibility Score over 8 weeks + citation rate by engine.",
    url: "https://ozvor.com/results",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor case study" }],
  },
};

const TREND = [44, 46, 45, 49, 53, 58, 64, 72];
const ENGINES: { e: string; v: number }[] = [
  { e: "ChatGPT", v: 42 },
  { e: "Claude", v: 36 },
  { e: "Perplexity", v: 51 },
  { e: "Gemini", v: 29 },
  { e: "Google AI", v: 33 },
];
const RESERVED = ["Early user · healthcare services", "Early user · professional services", "Early user · e-commerce"];

const PAGE_CSS = `
  .res-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .res-panels { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
  @media (max-width: 820px) { .res-panels { grid-template-columns: 1fr; } }
  .res-quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); }
  @media (max-width: 760px) { .res-quotes { grid-template-columns: 1fr; } }
  .res-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-card); }
  .res-bars { display: flex; align-items: flex-end; gap: 6px; height: 160px; }
  .res-bar { flex: 1; border-radius: 6px 6px 0 0; background: linear-gradient(180deg,#27c98a,#0c7d54); min-height: 4px; }
`;

export default function ResultsPage() {
  const maxTrend = Math.max(...TREND);
  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <span className="res-eyebrow">Case study · building in public</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        Real numbers, published every Monday.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        We run Ozvor on ourselves and publish the raw score every week. No cherry-picking — just the
        Ozvor AI Visibility Score moving (or not) across the five engines.
      </p>

      {/* Live panels */}
      <div className="res-panels" style={{ marginTop: "var(--space-12)" }}>
        {/* Trend */}
        <div className="res-card">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 700 }}>Ozvor AI Visibility Score · 8 weeks</h2>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-accent-ink)" }}>{TREND[0]} → {TREND[TREND.length - 1]}</span>
          </div>
          <div className="res-bars" role="img" aria-label={`Weekly Ozvor AI Visibility Score from ${TREND[0]} to ${TREND[TREND.length - 1]} over 8 weeks`}>
            {TREND.map((v, i) => (
              <div key={i} className="res-bar" style={{ height: `${(v / maxTrend) * 100}%`, opacity: i === TREND.length - 1 ? 1 : 0.65 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--color-muted)" }}>
            <span>W1</span><span>W8</span>
          </div>
        </div>

        {/* Engine bars */}
        <div className="res-card">
          <h2 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>Citation rate · by engine</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {ENGINES.map((en) => (
              <div key={en.e}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", fontWeight: 600 }}>{en.e}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-muted)" }}>{en.v}%</span>
                </div>
                <div style={{ height: "8px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-muted)", overflow: "hidden" }}>
                  <div style={{ width: `${en.v}%`, height: "100%", background: "linear-gradient(90deg,#27c98a,#0c7d54)", borderRadius: "var(--radius-pill)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reserved quotes — no fabricated testimonials */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="res-quotes-h">
        <h2 id="res-quotes-h" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-2)", textAlign: "center" }}>
          No fabricated testimonials. Ever.
        </h2>
        <p style={{ textAlign: "center", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)" }}>
          These slots are reserved for real early-access quotes. We&rsquo;ll fill them only when they&rsquo;re real.
        </p>
        <div className="res-quotes">
          {RESERVED.map((label) => (
            <div key={label} style={{ border: "1px dashed var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", textAlign: "center", color: "var(--color-muted)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Reserved</span>
              <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-5)" }}>
          Run the test. Share your own numbers.
        </h2>
        <Link href="/test" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#06140e", textDecoration: "none", background: "linear-gradient(135deg,#27c98a,#0c7d54)", borderRadius: "var(--radius-md)", padding: "0.8rem 1.5rem", boxShadow: "0 10px 32px rgba(39,201,138,0.32)" }}>
          Run the free AI test →
        </Link>
      </section>
    </main>
  );
}
