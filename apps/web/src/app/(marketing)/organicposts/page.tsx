/**
 * /organicposts — OrganicPosts by TrustIndex AI (consultancy service page)
 *
 * Per the brand architecture: OrganicPosts is the GEO content execution arm of
 * TrustIndex AI — NOT a separate product, NOT generic social media management.
 * Relationship: "TrustIndex AI finds the gaps. OrganicPosts helps publish the fix."
 *
 * Copy sourced from the brand package (organicposts-landing-page-copy.md).
 * Uses the same marketing layout, tokens, and dark-mode system as the platform site.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OrganicPosts by TrustIndex AI — Publish the proof AI needs to trust you",
  description:
    "OrganicPosts is the GEO content consulting and execution arm of TrustIndex AI. We create and publish the proof, pages, and posts AI search systems need to understand, cite, and recommend your brand.",
  alternates: { canonical: "https://organicposts.ai/" },
  openGraph: {
    title: "OrganicPosts by TrustIndex AI — GEO content execution",
    description:
      "Turn your AI search gaps into organic content that gets found. The consultancy execution arm of TrustIndex AI.",
    url: "https://organicposts.ai/",
    siteName: "OrganicPosts by TrustIndex AI",
    type: "website",
  },
};

const CREATES = {
  website: [
    "Comparison pages",
    "Alternative pages",
    "Service & category pages",
    "FAQ pages",
    "Expert explainers",
    "Case studies",
    "Proof pages",
    "Glossary pages",
  ],
  distribution: [
    "LinkedIn posts",
    "Google Business Profile posts",
    "Newsletter blurbs",
    "Founder / expert posts",
    "Content repurposing snippets",
    "Citation-ready answer blocks",
  ],
};

const STEPS = [
  { n: "1", title: "Audit", body: "We use TrustIndex AI to see how your company appears in AI search and which competitors are recommended instead." },
  { n: "2", title: "Map", body: "We convert visibility gaps into a prioritized content plan by prompt, buyer intent, competitor, and missing proof." },
  { n: "3", title: "Create", body: "We produce organic content assets designed to make your company easier to understand, verify, cite, and recommend." },
  { n: "4", title: "Publish", body: "We organize website, LinkedIn, Google Business Profile, newsletter, and owned-channel publishing workflows." },
  { n: "5", title: "Monitor", body: "We track changes in AI answers, citations, mentions, and competitor displacement using TrustIndex AI." },
];

const OFFERS = [
  {
    name: "OrganicPosts GEO Sprint",
    tag: "30-day execution",
    body: "A focused sprint for companies that need to act on their TrustIndex AI audit.",
    includes: [
      "GEO content roadmap",
      "4 priority content briefs",
      "4 publish-ready content assets",
      "8–12 organic post drafts",
      "Publishing calendar",
      "Post-sprint TrustIndex check",
    ],
    featured: false,
  },
  {
    name: "OrganicPosts Managed GEO",
    tag: "Ongoing monthly",
    body: "For SMBs that want AI search visibility to become a repeatable organic growth motion.",
    includes: [
      "Monthly answer monitoring",
      "Competitor answer review",
      "4–8 content assets / month",
      "12–20 repurposed organic posts / month",
      "Source & citation recommendations",
      "Monthly visibility report",
    ],
    featured: true,
  },
];

const SECTION = { maxWidth: "1000px", margin: "0 auto", padding: "var(--space-20) var(--space-4)" } as const;
const H2 = {
  fontSize: "clamp(1.875rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em",
  color: "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.1, marginBottom: "var(--space-4)",
} as const;

export default function OrganicPostsPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-hero-bg" style={{ padding: "var(--space-24) var(--space-4) var(--space-20)" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
          <div className="mk-badge" style={{ marginBottom: "var(--space-6)", display: "inline-flex" }}>
            OrganicPosts by TrustIndex&nbsp;AI · GEO content execution
          </div>
          <h1 style={{
            fontSize: "clamp(2.5rem, 5.5vw, 4rem)", fontWeight: 800, lineHeight: 1.08,
            letterSpacing: "-0.035em", color: "var(--color-text)", fontFamily: "var(--font-family)",
            margin: "0 0 var(--space-5) 0", textWrap: "balance",
          }}>
            Turn your AI search gaps into{" "}
            <span style={{ color: "var(--color-primary)" }}>organic content that gets found.</span>
          </h1>
          <p style={{
            fontSize: "clamp(1rem, 1.5vw, 1.125rem)", lineHeight: 1.75, color: "var(--color-muted)",
            fontFamily: "var(--font-family)", maxWidth: "56ch", margin: "0 auto var(--space-8)",
          }}>
            OrganicPosts is the GEO content consulting and execution arm of TrustIndex AI. We create and
            publish the proof, pages, posts, and authority signals AI search systems need to understand,
            cite, and recommend your brand.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#offers" style={ctaPrimary}>Build my GEO content plan</a>
            <a href="/" style={ctaSecondary}>Run my TrustIndex Audit</a>
          </div>
          <p style={{ marginTop: "var(--space-6)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            TrustIndex AI finds the gaps. OrganicPosts helps publish the fix.
          </p>
        </div>
      </section>

      {/* Problem → bridge */}
      <section style={{ ...SECTION, backgroundColor: "var(--color-surface-muted)" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <h2 style={H2}>Random content won&rsquo;t fix invisible trust gaps.</h2>
          <p style={{ fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-muted)", fontFamily: "var(--font-family)", marginBottom: "var(--space-5)" }}>
            Most companies publish blogs, social posts, and updates without knowing what AI search actually
            needs to see. The result: competitors appear in ChatGPT, Perplexity, Gemini, and Google AI
            answers while your brand stays missing, outdated, or uncited.
          </p>
          <div className="mk-callout">
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-badge-ai-text)", fontFamily: "var(--font-family)", lineHeight: 1.65, fontWeight: 500 }}>
              Built from AI search data, not content guesswork. OrganicPosts starts with buyer prompts, AI
              answer behavior, competitor citations, and missing trust signals — not keywords alone.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ ...SECTION, backgroundColor: "var(--color-surface)" }}>
        <h2 style={{ ...H2, textAlign: "center" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-8)" }}>
          {STEPS.map((s) => (
            <div key={s.n} className="mk-step-card" style={{ padding: "var(--space-6)" }}>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-primary)", lineHeight: 1, marginBottom: "var(--space-3)", letterSpacing: "-0.04em" }}>{s.n}</div>
              <h3 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-2) 0" }}>{s.title}</h3>
              <p style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, color: "var(--color-muted)", fontFamily: "var(--font-family)", margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we create */}
      <section style={{ ...SECTION, backgroundColor: "var(--color-surface-muted)" }}>
        <h2 style={{ ...H2, textAlign: "center" }}>What we create</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-6)", marginTop: "var(--space-8)" }}>
          <CreateCard title="Website content" items={CREATES.website} />
          <CreateCard title="Organic distribution" items={CREATES.distribution} />
        </div>
      </section>

      {/* Offers */}
      <section id="offers" style={{ ...SECTION, backgroundColor: "var(--color-surface)" }}>
        <h2 style={{ ...H2, textAlign: "center" }}>Two ways to work with us</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-6)", maxWidth: "820px", margin: "var(--space-8) auto 0" }}>
          {OFFERS.map((o) => (
            <div key={o.name} className={o.featured ? "mk-featured-card" : "mk-regular-card"} style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column" }}>
              <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 700, color: o.featured ? "#60a5fa" : "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-family)" }}>{o.tag}</p>
              <h3 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, color: o.featured ? "#f1f5f9" : "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-2) 0", letterSpacing: "-0.02em" }}>{o.name}</h3>
              <p style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, color: o.featured ? "#94a3b8" : "var(--color-muted)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-5) 0" }}>{o.body}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", display: "flex", flexDirection: "column", gap: "var(--space-2)", flexGrow: 1 }}>
                {o.includes.map((i) => (
                  <li key={i} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: o.featured ? "#e2e8f0" : "var(--color-text)", fontFamily: "var(--font-family)", lineHeight: 1.5 }}>
                    <span aria-hidden="true" style={{ color: o.featured ? "#34d399" : "var(--color-success)", fontWeight: 700, flexShrink: 0 }}>✓</span>{i}
                  </li>
                ))}
              </ul>
              <a href="/#waitlist-cta" style={o.featured ? { ...ctaPrimary, width: "100%", boxSizing: "border-box", textAlign: "center" } : { ...ctaSecondary, width: "100%", boxSizing: "border-box", textAlign: "center" }}>
                Build my GEO content plan
              </a>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: "var(--space-8)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          Every engagement starts with a TrustIndex AI audit so the work is driven by data, not guesswork.
        </p>
      </section>
    </>
  );
}

function CreateCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mk-privacy-card" style={{ padding: "var(--space-6)" }}>
      <h3 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-4) 0" }}>{title}</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        {items.map((i) => (
          <li key={i} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.4 }}>
            <span aria-hidden="true" style={{ color: "var(--color-primary)", flexShrink: 0 }}>·</span>{i}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ctaPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "var(--space-4) var(--space-6)", minHeight: "var(--min-button-height)",
  backgroundColor: "var(--color-primary)", color: "#fff", border: "none",
  borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body-sm)", fontWeight: 700,
  fontFamily: "var(--font-family)", textDecoration: "none", letterSpacing: "-0.01em",
};

const ctaSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "var(--space-4) var(--space-6)", minHeight: "var(--min-button-height)",
  backgroundColor: "transparent", color: "var(--color-primary)",
  border: "2px solid var(--color-primary)", borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-body-sm)", fontWeight: 700, fontFamily: "var(--font-family)",
  textDecoration: "none", letterSpacing: "-0.01em",
};
