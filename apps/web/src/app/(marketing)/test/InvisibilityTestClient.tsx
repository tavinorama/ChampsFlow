"use client";

/**
 * InvisibilityTestClient — interactive form + results panel.
 *
 * Extracted from page.tsx so that page.tsx can be a server component
 * (enabling metadata + JSON-LD exports).
 *
 * State machine: form → loading → results (or error → form)
 * Email is now REQUIRED and validated before submit.
 */

import { useState, useRef, useEffect, useId } from "react";
import { TrustIndexScorecard } from "../../../components/TrustIndexScorecard";

// ---------------------------------------------------------------------------
// Engine label map
// ---------------------------------------------------------------------------

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overview",
};

// ---------------------------------------------------------------------------
// Types — match the API shape exactly
// ---------------------------------------------------------------------------

interface EngineResult {
  engine: string;
  live: boolean;
  brandCited: boolean;
  brandPosition: number | null;
  competitorCited: boolean;
}

interface ScoreBreakdown {
  ai: { citationRate: number; avgPosition: number | null; sentiment: string; note: string };
  performance: { schemaCoverage: number; aiCrawlerAccess: number; note: string };
  brand: { entityCompleteness: number; note: string };
}

interface Recommendation {
  plan: "kit" | "growth" | "agency" | "call";
  reason: string;
  href: string;
}

interface FreeTestResult {
  prompt: string;
  live: boolean;
  engines: EngineResult[];
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  enginesLive: number;
  domain: string | null;
  verdict: string;
  status: "invisible" | "trailing" | "competitive" | "leading";
  score: {
    ai: number;
    performance: number;
    brand: number;
    overall: number;
  };
  breakdown: ScoreBreakdown;
  recommendations: Recommendation[];
}

// ---------------------------------------------------------------------------
// Status color map
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<FreeTestResult["status"], string> = {
  invisible: "#dc2626",
  trailing: "#d97706",
  competitive: "#7c3aed",
  leading: "var(--color-success)",
};

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

// ---------------------------------------------------------------------------
// Recommendation CTA labels
// ---------------------------------------------------------------------------

const PLAN_LABEL: Record<Recommendation["plan"], string> = {
  kit: "Get the Kit — $29 →",
  growth: "Start Growth Plan →",
  agency: "Start Agency Plan →",
  call: "Book a free 20-min call →",
};

// ---------------------------------------------------------------------------
// Injected responsive styles (one-time, no library needed)
// ---------------------------------------------------------------------------

const CLIENT_STYLES = `
  .ti-test-engine-table {
    display: table;
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-body-sm);
  }
  .ti-test-engine-cards {
    display: none;
    flex-direction: column;
    gap: var(--space-3);
  }
  @media (max-width: 640px) {
    .ti-test-engine-table { display: none; }
    .ti-test-engine-cards { display: flex; }
  }
  .ti-test-focus :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  .ti-test-spinner {
    display: inline-block;
    width: 28px;
    height: 28px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: ti-spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes ti-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ti-test-spinner { animation: none; border-top-color: var(--color-primary); }
  }
`;

function useClientStyles() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    if (typeof document === "undefined") return;
    if (document.getElementById("ti-test-client-styles")) {
      injected.current = true;
      return;
    }
    const el = document.createElement("style");
    el.id = "ti-test-client-styles";
    el.textContent = CLIENT_STYLES;
    document.head.appendChild(el);
    injected.current = true;
  }, []);
}

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

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
  fontFamily: "var(--font-family)",
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: "1.5px solid var(--color-error)",
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
    fontFamily: "var(--font-family)",
    width: "100%",
  };
}

function purpleBtn(): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body-sm)",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-family)",
    width: "100%",
  };
}

function outlinedBtn(): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "transparent",
    color: "var(--color-primary)",
    border: "1.5px solid var(--color-primary)",
    borderRadius: "var(--radius-md)",
    fontWeight: 700,
    fontSize: "var(--font-size-body-sm)",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-family)",
    width: "100%",
  };
}

const th: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 700,
  textAlign: "left",
  color: "var(--color-muted)",
};
const td: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid var(--color-border)",
};

// ---------------------------------------------------------------------------
// Field wrapper — wires label to input via htmlFor
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  required,
  fieldId,
  errorId,
  errorMessage,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  fieldId: string;
  errorId?: string;
  errorMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <label
        htmlFor={fieldId}
        style={{
          fontSize: "var(--font-size-body-sm)",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--color-error)" }} aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
        {hint && (
          <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> &mdash; {hint}</span>
        )}
      </label>
      {children}
      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-error)",
            fontFamily: "var(--font-family)",
          }}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading panel
// ---------------------------------------------------------------------------

function LoadingPanel({ brand, domain }: { brand: string; domain: string | null }) {
  const displayBrand = brand || "your brand";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Running AI visibility test"
      style={{
        ...cardStyle,
        alignItems: "center",
        textAlign: "center",
        padding: "var(--space-10) var(--space-6)",
        gap: "var(--space-5)",
      }}
    >
      <div className="ti-test-spinner" aria-hidden="true" />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
            lineHeight: 1.5,
          }}
        >
          Asking ChatGPT, Claude, Perplexity &amp; Gemini about{" "}
          <strong>{displayBrand}</strong>&hellip;
        </p>
        {domain && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.5,
            }}
          >
            Scanning <strong>{domain}</strong> for AI signals&hellip;
          </p>
        )}
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
          }}
        >
          This takes ~20&ndash;40 seconds &mdash; we run real API calls across 4 engines.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error panel
// ---------------------------------------------------------------------------

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        ...cardStyle,
        borderColor: "#dc2626",
        gap: "var(--space-3)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontWeight: 700,
          color: "var(--color-text)",
        }}
      >
        Something went wrong
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
        }}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          alignSelf: "flex-start",
          height: "44px",
          padding: "0 var(--space-5)",
          backgroundColor: "var(--color-primary)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontWeight: 700,
          fontSize: "var(--font-size-body-sm)",
          cursor: "pointer",
          fontFamily: "var(--font-family)",
        }}
      >
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-engine breakdown — table on desktop, cards on mobile
// ---------------------------------------------------------------------------

function EngineBreakdown({
  engines,
  brandEngineCount,
  totalEngines,
}: {
  engines: EngineResult[];
  brandEngineCount: number;
  totalEngines: number;
}) {
  return (
    <div>
      {/* Desktop table */}
      <table
        className="ti-test-engine-table"
        aria-label="AI engine citation breakdown"
      >
        <caption
          style={{
            textAlign: "left",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: 700,
            color: "var(--color-text)",
            marginBottom: "var(--space-3)",
            captionSide: "top",
          }}
        >
          Per-engine breakdown
        </caption>
        <thead>
          <tr>
            <th style={th} scope="col">AI engine</th>
            <th style={th} scope="col">Status</th>
            <th style={th} scope="col">You cited</th>
            <th style={th} scope="col">Position</th>
            <th style={th} scope="col">Competitor cited</th>
          </tr>
        </thead>
        <tbody>
          {engines.map((e) => (
            <tr key={e.engine}>
              <td style={{ ...td, fontWeight: 600 }}>
                {ENGINE_LABEL[e.engine] ?? e.engine}
              </td>
              <td style={td}>
                {e.live ? (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      backgroundColor: "rgba(22,163,74,0.1)",
                      color: "var(--color-success)",
                      fontSize: "var(--font-size-caption)",
                      fontWeight: 700,
                    }}
                  >
                    Live
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      backgroundColor: "var(--color-surface-muted)",
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      fontWeight: 700,
                    }}
                  >
                    Demo
                  </span>
                )}
              </td>
              <td
                style={{
                  ...td,
                  color: e.brandCited ? "var(--color-success)" : "#dc2626",
                  fontWeight: 700,
                }}
              >
                {e.brandCited ? "Cited ✓" : "Not cited ✗"}
              </td>
              <td style={td}>
                {e.brandPosition != null ? `#${e.brandPosition}` : "—"}
              </td>
              <td
                style={{
                  ...td,
                  color: e.competitorCited ? "#d97706" : "var(--color-muted)",
                }}
              >
                {e.competitorCited ? "Cited" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile stacked cards */}
      <div className="ti-test-engine-cards" aria-label="AI engine citation breakdown">
        {engines.map((e) => (
          <div
            key={e.engine}
            role="region"
            aria-label={`${ENGINE_LABEL[e.engine] ?? e.engine} result`}
            style={{
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-2)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
                {ENGINE_LABEL[e.engine] ?? e.engine}
              </span>
              {e.live ? (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    backgroundColor: "rgba(22,163,74,0.1)",
                    color: "var(--color-success)",
                    fontSize: "var(--font-size-caption)",
                    fontWeight: 700,
                  }}
                >
                  Live
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    backgroundColor: "var(--color-surface-muted)",
                    color: "var(--color-muted)",
                    fontSize: "var(--font-size-caption)",
                    fontWeight: 700,
                  }}
                >
                  Demo
                </span>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--space-2)",
                fontSize: "var(--font-size-caption)",
              }}
            >
              <div>
                <div style={{ color: "var(--color-muted)", marginBottom: "2px" }}>You</div>
                <div
                  style={{
                    fontWeight: 700,
                    color: e.brandCited ? "var(--color-success)" : "#dc2626",
                  }}
                >
                  {e.brandCited ? "Cited ✓" : "Not cited ✗"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-muted)", marginBottom: "2px" }}>Position</div>
                <div style={{ fontWeight: 700 }}>
                  {e.brandPosition != null ? `#${e.brandPosition}` : "—"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-muted)", marginBottom: "2px" }}>Competitor</div>
                <div
                  style={{
                    fontWeight: 700,
                    color: e.competitorCited ? "#d97706" : "var(--color-muted)",
                  }}
                >
                  {e.competitorCited ? "Cited" : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary line */}
      <p
        style={{
          marginTop: "var(--space-3)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
        }}
      >
        Cited on <strong>{brandEngineCount} of {totalEngines}</strong> engines.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vector notes
// ---------------------------------------------------------------------------

function VectorNotes({ breakdown }: { breakdown: ScoreBreakdown }) {
  const notes: Array<{ label: string; note: string }> = [
    { label: "AI Visibility", note: breakdown.ai.note },
    { label: "Site Performance", note: breakdown.performance.note },
    { label: "Brand Authority", note: breakdown.brand.note },
  ];
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      aria-label="Score vector notes"
    >
      {notes.map(({ label, note }) => (
        <div
          key={label}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            backgroundColor: "var(--color-surface-muted)",
          }}
        >
          <p
            style={{
              margin: "0 0 var(--space-1) 0",
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-muted)",
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.6,
              color: "var(--color-text)",
            }}
          >
            {note}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation CTAs
// ---------------------------------------------------------------------------

function RecommendationCards({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <section aria-labelledby="rec-heading">
      <h2
        id="rec-heading"
        style={{
          margin: "0 0 var(--space-4) 0",
          fontSize: "var(--font-size-h3)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
        }}
      >
        Your personalized next steps
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {recommendations.map((rec) => {
          const ctaLabel = PLAN_LABEL[rec.plan];
          const isKit = rec.plan === "kit";
          const isPrimary = isKit;
          const isPurple = rec.plan === "growth" || rec.plan === "agency";
          const isOutlined = rec.plan === "call";

          return (
            <div
              key={rec.plan}
              role="region"
              aria-label={`${rec.plan} recommendation`}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-5)",
                backgroundColor: "var(--color-surface)",
                boxShadow: "var(--shadow-card)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-muted)",
                  lineHeight: 1.6,
                }}
              >
                {rec.reason}
              </p>
              <a
                href={rec.href}
                style={
                  isPrimary
                    ? {
                        ...primaryBtn(false),
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textDecoration: "none",
                      }
                    : isPurple
                    ? purpleBtn()
                    : isOutlined
                    ? outlinedBtn()
                    : primaryBtn(false)
                }
              >
                {ctaLabel}
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Results panel
// ---------------------------------------------------------------------------

function ResultsPanel({
  result,
  brand,
  kitHref,
  onReset,
}: {
  result: FreeTestResult;
  brand: string;
  kitHref: string;
  onReset: () => void;
}) {
  const statusColor = STATUS_COLOR[result.status];
  const capitalizedStatus =
    result.status.charAt(0).toUpperCase() + result.status.slice(1);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}
    >
      {/* A) Status badge + verdict headline */}
      <div
        style={{
          ...cardStyle,
          borderColor: statusColor,
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: statusColor,
              border: `1.5px solid ${statusColor}`,
              borderRadius: "var(--radius-pill)",
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {capitalizedStatus}
          </span>
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--font-size-h2)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            color: "var(--color-text)",
          }}
        >
          {result.verdict}
        </h2>
      </div>

      {/* B) Prompt block */}
      <div
        style={cardStyle}
        aria-label="The buyer prompt sent to AI engines"
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-muted)",
          }}
        >
          We asked the AI engines:
        </p>
        <blockquote
          style={{
            margin: 0,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            backgroundColor: "var(--color-surface-muted)",
            fontSize: "var(--font-size-body-sm)",
            lineHeight: 1.7,
            fontStyle: "italic",
            color: "var(--color-text)",
          }}
        >
          &ldquo;{result.prompt}&rdquo;
        </blockquote>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          <strong>{result.enginesLive} of {result.totalEngines}</strong> engines responded live.
          {!result.live && (
            <span> (demo data &mdash; live engines activate once provider keys are connected)</span>
          )}
        </p>
      </div>

      {/* C) TrustIndex Scorecard */}
      <div style={cardStyle}>
        <TrustIndexScorecard
          overall={result.score.overall}
          vectors={{
            ai: result.score.ai,
            performance: result.score.performance,
            brand: result.score.brand,
          }}
          probeSummary={`${result.enginesLive} of ${result.totalEngines} engines live`}
          brandName={brand}
          compact={false}
        />
      </div>

      {/* D) Per-engine breakdown */}
      <div style={cardStyle}>
        <EngineBreakdown
          engines={result.engines}
          brandEngineCount={result.brandEngineCount}
          totalEngines={result.totalEngines}
        />
      </div>

      {/* E) Vector notes */}
      <div style={cardStyle}>
        <VectorNotes breakdown={result.breakdown} />
      </div>

      {/* F) Recommendation CTAs */}
      <div style={cardStyle}>
        <RecommendationCards recommendations={result.recommendations} />
      </div>

      {/* G) Reset link */}
      <div>
        <button
          type="button"
          onClick={onReset}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-primary)",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "var(--font-size-body-sm)",
            padding: "var(--space-2) 0",
            minHeight: "44px",
            fontFamily: "var(--font-family)",
          }}
        >
          &larr; Test another brand
        </button>
      </div>

      {/* H) Disclaimer */}
      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
        }}
      >
        Results are evidence-based estimates. AI answers are non-deterministic &mdash; this is a
        directional snapshot, not a guarantee of citation.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function InvisibilityTestClient() {
  useClientStyles();

  // Form state
  const [brand, setBrand] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [competitor2, setCompetitor2] = useState("");
  const [competitor3, setCompetitor3] = useState("");
  const [extraComp, setExtraComp] = useState(0); // 0, 1 or 2 extra competitor fields shown
  const [category, setCategory] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("United States");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Machine state
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FreeTestResult | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");

  // Stable IDs for accessible label wiring
  const brandId = useId();
  const competitorId = useId();
  const competitor2Id = useId();
  const competitor3Id = useId();
  const categoryId = useId();
  const sectorId = useId();
  const countryId = useId();
  const emailId = useId();
  const emailErrorId = useId();

  // Derive domain from brand (best-effort)
  const derivedDomain: string | null = null; // backend derives it; we don't have explicit field

  // Country select → engine routing region (EU countries route GDPR-safe).
  const EU_COUNTRIES = ["Portugal", "Germany", "United Kingdom", "Spain"];
  const region: "US" | "EU" = EU_COUNTRIES.includes(country) ? "EU" : "US";
  // Up to 3 competitors, de-duplicated + non-empty.
  const competitors = [competitor, competitor2, competitor3]
    .map((c) => c.trim())
    .filter((c, i, a) => c.length > 0 && a.indexOf(c) === i)
    .slice(0, 3);

  // Email validation
  const showEmailError =
    email.length > 0 && (emailTouched || submitAttempted) && !isValidEmail(email);
  const emailMissing = submitAttempted && email.trim() === "";
  const emailErrorMessage = emailMissing
    ? "Email is required"
    : showEmailError
    ? "Please enter a valid email address"
    : undefined;

  const canSubmit =
    brand.trim().length > 0 &&
    category.trim().length > 0 &&
    email.trim().length > 0 &&
    isValidEmail(email);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!canSubmit || busy) return;

    setBusy(true);
    setApiError("");

    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          competitor: competitors[0] ?? "",
          competitors,
          category: category.trim(),
          sector,
          country,
          region,
          email: email.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data as { error?: string }).error ||
          "Could not run the test right now. Please try again.";
        setApiError(msg);
      } else {
        const data = await res.json();
        setResult(data.result);
        setTestId(data.testId ?? null);
      }
    } catch {
      setApiError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setTestId(null);
    setApiError("");
    setSubmitAttempted(false);
    setEmailTouched(false);
  }

  // Kit href with testId + context params
  const kitParams = new URLSearchParams();
  if (testId) kitParams.set("testId", testId);
  if (brand.trim()) kitParams.set("brand", brand.trim());
  if (category.trim()) kitParams.set("category", category.trim());
  kitParams.set("region", region);
  const kitHref = `/kit?${kitParams.toString()}`;

  // ---- Loading state — replace form entirely ----
  if (busy) {
    return (
      <LoadingPanel
        brand={brand}
        domain={derivedDomain}
      />
    );
  }

  // ---- Error state — show error panel, re-enables form on retry ----
  if (apiError && !result) {
    return (
      <ErrorPanel
        message={apiError}
        onRetry={() => {
          setApiError("");
          setSubmitAttempted(false);
        }}
      />
    );
  }

  // ---- Results state ----
  if (result) {
    return (
      <ResultsPanel
        result={result}
        brand={brand}
        kitHref={kitHref}
        onReset={reset}
      />
    );
  }

  // ---- Form state ----
  return (
    <form
      onSubmit={run}
      noValidate
      className="ti-test-focus"
      style={cardStyle}
      aria-label="AI Invisibility Test form"
    >
      <Field
        label="Your brand"
        required
        fieldId={brandId}
      >
        <input
          id={brandId}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Acme CRM"
          required
          autoComplete="organization"
          style={inputStyle}
        />
      </Field>

      <Field
        label="Competitors"
        hint="optional — up to 3; we compare you head-to-head"
        fieldId={competitorId}
      >
        <input
          id={competitorId}
          value={competitor}
          onChange={(e) => setCompetitor(e.target.value)}
          placeholder="A rival brand"
          autoComplete="off"
          style={inputStyle}
        />
        {extraComp >= 1 && (
          <input
            id={competitor2Id}
            value={competitor2}
            onChange={(e) => setCompetitor2(e.target.value)}
            placeholder="Another competitor"
            autoComplete="off"
            aria-label="Second competitor"
            style={{ ...inputStyle, marginTop: "var(--space-2)" }}
          />
        )}
        {extraComp >= 2 && (
          <input
            id={competitor3Id}
            value={competitor3}
            onChange={(e) => setCompetitor3(e.target.value)}
            placeholder="A third competitor"
            autoComplete="off"
            aria-label="Third competitor"
            style={{ ...inputStyle, marginTop: "var(--space-2)" }}
          />
        )}
        {extraComp < 2 && (
          <button
            type="button"
            onClick={() => setExtraComp((n) => Math.min(2, n + 1))}
            style={{
              marginTop: "var(--space-2)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-accent-ink, var(--color-primary))",
              fontWeight: 600,
              fontSize: "var(--font-size-body-sm)",
              fontFamily: "var(--font-family)",
            }}
          >
            + Add another competitor
          </button>
        )}
      </Field>

      <Field
        label="Your category"
        required
        hint="how buyers describe what you sell"
        fieldId={categoryId}
      >
        <input
          id={categoryId}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="CRM, accounting software, law firm…"
          required
          autoComplete="off"
          style={inputStyle}
        />
      </Field>

      <Field label="Sector" hint="so we localise the buyer prompts" fieldId={sectorId}>
        <select
          id={sectorId}
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          style={inputStyle}
        >
          <option value="">Select your sector</option>
          {["Professional services", "Local services", "B2B SaaS", "E-commerce / DTC", "Agency", "Healthcare", "Other"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>

      <Field label="Country" hint="GDPR-safe routing for EU countries" fieldId={countryId}>
        <select
          id={countryId}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={inputStyle}
        >
          {["Brazil", "United States", "Portugal", "Germany", "United Kingdom", "Spain", "Other"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <Field
        label="Your email"
        required
        hint="We'll email your full snapshot — a copy you can share."
        fieldId={emailId}
        errorId={emailErrorId}
        errorMessage={emailErrorMessage}
      >
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="you@company.com"
          required
          autoComplete="email"
          aria-describedby={emailErrorMessage ? emailErrorId : undefined}
          aria-invalid={emailErrorMessage ? "true" : undefined}
          style={emailErrorMessage ? inputErrorStyle : inputStyle}
        />
      </Field>

      <button
        type="submit"
        disabled={!canSubmit}
        style={primaryBtn(!canSubmit)}
        aria-disabled={!canSubmit}
      >
        Run my free test
      </button>
    </form>
  );
}
