/**
 * /faq — the full FAQ.
 *
 * Sourced from:
 *  - The 3 mini-FAQ items on the new home (landing-v2-logic.ts's FAQS —
 *    answers kept verbatim here so the two pages never disagree).
 *  - /learn tutorial copy (score breakdown, how the audit runs).
 *  - ./vs/_data.ts (audit failure honesty — "fails if a probe fails").
 *  - ./pricing/PricingPlans.tsx + landing-v2-logic.ts (plan features/prices).
 *  - ./local-pages/page.tsx + ./organicposts/page.tsx (product facts).
 *
 * No new claims are made — every answer paraphrases facts that already exist
 * elsewhere in the app. Privacy questions link to /legal pages instead of
 * restating legal text. Server component, SSR, native <details>/<summary>
 * (keyboard-accessible with no JS), FAQPage JSON-LD via safeJsonLd (#216 XSS
 * hardening — tenant/user copy is never allowed to break out of the
 * <script> tag; this page's copy is static, but the same builder is used
 * everywhere for one consistent, audited code path).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { safeJsonLd } from "../../../components/landing-public/json-ld";

export const metadata: Metadata = {
  title: "FAQ — Answers about Ozvor, pricing, and the AI Visibility Score | Ozvor",
  description:
    "Answers about the Ozvor AI Visibility Score, how the audit works, the free test, the $29 Kit, Growth, Agency, Ozvor Pages, OrganicPosts, SEO vs GEO, and data privacy.",
  alternates: { canonical: "https://ozvor.com/faq" },
  openGraph: {
    title: "FAQ — Ozvor",
    description: "Straight answers about the Score, the audit, pricing, and your data.",
    url: "https://ozvor.com/faq",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor FAQ" }],
  },
};

interface FaqItem {
  q: string;
  a: React.ReactNode;
  /** Plain-text version of `a`, used only for the JSON-LD (no JSX allowed there). */
  aText: string;
}

interface FaqGroup {
  title: string;
  items: FaqItem[];
}

const GROUPS: FaqGroup[] = [
  {
    title: "The Score & the audit",
    items: [
      {
        q: "What is the Ozvor AI Visibility Score?",
        aText:
          "It's a 0–100 score. It shows how often AI sees and quotes your brand across 5 engines. Three parts: Visibility, Citation Readiness, Execution.",
        a: "It's a 0–100 score. It shows how often AI sees and quotes your brand across 5 engines. Three parts: Visibility, Citation Readiness, Execution.",
      },
      {
        q: "What do the three parts of the score mean?",
        aText:
          "Visibility checks how often AI names you, and where. Citation Readiness checks your schema and AI-crawler access. Execution checks your authority on the sources AI trusts.",
        a: "Visibility checks how often AI names you, and where. Citation Readiness checks your schema and AI-crawler access. Execution checks your authority on the sources AI trusts.",
      },
      {
        q: "How does the audit actually work?",
        aText:
          "We ask real buyer questions. We check: ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews. Then we record who gets named — you or a competitor.",
        a: "We ask real buyer questions. We check: ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews. Then we record who gets named — you or a competitor.",
      },
      {
        q: "What happens if an engine won't answer?",
        aText:
          "We don't guess. We mark that engine as failed. You see exactly which check didn't run, and why.",
        a: "We don't guess. We mark that engine as failed. You see exactly which check didn't run, and why.",
      },
      {
        q: "Is the audit data real?",
        aText: "Yes. Real questions to real engines. If we can't measure something, we say so. We never make up a result.",
        a: "Yes. Real questions to real engines. If we can't measure something, we say so. We never make up a result.",
      },
    ],
  },
  {
    title: "Getting started",
    items: [
      {
        q: "What's the free test?",
        aText:
          "A real audit of your brand. No card needed. About 60 seconds. You get your score. You see who AI named instead of you.",
        a: "A real audit of your brand. No card needed. About 60 seconds. You get your score. You see who AI named instead of you.",
      },
      {
        q: "What's in the Get-Cited Kit ($29)?",
        aText:
          "You get your full audit report. Plus 3 ready-to-publish content drafts. Plus your top fixes, in order. One payment — it's yours to keep.",
        a: "You get your full audit report. Plus 3 ready-to-publish content drafts. Plus your top fixes, in order. One payment — it's yours to keep.",
      },
      {
        q: "What's included in Growth ($99/mo)?",
        aText:
          "Growth checks all 5 AIs every week. You get a monthly content plan. Plus a free Ozvor Pages site. You can track up to 10 competitors.",
        a: "Growth checks all 5 AIs every week. You get a monthly content plan. Plus a free Ozvor Pages site. You can track up to 10 competitors.",
      },
      {
        q: "What's included in Agency ($249/mo)?",
        aText:
          "Agency covers up to 25 client brands. Reports carry your brand, not ours. You get priority support, with a 4-hour response time.",
        a: "Agency covers up to 25 client brands. Reports carry your brand, not ours. You get priority support, with a 4-hour response time.",
      },
    ],
  },
  {
    title: "The products",
    items: [
      {
        q: "What is Ozvor Pages?",
        aText:
          "A 5-page website, built from your real business facts. It's schema-rich, so AI can read it. $99 once, or free with Growth.",
        a: "A 5-page website, built from your real business facts. It's schema-rich, so AI can read it. $99 once, or free with Growth.",
      },
      {
        q: "What is OrganicPosts?",
        aText:
          "OrganicPosts is our hands-on service. Our team researches, writes, and publishes for you. Book a call to see if it fits.",
        a: (
          <>
            OrganicPosts is our hands-on service. Our team researches, writes, and publishes for you.{" "}
            <Link href="/organicposts" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
              Book a call
            </Link>{" "}
            to see if it fits.
          </>
        ),
      },
    ],
  },
  {
    title: "SEO, privacy & your plan",
    items: [
      {
        q: "Does this replace my SEO?",
        aText: "No. Your SEO keeps working. This covers the new channel — AI answers.",
        a: "No. Your SEO keeps working. This covers the new channel — AI answers.",
      },
      {
        q: "Is my data private?",
        aText:
          "We only use your data to run your audits. Read the details in our Privacy Policy and our DPA.",
        a: (
          <>
            We only use your data to run your audits. Read the details in our{" "}
            <Link href="/privacy-policy" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
              Privacy Policy
            </Link>{" "}
            and our{" "}
            <Link href="/legal/dpa" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
              DPA
            </Link>
            .
          </>
        ),
      },
      {
        q: "Can I cancel anytime?",
        aText: "Yes. Cancel anytime, no lock-in. We don't guarantee citations. We track what moves, and tell you.",
        a: "Yes. Cancel anytime, no lock-in. We don't guarantee citations. We track what moves, and tell you.",
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ALL_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.aText },
  })),
};

const CSS = `
  .faq-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .faq-group-title { font-size: var(--font-size-h3); font-weight: 800; letter-spacing: -0.01em; margin: 0 0 var(--space-4); }
  .faq-item { border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); overflow: hidden; }
  .faq-item summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); cursor: pointer; padding: var(--space-4) var(--space-5); font-size: 1rem; font-weight: 600; color: var(--color-text); list-style: none; }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item[open] { border-color: var(--color-primary); }
  .faq-item-body { padding: 0 var(--space-5) var(--space-5); font-size: var(--font-size-body-sm); line-height: 1.6; color: var(--color-muted); }
`;

export default function FaqPage() {
  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{CSS}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <span className="faq-eyebrow">FAQ</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        Your questions, answered.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "620px",
          margin: "0 0 var(--space-12)",
        }}
      >
        Straight answers about the Score, the audit, pricing, and your data.
        No fine print you have to hunt for.
      </p>

      {GROUPS.map((group, groupIndex) => (
        <section key={group.title} aria-labelledby={`faq-group-${groupIndex}`} style={{ marginTop: groupIndex === 0 ? 0 : "var(--space-12)" }}>
          <h2 id={`faq-group-${groupIndex}`} className="faq-group-title">
            {group.title}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {group.items.map((item, i) => (
              <details key={item.q} open={groupIndex === 0 && i === 0} className="faq-item">
                <summary>
                  <span>{item.q}</span>
                  <span aria-hidden="true" style={{ flexShrink: 0, fontSize: "1.25rem", color: "var(--color-accent-ink)" }}>+</span>
                </summary>
                <div className="faq-item-body">{item.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          Still have a question?
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)", maxWidth: "480px", marginInline: "auto" }}>
          The fastest answer is your own number. Run the free test and see
          exactly where you stand.
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
          Check my brand — free →
        </Link>
      </section>
    </main>
  );
}
