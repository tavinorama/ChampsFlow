/**
 * /local-pages — Ozvor Pages sales page (issue #208, PR-8, final PR of the series).
 *
 * Server shell: static marketing sections + the PagesBuyForm client widget
 * ($99 one-time checkout). Mirrors /kit's structure (server component owns
 * metadata + JSON-LD, a small client component owns the form + fetch call).
 *
 *  1. Hero — "A 5-page website AI can actually cite" + CTA row
 *  2. How it works (3 steps)
 *  3. What's included grid
 *  4. Pricing block ($99 one-time vs Growth vs Agency) + refund guarantee
 *  5. Checkout (PagesBuyForm)
 *  6. FAQ (details/summary, first item open)
 *
 * Only factual claims — no fabricated numbers/testimonials/rankings (house
 * rule, #162). "$99 one-time" and "5-page website" are the exact founder
 * price/copy decisions from issue #208. Custom domain + code export are
 * honestly labeled "coming soon" — neither ships yet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PagesBuyForm } from "./PagesBuyForm";
import { FounderAnnualNote } from "../../../components/marketing/FounderAnnualNote";

export const metadata: Metadata = {
  title: "Ozvor Pages — AI-search-ready 5-page websites | Ozvor",
  description:
    "A 5-page website built from your real business data — interlinked, schema-rich, live on ozvor.com with lead capture. $99 one-time, or included free with the Growth plan.",
  alternates: { canonical: "https://ozvor.com/local-pages" },
  openGraph: {
    title: "Ozvor Pages — AI-search-ready 5-page websites",
    description:
      "Built from your real business data — interlinked, schema-rich, live on ozvor.com with lead capture. $99 one-time.",
    url: "https://ozvor.com/local-pages",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor Pages" }],
  },
};

const pagesJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Ozvor Pages",
  description:
    "A 5-page website generated from a business's real facts, reviews, and site content — interlinked, schema-rich, hosted on ozvor.com with a lead-capture form.",
  brand: { "@type": "Brand", name: "Ozvor" },
  offers: {
    "@type": "Offer",
    price: "99",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: "https://ozvor.com/local-pages",
  },
};

const STEPS: { num: string; title: string; body: string }[] = [
  {
    num: "01",
    title: "Tell us about your business",
    body: "Name, category, address, phone, service areas, hours, and (optionally) your existing site — the same facts your audit already uses.",
  },
  {
    num: "02",
    title: "We generate 5 interlinked pages",
    body: "Home, 2 service/city pages, an FAQ page, and a proof page — each cross-linked, with LocalBusiness and FAQ schema.org markup built in.",
  },
  {
    num: "03",
    title: "Publish — leads land in your dashboard",
    body: "One click makes it live at ozvor.com/l/your-business. Every form submission shows up in your Leads screen, with an email notification.",
  },
];

const INCLUDED: { title: string; body: string }[] = [
  { title: "5 interlinked pages", body: "Home, service/city pages, FAQ, and proof — cross-linked so AI crawlers and visitors can navigate the whole site." },
  { title: "LocalBusiness + FAQ schema", body: "Structured data on every page, built for AI and search citation, not just human readers." },
  { title: "Lead capture with email alerts", body: "A contact form on your site with consent capture; every submission notifies you and lands in your dashboard." },
  { title: "Version history", body: "Every edit is snapshotted. Restore any previous version of a page in one click." },
  { title: "Hosted on ozvor.com", body: "Live instantly at ozvor.com/l/your-business. Custom domain support is coming soon — not available yet." },
  { title: "AI-readiness score per page", body: "Each page gets a score so you know exactly where it's weak before you publish." },
  { title: "Audit-fix loop (subscribers)", body: "On Growth or Agency, your weekly audit's fixes regenerate straight into the site — one click, no rebuild from scratch." },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Who owns the site?",
    a: "You do. It's your business's content, hosted on ozvor.com. Code export isn't available yet — it's on the roadmap — but nothing about the site is locked to a subscription once you've paid the one-time $99 or it's included with your plan.",
  },
  {
    q: "Where is it hosted?",
    a: "On ozvor.com, at ozvor.com/l/your-business-slug. Custom domain support (yourbusiness.com) is coming soon — it isn't available today.",
  },
  {
    q: "What happens on the Free plan?",
    a: "The Free plan doesn't include the site builder. Buying the $99 one-time unlocks the builder for exactly 1 site on your account, regardless of plan tier. Growth includes 1 site as part of the subscription; Agency includes up to 25.",
  },
  {
    q: "How do regenerations work?",
    a: "Regenerating a site (rebuilding it after edits to your business info, or pulling in fresh audit fixes) draws from a quota. The $99 one-time purchase includes 2 lifetime regenerations. Growth and Agency subscribers get 5 regenerations per site, per month, resetting on the 1st (UTC). The very first generation of a new site is always free and never counted against either quota.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const PAGE_CSS = `
  .lp-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .lp-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 860px) { .lp-steps-grid { grid-template-columns: 1fr; } }
  .lp-included-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); }
  @media (max-width: 680px) { .lp-included-grid { grid-template-columns: 1fr; } }
  .lp-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
  @media (max-width: 860px) { .lp-pricing-grid { grid-template-columns: 1fr; } }
  .lp-cta-row { display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap; }
`;

export default function LocalPagesSalesPage() {
  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pagesJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto" }}>
        <span className="lp-eyebrow">Ozvor Pages</span>
        <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
          A 5-page website AI can actually cite.
        </h1>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: 0 }}>
          Built from your real business data &mdash; your info, your existing site, your reviews &mdash; then interlinked and
          schema-rich. Live on ozvor.com with a lead-capture form from day one.
        </p>
        <div className="lp-cta-row" style={{ marginTop: "var(--space-6)" }}>
          <Link
            href="#buy"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,#27c98a,#0c7d54)", color: "#06140e",
              fontWeight: 700, fontSize: "1rem", padding: "0.9rem 1.6rem",
              borderRadius: "var(--radius-md)", textDecoration: "none",
              boxShadow: "0 10px 32px rgba(39,201,138,0.28)",
            }}
          >
            Get your site &mdash; $99 one-time
          </Link>
          <Link
            href="/pricing"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
              color: "var(--color-text)", fontWeight: 600, fontSize: "1rem", padding: "0.9rem 1.6rem",
              borderRadius: "var(--radius-md)", textDecoration: "none",
            }}
          >
            Included free with Growth &rarr;
          </Link>
        </div>
      </div>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section aria-labelledby="lp-how-heading" style={{ marginTop: "var(--space-16)" }}>
        <h2 id="lp-how-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          How it works
        </h2>
        <div className="lp-steps-grid">
          {STEPS.map((s) => (
            <div key={s.num} style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-accent-ink)" }}>{s.num}</div>
              <h3 style={{ margin: "var(--space-2) 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What's included ─────────────────────────────────────────── */}
      <section aria-labelledby="lp-included-heading" style={{ marginTop: "var(--space-16)" }}>
        <h2 id="lp-included-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          What&rsquo;s included
        </h2>
        <div className="lp-included-grid">
          {INCLUDED.map((item) => (
            <div key={item.title} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-5)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
              <span aria-hidden="true" style={{ color: "var(--color-accent-ink)", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
              <span>
                <strong style={{ display: "block", fontSize: "var(--font-size-body-sm)" }}>{item.title}</strong>
                <span style={{ display: "block", marginTop: "2px", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>{item.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section aria-labelledby="lp-pricing-heading" style={{ marginTop: "var(--space-16)" }}>
        <h2 id="lp-pricing-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          Buy it once, or get it with a plan
        </h2>
        <div className="lp-pricing-grid">
          <div style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", border: "1.5px solid var(--color-primary)", background: "var(--color-surface)", boxShadow: "0 12px 40px rgba(39,201,138,0.14)" }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-accent-ink)" }}>One-time</div>
            <div style={{ marginTop: "var(--space-2)", fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>$99</div>
            <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>1 site, yours to keep. 2 lifetime regenerations.</p>
          </div>
          <div style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-muted)" }}>Growth</div>
            <div style={{ marginTop: "var(--space-2)", fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>$99<span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-muted)" }}>/mo</span></div>
            <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>1 site included, plus weekly audits and the audit-fix regeneration loop. 5 regenerations/site/month.</p>
          </div>
          <div style={{ padding: "var(--space-6)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-gold-ink)" }}>Agency</div>
            <div style={{ marginTop: "var(--space-2)", fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>$249<span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-muted)" }}>/mo</span></div>
            <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>Up to 25 sites &mdash; 1 per client brand. Same 5 regenerations/site/month.</p>
          </div>
        </div>
        <div style={{ marginTop: "var(--space-5)", padding: "var(--space-4)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, textAlign: "center" }}>
          <strong style={{ color: "var(--color-text)" }}>Guarantee:</strong> if your 5-page site isn&rsquo;t live and ready to publish, we refund the $99.
          We guarantee the deliverable &mdash; never AI outcomes like citations or rankings.
        </div>
      </section>

      {/* ── Checkout ─────────────────────────────────────────────────── */}
      <section id="buy" aria-labelledby="lp-buy-heading" style={{ marginTop: "var(--space-16)", scrollMarginTop: "var(--space-16)" }}>
        <h2 id="lp-buy-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          Get your site
        </h2>
        <PagesBuyForm />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="lp-faq-heading" style={{ marginTop: "var(--space-16)" }}>
        <h2 id="lp-faq-heading" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6)", textAlign: "center" }}>
          Questions we get asked
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxWidth: "780px", margin: "0 auto" }}>
          {FAQS.map((f, i) => (
            <details key={f.q} open={i === 0} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)", overflow: "hidden" }}>
              <summary
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)",
                  cursor: "pointer", padding: "var(--space-4) var(--space-5)", fontSize: "1rem", fontWeight: 600,
                  color: "var(--color-text)", listStyle: "none",
                }}
              >
                <span>{f.q}</span>
                <span aria-hidden="true" style={{ flexShrink: 0, fontSize: "1.25rem", color: "var(--color-accent-ink)" }}>+</span>
              </summary>
              <div style={{ padding: "0 var(--space-5) var(--space-5)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, color: "var(--color-muted)" }}>
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      <FounderAnnualNote
        suffix="No guaranteed citations."
        style={{ marginTop: "var(--space-8)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}
      />

      <style>{`
        details summary::-webkit-details-marker { display: none; }
      `}</style>
    </main>
  );
}
