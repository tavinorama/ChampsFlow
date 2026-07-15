/**
 * /agencies — the agency-facing surface (ICP audit P1).
 *
 * Segment A of the ICP (digital-marketing & SEO agencies) had no landing
 * surface: the homepage speaks to single-brand SMB owners and the Agency tier
 * only appeared as a pricing card. This page sells the tier's real capabilities:
 *  1. Hero — "Deliver AI visibility to every client. Under your brand."
 *  2. Economics strip — $549/mo across up to 15 brands (~$37/brand)
 *  3. What's in the tier (real features only) + pitch-mode play
 *  4. Honesty block — measured-never-fabricated is a client-trust asset
 *  5. OrganicPosts referral (gold) + final CTA
 * Server component, SSR; checkout via DirectCheckoutButton (client island).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { DirectCheckoutButton } from "../../../components/marketing/DirectCheckoutButton";
import { FounderAnnualNote } from "../../../components/marketing/FounderAnnualNote";

export const metadata: Metadata = {
  title: "Ozvor for agencies — white-label AI-visibility for every client",
  description:
    "Run AI-search audits, evidence-backed GEO plans, and white-label reports for up to 15 client brands. $549/mo, about $37 per brand ($26 on founder annual). Win the GEO line item before your competitor agency does.",
  alternates: { canonical: "https://ozvor.com/agencies" },
  openGraph: {
    title: "Ozvor for agencies — white-label AI visibility",
    description: "Audits, evidence, plans and white-label reports for up to 15 client brands. $549/mo.",
    url: "https://ozvor.com/agencies",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor for agencies" }],
  },
};

const FEATURES: { t: string; d: string }[] = [
  { t: "Multi-client dashboard", d: "Up to 15 brands in one portfolio view. See every client's AI Visibility Score, trend, and next action in one screen." },
  { t: "White-label reports", d: "Client-facing reports under your agency's brand. The evidence is Ozvor's. The relationship is yours." },
  { t: "Weekly monitoring on every client", d: "Every brand re-probed weekly across ChatGPT, Claude, Perplexity, Gemini and Google AI Overview." },
  { t: "10 competitors per brand", d: "Show each client exactly who AI recommends instead of them. It's the single most persuasive slide you'll present all year." },
  { t: "Client approval workflow", d: "Drafts move through review and approval — nothing publishes without a sign-off. Your process, enforced by the tool." },
  { t: "Pitch mode", d: "Run a free test on a prospect before the meeting. Open with their real AI-visibility gaps. Evidence beats promises." },
  { t: "Priority support · 4h SLA", d: "When a client call is tomorrow, you get answers today." },
  { t: "CSV export + API", d: "Pull the data into your own decks, dashboards and reporting stack." },
];

const PAGE_CSS = `
  .ag-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .ag-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); }
  @media (max-width: 760px) { .ag-grid { grid-template-columns: 1fr; } }
  .ag-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-card); }
  .ag-cta-emerald { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 var(--space-6); border-radius:var(--radius-md); font-weight:800; font-size:var(--font-size-body); text-decoration:none; background:linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e; box-shadow:0 10px 32px rgba(39,201,138,0.28); border:none; cursor:pointer; font-family:var(--font-family); }
  .ag-cta-ghost { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 var(--space-6); border-radius:var(--radius-md); font-weight:700; font-size:var(--font-size-body); text-decoration:none; border:1px solid var(--color-border); color:var(--color-text); font-family:var(--font-family); }
  .ag-stat { text-align:center; padding: var(--space-4); }
  .ag-stat b { display:block; font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 800; letter-spacing: -0.02em; color: var(--color-accent-ink); }
`;

export default function AgenciesPage() {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: "760px", margin: "0 auto" }}>
        <span className="ag-eyebrow">Ozvor for agencies</span>
        <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
          Deliver AI visibility to every client. Under your brand.
        </h1>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-6)" }}>
          Your clients are already asking why ChatGPT recommends their competitor. Ozvor Agency gives you the audits,
          the evidence, and the white-label reports. Own that conversation across your whole portfolio.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <DirectCheckoutButton
            plan="agency"
            interval="year"
            label="Start Agency — $549/mo"
            style={{ background: "linear-gradient(135deg,#27c98a,#0c7d54)", color: "#06140e", border: "none", fontWeight: 800, boxShadow: "0 10px 32px rgba(39,201,138,0.28)" }}
          />
          <Link href="/book" className="ag-cta-ghost">Talk it through first</Link>
        </div>
      </div>

      {/* Economics strip */}
      <div className="ag-card" style={{ marginTop: "var(--space-12)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-2)" }}>
        <div className="ag-stat"><b>15</b><span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>client brands on one plan</span></div>
        <div className="ag-stat"><b>$36.60</b><span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>per brand per month. Just $25.62 on founder annual pricing.</span></div>
        <div className="ag-stat"><b>5</b><span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>AI engines probed weekly</span></div>
        <div className="ag-stat"><b>4h</b><span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>priority-support SLA</span></div>
      </div>
      <FounderAnnualNote style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }} />

      {/* Features */}
      <section style={{ marginTop: "var(--space-16)" }} aria-labelledby="ag-features">
        <h2 id="ag-features" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          The GEO line item, productized.
        </h2>
        <div className="ag-grid">
          {FEATURES.map((f) => (
            <div key={f.t} className="ag-card">
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-accent-ink)" }}>{f.t}</h3>
              <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honesty block — client trust as a sales asset */}
      <section className="ag-card" style={{ marginTop: "var(--space-16)", borderColor: "rgba(39,201,138,0.4)" }} aria-labelledby="ag-honesty">
        <h2 id="ag-honesty" style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h2)", fontWeight: 800 }}>
          Reports your clients can verify.
        </h2>
        <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "720px" }}>
          Every score in an Ozvor report is measured live, on real prompts and real engines. When an engine cannot be
          measured, the report says so. AI answers can change from day to day. We label every number measured or
          baseline, never invented. <Link href="/how-we-measure" style={{ color: "var(--color-accent-ink)", fontWeight: 600, textDecoration: "none" }}>Read the public methodology →</Link>
        </p>
      </section>

      {/* OrganicPosts referral */}
      <section className="ag-card" style={{ marginTop: "var(--space-8)", borderColor: "var(--color-gold)" }} aria-labelledby="ag-op">
        <h2 id="ag-op" style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h2)", fontWeight: 800 }}>
          Client too big to serve in-house?
        </h2>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "720px" }}>
          When a client needs the whole engagement run for them, <strong>OrganicPosts</strong> is Ozvor&rsquo;s managed
          arm. It covers research, content system, cadence, and monitoring. Hand it off, and stay the relationship owner.
        </p>
        <Link href="/organicposts" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "0 var(--space-5)", borderRadius: "var(--radius-md)", fontWeight: 700, textDecoration: "none", background: "linear-gradient(135deg,#e6a93f,#b9791f)", color: "#1a1206" }}>
          How OrganicPosts works →
        </Link>
      </section>

      {/* Final CTA */}
      <div style={{ textAlign: "center", marginTop: "var(--space-16)" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          Win the GEO line item before your competitor agency does.
        </h2>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <DirectCheckoutButton
            plan="agency"
            interval="year"
            label="Start Agency"
            style={{ background: "linear-gradient(135deg,#27c98a,#0c7d54)", color: "#06140e", border: "none", fontWeight: 800, boxShadow: "0 10px 32px rgba(39,201,138,0.28)" }}
          />
          <Link href="/pricing" className="ag-cta-ghost">Compare all plans</Link>
        </div>
        <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          30-day money-back · cancel anytime · no lock-in
        </p>
      </div>
    </main>
  );
}
