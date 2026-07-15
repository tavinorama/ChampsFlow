/**
 * /kit — "The Get-Cited Kit" ($29 one-time) — Ozvor mockup.
 *
 * Server shell: mockup marketing sections + the KitCheckoutForm client widget
 * (the $29 price card + Stripe checkout — preserved).
 *  1. Hero "The Get-Cited Kit." (Step 2 · $29 one-time)
 *  2. Three deliverable cards: Part 1 audit+score · Part 2 three drafts · Bonus GEO PDF
 *  3. KitCheckoutForm ($29 one-time + checkout)
 *  4. Bridge line → Growth plan (the next rung)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { KitCheckoutForm } from "./KitCheckoutForm";
import { UpsellLadder } from "../../../components/UpsellLadder";
import { FounderAnnualNote } from "../../../components/marketing/FounderAnnualNote";
import { safeJsonLd } from "../../../lib/safe-json-ld";

export const metadata: Metadata = {
  title: "The Get-Cited Kit — Full AI Visibility Audit + 3 Ready Drafts ($29) | Ozvor",
  description:
    "One-time $29. Know exactly why you're invisible in AI search — get your full Ozvor AI Visibility Score, your top 3 fixes, and 3 ready-to-publish content drafts. No subscription required.",
  alternates: { canonical: "https://ozvor.com/kit" },
  openGraph: {
    title: "The Get-Cited Kit ($29) — Ozvor",
    description: "The free test shows the gap. The Kit closes it: full audit + 3 ready-to-publish drafts + a GEO guide.",
    url: "https://ozvor.com/kit",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "The Get-Cited Kit" }],
  },
};

const kitJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "The Get-Cited Kit",
  description: "Full AI visibility audit + your Ozvor AI Visibility Score + 3 ready-to-publish drafts + a plain-English GEO guide.",
  brand: { "@type": "Brand", name: "Ozvor" },
  offers: { "@type": "Offer", price: "29", priceCurrency: "USD", availability: "https://schema.org/InStock", url: "https://ozvor.com/kit" },
};

const PARTS: { tag: string; t: string; items: string[] }[] = [
  { tag: "Part 1", t: "Full audit + your Ozvor AI Visibility Score", items: ["Your score across all 5 engines", "Your top 3 highest-impact fixes", "See exactly where AI already mentions you."] },
  { tag: "Part 2", t: "3 structured drafts, built to finish fast", items: ["1 blog post (with schema)", "1 LinkedIn proof post", "1 FAQ block for your site"] },
  { tag: "Bonus", t: "Plain-English GEO guide (PDF)", items: ["Why AI cites what it cites", "A publish checklist", "Your 30-day re-test plan"] },
];

const PAGE_CSS = `
  .kit-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .kit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 860px) { .kit-grid { grid-template-columns: 1fr; } }
  .kit-fit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
  @media (max-width: 680px) { .kit-fit-grid { grid-template-columns: 1fr; } }
`;

export default function KitPage() {
  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(kitJsonLd) }} />

      {/* Hero */}
      <span className="kit-eyebrow">Step 2 · $29 one-time</span>
      <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
        The Get-Cited Kit. Your audit plus 3 fixes, $29.
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "660px", margin: 0 }}>
        The Kit gives you a full audit and your Ozvor AI Visibility Score. You get your top 3 citation fixes. You also get 3 structured drafts, built to finish fast: a blog post, a LinkedIn post, and an FAQ, each with your top fixes baked in. Plus a plain-English GEO guide and a 30-day re-test plan. No subscription. We guarantee the deliverable, never AI outcomes. If your 3 drafts aren&rsquo;t ready to finish in about 10 minutes, we refund the $29.
      </p>

      {/* Three deliverable cards */}
      <div className="kit-grid" style={{ marginTop: "var(--space-12)" }}>
        {PARTS.map((k) => (
          <div key={k.tag} style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", border: k.tag === "Bonus" ? "1px solid var(--color-gold)" : "1px solid var(--color-border)", background: "var(--color-surface)", boxShadow: "var(--shadow-card)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 9px", borderRadius: "var(--radius-sm)", background: k.tag === "Bonus" ? "rgba(230,169,63,0.12)" : "var(--color-badge-ai-bg)", color: k.tag === "Bonus" ? "var(--color-gold-ink)" : "var(--color-accent-ink)", fontWeight: 700 }}>{k.tag}</span>
            <h2 style={{ margin: "var(--space-3) 0 var(--space-3)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>{k.t}</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {k.items.map((it) => (
                <li key={it} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ color: k.tag === "Bonus" ? "var(--color-gold-ink)" : "var(--color-accent-ink)", fontWeight: 700 }}>&#10003;</span>{it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* "This is for you / not for you" — two-column fit guide */}
      <section aria-labelledby="kit-fit-heading" style={{ marginTop: "var(--space-12)" }}>
        <h2 id="kit-fit-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)" }}>
          Is this for you?
        </h2>
        <div className="kit-fit-grid">
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)" }}>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-accent-ink)" }}>This is for you</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[
                "You want to know whether AI recommends you or a competitor",
                "You’re willing to publish useful proof — FAQs, comparisons, case-study content",
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
                "You won’t publish or improve anything after the audit",
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

      {/* $29 price card + checkout (client widget — preserved) */}
      <div style={{ marginTop: "var(--space-12)" }}>
        <KitCheckoutForm />
      </div>

      {/* Upsell ladder — Growth is the natural next step after the Kit */}
      <UpsellLadder
        heading="Keep climbing — from snapshot to weekly momentum"
        primary={{
          title: "Growth Plan",
          why: "Your Kit is a one-time snapshot. Growth re-runs your full audit every week. It alerts you when your score or citation share moves, and hands you fresh content briefs. The Kit was the first brick — Growth is the wall.",
          price: "$99/mo",
          plan: "growth", interval: "year",
          accent: "emerald",
          ctaAriaLabel: "Start the Growth Plan — $99 per month",
        }}
        secondary={[
          {
            title: "Agency Plan",
            why: "Monitor up to 25 brands, white-label reports, and a client approval workflow.",
            price: "$249/mo",
            plan: "agency", interval: "year",
            accent: "ghost",
            ctaAriaLabel: "Start the Agency Plan — $249 per month",
          },
          {
            title: "OrganicPosts",
            why: "Rather have a team run the whole GEO project? Done-for-you managed engagement.",
            price: "Custom",
            href: "/organicposts",
            accent: "ghost",
            ctaAriaLabel: "Learn about OrganicPosts done-for-you engagement",
          },
        ]}
        marginTop="var(--space-12)"
      />

      <FounderAnnualNote
        suffix="No guaranteed citations."
        style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}
      />
    </main>
  );
}
