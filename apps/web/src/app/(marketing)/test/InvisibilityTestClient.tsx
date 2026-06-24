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
        <Scorecard
          result={result}
          kitHref={kitHref}
          onReset={() => {
            setResult(null);
            setTestId(null);
          }}
        />
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
