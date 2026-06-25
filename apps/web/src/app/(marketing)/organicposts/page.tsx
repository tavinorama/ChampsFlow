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
import { BookCallButton } from "../../../components/BookCallButton";

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
    images: [
      {
        url: "https://trustindexai.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "OrganicPosts by TrustIndex AI — GEO content execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrganicPosts by TrustIndex AI — GEO content execution",
    description:
      "Turn your AI search gaps into organic content that gets found. The consultancy execution arm of TrustIndex AI.",
    images: ["https://trustindexai.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD — Service schema for the OrganicPosts GEO content execution service
// ---------------------------------------------------------------------------

const organicPostsServiceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "OrganicPosts by TrustIndex AI",
  description:
    "GEO content consulting and execution service. We create and publish the proof, pages, posts, and authority signals AI search systems need to understand, cite, and recommend your brand.",
  url: "https://organicposts.ai/",
  provider: {
    "@type": "Organization",
    name: "TrustIndex AI",
    url: "https://trustindexai.com",
  },
  serviceType: "GEO Content Execution",
  areaServed: ["US", "EU", "BR"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "OrganicPosts Service Offers",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "OrganicPosts GEO Sprint Starter",
          description: "One brand, top-3 GEO fixes executed. Fastest path from audit to published improvement.",
        },
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: "1500",
          priceCurrency: "USD",
          description: "from $1,500 one-time",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "OrganicPosts GEO Sprint Standard",
          description: "Full GEO plan executed with content — audit, roadmap, content assets published, 30-day re-measure.",
        },
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: "2400",
          priceCurrency: "USD",
          description: "from $2,400 one-time",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "OrganicPosts GEO Sprint Plus",
          description: "Multi-brand, aggressive execution with priority access. Up to 3 brands, full citation and schema hardening.",
        },
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: "4500",
          priceCurrency: "USD",
          description: "from $4,500 one-time",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "OrganicPosts Managed GEO",
          description:
            "Ongoing monthly GEO content execution for SMBs that want AI search visibility as a repeatable organic growth motion.",
        },
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: "1900",
          priceCurrency: "USD",
          description: "from $1,900 per month",
        },
      },
    ],
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trustindexai.com" },
      { "@type": "ListItem", position: 2, name: "OrganicPosts", item: "https://organicposts.ai/" },
    ],
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

// GEO Sprint tiers — done-for-you, founder-led (all CTAs → /book, not self-serve Stripe checkout).
const GEO_SPRINT_TIERS = [
  {
    name: "Sprint Starter",
    tag: "One brand · top-3 fixes",
    price: "from $1,500",
    priceNote: "one-time",
    popular: false,
    body: "The fastest path from audit to published fix. We take your TrustIndex results and execute your three highest-impact GEO improvements.",
    includes: [
      "Full GEO audit (5 AI engines, 50+ prompts)",
      "Top-3 citation gaps identified + prioritised",
      "3 publish-ready content assets (blog / LinkedIn / FAQ)",
      "Knowledge-graph entity check + quick fixes",
      "30-day re-measure at close",
    ],
  },
  {
    name: "Sprint Standard",
    tag: "Full GEO plan executed + content",
    price: "from $2,400",
    priceNote: "one-time",
    popular: true,
    body: "The complete sprint — audit, full GEO plan, content written and published across your owned channels. We do the work; you watch your TrustIndex Score climb.",
    includes: [
      "Full GEO audit (5 AI engines, 250+ prompts)",
      "Prioritised content roadmap (by prompt + competitor gap)",
      "4 priority content briefs",
      "4 publish-ready content assets",
      "8–12 organic post drafts",
      "Publishing calendar",
      "Post-sprint TrustIndex re-measure",
    ],
  },
  {
    name: "Sprint Plus",
    tag: "Multi-brand · aggressive · priority",
    price: "from $4,500",
    priceNote: "one-time",
    popular: false,
    body: "For agencies, funded startups, or businesses with multiple brands or competitive categories that need to move fast across the full AI-answer surface.",
    includes: [
      "Everything in Sprint Standard",
      "Up to 3 brands or product lines",
      "Competitor displacement analysis (full suite)",
      "Off-site authority & citation source audit",
      "Schema + crawler-access hardening",
      "Priority execution + dedicated founder contact",
      "60-day monitoring check-in",
    ],
  },
];

const MANAGED_GEO = {
  name: "OrganicPosts Managed GEO",
  tag: "Ongoing monthly retainer",
  price: "from $1,900",
  priceNote: "per month",
  body: "For SMBs that want AI search visibility to become a repeatable organic growth motion. We monitor, create, and publish every month.",
  includes: [
    "Monthly answer monitoring (5 AI engines)",
    "Competitor answer review",
    "4–8 content assets / month",
    "12–20 repurposed organic posts / month",
    "Source & citation recommendations",
    "Monthly TrustIndex visibility report",
  ],
};

// Legacy OFFERS kept for the in-app handoff comparison panel (DFY price note).
const OFFERS = [
  {
    name: "OrganicPosts GEO Sprint",
    tag: "30-day execution",
    price: "from $1,500",
    priceNote: "one-time",
    body: "A focused sprint for companies that need to act on their TrustIndex AI audit. Three tiers — from top-3 fixes to full multi-brand execution.",
    includes: [
      "Sprint Starter — from $1,500 (top-3 fixes)",
      "Sprint Standard — from $2,400 (full plan + content)",
      "Sprint Plus — from $4,500 (multi-brand, priority)",
      "All tiers: founder-led close, data-driven, real execution",
    ],
    featured: false,
  },
  {
    name: "OrganicPosts Managed GEO",
    tag: "Ongoing monthly",
    price: "from $1,900",
    priceNote: "per month",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organicPostsServiceJsonLd) }}
      />
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
          <p style={{ marginTop: "var(--space-5)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            TrustIndex AI finds the gaps. OrganicPosts helps publish the fix.
          </p>
          <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
            Prefer to talk it through first?{" "}
            <BookCallButton label="Book a 20-min call" variant="secondary" style={{ display: "inline-flex", minHeight: "36px", padding: "0 var(--space-4)", fontSize: "var(--font-size-caption)" }} />
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

      {/* In-app handoff — explains the DIY vs done-for-you path */}
      <section style={{ ...SECTION, backgroundColor: "var(--color-surface-muted)" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <h2 style={H2}>How the in-app handoff works</h2>
          <p style={{ fontSize: "var(--font-size-body)", lineHeight: 1.75, color: "var(--color-muted)", fontFamily: "var(--font-family)", marginBottom: "var(--space-6)" }}>
            After you run a TrustIndex Audit, your results page gives you two clear paths. You choose — no pressure.
          </p>

          {/* Three-step flow */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            {[
              {
                n: "1",
                title: "Run your free audit",
                body: "Go to /test, enter your brand name. TrustIndex AI probes ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview — then scores you across AI, Performance, and Brand trust.",
              },
              {
                n: "2",
                title: "Choose your path",
                body: "Your audit results page shows you the GEO plan and content drafts. Pick DIY (publish them yourself using the Growth plan tools) or done-for-you (hand it to OrganicPosts in one click).",
              },
              {
                n: "3",
                title: "We map, create, publish, monitor",
                body: "If you choose done-for-you, OrganicPosts takes your audit context — score, gaps, plan — and executes the full cycle: content, schema, off-site authority, and monthly re-audits.",
              },
            ].map((s) => (
              <div
                key={s.n}
                style={{
                  padding: "var(--space-5)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-primary)", lineHeight: 1, marginBottom: "var(--space-3)", letterSpacing: "-0.04em", fontFamily: "var(--font-family)" }}>{s.n}</div>
                <h3 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: "0 0 var(--space-2) 0" }}>{s.title}</h3>
                <p style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, color: "var(--color-muted)", fontFamily: "var(--font-family)", margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* DIY vs DFY comparison */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            <div style={{ padding: "var(--space-5)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface)" }}>
              <div style={{ fontWeight: 800, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", fontFamily: "var(--font-family)", marginBottom: "var(--space-2)" }}>
                Do it yourself — Growth plan
              </div>
              <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, fontFamily: "var(--font-family)", margin: "0 0 var(--space-3) 0" }}>
                Your audit generates a GEO plan and AI-drafted content. You review, approve, and publish
                it yourself. Best for teams with in-house content bandwidth.
              </p>
              <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-family)", margin: 0 }}>$99/mo</p>
            </div>
            <div style={{ padding: "var(--space-5)", border: "2px solid var(--color-accent-amber)", borderRadius: "var(--radius-md)", backgroundColor: "rgba(224,152,47,0.04)" }}>
              <div style={{ fontWeight: 800, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", fontFamily: "var(--font-family)", marginBottom: "var(--space-2)" }}>
                Done-for-you — OrganicPosts
              </div>
              <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, fontFamily: "var(--font-family)", margin: "0 0 var(--space-3) 0" }}>
                OrganicPosts takes your audit data and executes everything — content creation, publishing,
                off-site authority, schema, and monitoring. No content work on your end.
              </p>
              <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family)", margin: 0 }}>GEO Sprint from $1,500 one-time &nbsp;·&nbsp; Managed GEO from $1,900/mo</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <a href="/test" style={ctaPrimary}>Run your free TrustIndex Audit</a>
            <a href="#offers" style={ctaSecondary}>See done-for-you plans</a>
          </div>
          <p style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-family)", lineHeight: 1.6 }}>
            Once you have your audit, the in-app handoff is one click — your score and plan are pre-filled automatically.
          </p>
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

      {/* Offers — GEO Sprint tiers + Managed GEO */}
      <section id="offers" style={{ ...SECTION, backgroundColor: "var(--color-surface)" }}>
        {/* GEO Sprint heading + value framing */}
        <div style={{ maxWidth: "760px", margin: "0 auto var(--space-10)", textAlign: "center" }}>
          <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", fontFamily: "var(--font-family)" }}>
            Done-for-you · founder-led close
          </p>
          <h2 style={{ ...H2, textAlign: "center", marginBottom: "var(--space-4)" }}>
            OrganicPosts GEO Sprint
          </h2>
          <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, fontFamily: "var(--font-family)", margin: 0 }}>
            We publish the fixes. You watch your TrustIndex Score climb.
            All tiers are founder-led — you talk directly to the person doing the work.
            Every engagement begins with a TrustIndex AI audit so the plan is driven by data,
            not guesswork. CTAs below connect you to a free 20-min call, not an automated checkout.
          </p>
        </div>

        {/* Three Sprint tier cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-6)",
            maxWidth: "1060px",
            margin: "0 auto var(--space-12)",
            alignItems: "start",
          }}
        >
          {GEO_SPRINT_TIERS.map((tier) => (
            <article
              key={tier.name}
              aria-label={`${tier.name} — ${tier.price}`}
              className="mk-regular-card"
              style={{
                padding: "var(--space-8)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {tier.popular && (
                <div
                  aria-label="Most popular"
                  style={{
                    position: "absolute",
                    top: "-14px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "var(--color-primary)",
                    color: "#fff",
                    fontSize: "var(--font-size-caption)",
                    fontWeight: 700,
                    fontFamily: "var(--font-family)",
                    padding: "3px 16px",
                    borderRadius: "var(--radius-pill)",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                  }}
                >
                  Most popular
                </div>
              )}
              <p
                style={{
                  margin: "0 0 var(--space-2) 0",
                  fontSize: "var(--font-size-caption)",
                  fontWeight: 700,
                  color: "var(--color-primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  fontFamily: "var(--font-family)",
                }}
              >
                {tier.tag}
              </p>
              <h3
                style={{
                  fontSize: "var(--font-size-h2)",
                  fontWeight: 800,
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  margin: "0 0 var(--space-2) 0",
                  letterSpacing: "-0.02em",
                }}
              >
                {tier.name}
              </h3>
              <p
                style={{
                  margin: "0 0 var(--space-3) 0",
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--space-2)",
                  fontFamily: "var(--font-family)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--font-size-h3)",
                    fontWeight: 800,
                    color: "var(--color-text)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {tier.price}
                </span>
                <span
                  style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}
                >
                  {tier.priceNote}
                </span>
              </p>
              <p
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  lineHeight: 1.6,
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-family)",
                  margin: "0 0 var(--space-5) 0",
                }}
              >
                {tier.body}
              </p>
              <ul
                aria-label={`${tier.name} includes`}
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 var(--space-6) 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                  flexGrow: 1,
                }}
              >
                {tier.includes.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-text)",
                      fontFamily: "var(--font-family)",
                      lineHeight: 1.5,
                    }}
                  >
                    <span aria-hidden="true" style={{ color: "var(--color-success)", fontWeight: 700, flexShrink: 0 }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/book"
                style={{
                  ...ctaPrimary,
                  width: "100%",
                  boxSizing: "border-box",
                  textAlign: "center",
                }}
              >
                Book a free call &rarr;
              </a>
            </article>
          ))}
        </div>

        {/* Managed GEO retainer */}
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <div
            className="mk-featured-card"
            style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column" }}
          >
            <p
              style={{
                margin: "0 0 var(--space-2) 0",
                fontSize: "var(--font-size-caption)",
                fontWeight: 700,
                color: "#60a5fa",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                fontFamily: "var(--font-family)",
              }}
            >
              {MANAGED_GEO.tag}
            </p>
            <h3
              style={{
                fontSize: "var(--font-size-h2)",
                fontWeight: 800,
                color: "#f1f5f9",
                fontFamily: "var(--font-family)",
                margin: "0 0 var(--space-2) 0",
                letterSpacing: "-0.02em",
              }}
            >
              {MANAGED_GEO.name}
            </h3>
            <p
              style={{
                margin: "0 0 var(--space-3) 0",
                display: "flex",
                alignItems: "baseline",
                gap: "var(--space-2)",
                fontFamily: "var(--font-family)",
              }}
            >
              <span
                style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}
              >
                {MANAGED_GEO.price}
              </span>
              <span style={{ fontSize: "var(--font-size-caption)", color: "#94a3b8" }}>
                {MANAGED_GEO.priceNote}
              </span>
            </p>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                lineHeight: 1.6,
                color: "#94a3b8",
                fontFamily: "var(--font-family)",
                margin: "0 0 var(--space-5) 0",
              }}
            >
              {MANAGED_GEO.body}
            </p>
            <ul
              aria-label="Managed GEO includes"
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 var(--space-6) 0",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                flexGrow: 1,
              }}
            >
              {MANAGED_GEO.includes.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    fontSize: "var(--font-size-body-sm)",
                    color: "#e2e8f0",
                    fontFamily: "var(--font-family)",
                    lineHeight: 1.5,
                  }}
                >
                  <span aria-hidden="true" style={{ color: "#34d399", fontWeight: 700, flexShrink: 0 }}>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="/book"
              style={{
                ...ctaPrimary,
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
              }}
            >
              Book a free call &rarr;
            </a>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: "var(--space-8)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", fontFamily: "var(--font-family)" }}>
          Not sure which tier fits? The 20-min call is free — we&rsquo;ll scope it together.
          All prices are &ldquo;from&rdquo; — final scope depends on brand complexity and audit findings.
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
