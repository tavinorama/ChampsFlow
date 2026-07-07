/**
 * /vs/[competitor] — one honest head-to-head per competitor.
 *
 * Statically generated for each known slug (SEO + speed). Layout:
 *  1. Hero — "Ozvor vs {name}" + the single sharpest true difference.
 *  2. Comparison table — check marks by edge; ties are ties.
 *  3. Where {name} wins — an honest section (this is the trust asset).
 *  4. The landmine question, reframed for the reader.
 *  5. CTA — free test + Growth checkout.
 *
 * Every claim is sourced from the sales battlecards; pricing uncertainty is
 * surfaced (pricingNote), not hidden — the same measurement honesty the
 * product sells.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectCheckoutButton } from "../../../../components/marketing/DirectCheckoutButton";
import { COMPETITOR_SLUGS, getCompetitor } from "../_data";

export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((competitor) => ({ competitor }));
}

export const dynamicParams = false;

interface Params {
  params: Promise<{ competitor: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) return { title: "Comparison not found | Ozvor" };
  const title = `Ozvor vs ${c.name} — honest comparison (${new Date().getFullYear()})`;
  const description = `${c.thesis} See the full feature-by-feature comparison, where ${c.name} wins, and how to get your own AI-visibility number in 60 seconds.`;
  return {
    title,
    description,
    alternates: { canonical: `https://ozvor.com/vs/${c.slug}` },
    openGraph: {
      title,
      description,
      url: `https://ozvor.com/vs/${c.slug}`,
      siteName: "Ozvor",
      type: "website",
      images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: `Ozvor vs ${c.name}` }],
    },
  };
}

const CSS = `
  .cmp-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .cmp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); margin-top: var(--space-8); }
  @media (max-width: 760px) { .cmp-cols { grid-template-columns: 1fr; } }
  .cmp-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-card); }
  .cmp-tablewrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-lg); margin-top: var(--space-6); }
  .cmp-table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: var(--font-size-body-sm); }
  .cmp-table th { text-align: left; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); background: var(--color-surface-muted); font-weight: 700; }
  .cmp-table th.mine { color: var(--color-accent-ink); }
  .cmp-table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); vertical-align: top; line-height: 1.5; }
  .cmp-table tr:last-child td { border-bottom: none; }
  .cmp-feature { font-weight: 600; color: var(--color-text); }
  .cmp-win { color: var(--color-accent-ink); font-weight: 700; }
`;

export default async function CompetitorPage({ params }: Params) {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) notFound();

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
      <style>{CSS}</style>

      <Link
        href="/vs"
        style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", textDecoration: "none" }}
      >
        ← All comparisons
      </Link>

      {/* Hero */}
      <span className="cmp-eyebrow" style={{ display: "block", marginTop: "var(--space-4)" }}>
        Honest comparison · {c.category}
      </span>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        Ozvor vs {c.name}
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "680px",
          margin: 0,
        }}
      >
        {c.thesis}
      </p>

      {/* Strengths / gaps two-up */}
      <div className="cmp-cols">
        <div className="cmp-card">
          <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h4)", fontWeight: 700 }}>
            Where {c.name} is strong
          </h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {c.strengths.map((s) => (
              <li key={s} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
                <span aria-hidden="true" style={{ flexShrink: 0 }}>•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="cmp-card">
          <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h4)", fontWeight: 700 }}>
            Where Ozvor closes the gap
          </h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {c.gaps.map((g) => (
              <li key={g} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
                <span aria-hidden="true" className="cmp-win" style={{ flexShrink: 0 }}>✓</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Comparison table */}
      <h2 style={{ margin: "var(--space-16) 0 0", fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 800, letterSpacing: "-0.02em" }}>
        Feature by feature
      </h2>
      <div className="cmp-tablewrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              <th scope="col" className="mine">Ozvor</th>
              <th scope="col">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.feature}>
                <td className="cmp-feature">{r.feature}</td>
                <td className={r.edge === "ozvor" ? "cmp-win" : undefined}>
                  {r.edge === "ozvor" ? "✓ " : ""}
                  {r.ozvor}
                </td>
                <td className={r.edge === "them" ? "cmp-win" : undefined}>
                  {r.edge === "them" ? "✓ " : ""}
                  {r.them}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "var(--space-3) 0 0", fontSize: "0.75rem", color: "var(--color-muted)" }}>
        {c.name} entry price: <strong style={{ color: "var(--color-text)" }}>{c.entryPrice}</strong>.
        {c.pricingNote ? ` ${c.pricingNote}` : ""}
      </p>

      {/* Where they win — honesty section */}
      <section style={{ marginTop: "var(--space-16)" }}>
        <div
          className="cmp-card"
          style={{ borderLeft: "3px solid var(--color-accent-ink)" }}
        >
          <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.01em" }}>
            When {c.name} is the right call
          </h2>
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>
            {c.whenTheyWin}
          </p>
          <p style={{ margin: "var(--space-4) 0 0", fontSize: "0.75rem", color: "var(--color-muted)", fontStyle: "italic" }}>
            We publish where we lose because we hold our comparisons to the same standard as our
            audits: measured, not fabricated.
          </p>
        </div>
      </section>

      {/* Landmine question, reframed */}
      <section style={{ marginTop: "var(--space-12)" }}>
        <div className="cmp-card">
          <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--font-size-h4)", fontWeight: 700 }}>
            The one question to ask before you decide
          </h2>
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", color: "var(--color-text)", lineHeight: 1.7, fontWeight: 500 }}>
            &ldquo;{c.landmine}&rdquo;
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: "var(--space-20)", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-4)" }}>
          Compare on your own brand.
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)", maxWidth: "540px", marginInline: "auto" }}>
          The honest way to choose is to see your own number first. Run the free test, then decide
          whether you want the plan and the content that come with it.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
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
            Run the free AI test →
          </Link>
          <DirectCheckoutButton plan="growth" interval="year" label="Get Growth →" />
        </div>
      </section>
    </main>
  );
}
