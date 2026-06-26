/**
 * /pricing — Plans (Ozvor mockup).
 *
 *  1. Hero "Replace a $30k/yr specialist for under $100/mo."
 *  2. Founding-member band (gold) — 30% founder discount + free 5-page website, annual only.
 *  3. Three plan cards — Free / Growth (featured, emerald, "Most popular") / Agency (gold).
 *  4. Competitor comparison table (Buffer/Hootsuite/Later/Predis.ai vs Ozvor).
 * Server component, SSR, real <a href> checkout links.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Plans — Replace a $30k/yr specialist for under $100/mo | Ozvor",
  description:
    "Start free, climb when you're ready. Free AI test, $29 Get-Cited Kit, Growth $99/mo, Agency $249/mo. 30-day money-back, cancel anytime, no lock-in. Founding members: 30% off annual + a free 5-page website.",
  alternates: { canonical: "https://ozvor.com/pricing" },
  openGraph: {
    title: "Plans — Ozvor",
    description: "Free → Kit $29 → Growth $99/mo → Agency $249/mo. 30-day money-back, no lock-in.",
    url: "https://ozvor.com/pricing",
    siteName: "Ozvor",
    type: "website",
    images: [{ url: "https://ozvor.com/og-default.png", width: 1200, height: 630, alt: "Ozvor plans" }],
  },
};

type Plan = {
  name: string;
  price: string;
  per: string;
  sub: string;
  features: string[];
  cta: string;
  href: string;
  accent: "muted" | "emerald" | "gold";
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    per: "",
    sub: "See where you stand — no card.",
    features: ["1 brand", "One buyer-prompt audit", "Up to 3 competitors", "All 5 AI engines", "Instant TrustIndex AI Score"],
    cta: "Run the free test",
    href: "/test",
    accent: "muted",
  },
  {
    name: "Growth",
    price: "$99",
    per: "/mo",
    sub: "For one brand you want cited.",
    features: ["Unlimited audits", "Weekly monitoring", "Up to 5 competitors", "GEO content plan + Content Studio", "CSV export", "Email support"],
    cta: "Start Growth",
    href: "/login?plan=growth&next=checkout",
    accent: "emerald",
    featured: true,
  },
  {
    name: "Agency",
    price: "$249",
    per: "/mo",
    sub: "For agencies & multi-brand teams.",
    features: ["Multi-client dashboard (up to 25 brands)", "10 competitors per brand", "Weekly monitoring on every client", "White-label reports", "Client approval workflow", "Priority support · 4h SLA", "Annual: website + 3 client landings"],
    cta: "Start Agency",
    href: "/login?plan=agency&next=checkout",
    accent: "gold",
  },
];

const COMPARE_COLS = ["Buffer", "Hootsuite", "Later", "Predis.ai"];
const COMPARE_ROWS: { f: string; vals: string[]; us: string }[] = [
  { f: "Content drafted for LLM visibility (GEO)", vals: ["✗", "✗", "✗", "✗"], us: "Structured drafts shaped for AI citation" },
  { f: "No AI training on your content", vals: ["?", "?", "?", "?"], us: "Provider-contractual (Anthropic terms)" },
  { f: "EU-region inference", vals: ["~", "~", "?", "?"], us: "On our roadmap" },
  { f: "Draft-and-confirm (no autonomous posting)", vals: ["✗", "✗", "✗", "✗"], us: "Always, by design" },
  { f: "AI disclosure (EU AI Act Art. 50)", vals: ["?", "?", "?", "?"], us: "Named model + visible badge" },
];

const PAGE_CSS = `
  .pr-eyebrow { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent-ink); font-weight: 600; }
  .pr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); align-items: start; }
  @media (max-width: 860px) { .pr-grid { grid-template-columns: 1fr; } }
  .pr-cta { display:block; text-align:center; width:100%; box-sizing:border-box; font-weight:700; text-decoration:none; border-radius:var(--radius-md); padding:0.8rem 1rem; margin-top:var(--space-4); }
  .pr-cta-emerald { background:linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e; box-shadow:0 10px 32px rgba(39,201,138,0.28); }
  .pr-cta-gold { background:linear-gradient(135deg,#e6a93f,#b9791f); color:#1a1206; box-shadow:0 10px 32px rgba(230,169,63,0.26); }
  .pr-cta-ghost { border:1px solid var(--color-border); color:var(--color-text); }
  .pr-tablewrap { overflow-x:auto; }
  .pr-table { width:100%; min-width:720px; border-collapse:collapse; font-size:var(--font-size-body-sm); }
  .pr-table th, .pr-table td { padding:0.75rem 0.9rem; border-bottom:1px solid var(--color-border); text-align:left; }
  .pr-table thead th { font-family:var(--font-mono); font-size:0.6875rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--color-muted); font-weight:600; }
  .pr-us { color:var(--color-accent-ink); font-weight:600; }
`;

function accentColor(a: Plan["accent"]) {
  return a === "emerald" ? "var(--color-accent-ink)" : a === "gold" ? "var(--color-gold-ink)" : "var(--color-muted)";
}

export default function PricingPage() {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "var(--space-16) var(--space-4) calc(var(--bottom-nav-height) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto" }}>
        <span className="pr-eyebrow">Plans</span>
        <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "var(--space-3) 0 var(--space-4)" }}>
          Replace a $30k/yr specialist for under $100/mo.
        </h1>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: 0 }}>
          Start free, climb when you&rsquo;re ready. 30-day money-back guarantee · cancel any time · no lock-in.
        </p>
      </div>

      {/* Founding-member band (gold) */}
      <div style={{ marginTop: "var(--space-10)", border: "1px solid var(--color-gold)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", background: "var(--color-surface)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <div>
          <span className="pr-eyebrow" style={{ color: "var(--color-gold-ink)" }}>Founding member offer · first 100</span>
          <h2 style={{ margin: "var(--space-2) 0 var(--space-1)", fontSize: "var(--font-size-h2)", fontWeight: 800 }}>30% founder discount + a free 5-page website</h2>
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, maxWidth: "560px" }}>
            Applied only when you pay annually. No countdown, no fake scarcity — when the cohort fills, it fills.
          </p>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-gold-ink)", fontSize: "1.125rem", whiteSpace: "nowrap" }}>$69/mo · $174/mo</div>
      </div>

      {/* Plan cards */}
      <div className="pr-grid" style={{ marginTop: "var(--space-10)" }}>
        {PLANS.map((pl) => (
          <div
            key={pl.name}
            style={{
              position: "relative",
              padding: "var(--space-8) var(--space-6)",
              borderRadius: "var(--radius-lg)",
              border: pl.featured ? "1.5px solid var(--color-primary)" : pl.accent === "gold" ? "1px solid var(--color-gold)" : "1px solid var(--color-border)",
              background: "var(--color-surface)",
              boxShadow: pl.featured ? "0 12px 40px rgba(39,201,138,0.14)" : "var(--shadow-card)",
            }}
          >
            {pl.featured && (
              <span style={{ position: "absolute", top: "-11px", left: "var(--space-6)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 11px", borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg,#27c98a,#0c7d54)", color: "#06140e", fontWeight: 700 }}>
                Most popular
              </span>
            )}
            <div style={{ fontSize: "1rem", fontWeight: 700, color: accentColor(pl.accent) }}>{pl.name}</div>
            <div style={{ marginTop: "var(--space-2)", fontSize: "2.5rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
              {pl.price}<span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-muted)" }}>{pl.per}</span>
            </div>
            <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", minHeight: "32px" }}>{pl.sub}</div>
            <Link href={pl.href} className={`pr-cta ${pl.accent === "gold" ? "pr-cta-gold" : pl.featured ? "pr-cta-emerald" : "pr-cta-ghost"}`}>
              {pl.cta}
            </Link>
            <ul style={{ listStyle: "none", margin: "var(--space-5) 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {pl.features.map((f) => (
                <li key={f} style={{ display: "flex", gap: "var(--space-2)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ color: accentColor(pl.accent === "muted" ? "emerald" : pl.accent), fontWeight: 700 }}>&#10003;</span>{f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <section style={{ marginTop: "var(--space-20)" }} aria-labelledby="pr-compare">
        <h2 id="pr-compare" style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-2)", textAlign: "center" }}>
          Social schedulers post. Ozvor gets you cited.
        </h2>
        <p style={{ textAlign: "center", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6)" }}>
          Competitor capabilities not disclosed are marked &ldquo;?&rdquo; (checked 2026-05-11).
        </p>
        <div className="pr-tablewrap" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {COMPARE_COLS.map((c) => <th key={c} scope="col" style={{ textAlign: "center" }}>{c}</th>)}
                <th scope="col" style={{ color: "var(--color-accent-ink)" }}>Ozvor</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.f}>
                  <td style={{ color: "var(--color-text)" }}>{r.f}</td>
                  {r.vals.map((v, i) => <td key={i} style={{ textAlign: "center", color: "var(--color-muted)" }}>{v}</td>)}
                  <td className="pr-us">{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}>
          ✓ yes · ~ partial · ✗ no · ? not disclosed. <Link href="/how-we-measure" style={{ color: "var(--color-accent-ink)", textDecoration: "none", fontWeight: 600 }}>How we measure →</Link>
        </p>
      </section>
    </main>
  );
}
