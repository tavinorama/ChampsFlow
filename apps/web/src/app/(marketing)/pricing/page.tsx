/**
 * /pricing — Plans (Ozvor mockup).
 *
 *  1. Hero "Replace a $30k/yr specialist for under $100/mo."
 *  2. Founding-member band (gold) — 30% founder discount + free 5-page website, annual only.
 *  3. Three plan cards — Free / Growth (featured, emerald, "Most popular") / Agency (gold).
 *  4. Competitor comparison table (Buffer/Hootsuite/Later/Predis.ai vs Ozvor).
 * Server component, SSR, real <a href> checkout links.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { UpsellLadder } from "../../../components/UpsellLadder";
import { PricingPlans } from "./PricingPlans";
import { FounderBand } from "./FounderBand";

export const metadata: Metadata = {
  title: "Plans — Replace a $30k/yr specialist for under $100/mo | Ozvor",
  description:
    "Start free, climb when you're ready. Free AI test, $29 Get-Cited Kit, Growth $99/mo, Agency $249/mo. 30-day money-back, cancel anytime, no lock-in. Founding members: 30% off annual + a free 5-page website.",
  alternates: { canonical: "https://ozvor.com/pricing" },
  openGraph: {
    title: "Plans — Ozvor",
    description: "Free → Kit $29 → Growth $99/mo → Agency $249/mo. 30-day money-back, no lock-in.",
    url: "https://ozvor.com/pricing",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor plans" }],
  },
};

// Plan cards (with the annual-default / monthly toggle) live in the client
// component ./PricingPlans.tsx. Comparison table data stays below.

const COMPARE_COLS = ["Buffer", "Hootsuite", "Later", "Predis.ai"];
const COMPARE_ROWS: { f: string; vals: string[]; us: string }[] = [
  { f: "Content drafted for LLM visibility (GEO)", vals: ["✗", "✗", "✗", "✗"], us: "Structured drafts shaped for AI citation" },
  { f: "No AI training on your content", vals: ["?", "?", "?", "?"], us: "Provider-contractual (Anthropic terms)" },
  { f: "EU-region inference", vals: ["~", "~", "?", "?"], us: "On our roadmap" },
  { f: "Draft-and-confirm (no autonomous posting)", vals: ["✗", "✗", "✗", "✗"], us: "Always, by design" },
  { f: "AI disclosure (EU AI Act Art. 50)", vals: ["?", "?", "?", "?"], us: "Named model + visible badge" },
];

const PAGE_CSS = `
  .pr-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .pr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); align-items: start; }
  @media (max-width: 860px) { .pr-grid { grid-template-columns: 1fr; } }
  .pr-cta { display:block; text-align:center; width:100%; box-sizing:border-box; font-weight:700; text-decoration:none; border-radius:var(--radius-md); padding:0.8rem 1rem; margin-top:var(--space-4); }
  .pr-cta-emerald { background:linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e; box-shadow:0 10px 32px rgba(39,201,138,0.28); }
  .pr-cta-gold { background:linear-gradient(135deg,#e6a93f,#b9791f); color:#1a1206; box-shadow:0 10px 32px rgba(230,169,63,0.26); }
  .pr-cta-ghost { border:1px solid var(--color-border); color:var(--color-text); }
  .pr-tablewrap { overflow-x:auto; }
  .pr-table { width:100%; min-width:720px; border-collapse:collapse; font-size:var(--font-size-body-sm); }
  .pr-table th, .pr-table td { padding:0.75rem 0.9rem; border-bottom:1px solid var(--color-border); text-align:left; }
  .pr-table thead th { font-family:var(--font-mono); font-size:0.6875rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--color-muted); font-weight:600; }
  .pr-us { color:var(--color-accent-ink); font-weight:600; }
  .pr-fit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
  @media (max-width: 680px) { .pr-fit-grid { grid-template-columns: 1fr; } }
`;

export default function PricingPage() {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto" }}>
        <span className="pr-eyebrow">Plans</span>
        <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
          Replace a $30k/yr specialist for under $100/mo.
        </h1>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: 0 }}>
          Start free, climb when you&rsquo;re ready. 30-day money-back guarantee · cancel any time · no lock-in.
        </p>
      </div>

      {/* Founding-member band — shows only while the offer is live (auto-hides
          when the first-100 cohort fills, via /api/founder-status). */}
      <FounderBand />

      {/* Plan cards — annual default with an in-card Monthly toggle (client) */}
      <PricingPlans />

      {/* "This is for you / not for you" — two-column fit guide */}
      <section aria-labelledby="pr-fit-heading" style={{ marginTop: "var(--space-16)" }}>
        <h2 id="pr-fit-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          Is this for you?
        </h2>
        <div className="pr-fit-grid">
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-accent-ink)" }}>This is for you</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[
                "You want to know whether AI recommends you or a competitor",
                "You're willing to publish useful proof — FAQs, comparisons, case-study content",
                "You want a repeatable system to improve AI visibility over time",
              ].map((item) => (
                <li key={item} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
                  <span aria-hidden="true" style={{ color: "var(--color-accent-ink)", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-muted)" }}>Not for you</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[
                "You expect guaranteed citations overnight",
                "You want fake reviews, Reddit posts, or spammy link signals",
                "You want fully autonomous publishing with no approval step",
                "You won't publish or improve anything after the audit",
              ].map((item) => (
                <li key={item} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
                  <span aria-hidden="true" style={{ fontWeight: 700, flexShrink: 0 }}>&#10005;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* OrganicPosts done-for-you nudge — for Agency-context visitors who want
          the full managed engagement rather than a self-serve subscription. */}
      <UpsellLadder
        heading="Need someone to run it for you?"
        primary={{
          title: "OrganicPosts",
          why: "The self-serve plans give you the tools and intelligence. OrganicPosts is the done-with-you summit: a managed GEO project where our team runs discovery, content, cadence, and monitoring — you approve every draft before it goes live.",
          price: "Starts with a call",
          href: "/organicposts",
          accent: "gold",
          ctaAriaLabel: "Learn about OrganicPosts done-for-you GEO management",
        }}
        secondary={[
          {
            title: "Book a 20-min call",
            why: "Scope the project — no commitment, no sales pitch.",
            price: "Free",
            href: "/book",
            accent: "ghost",
            ctaAriaLabel: "Book a free 20-minute GEO scoping call",
          },
        ]}
        marginTop="var(--space-16)"
      />

      {/* Comparison table */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="pr-compare">
        <h2 id="pr-compare" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-2)", textAlign: "center" }}>
          Social schedulers post. Ozvor gets you cited.
        </h2>
        <p style={{ textAlign: "center", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)" }}>
          Competitor capabilities not disclosed are marked &ldquo;?&rdquo; (checked 2026-05-11).
        </p>
        <div className="pr-tablewrap" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {COMPARE_COLS.map((c) => <th key={c} scope="col" style={{ textAlign: "center" }}>{c}</th>)}
                <th scope="col" style={{ color: "var(--color-accent-ink)" }}>Ozvor</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.f}>
                  <td style={{ color: "var(--color-text)" }}>{r.f}</td>
                  {r.vals.map((v, i) => <td key={i} style={{ textAlign: "center", color: "var(--color-muted)" }}>{v}</td>)}
                  <td className="pr-us">{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}>
          ✓ yes · ~ partial · ✗ no · ? not disclosed. <Link href="/how-we-measure" style={{ color: "var(--color-accent-ink)", textDecoration: "none", fontWeight: 600 }}>How we measure →</Link>
        </p>
      </section>
    </main>
  );
}
