"use client";

/**
 * InvisibilityTestClient — interactive form + scorecard.
 *
 * Extracted from page.tsx so that page.tsx can be a server component
 * (enabling metadata + JSON-LD exports).
 */

import { useState } from "react";

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overview",
};

interface EngineResult {
  engine: string;
  brandCited: boolean;
  brandPosition: number | null;
  competitorCited: boolean;
}

interface TestResult {
  prompt: string;
  live: boolean;
  engines: EngineResult[];
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  verdict: string;
  status: "invisible" | "trailing" | "competitive" | "leading";
}

const STATUS_COLOR: Record<TestResult["status"], string> = {
  invisible: "#dc2626",
  trailing: "#d97706",
  competitive: "#7c3aed",
  leading: "var(--color-success)",
};

export function InvisibilityTestClient() {
  const [brand, setBrand] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState<"US" | "EU">("US");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim() || !category.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          competitor: competitor.trim(),
          category: category.trim(),
          region,
          email: email.trim(),
        }),
      });
      if (!res.ok) {
        setError("Could not run the test right now. Please try again.");
      } else {
        const data = await res.json();
        setResult(data.result);
        setTestId(data.testId ?? null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Carry this test into the Kit so its Part 1 is framed as "your test, completed".
  const kitParams = new URLSearchParams();
  if (testId) kitParams.set("testId", testId);
  if (brand.trim()) kitParams.set("brand", brand.trim());
  if (category.trim()) kitParams.set("category", category.trim());
  kitParams.set("region", region);
  const kitHref = `/kit?${kitParams.toString()}`;

  return (
    <>
      {!result && (
        <form onSubmit={run} style={cardStyle}>
          <Field label="Your brand" required>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Acme CRM"
              required
              style={inputStyle}
            />
          </Field>
          <Field label="A competitor" hint="optional — we'll compare you head-to-head">
            <input
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder="A rival brand"
              style={inputStyle}
            />
          </Field>
          <Field label="Your category" required hint="how buyers describe what you sell">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="CRM, accounting software, law firm…"
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Data region">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as "US" | "EU")}
              style={inputStyle}
            >
              <option value="US">US</option>
              <option value="EU">EU (GDPR routing)</option>
            </select>
          </Field>
          <Field label="Email me the full scorecard" hint="optional">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              style={inputStyle}
            />
          </Field>
          {error && (
            <p style={{ color: "#dc2626", fontSize: "var(--font-size-body-sm)" }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || !brand.trim() || !category.trim()}
            style={primaryBtn(busy || !brand.trim() || !category.trim())}
          >
            {busy ? "Asking the AI engines…" : "Run my free test"}
          </button>
        </form>
      )}

      {result && (
        <>
          <Scorecard
            result={result}
            kitHref={kitHref}
            onReset={() => {
              setResult(null);
              setTestId(null);
            }}
          />
          {/* GEO Sprint offer — shown when brand has low / mediocre visibility */}
          {(result.status === "invisible" || result.status === "trailing") && (
            <GeoSprintOffer
              brandEngineCount={result.brandEngineCount}
              totalEngines={result.totalEngines}
            />
          )}
        </>
      )}

      <p
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          marginTop: "var(--space-6)",
          lineHeight: 1.6,
        }}
      >
        Results are evidence-based estimates. AI answers are non-deterministic and vary between
        runs &mdash; this is a directional snapshot, not a guarantee of citation.
        {result && !result.live
          ? " (Demo data — live engines activate once provider keys are connected.)"
          : ""}
      </p>
    </>
  );
}

function Scorecard({
  result,
  kitHref,
  onReset,
}: {
  result: TestResult;
  kitHref: string;
  onReset: () => void;
}) {
  const color = STATUS_COLOR[result.status];
  return (
    <div style={{ ...cardStyle, borderColor: color }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color,
            border: `1px solid ${color}`,
            borderRadius: "var(--radius-pill)",
            padding: "3px 10px",
          }}
        >
          {result.status}
        </span>
        <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          Prompt: &ldquo;{result.prompt}&rdquo;
        </span>
      </div>
      <p
        style={{
          fontSize: "var(--font-size-h3)",
          fontWeight: 700,
          lineHeight: 1.3,
          margin: "0 0 var(--space-4) 0",
        }}
      >
        {result.verdict}
      </p>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-body-sm)",
          marginBottom: "var(--space-4)",
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "var(--color-muted)" }}>
            <th style={th}>AI engine</th>
            <th style={th}>You</th>
            <th style={th}>Position</th>
            <th style={th}>Competitor</th>
          </tr>
        </thead>
        <tbody>
          {result.engines.map((e) => (
            <tr key={e.engine}>
              <td style={td}>{ENGINE_LABEL[e.engine] ?? e.engine}</td>
              <td
                style={{
                  ...td,
                  color: e.brandCited ? "var(--color-success)" : "#dc2626",
                  fontWeight: 700,
                }}
              >
                {e.brandCited ? "Cited ✓" : "Not cited ✗"}
              </td>
              <td style={td}>{e.brandPosition ? `#${e.brandPosition}` : "—"}</td>
              <td style={{ ...td, color: e.competitorCited ? "#d97706" : "var(--color-muted)" }}>
                {e.competitorCited ? "Cited" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CTA into the $29 Kit (the next step) */}
      <div
        style={{
          backgroundColor: "var(--color-surface-muted)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5)",
          marginTop: "var(--space-2)",
        }}
      >
        <p style={{ fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>
          Now fix it &mdash; without becoming a GEO expert.
        </p>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
            margin: "0 0 var(--space-3) 0",
          }}
        >
          This is <strong>one question</strong> across the AI engines. The{" "}
          <strong>Get-Cited Kit</strong> ($29, one-time) runs <strong>every</strong> buyer
          prompt in your category, scores all three vectors, and hands you 3 ready-to-publish
          drafts (blog + LinkedIn + FAQ with schema) &mdash; the full audit this test previews,
          plus a plain-English GEO guide.
        </p>
        <a
          href={kitHref}
          style={{
            ...primaryBtn(false),
            display: "inline-block",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Complete it with the Kit &mdash; $29 &rarr;
        </a>
      </div>

      <button
        onClick={onReset}
        style={{
          marginTop: "var(--space-4)",
          background: "none",
          border: "none",
          color: "var(--color-primary)",
          fontWeight: 600,
          cursor: "pointer",
          fontSize: "var(--font-size-body-sm)",
        }}
      >
        &larr; Test another brand
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GEO Sprint offer — done-for-you upsell shown when score is low/mediocre.
// Shows 3 tiers; all CTAs route to /book (founder-led close, not self-serve checkout).
// ---------------------------------------------------------------------------

function GeoSprintOffer({
  brandEngineCount,
  totalEngines,
}: {
  brandEngineCount: number;
  totalEngines: number;
}) {
  const missingPct = Math.round(
    ((totalEngines - brandEngineCount) / totalEngines) * 100,
  );

  const sprintTiers: Array<{
    name: string;
    price: string;
    summary: string;
    popular: boolean;
  }> = [
    {
      name: "Sprint Starter",
      price: "from $1,500",
      summary: "One brand · top-3 fixes executed",
      popular: false,
    },
    {
      name: "Sprint Standard",
      price: "from $2,400",
      summary: "Full GEO plan executed + content",
      popular: true,
    },
    {
      name: "Sprint Plus",
      price: "from $4,500",
      summary: "Multi-brand · aggressive · priority",
      popular: false,
    },
  ];

  return (
    <section
      aria-labelledby="geo-sprint-heading"
      style={{
        marginTop: "var(--space-6)",
        background:
          "linear-gradient(135deg, var(--color-badge-ai-bg), var(--color-surface))",
        border: "1.5px solid var(--color-primary)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Eyebrow */}
      <span
        style={{
          fontSize: "0.7rem",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-primary)",
        }}
      >
        Done-for-you &middot; OrganicPosts GEO Sprint
      </span>

      <h2
        id="geo-sprint-heading"
        style={{
          margin: 0,
          fontSize: "1.25rem",
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
        }}
      >
        Want this fixed for you? Get Cited in 30 Days.
      </h2>

      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.7,
        }}
      >
        You&rsquo;re missing from{" "}
        <strong style={{ color: "var(--color-text)" }}>{missingPct}%</strong> of AI
        answers. The OrganicPosts GEO Sprint is a founder-led, done-for-you
        engagement &mdash; we publish the fixes, you watch your TrustIndex Score
        climb. No templates. No AI slop. Real execution.
      </p>

      {/* Three tier cards — scannable */}
      <div
        role="list"
        aria-label="GEO Sprint tiers"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {sprintTiers.map((tier) => (
          <div
            key={tier.name}
            role="listitem"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: tier.popular
                ? "var(--color-badge-ai-bg)"
                : "var(--color-surface)",
              border: tier.popular
                ? "1.5px solid var(--color-primary)"
                : "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {tier.popular && (
                <span
                  aria-label="Most popular"
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    backgroundColor: "var(--color-primary)",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Most popular
                </span>
              )}
              <div>
                <span
                  style={{
                    display: "block",
                    fontWeight: 800,
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-text)",
                  }}
                >
                  {tier.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                  }}
                >
                  {tier.summary}
                </span>
              </div>
            </div>
            <span
              style={{
                fontWeight: 800,
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-text)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {tier.price}
            </span>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <a
          href="/book"
          style={{
            ...primaryBtn(false),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Book a free 20-min call &rarr;
        </a>
        <a
          href="/kit"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "48px",
            padding: "0 var(--space-5)",
            backgroundColor: "transparent",
            color: "var(--color-primary)",
            border: "1.5px solid var(--color-primary)",
            borderRadius: "var(--radius-md)",
            fontWeight: 700,
            fontSize: "var(--font-size-body-sm)",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Or DIY with the $29 Kit
        </a>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          lineHeight: 1.5,
        }}
      >
        The call is free. No hard sell &mdash; if the Sprint isn&rsquo;t a fit we&rsquo;ll
        tell you. Founder-led close means you talk directly to the person doing
        the work. All prices are &ldquo;from&rdquo; &mdash; final scope set on the call.
        <br />
        <a href="/organicposts" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
          See full tier details &rarr;
        </a>
      </p>
    </section>
  );
}

// --- shared styles ---
const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  padding: "0 var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body-sm)",
  boxSizing: "border-box",
};
const th: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 700,
};
const td: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid var(--color-border)",
};
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: 600,
          marginBottom: "var(--space-1)",
        }}
      >
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
        {hint && (
          <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> &mdash; {hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
