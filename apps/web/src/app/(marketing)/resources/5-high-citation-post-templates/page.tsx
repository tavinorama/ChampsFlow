/**
 * /resources/5-high-citation-post-templates — Download landing for the template pack.
 *
 * Summarises all 5 templates: name, Princeton trait + lift, one strong
 * before/after teaser. Prominent PDF download CTA.
 *
 * JSON-LD: TechArticle + BreadcrumbList.
 * Server component — no client interactivity needed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SoftCTA } from "../../../../components/marketing/SoftCTA";

export const metadata: Metadata = {
  title:
    "5 High-Citation LinkedIn Post Templates — Backed by Princeton GEO Research | Ozvor",
  description:
    "Fill-in-the-blank LinkedIn post templates derived from the peer-reviewed Princeton GEO study (KDD 2024). Each maps to a proven citation tactic: +41% quotations, +33% statistics, +28% cited sources. Included with every Ozvor Growth and Agency plan.",
  alternates: {
    canonical:
      "https://ozvor.com/resources/5-high-citation-post-templates",
  },
  openGraph: {
    title:
      "5 High-Citation Post Templates (Princeton GEO Research) | Ozvor",
    description:
      "Each template maps to a proven Princeton GEO tactic. Before/after examples in real SMB verticals. Included with every Ozvor Growth and Agency plan.",
    url: "https://ozvor.com/resources/5-high-citation-post-templates",
    siteName: "Ozvor",
    type: "article",
  },
};

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    number: "Template 1",
    name: "The Data Story",
    principle: "Statistics addition",
    lift: "+33% AI visibility",
    research: "Aggarwal et al., KDD 2024",
    when: "When you have a real number from your own work, a clear observation you can quantify, or a credible published statistic you can interpret for your niche.",
    before: {
      label: "BEFORE (weak — will not get cited)",
      text: "A lot of restaurants overpay on taxes because they don't track expenses properly. Good bookkeeping saves you money! DM me if you want help getting organized this year. #bookkeeping #smallbusiness",
    },
    after: {
      label: "AFTER — independent bookkeeper, restaurant niche",
      text: "About 7 in 10 of the independent restaurants that come to me are leaving the FICA tip credit on the table — a federal credit on the employer payroll taxes you already pay on staff tip income. For a 15-seat spot with a few tipped servers, that can be a four-figure recovery — and you can often amend prior returns. In our practice, this single item recovers an average of $1,800–$4,000 per restaurant in the first year we take them on.",
    },
    whyItWorks:
      "A specific statistic (\"7 in 10\"), a named mechanism (Form 8846, FICA tip credit), and a quantified result ($1,800–$4,000). The BEFORE has zero retrievable substance.",
  },
  {
    number: "Template 2",
    name: "The Contrarian / Expert Take",
    principle: "Quotation addition",
    lift: "+41% AI visibility (strongest single tactic)",
    research: "Aggarwal et al., KDD 2024",
    when: "When conventional wisdom in your field is wrong — or wrong for your specific audience. You need a genuine, experience-backed opinion.",
    before: {
      label: "BEFORE (weak)",
      text: "Consistency is key on social media! If you want to grow, you need to show up every single day. The algorithm rewards people who post daily. No excuses — get posting! 💪",
    },
    after: {
      label: "AFTER — freelance social-media manager for service businesses",
      text: "The standard advice for small-business social media is 'post every day.' For a solo plumber, dentist, or accountant, that's the wrong target. A Semrush study of 89,000 LinkedIn URLs cited across ChatGPT, Google AI Mode, and Perplexity (Jan–Feb 2026) found the median cited post had just 15–25 reactions. Frequency wasn't the driver. Specificity was. What actually works: two well-researched posts a week, each answering one real question a prospective customer would ask.",
    },
    whyItWorks:
      "A clear, specific position (\"two posts a week, not daily\") backed by an attributed statistic (the +41% quotation/citation lever in action), plus an honest exception that signals trustworthiness.",
  },
  {
    number: "Template 3",
    name: "The How-We-Did-It Case",
    principle: "Cite authoritative sources / specificity",
    lift: "+28% average, up to +115% for an underdog page",
    research: "Aggarwal et al., KDD 2024",
    when: "When you have a recent client win you can describe concretely — even anonymised. You need real steps and a real (or honestly ranged) outcome.",
    before: {
      label: "BEFORE (weak)",
      text: "Another happy customer! 😊 We replaced a full system for a family this week and they couldn't be happier. We always go above and beyond for our clients. Call us for all your heating and cooling needs! ❄️🔥",
    },
    after: {
      label: "AFTER — HVAC contractor, Austin",
      text: "A 1990s two-story home in Austin: $540 summer electric bills and an upstairs that never dropped below 80°F. We ran a Manual J load calculation instead of 'matching the old unit' — the original 4-ton system was oversized, causing short-cycling. Found and sealed 31% duct leakage in the attic runs. Installed a correctly-sized 3-ton variable-speed system. Result: the upstairs now holds 72°F, first full summer bill came in at $310 — a 43% drop, verified against prior-year utility statements. The one thing that mattered most: the duct-leakage test, not the new equipment.",
    },
    whyItWorks:
      "Named diagnostics (Manual J, blower-door), concrete numbers (\"31% leakage,\" \"$540 → $310,\" \"43% drop\"), and an opinionated takeaway (\"it's the ducts, not the unit\"). A specific case like this is how a small local shop out-cites a national franchise.",
  },
  {
    number: "Template 4",
    name: "The Mistake Confession",
    principle: "Quotation addition + single-idea focus",
    lift: "+41% AI visibility",
    research: "Aggarwal et al., KDD 2024",
    when: "When you've made — or repeatedly watched clients make — a specific, costly mistake you can name precisely. One of the most-cited content types.",
    before: {
      label: "BEFORE (weak)",
      text: "Lesson learned over the years: communication is everything! Early in my career I didn't communicate enough with clients and it caused problems. Now I always keep my clients in the loop. Trust the process! ✨",
    },
    after: {
      label: "AFTER — residential interior designer",
      text: "The biggest mistake I made with my first interior-design clients: I let them approve a design without a fixed, itemised budget attached to it. They'd fall in love with a concept, and the real total would land 40–60% over what they'd vaguely imagined. Two projects nearly collapsed at the invoice stage. What I should have done: present every concept with a line-item budget and get sign-off on the number, not just the mood board. The sign you're making it right now: your clients regularly react to the final invoice, not the proposal.",
    },
    whyItWorks:
      "One sharp, single-idea insight (\"approve the budget, not just the mood board\"), a concrete consequence (\"40–60% over\"), and a checkable diagnostic signal (\"clients react to the invoice, not the proposal\").",
  },
  {
    number: "Template 5",
    name: "The Definition Frame",
    principle: "Cite authoritative sources + authority positioning",
    lift: "+28% average AI visibility",
    research: "Aggarwal et al., KDD 2024",
    when: "When there's a term in your field that's used loosely, misunderstood, or oversold — and you have a precise, practical definition that helps your audience do something.",
    before: {
      label: "BEFORE (weak)",
      text: "Did you know we offer 'medical-grade' skincare? 🌿 Our products are so much better than what you find at the drugstore. Book a consultation today and glow up this season! 💆‍♀️",
    },
    after: {
      label: "AFTER — independent med-spa / aesthetics clinic",
      text: "'Medical-grade skincare' gets used everywhere — and it means something different at almost every clinic using it. The precise, useful definition: medical-grade (more accurately, physician-dispensed or cosmeceutical) skincare means products formulated at active-ingredient concentrations high enough to require sale through a licensed provider — NOT an FDA-awarded grade. There is no government 'medical grade' stamp. The meaningful difference is the dose of the active (e.g. a 0.5–1% retinol vs a drugstore 0.025%). Ask one question: 'What is the concentration of the active ingredient, and why is that the right dose for my skin?' A real clinic answers specifically. A reseller can't.",
    },
    whyItWorks:
      "A precise, useful definition, a corrected misconception (\"there's no FDA medical grade\"), and a concrete decision tool (\"ask the concentration\"). When someone asks \"what does medical-grade skincare actually mean?\", this is the clearest direct answer in the category.",
  },
];

const PRINCETON_RESULTS = [
  {
    tactic: "Add quotations from credible sources",
    lift: "+41%",
    template: "Template 2, Template 4",
  },
  {
    tactic: "Add statistics (concrete data points)",
    lift: "+33%",
    template: "Template 1",
  },
  {
    tactic: "Cite authoritative sources inline",
    lift: "+28% avg / up to +115%",
    template: "Template 3, Template 5",
  },
  {
    tactic: "Combine fluency + statistics",
    lift: ">+5.5% over best single tactic",
    template: "All five (use in rotation)",
  },
  {
    tactic: "Keyword stuffing",
    lift: "−8.7% (backfires)",
    template: "None — this is what NOT to do",
  },
];

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const TEMPLATES_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id":
        "https://ozvor.com/resources/5-high-citation-post-templates",
      headline:
        "5 High-Citation LinkedIn Post Templates — Backed by Princeton GEO Research",
      description:
        "Fill-in-the-blank LinkedIn post templates engineered to get your business cited by ChatGPT, Claude, Perplexity, Gemini and Google AI Overview. Each template maps to a finding from the peer-reviewed Princeton GEO study (KDD 2024).",
      author: { "@type": "Organization", name: "Ozvor" },
      publisher: {
        "@type": "Organization",
        name: "Ozvor",
        url: "https://ozvor.com",
      },
      datePublished: "2026-06-01",
      dateModified: "2026-06-24",
      inLanguage: "en",
      url: "https://ozvor.com/resources/5-high-citation-post-templates",
      about: { "@type": "Thing", name: "Generative Engine Optimization" },
      citation: [
        {
          "@type": "ScholarlyArticle",
          name: "GEO: Generative Engine Optimization",
          author: "Aggarwal et al.",
          url: "https://arxiv.org/abs/2311.09735",
          datePublished: "2024",
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://ozvor.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Resources",
          item: "https://ozvor.com/resources",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "5 High-Citation Post Templates",
          item: "https://ozvor.com/resources/5-high-citation-post-templates",
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PostTemplatesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: TEMPLATES_LD }}
      />

      <article
        aria-labelledby="templates-heading"
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4) var(--space-20)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        {/* Hero */}
        <header style={{ marginBottom: "var(--space-10)" }}>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-primary)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "var(--space-3)",
            }}
          >
            Premium Growth-plan resource &middot; 5 fill-in-the-blank templates
          </p>

          <h1
            id="templates-heading"
            style={{
              fontSize: "clamp(1.9rem, 4.5vw, 2.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            5 High-Citation Post Templates
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
              color: "var(--color-muted)",
              lineHeight: 1.5,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Fill-in-the-blank LinkedIn structures engineered to get your business
            named by ChatGPT, Claude, Perplexity, Gemini &amp; Google AI
            Overview — backed by Princeton GEO research (KDD 2024)
          </p>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              marginBottom: "var(--space-6)",
            }}
          >
            by Ozvor &middot; 2026 &middot; 14 pages &middot; Included
            with Growth plan
          </p>

          {/* Primary CTA */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <Link
              href="/pricing"
              aria-label="Get the 5 High-Citation Post Templates with a Growth or Agency plan"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "52px",
                padding: "0 var(--space-7)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                fontSize: "var(--font-size-body)",
                textDecoration: "none",
                fontFamily: "var(--font-family)",
              }}
            >
              Get the full template pack with Growth →
            </Link>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
            }}
          >
            Included with every Growth ($99/mo) and Agency plan — yours to
            download the moment you subscribe.
          </p>
        </header>

        {/* Why these work — the science */}
        <section
          aria-labelledby="science-heading"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            id="science-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            These templates are science, not vibes
          </h2>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            Every template in this pack maps to a finding from the single most
            defensible piece of research in this field: the peer-reviewed{" "}
            <strong>
              &ldquo;GEO: Generative Engine Optimization&rdquo; paper from
              Princeton, Georgia Tech, the Allen Institute for AI, and IIT Delhi
            </strong>
            , presented at ACM SIGKDD (KDD) 2024 (Aggarwal et al.,
            arXiv:2311.09735).
          </p>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-4)",
            }}
          >
            The researchers tested nine content tactics across{" "}
            <strong>10,000 real queries</strong> and measured each one&rsquo;s
            effect on visibility inside AI-generated answers. The headline result:
            the right tactics lift a page&rsquo;s visibility in AI answers by{" "}
            <strong>up to 40%</strong>. The specific lifts:
          </p>

          {/* Princeton results table */}
          <div
            style={{ overflowX: "auto", marginBottom: "var(--space-5)" }}
            role="region"
            aria-label="Princeton GEO study results"
            tabIndex={0}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "var(--font-size-body-sm)",
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--color-teal-surface)",
                    borderBottom: "2px solid var(--color-teal-border)",
                  }}
                >
                  {["Tactic", "Visibility lift", "Template"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "left",
                        fontWeight: 700,
                        color: "var(--color-text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRINCETON_RESULTS.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor:
                        i % 2 === 0
                          ? "var(--color-surface)"
                          : "var(--color-surface-muted)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        color: "var(--color-text)",
                        verticalAlign: "top",
                        lineHeight: 1.5,
                      }}
                    >
                      {row.tactic}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        color:
                          row.lift.startsWith("−")
                            ? "var(--color-error)"
                            : "var(--color-primary)",
                        fontWeight: 700,
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.lift}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        color: "var(--color-muted)",
                        verticalAlign: "top",
                        lineHeight: 1.5,
                      }}
                    >
                      {row.template}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <blockquote
            style={{
              margin: "0 0 var(--space-4) 0",
              padding: "var(--space-4)",
              borderLeft: "4px solid var(--color-primary)",
              backgroundColor: "var(--color-surface-muted)",
              borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontStyle: "italic",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Read that last row twice. Keyword stuffing — the spammy SEO reflex
              — is the <strong>only</strong> tactic that made content{" "}
              <strong>less</strong> visible to AI. GEO rewards genuine substance:
              data, quotes, sources, clarity.
            </p>
          </blockquote>

          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            LinkedIn specifically is worth calling out:{" "}
            <strong>
              it is roughly the #2 most-cited domain in AI search, appearing in
              about 11% of AI answers
            </strong>{" "}
            (Semrush, 325,000 prompts, Jan–Feb 2026). And you do not need a big
            following — the{" "}
            <strong>
              median cited LinkedIn post had just 15–25 reactions and one or zero
              comments
            </strong>
            , with about 95% of cited posts being original content (Semrush,
            2026). You are not competing on virality. You are competing on
            usefulness and credibility — a game a small business can actually win.
          </p>
        </section>

        {/* The 5 templates */}
        <section
          aria-label="All 5 templates"
          style={{ marginBottom: "var(--space-10)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-6) 0",
              letterSpacing: "-0.01em",
            }}
          >
            The 5 templates — summary
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-6)",
            }}
          >
            {TEMPLATES.map((tmpl, i) => (
              <section
                key={i}
                aria-labelledby={`tmpl-${i}-heading`}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                }}
              >
                {/* Template header */}
                <div
                  style={{
                    padding: "var(--space-4) var(--space-5)",
                    backgroundColor: "var(--color-teal-surface)",
                    borderBottom: "1px solid var(--color-teal-border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      gap: "var(--space-2)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--font-size-caption)",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--color-primary)",
                      }}
                    >
                      {tmpl.number}
                    </span>
                    <h3
                      id={`tmpl-${i}-heading`}
                      style={{
                        fontSize: "var(--font-size-body)",
                        fontWeight: 800,
                        color: "var(--color-text)",
                        margin: 0,
                      }}
                    >
                      {tmpl.name}
                    </h3>
                  </div>
                  <p
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-primary)",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    Princeton trait: {tmpl.principle} &rarr;{" "}
                    <strong>{tmpl.lift}</strong>
                  </p>
                </div>

                {/* Template body */}
                <div style={{ padding: "var(--space-5)" }}>
                  <p
                    style={{
                      fontSize: "var(--font-size-caption)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      margin: "0 0 var(--space-1) 0",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    When to use it
                  </p>
                  <p
                    style={{
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-muted)",
                      lineHeight: 1.6,
                      margin: "0 0 var(--space-4) 0",
                    }}
                  >
                    {tmpl.when}
                  </p>

                  {/* Before / after */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "var(--space-3)",
                      marginBottom: "var(--space-4)",
                    }}
                  >
                    {/* Before */}
                    <div
                      style={{
                        padding: "var(--space-4)",
                        backgroundColor: "var(--color-surface-muted)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "var(--font-size-caption)",
                          fontWeight: 700,
                          color: "var(--color-muted)",
                          margin: "0 0 var(--space-2) 0",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {tmpl.before.label}
                      </p>
                      <p
                        style={{
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-muted)",
                          lineHeight: 1.6,
                          margin: 0,
                          fontStyle: "italic",
                        }}
                      >
                        &ldquo;{tmpl.before.text}&rdquo;
                      </p>
                    </div>

                    {/* After */}
                    <div
                      style={{
                        padding: "var(--space-4)",
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-teal-border)",
                        borderLeft: "4px solid var(--color-success)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "var(--font-size-caption)",
                          fontWeight: 700,
                          color: "var(--color-success)",
                          margin: "0 0 var(--space-2) 0",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {tmpl.after.label}
                      </p>
                      <p
                        style={{
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-text)",
                          lineHeight: 1.65,
                          margin: 0,
                        }}
                      >
                        {tmpl.after.text}
                      </p>
                    </div>
                  </div>

                  {/* Why AI cites the AFTER */}
                  <div
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      backgroundColor: "var(--color-surface-muted)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "var(--font-size-caption)",
                        fontWeight: 700,
                        color: "var(--color-text)",
                        margin: "0 0 var(--space-1) 0",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Why AI cites the AFTER version
                    </p>
                    <p
                      style={{
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-muted)",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {tmpl.whyItWorks}
                    </p>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </section>

        {/* Cadence note */}
        <section
          aria-label="Cadence and cross-posting guidance"
          style={{ marginBottom: "var(--space-8)" }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-4) 0",
              letterSpacing: "-0.01em",
            }}
          >
            The part most people skip: cadence
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            A single brilliant post is a lottery ticket. Citation is won by{" "}
            <strong>showing up consistently with substance</strong>. AI engines
            strongly favor fresh content — AI-cited URLs are about{" "}
            <strong>25.7% fresher</strong> than the top-10 organic results, with
            ChatGPT citing pages hundreds of days newer than the standard search
            listing (Ahrefs, ~17M citations, Dec 2025).
          </p>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            The Princeton paper found that{" "}
            <strong>combining tactics compounds</strong> — fluency optimization plus
            statistics beat the best single tactic by more than 5.5% (Aggarwal et
            al., KDD 2024). Rotating through the five templates means your feed
            accumulates statistics <em>and</em> quotations <em>and</em> cited
            sources over time. You are not betting on one lever; you are stacking
            them.
          </p>
          <blockquote
            style={{
              margin: 0,
              padding: "var(--space-4)",
              borderLeft: "4px solid var(--color-primary)",
              backgroundColor: "var(--color-surface-muted)",
              borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontStyle: "italic",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              A realistic, sustainable cadence: two posts a week, alternating
              templates. Open with a Data Story Monday and a How-We-Did-It Case or
              Mistake Confession Thursday. Over four weeks that&rsquo;s eight posts
              across four different citation-driving formats — keeping your feed
              fresh without sacrificing the specificity that actually earns
              citations.
            </p>
          </blockquote>
        </section>

        {/* Mid-content download repeat */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "var(--space-8)",
            padding: "var(--space-6)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 700,
              color: "var(--color-text)",
              margin: "0 0 var(--space-2) 0",
            }}
          >
            Each template in the full PDF includes:
          </p>
          <ul
            style={{
              textAlign: "left",
              display: "inline-block",
              margin: "0 0 var(--space-5) 0",
              paddingLeft: "var(--space-5)",
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
            }}
          >
            <li>The exact fill-in-the-blank skeleton with [bracketed slots]</li>
            <li>A full worked BEFORE &rarr; AFTER in a concrete SMB vertical</li>
            <li>A &ldquo;why AI cites the AFTER version&rdquo; explanation</li>
            <li>A 3-item pre-publish checklist</li>
          </ul>
          <br />
          <Link
            href="/pricing"
            aria-label="Get the full 5 High-Citation Post Templates pack with a Growth or Agency plan"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "52px",
              padding: "0 var(--space-7)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontWeight: 800,
              fontSize: "var(--font-size-body)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            Get the full template pack with Growth or Agency →
          </Link>
        </div>

        {/* Soft CTA nudge — free test */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <SoftCTA
            headline="See if these templates are already working for your brand"
            subline="The free AI Visibility Test checks whether ChatGPT, Claude, and Perplexity mention you today."
            primary={{ label: "Run the free test", href: "/test" }}
            secondary={{ label: "$29 Get-Cited Kit — get 3 ready-to-publish drafts →", href: "/kit" }}
          />
        </div>

        {/* Plans CTA */}
        <section
          style={{
            padding: "var(--space-6)",
            border: "2px solid var(--color-primary)",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "var(--color-surface)",
            marginBottom: "var(--space-6)",
          }}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              margin: "0 0 var(--space-3) 0",
            }}
          >
            These templates are the <em>doing</em> half. Ozvor is the{" "}
            <em>measuring</em> half.
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Publishing the right content is step one. Knowing whether it&rsquo;s
            working — which queries you&rsquo;re cited for, what position, by which
            engine, versus which competitors — is step two. Ozvor audits
            how your brand appears across all five AI surfaces, computes your{" "}
            <strong>Ozvor AI Visibility Score</strong> (Brand 30% / Performance 35% / AI
            35%), benchmarks you against up to 10 competitors, and builds a
            prioritised GEO content plan.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
            }}
          >
            <Link
              href="/#pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontWeight: 800,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
              }}
            >
              Start free — no credit card →
            </Link>
            <Link
              href="/#pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 var(--space-5)",
                backgroundColor: "transparent",
                color: "var(--color-primary)",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
              }}
            >
              See Growth &amp; Agency plans
            </Link>
          </div>
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              margin: "var(--space-3) 0 0 0",
            }}
          >
            Founder pricing: 30% off, annual plans, first 100 customers only.
          </p>
        </section>

        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
          }}
        >
          A premium resource from Ozvor — ozvor.com ·
          hello@ozvor.com
          <br />
          Research anchor: Aggarwal et al., &ldquo;GEO: Generative Engine
          Optimization,&rdquo; ACM SIGKDD (KDD) 2024, arXiv:2311.09735. All
          statistics carry their source and date inline; figures are current as
          of mid-2026.
        </p>
      </article>
    </>
  );
}
