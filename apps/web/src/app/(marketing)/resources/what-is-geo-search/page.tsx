/**
 * /resources/what-is-geo-search — "Understanding GEO Search"
 *
 * Part 2 of The Get-Cited Kit ($29): a short, foundational, fully-branded
 * explainer of GEO (Generative Engine Optimization) shipped to every buyer.
 * Distinct from the gated 30-page "GEO Visibility Guide" (a Growth-plan bonus).
 *
 * Delivery: a print-ready web guide. The "Download as PDF" button uses the
 * browser print pipeline; the @media print CSS strips the site chrome so the
 * output is a clean branded document. Doubles as a public SEO asset.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../../../../components/brand/Logo";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Understanding GEO Search — TrustIndex AI",
  description:
    "What Generative Engine Optimization (GEO) is, why it matters for small businesses, and how AI engines like ChatGPT, Claude, Perplexity, and Gemini decide which businesses to cite.",
};

// ---------------------------------------------------------------------------
// Content (evergreen — the same guide every buyer receives)
// ---------------------------------------------------------------------------

interface Section {
  heading: string;
  body: string; // markdown-lite: \n\n paragraphs, **bold**, "- " bullets
  keyTakeaway?: string;
}

const GUIDE = {
  title: "Understanding GEO Search",
  subtitle:
    "What Generative Engine Optimization is, why it matters for your business, and how AI engines decide who to name.",
  intro:
    'You just ran your AI Visibility Test and bought the Get-Cited Kit, so you have already seen the part that stings: a real customer can ask ChatGPT, Claude, Perplexity, or Google "who’s the best [your category]?" and your name may or may not come up. This short guide explains the rules behind that answer — what GEO (Generative Engine Optimization) actually is, why it now matters as much as ranking on Google, and how AI engines decide which businesses to cite. No jargon, no hype, just how the system works and where your Kit results fit in.',
  sections: [
    {
      heading: "GEO in one sentence",
      body: "GEO — Generative Engine Optimization — is the practice of structuring your online presence so AI answer engines are more likely to name you when someone asks a question your business can answer.\n\nThat’s the whole idea. Traditional SEO is about earning a blue link on Google’s results page and hoping someone clicks. GEO is about being the business the AI mentions inside its written answer — often before the user ever sees a list of links, and increasingly instead of one.\n\nThe term isn’t marketing slang. It was defined in a 2024 research paper from academics at Princeton, Georgia Tech, the Allen Institute for AI, and IIT Delhi, presented at KDD 2024 (a top data-science conference). They built a benchmark of 10,000 real user queries and tested which content changes actually moved the needle on getting cited. So when we talk about GEO, we’re talking about something measured, not invented.",
      keyTakeaway: "SEO gets you a link. GEO gets you named inside the AI’s answer.",
    },
    {
      heading: "Why this matters now (not in two years)",
      body: 'The shift to AI search is already underway, and the numbers are not small. Gartner predicted in February 2024 that traditional search volume would fall about 25% by 2026 as people move to AI tools for answers. ChatGPT passed 200 million weekly users by August 2024 and has grown since. Perplexity went from 10 million monthly users in early 2024 to roughly 30 million by 2025. Google now puts an AI Overview above the regular results for a growing share of searches.\n\nHere’s why that’s different from old search, and why it hits small businesses specifically. When a customer asks an AI "best accountant for freelancers in Lisbon" or "reliable CRM for a 5-person team," the AI doesn’t return ten options to choose from. It returns a short answer that names two or three businesses. There is far less room. You are either in that answer or you are invisible — there is no page 2 to scroll to.\n\nMarketers have noticed: a June 2025 BrightEdge survey of 750+ professionals found 68% are already changing strategy for AI search. The businesses that show up early tend to keep showing up, because AI engines build on what’s already established.',
      keyTakeaway: "AI answers name 2–3 businesses, not 10 links. Early presence compounds.",
    },
    {
      heading: "How AI engines decide who to cite",
      body: 'There are two separate ways your business can end up in an AI answer, and they work on completely different timelines. Understanding the difference tells you where to spend your effort.\n\n**Training data (slow).** When a model is built, it digests a huge slice of the internet. Sources that appear often, from places that appear often, get baked into the model’s memory. This is why Wikipedia, Reddit, and LinkedIn show up so much. The catch for a small business: anything you publish today won’t reach a model’s built-in knowledge until its next big training run — which can be a year or more away.\n\n**Live retrieval (fast).** This is the real opportunity. ChatGPT (via Bing), Perplexity, Claude, and Gemini can all fetch live web content while answering and cite their sources with links. Content you publish this month can be picked up and cited within days or weeks — no waiting for a retraining cycle.\n\nThe one rule both paths share: the AI matches your content to the customer’s question by meaning. If someone asks "Invisalign consultation in city centre" and your page says exactly that, you can be matched. If your page says "we love helping clients smile," nothing matches and nothing gets cited.',
      keyTakeaway: "Live retrieval is your fast lane — but only if your content uses the words customers actually search with.",
    },
    {
      heading: "Where AI pulls its citations from",
      body: "Not all places on the web carry equal weight. A three-month Semrush study of the most-cited domains in AI search found Reddit at the top (cited ~40% of the time), with Wikipedia and LinkedIn close behind. A separate Semrush analysis of 89,000 LinkedIn URLs across 325,000 prompts found LinkedIn appearing in about 11% of AI answers — and it’s the single most-cited source for professional and B2B questions.\n\nWhat surprised most people: popularity isn’t the driver. In that LinkedIn study, the median cited post had only 15–25 reactions. AI engines don’t cite the most-liked content. They cite the most relevant, specific answer to the exact question asked.\n\nFor a practical priority order: LinkedIn carries the most weight for professional and B2B businesses; Reddit and Quora threads work well for consumer niches with active communities; your own blog and FAQ pages are slower to build but fully owned by you. Your Kit’s checklist already points you to the specific sources where you’re currently absent.",
      keyTakeaway: "AI cites the most relevant source, not the most popular one — so specificity beats reach.",
    },
    {
      heading: "What citation-worthy content looks like",
      body: 'The research is consistent about what earns citations. The Princeton GEO paper found the strongest single moves were adding specific statistics and adding attributed quotes — each improved citation visibility by up to ~40% versus plain content. The pattern across studies comes down to a handful of traits:\n\n- **Specific, not general.** "Three deductions freelancers in Portugal miss" gets cited. "Tax planning is important" does not.\n- **Backed by a number or source.** A real figure the AI can quote beats an adjective every time.\n- **A clear point of view.** "We recommend X over Y for small retailers because Z" is more citable than "there are many factors to consider."\n- **One idea per piece.** Content that covers everything gets cited for nothing; content that fully answers one question gets retrieved when that question is asked.\n- **Published consistently.** A single great post isn’t a strategy. Regular publishing gives retrieval engines a base to draw from.\n\nYou don’t have to memorize this list. The three drafts in your Kit were already written to follow it — they’re your worked examples.',
      keyTakeaway: "Specific + numbered + opinionated + focused + consistent = the content AI actually quotes.",
    },
    {
      heading: "GEO vs. SEO — and why you still need both",
      body: "It’s tempting to treat GEO as the new thing that replaces SEO. It doesn’t. They optimize for different moments and reinforce each other.\n\nSEO aims to rank a page in Google’s index; GEO aims to be named in an AI-generated answer. SEO leans on backlinks and keywords; GEO leans on structured, specific, authoritative content that an engine can parse and quote. SEO impact is measured in months to years; live-retrieval GEO impact can show up in weeks.\n\nThey overlap in the plumbing. The same things that make your site readable to Google — clean structure, schema.org markup, pages that load and aren’t blocked — also make your site readable to AI crawlers like GPTBot, ClaudeBot, and PerplexityBot. That’s why your Kit’s Performance score covers schema coverage and crawler access: fixing them helps both at once.\n\nThe honest framing: most small businesses have done some SEO and almost no GEO. That gap is the opening. You don’t have to outspend big brands — you have to be more specific and more present where AI looks.",
      keyTakeaway: "GEO and SEO share the same foundations — fixing one usually helps the other.",
    },
    {
      heading: "An honest word on what GEO can and can’t promise",
      body: "No one can guarantee your business will be cited by ChatGPT or Perplexity, and you should be skeptical of anyone who does. AI answers vary by phrasing, by engine, by day, and by what’s freshly indexed. We won’t pretend otherwise.\n\nWhat the evidence does support: certain content practices are reliably more likely to earn citations than others, and being absent from the sources AI draws on guarantees you won’t be cited. GEO improves your odds and your share of the answer — it doesn’t hand you a certainty.\n\nA realistic timeline: if you act on your Kit’s fixes and start publishing specific content now, expect to begin seeing movement on narrow, niche queries after about four weeks of consistency. Broad, competitive queries take longer. The work compounds — which is exactly why starting now beats waiting.",
      keyTakeaway: "GEO shifts the odds in your favor; it never sells you a guarantee.",
    },
  ] as Section[],
  kitConnection:
    'This guide isn’t generic theory — it’s the manual for the results sitting in your Kit. Here’s how the two line up.\n\n**Your TrustIndex Score** is built on exactly the mechanics above. We ran buyer-intent prompts across 5 engines (ChatGPT/OpenAI, Claude/Anthropic, Gemini, Perplexity, and Google AI Overview) and scored you on three vectors: Brand (30%) — whether AI recognizes you as a real, established entity; Performance (35%) — whether engines can technically read and parse your site (schema, crawler access, share of voice); and AI (35%) — how often you were actually cited, in what position, and how favorably. A low Performance score usually means crawlers are blocked or schema is missing (the readability problem from the GEO-vs-SEO section). A low Brand score usually means you’re absent from the high-authority sources from the "where AI pulls citations" section.\n\n**Your top 3 fixes** are this guide made specific to you. We didn’t hand you a list of 50 best practices — we ranked every gap by impact and effort and surfaced the 3 that will move your score most. They are your starting point, in order.\n\n**Your 3 ready-to-publish drafts** (a blog post, a LinkedIn post, and an FAQ entry, each with schema.org markup) are the "citation-worthy content" traits turned into finished copy you can paste and publish today. Read this guide once for the why; then go act on the three fixes and publish the three drafts for the how.',
  plansCta: {
    heading: "Your Kit is a snapshot. AI search moves every week.",
    body: "The Get-Cited Kit shows you where you stand today and gives you three fixes and three drafts to act on. But AI answers change constantly — new competitors get cited, engines re-index, your fixes start (or stop) working. A one-time audit can’t tell you whether you’re gaining or losing ground. That’s what the subscription Plans do: re-run your probes on a schedule, track your TrustIndex Score over time, alert you when a competitor displaces you or an engine drops you, and keep feeding you the next content drafts to publish. Growth ($99/mo, or $831/yr founder pricing) covers weekly monitoring for one brand; Agency ($149/mo, or $1,251/yr founder pricing) adds more brands and competitor tracking. Knock out your three fixes first — then keep the gains compounding instead of going stale.",
    buttonLabel: "See Growth & Agency plans",
  },
  sources:
    "Sources & further reading: Aggarwal et al., “GEO: Generative Engine Optimization,” KDD 2024 (Princeton/Georgia Tech/Allen Institute/IIT Delhi); Gartner search-volume forecast, Feb 2024; OpenAI weekly-active-users announcement, Aug 2024; Semrush AI-citation domain and LinkedIn studies, 2024–2025; BrightEdge AI-search survey, June 2025. Figures are third-party estimates cited for context; AI behavior is non-deterministic.",
};

// ---------------------------------------------------------------------------
// Markdown-lite renderer (paragraphs, **bold**, "- " bullets)
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

function RichText({ body }: { body: string }): React.ReactElement {
  const blocks = body.split("\n\n");
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => l.trim().startsWith("- "));
        if (isList) {
          return (
            <ul key={bi} style={{ margin: "0 0 var(--space-3) 0", paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {lines.map((l, li) => (
                <li key={li} style={{ lineHeight: 1.65 }}>{renderInline(l.replace(/^\s*-\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: "0 0 var(--space-3) 0", lineHeight: 1.7 }}>
            {renderInline(block)}
          </p>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PRINT_CSS = `
  @media print {
    .mk-navbar, footer[aria-label="Site footer"], .noprint { display: none !important; }
    .geo-guide { max-width: 100% !important; padding: 0 !important; }
    .geo-guide a[href]::after { content: ""; } /* don't print raw URLs */
    body { background: #fff !important; }
  }
`;

export default function WhatIsGeoSearchPage(): React.ReactElement {
  return (
    <article
      className="geo-guide"
      style={{ maxWidth: "760px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-20)", fontFamily: "var(--font-family)", color: "var(--color-text)" }}
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Branded header */}
      <header style={{ marginBottom: "var(--space-8)", borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
          <Logo markSize={30} wordSize="1.0625rem" />
          <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)" }}>
            Get-Cited Kit · Part 2
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(1.9rem, 4.5vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 var(--space-3) 0" }}>
          {GUIDE.title}
        </h1>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-5) 0" }}>
          {GUIDE.subtitle}
        </p>
        <p style={{ fontSize: "var(--font-size-body)", lineHeight: 1.7, margin: "0 0 var(--space-5) 0" }}>
          {GUIDE.intro}
        </p>
        <PrintButton />
      </header>

      {/* Sections */}
      {GUIDE.sections.map((s, i) => (
        <section key={i} style={{ marginBottom: "var(--space-7)" }}>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 var(--space-3) 0" }}>
            <span style={{ color: "var(--color-primary)" }}>{String(i + 1).padStart(2, "0")}</span>{"  "}{s.heading}
          </h2>
          <div style={{ fontSize: "var(--font-size-body-sm)" }}>
            <RichText body={s.body} />
          </div>
          {s.keyTakeaway && (
            <p style={{ margin: "var(--space-2) 0 0 0", padding: "var(--space-3) var(--space-4)", borderLeft: "4px solid var(--color-primary)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-sm)", fontSize: "var(--font-size-body-sm)", fontWeight: 700, lineHeight: 1.5 }}>
              {s.keyTakeaway}
            </p>
          )}
        </section>
      ))}

      {/* How this connects to your Kit */}
      <section style={{ marginBottom: "var(--space-7)", padding: "var(--space-6)", backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>
          How this connects to your Kit
        </h2>
        <div style={{ fontSize: "var(--font-size-body-sm)" }}>
          <RichText body={GUIDE.kitConnection} />
        </div>
      </section>

      {/* Plans CTA */}
      <section className="noprint" style={{ marginBottom: "var(--space-6)", padding: "var(--space-6)", border: "2px solid var(--color-primary)", borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface)" }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
          {GUIDE.plansCta.heading}
        </h2>
        <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-4) 0" }}>
          {GUIDE.plansCta.body}
        </p>
        <Link
          href="/#pricing"
          style={{ display: "inline-flex", alignItems: "center", height: "48px", padding: "0 var(--space-6)", backgroundColor: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", fontWeight: 800, fontSize: "var(--font-size-body)", textDecoration: "none" }}
        >
          {GUIDE.plansCta.buttonLabel} →
        </Link>
      </section>

      {/* Sources */}
      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>
        {GUIDE.sources}
      </p>
    </article>
  );
}
