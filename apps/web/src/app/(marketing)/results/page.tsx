/**
 * /results — LIVE case study / building-in-public.
 *
 * Every number on this page comes from GET /api/showcase/geo — Ozvor's own
 * production audits (same engine customers get). Server-rendered with
 * 10-minute revalidation so the page updates itself after every audit.
 *
 * DATA INTEGRITY (founder mandate): no fabricated numbers, ever. If the
 * showcase API is unavailable the page says so honestly instead of showing
 * stale or invented data. The previous version of this page carried a mocked
 * 44→72 trend — replaced by this live implementation.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ScorecardGlyph } from "../../../components/marketing/illustrations";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Live case study — Ozvor's real AI visibility numbers",
  description:
    "We run Ozvor on ourselves and publish the raw audit data. Score history and citation rate, per AI engine, straight from the production database. No fabricated numbers, ever.",
  alternates: { canonical: "https://ozvor.com/results" },
  openGraph: {
    title: "Live case study — Ozvor's real AI visibility numbers",
    description:
      "Building in public: our own Ozvor AI Visibility Score, updated after every audit. Straight from production.",
    url: "https://ozvor.com/results",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor live case study" }],
  },
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ShowcaseAudit {
  date: string;
  ai: number | null;
  performance: number | null;
  brand: number | null;
  overall: number | null;
}

interface Showcase {
  history: ShowcaseAudit[];
  latest_engines: { provider: string; probes: number; cited: number }[];
  generated_at: string;
}

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  google: "Gemini",
  perplexity: "Perplexity",
  dataforseo: "Google AI Overview",
};

async function fetchShowcase(): Promise<Showcase | null> {
  const base =
    process.env.INTERNAL_API_URL ?? "https://api-production-2052.up.railway.app";
  try {
    const res = await fetch(`${base}/api/showcase/geo`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Showcase;
  } catch {
    return null;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_CSS = `
  .res-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .res-panels { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
  @media (max-width: 820px) { .res-panels { grid-template-columns: 1fr; } }
  .res-quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); }
  @media (max-width: 760px) { .res-quotes { grid-template-columns: 1fr; } }
  .res-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-card); }
  .res-bars { display: flex; align-items: flex-end; gap: 6px; height: 160px; }
  .res-bar { flex: 1; border-radius: 6px 6px 0 0; background: linear-gradient(180deg,#27c98a,#0c7d54); min-height: 4px; }
`;

const RESERVED = [
  "Early user · healthcare services",
  "Early user · professional services",
  "Early user · e-commerce",
];

export default async function ResultsPage() {
  const data = await fetchShowcase();
  const history = data?.history ?? [];
  const latestOverall = history.length > 0 ? history[history.length - 1]?.overall : null;
  const firstOverall = history.length > 0 ? history[0]?.overall : null;
  const latestAi = history.length > 0 ? history[history.length - 1]?.ai : null;
  const maxOverall = Math.max(1, ...history.map((h) => h.overall ?? 0));

  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding:
          "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <span className="res-eyebrow">Live case study · building in public</span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        Our real numbers. Straight from production.
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "640px",
          margin: 0,
        }}
      >
        We run Ozvor on ourselves and publish the raw audit data. It&rsquo;s the same engine, the
        same scoring our customers get. This page reads directly from our production database.
        It updates after every audit. No cherry-picking, no invented trends.
      </p>

      <div style={{ display: "grid", placeItems: "center", marginTop: "var(--space-8)" }}>
        <ScorecardGlyph size={150} />
      </div>

      <p
        style={{
          marginTop: "var(--space-6)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          maxWidth: "640px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
        }}
      >
        <strong style={{ color: "var(--color-text)" }}>
          These are Ozvor&rsquo;s own numbers, not a customer&rsquo;s.
        </strong>{" "}
        We are a new brand measuring ourselves in public. That means the early numbers are
        honest, not impressive. That is the point.
      </p>

      {data === null || history.length === 0 ? (
        /* Honest fallback — never invented numbers */
        <div
          className="res-card"
          role="status"
          style={{ marginTop: "var(--space-12)", textAlign: "center" }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Live data is temporarily unavailable.</p>
          <p
            style={{
              margin: "var(--space-2) 0 0",
              color: "var(--color-muted)",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            We won&rsquo;t show you stale or made-up numbers. We show you nothing until the live
            feed is back. That is the same integrity rule your audits run on.
          </p>
        </div>
      ) : (
        <>
          {/* Live panels */}
          <div className="res-panels" style={{ marginTop: "var(--space-12)" }}>
            {/* Score history */}
            <div className="res-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: "var(--space-4)",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 700 }}>
                  Ozvor AI Visibility Score · every audit
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: "var(--color-accent-ink)",
                  }}
                >
                  {firstOverall} → {latestOverall}
                </span>
              </div>
              <div
                className="res-bars"
                role="img"
                aria-label={`Ozvor AI Visibility Score across ${history.length} audits, from ${firstOverall} to ${latestOverall}`}
              >
                {history.map((h, i) => (
                  <div
                    key={h.date}
                    className="res-bar"
                    style={{
                      height: `${((h.overall ?? 0) / maxOverall) * 100}%`,
                      opacity: i === history.length - 1 ? 1 : 0.65,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "var(--space-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  color: "var(--color-muted)",
                }}
              >
                <span>{fmtDate(history[0]!.date)}</span>
                <span>{fmtDate(history[history.length - 1]!.date)}</span>
              </div>
              <p
                style={{
                  margin: "var(--space-3) 0 0",
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                }}
              >
                {history.length} audits published · latest AI Visibility vector: {latestAi}/100
              </p>
            </div>

            {/* Engine citation rate — latest audit */}
            <div className="res-card">
              <h2 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 700 }}>
                Citation rate · latest audit
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {(data.latest_engines ?? []).map((en) => {
                  const pct = en.probes > 0 ? Math.round((en.cited / en.probes) * 100) : 0;
                  return (
                    <div key={en.provider}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--font-size-body-sm)",
                            color: "var(--color-text)",
                            fontWeight: 600,
                          }}
                        >
                          {ENGINE_LABELS[en.provider] ?? en.provider}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            color: "var(--color-muted)",
                          }}
                        >
                          {en.cited}/{en.probes} · {pct}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: "8px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--color-surface-muted)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            height: "100%",
                            background: "linear-gradient(90deg,#27c98a,#0c7d54)",
                            borderRadius: "var(--radius-pill)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p
                style={{
                  margin: "var(--space-3) 0 0",
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                }}
              >
                Buyer-intent prompts where Ozvor was cited, per engine. Low numbers are normal
                for a new brand. Watch them move as we execute.
              </p>
            </div>
          </div>

          {/* What we're doing — truthful log */}
          <section aria-labelledby="res-causal" style={{ marginTop: "var(--space-20)" }}>
            <div className="res-card" style={{ marginBottom: "var(--space-5)" }}>
              <h2
                id="res-causal"
                style={{
                  margin: "0 0 var(--space-4)",
                  fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                What we&rsquo;ve shipped so far
              </h2>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                {[
                  "Structured schema.org markup + AI-crawler access (GPTBot, ClaudeBot, PerplexityBot) across the site",
                  "A public methodology page explaining exactly how the score is computed",
                  "10 research-sourced blog posts answering the buyer questions AI engines get asked",
                  "Weekly automated self-audits across all 5 engines (the chart above is their output)",
                  "301-consolidation of legacy domains into ozvor.com for entity consistency",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: "var(--color-accent-ink)", fontWeight: 700, flexShrink: 0 }}
                    >
                      &#10003;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="res-card" style={{ marginBottom: "var(--space-5)" }}>
              <h2
                style={{
                  margin: "0 0 var(--space-4)",
                  fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                What&rsquo;s next on our own plan
              </h2>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                {[
                  "Publish comparison pages for the buyer queries where we're invisible today",
                  "Build presence on the third-party sources AI cites most (Reddit, review sites)",
                  "Keep publishing — and let this page show whether it works",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: "var(--color-accent-ink)", fontWeight: 700, flexShrink: 0 }}
                    >
                      →
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <p
                style={{
                  margin: "var(--space-4) 0 0",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-muted)",
                  lineHeight: 1.7,
                }}
              >
                These are the same evidence-backed actions the platform generates for every
                audited brand. We eat our own cooking — publicly.
              </p>
            </div>

            <div className="res-card">
              <h2
                style={{
                  margin: "0 0 var(--space-4)",
                  fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                What this means for your brand
              </h2>
              <p
                style={{
                  margin: "0 0 var(--space-5)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-muted)",
                  lineHeight: 1.7,
                }}
              >
                Every brand starts by knowing its real number. Ours is on this page for anyone
                to see. Yours takes 60 seconds to find out. Same engine, same no-fabrication rule.
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
                Run your free AI Visibility Test &rarr;
              </Link>
            </div>
          </section>
        </>
      )}

      {/* Reserved quotes — no fabricated testimonials */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="res-quotes-h">
        <h2
          id="res-quotes-h"
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: "0 0 var(--space-2)",
            textAlign: "center",
          }}
        >
          No fabricated testimonials. Ever.
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "var(--color-muted)",
            fontSize: "var(--font-size-body-sm)",
            margin: "0 0 var(--space-6)",
          }}
        >
          These slots are reserved for real early-access quotes. We&rsquo;ll fill them only when
          they&rsquo;re real.
        </p>
        <div className="res-quotes">
          {RESERVED.map((label) => (
            <div
              key={label}
              style={{
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
                textAlign: "center",
                color: "var(--color-muted)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Reserved
              </span>
              <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: "0 0 var(--space-5)",
          }}
        >
          Run the test. Compare your number to ours.
        </h2>
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
          }}
        >
          Run the free AI test →
        </Link>
      </section>
      <p style={{ maxWidth: 720, margin: "var(--space-8) auto 0", padding: "0 var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center", lineHeight: 1.6 }}>
        AI answers are non-deterministic and vary by engine, phrasing, and day. Ozvor&rsquo;s scores and
        recommendations are evidence-based, directional estimates &mdash; not a guarantee of citation,
        ranking, traffic, or revenue.
      </p>
    </main>
  );
}
