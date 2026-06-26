/**
 * /organicposts — the ladder summit (Ozvor mockup). GOLD-accented throughout.
 *
 * "OrganicPosts. We build it with you." — the managed, done-with-you engagement.
 * Per the brand architecture: OrganicPosts is the GEO execution arm of Ozvor.
 *  1. Gold hero + image placeholder
 *  2. The engagement — 4 steps (Discovery → Content system → Publish cadence → Monitor)
 *  3. DIY-vs-done-with-you decision aid (two columns)
 *  4. CTA — scope a call / compare plans
 * Server component, SSR, real <a href>.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OrganicPosts — We build your AI visibility with you",
  description:
    "The tools get you moving on your own. When you'd rather have a team run the whole AI-visibility project — research, content, cadence and monitoring — OrganicPosts is the managed engagement that does it with you.",
  alternates: { canonical: "https://ozvor.com/organicposts" },
  openGraph: {
    title: "OrganicPosts — We build your AI visibility with you",
    description: "The done-with-you summit of the Ozvor ladder: a managed GEO project, end to end.",
    url: "https://ozvor.com/organicposts",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "OrganicPosts by Ozvor" }],
  },
};

const STEPS: { n: string; t: string; d: string }[] = [
  { n: "01", t: "Discovery & research", d: "We map the real buyer prompts in your category, audit your baseline, and identify the citations worth winning." },
  { n: "02", t: "Content system", d: "A managed editorial calendar — proof pages, comparison content and LinkedIn posts engineered to be cited, written with you." },
  { n: "03", t: "Publish cadence", d: "We hold the cadence steady across your site and LinkedIn — and you approve every draft before it goes live." },
  { n: "04", t: "Monitor & report", d: "Weekly TrustIndex AI tracking across all five engines, with a clear read on what moved your score and what comes next." },
];

const DIY = [
  "You have someone to publish weekly",
  "You want the lowest cost to start",
  "Free → Kit → Growth is enough",
];
const DWY = [
  "Nobody on the team has time to publish",
  "You want the score moved, not managed",
  "You'd rather buy the outcome than run the process",
];

const PAGE_CSS = `
  .op-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-gold-ink); font-weight: 600; }
  .op-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); }
  @media (max-width: 760px) { .op-grid { grid-template-columns: 1fr; } }
  .op-ph {
    aspect-ratio: 16 / 7; border-radius: var(--radius-lg);
    background-color: var(--color-surface-muted);
    background-image: repeating-linear-gradient(135deg, rgba(230,169,63,0.06) 0 12px, transparent 12px 24px);
    border: 1px solid var(--color-gold); display: grid; place-items: center; text-align: center; padding: var(--space-6);
  }
  .op-cta-gold { display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:#1a1206; text-decoration:none; background:linear-gradient(135deg,#e6a93f,#b9791f); border-radius:var(--radius-md); padding:0.8rem 1.5rem; box-shadow:0 10px 32px rgba(230,169,63,0.30); }
  .op-cta-ghost { display:inline-flex; align-items:center; justify-content:center; font-weight:600; color:var(--color-gold-ink); text-decoration:none; border:1px solid var(--color-gold); border-radius:var(--radius-md); padding:0.8rem 1.5rem; }
`;

export default function OrganicPostsPage() {
  return (
    <main style={{ maxWidth: "980px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero (gold) */}
      <span className="op-eyebrow">The summit of the ladder · done with you</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        OrganicPosts. <span style={{ color: "var(--color-gold-ink)" }}>We build it with you.</span>
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "660px", margin: "0 0 var(--space-6)" }}>
        The tools get you moving on your own. When you&rsquo;d rather have a team run the whole
        AI-visibility project &mdash; research, content, cadence and monitoring &mdash; OrganicPosts is
        the managed engagement that does it with you.
      </p>
      <Link href="/book" className="op-cta-gold">Scope your project &rarr;</Link>

      <div className="op-ph" style={{ marginTop: "var(--space-10)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-muted)", letterSpacing: "0.06em" }}>
          [ founder / team working session &mdash; or a real client dashboard ]
        </span>
      </div>

      {/* The engagement */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="op-engagement">
        <span className="op-eyebrow">The engagement</span>
        <h2 id="op-engagement" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-3) 0 var(--space-6)" }}>
          A managed GEO project, end to end.
        </h2>
        <div className="op-grid">
          {STEPS.map((s) => (
            <div key={s.n} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-gold-ink)", fontSize: "0.8125rem" }}>{s.n}</span>
              <h3 style={{ margin: "var(--space-2) 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>{s.t}</h3>
              <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.6, fontSize: "var(--font-size-body-sm)" }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Decision aid */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="op-decide">
        <h2 id="op-decide" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          DIY, or bring in OrganicPosts?
        </h2>
        <div className="op-grid">
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)" }}>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-accent-ink)" }}>Do it yourself when&hellip;</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {DIY.map((t) => (
                <li key={t} style={{ display: "flex", gap: "var(--space-2)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ color: "var(--color-accent-ink)", fontWeight: 700 }}>&#10003;</span>{t}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-gold)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)" }}>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-gold-ink)" }}>Bring in OrganicPosts when&hellip;</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {DWY.map((t) => (
                <li key={t} style={{ display: "flex", gap: "var(--space-2)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ color: "var(--color-gold-ink)", fontWeight: 700 }}>&rarr;</span>{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-5)" }}>
          Let&rsquo;s move your score together.
        </h2>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/book" className="op-cta-gold">Book a scoping call &rarr;</Link>
          <Link href="/pricing" className="op-cta-ghost">Compare plans</Link>
        </div>
      </section>
    </main>
  );
}
