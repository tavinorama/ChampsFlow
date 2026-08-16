"use client";

/**
 * AiAuditClient — the interactive AI Audit Stack questionnaire + entry result.
 *
 * Same pattern as InvisibilityTestClient (/test): page.tsx stays a server
 * component (metadata + JSON-LD + hero); all state lives here. The
 * questionnaire is data-driven from GET /api/ai-audit/meta (pains, categories,
 * niches, engines) so catalog growth changes the form with no deploy.
 *
 * State machine: intro-load -> form (4 steps) -> loading -> result | error.
 * Copy lives in ai-audit-copy.ts (pure, tested for the founder's copy rules).
 */

import { useEffect, useMemo, useState } from "react";
import {
  COPY,
  ENGINE_CARDS,
  buildEntryPayload,
  canSubmit,
  groupPains,
  painLabel,
  pickedForLine,
  withheldLine,
  type BusinessEngine,
} from "./ai-audit-copy";

// ---------------------------------------------------------------------------
// API shapes (subset actually rendered) — see apps/api/src/lib/ai-audit/types.ts
// ---------------------------------------------------------------------------

interface Meta {
  engines: BusinessEngine[];
  pains: string[];
  categories: string[];
  niches: string[];
  toolCount: number;
  catalog: { source: string; estimatesUnverified: boolean };
}

interface PickTool {
  name: string;
  url: string;
  oneLiner: string;
  monthlyCostUsd: number;
  setupEffort: string;
  hoursSavedWeekly: number;
}

interface EntryResponse {
  entry: {
    pick: { tool: PickTool; matchedPains: string[] } | null;
    reason: string;
    totalMatched: number;
    withheldCount: number;
    painSummary: string;
    empty: boolean;
  };
  upsell: {
    limitation: string;
    fullAudit: { name: string; gets: string; bundledWith: string };
    alsoOffer: string;
  };
  catalog: { source: string; estimatesUnverified: boolean };
}

// ---------------------------------------------------------------------------
// Shared styles — mirrors the /test client conventions (inline + CSS vars)
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  };
}

function ghostBtn(): React.CSSProperties {
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
  };
}

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    border: selected
      ? "1.5px solid var(--color-primary)"
      : "1px solid var(--color-border)",
    borderRadius: "var(--radius-pill)",
    padding: "8px 14px",
    fontSize: "var(--font-size-body-sm)",
    fontWeight: 600,
    color: selected ? "var(--color-primary)" : "var(--color-text)",
    background: selected ? "rgba(39,201,138,0.10)" : "var(--color-surface-muted)",
    cursor: "pointer",
    fontFamily: "var(--font-family)",
    minHeight: "40px",
  };
}

function sectionLabel(text: string) {
  return (
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
      {text}
    </p>
  );
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2
        style={{
          margin: "0 0 var(--space-1) 0",
          fontSize: "var(--font-size-h3)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
        }}
      >
        {hint}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------

function ResultPanel({
  data,
  businessType,
  onRestart,
}: {
  data: EntryResponse;
  businessType: string;
  onRestart: () => void;
}) {
  const { entry, upsell, catalog } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {entry.empty || !entry.pick ? (
        // Honest empty state: no niche fit, book a call.
        <div style={cardStyle} role="status">
          {sectionLabel(COPY.result.kicker)}
          <h2
            style={{
              margin: 0,
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
            }}
          >
            {COPY.result.emptyTitle}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.7,
            }}
          >
            {COPY.result.emptyBody}
          </p>
          {entry.reason && (
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>
              {entry.reason}
            </p>
          )}
          <a href="/book" style={primaryBtn(false)}>
            {COPY.result.emptyCta}
          </a>
        </div>
      ) : (
        <div style={{ ...cardStyle, borderColor: "rgba(39,201,138,0.45)" }}>
          {sectionLabel(COPY.result.kicker)}
          <h2
            style={{
              margin: 0,
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
            }}
          >
            {entry.pick.tool.name}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body)",
              color: "var(--color-text)",
              lineHeight: 1.6,
            }}
          >
            {entry.pick.tool.oneLiner}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
            }}
          >
            {pickedForLine(businessType)} {entry.reason}
          </p>
          {entry.painSummary && (
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              {entry.painSummary}
            </p>
          )}
          {entry.pick.matchedPains.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 var(--space-2) 0",
                  fontSize: "var(--font-size-caption)",
                  fontWeight: 700,
                  color: "var(--color-muted)",
                }}
              >
                {COPY.result.matchedPains}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  margin: 0,
                  padding: 0,
                }}
              >
                {entry.pick.matchedPains.map((p) => (
                  <li
                    key={p}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-pill)",
                      padding: "4px 10px",
                      fontSize: "var(--font-size-caption)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      background: "var(--color-surface-muted)",
                    }}
                  >
                    {painLabel(p)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <a
            href={entry.pick.tool.url}
            target="_blank"
            rel="noopener noreferrer"
            style={ghostBtn()}
          >
            {COPY.result.visitTool}
          </a>
          {/* The honest limitation, in the API's own words. */}
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
              borderTop: "1px solid var(--color-border)",
              paddingTop: "var(--space-3)",
            }}
          >
            {upsell.limitation} {withheldLine(entry.totalMatched, entry.withheldCount)}
          </p>
          {catalog.estimatesUnverified && (
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                lineHeight: 1.5,
              }}
            >
              {COPY.result.estimatesNote}
            </p>
          )}
        </div>
      )}

      {/* The upsell ladder, exactly as the API returns it. */}
      <div style={cardStyle}>
        {sectionLabel(COPY.result.upsellTitle)}
        <h3
          style={{
            margin: 0,
            fontSize: "var(--font-size-h3)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
          }}
        >
          {upsell.fullAudit.name}
        </h3>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.7 }}>
          {upsell.fullAudit.gets}
        </p>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>
          {upsell.fullAudit.bundledWith}
        </p>
        <a href="/organicposts" style={primaryBtn(false)}>
          {COPY.result.fullAuditCta}
        </a>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>
          {upsell.alsoOffer}
        </p>
        <a href="/" style={ghostBtn()}>
          {COPY.result.geoCta}
        </a>
      </div>

      <div>
        <button
          type="button"
          onClick={onRestart}
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
          &larr; {COPY.result.restart}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 4;

export function AiAuditClient() {
  // Vocabulary from the API
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState(false);

  // Answers
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState("");
  const [primaryFocus, setPrimaryFocus] = useState("");
  const [engines, setEngines] = useState<BusinessEngine[]>([]);
  const [pains, setPains] = useState<string[]>([]);
  const [toolsInUseRaw, setToolsInUseRaw] = useState("");
  const [stepError, setStepError] = useState("");

  // Machine state
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<EntryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-audit/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("meta failed"))))
      .then((data: Meta) => {
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        if (!cancelled) setMetaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const painGroups = useMemo(() => (meta ? groupPains(meta.pains) : []), [meta]);

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function goNext() {
    setStepError("");
    if (step === 0 && businessType.trim().length === 0) {
      setStepError(COPY.steps.needBusiness);
      return;
    }
    if (step === 2 && pains.length === 0) {
      setStepError(COPY.steps.needPains);
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }

  async function submit() {
    setStepError("");
    if (!canSubmit({ businessType, pains })) {
      setStepError(pains.length === 0 ? COPY.steps.needPains : COPY.steps.needBusiness);
      return;
    }
    setBusy(true);
    setApiError("");
    try {
      const res = await fetch("/api/ai-audit/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildEntryPayload({ businessType, primaryFocus, pains, engines, toolsInUseRaw })
        ),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setApiError(data.message || COPY.apiError);
      } else {
        setResult((await res.json()) as EntryResponse);
      }
    } catch {
      setApiError(COPY.networkError);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setApiError("");
    setStep(0);
    setStepError("");
  }

  // ---- Loading state ----
  if (busy) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, alignItems: "center", textAlign: "center", padding: "var(--space-10) var(--space-6)" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--font-size-body)", color: "var(--color-text)" }}>
          {COPY.loading}
        </p>
      </div>
    );
  }

  // ---- Error state ----
  if (apiError) {
    return (
      <div role="alert" style={{ ...cardStyle, borderColor: "#dc2626", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--color-text)" }}>{COPY.errorTitle}</p>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          {apiError}
        </p>
        <button type="button" onClick={() => setApiError("")} style={{ ...primaryBtn(false), alignSelf: "flex-start" }}>
          {COPY.errorRetry}
        </button>
      </div>
    );
  }

  // ---- Result state ----
  if (result) {
    return <ResultPanel data={result} businessType={businessType} onRestart={restart} />;
  }

  // ---- Meta failed: the form cannot be data-driven; say so honestly ----
  if (metaError) {
    return (
      <div role="alert" style={{ ...cardStyle, borderColor: "#dc2626" }}>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--color-text)" }}>{COPY.errorTitle}</p>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          {COPY.apiError}
        </p>
      </div>
    );
  }

  // ---- Meta still loading ----
  if (!meta) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, alignItems: "center", padding: "var(--space-8)" }}>
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
          Loading the questionnaire.
        </p>
      </div>
    );
  }

  // ---- Form state (4 steps) ----
  const nicheSuggestions = meta.niches.slice(0, 8);

  return (
    <div style={cardStyle}>
      <p
        aria-live="polite"
        style={{
          margin: 0,
          fontSize: "var(--font-size-caption)",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-muted)",
        }}
      >
        Step {step + 1} of {TOTAL_STEPS}
      </p>

      {step === 0 && (
        <>
          <StepHeading title={COPY.steps.businessTitle} hint={COPY.steps.businessHint} />
          <input
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder={COPY.steps.businessPlaceholder}
            aria-label={COPY.steps.businessTitle}
            autoComplete="organization-title"
            style={inputStyle}
          />
          {nicheSuggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {nicheSuggestions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBusinessType(n)}
                  aria-pressed={businessType === n}
                  style={chipStyle(businessType === n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <StepHeading title={COPY.steps.focusTitle} hint={COPY.steps.focusHint} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {meta.categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setPrimaryFocus((cur) => (cur === cat ? "" : cat))}
                aria-pressed={primaryFocus === cat}
                style={chipStyle(primaryFocus === cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <StepHeading title={COPY.steps.enginesTitle} hint={COPY.steps.enginesHint} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
            {ENGINE_CARDS.map((card) => {
              const selected = engines.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setEngines((cur) => toggle(cur, card.id))}
                  aria-pressed={selected}
                  style={{
                    textAlign: "left",
                    border: selected ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    background: selected ? "rgba(39,201,138,0.10)" : "var(--color-surface-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-family)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1)",
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: "var(--font-size-body)", color: selected ? "var(--color-primary)" : "var(--color-text)" }}>
                    {card.title}
                  </span>
                  <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                    {card.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeading title={COPY.steps.painsTitle} hint={COPY.steps.painsHint} />
          {painGroups.map(({ group, pains: slugs }) => (
            <div key={group}>
              <p
                style={{
                  margin: "0 0 var(--space-2) 0",
                  fontSize: "var(--font-size-caption)",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-muted)",
                }}
              >
                {group}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {slugs.map((slug) => {
                  const selected = pains.includes(slug);
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setPains((cur) => toggle(cur, slug))}
                      aria-pressed={selected}
                      style={chipStyle(selected)}
                    >
                      {painLabel(slug)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 3 && (
        <>
          <StepHeading title={COPY.steps.toolsTitle} hint={COPY.steps.toolsHint} />
          <input
            value={toolsInUseRaw}
            onChange={(e) => setToolsInUseRaw(e.target.value)}
            placeholder={COPY.steps.toolsPlaceholder}
            aria-label={COPY.steps.toolsTitle}
            autoComplete="off"
            style={inputStyle}
          />
        </>
      )}

      {stepError && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-error)", fontFamily: "var(--font-family)" }}>
          {stepError}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => {
            setStepError("");
            setStep((s) => Math.max(0, s - 1));
          }}
          disabled={step === 0}
          style={{ ...ghostBtn(), visibility: step === 0 ? "hidden" : "visible" }}
        >
          {COPY.steps.back}
        </button>
        {step < TOTAL_STEPS - 1 ? (
          <button type="button" onClick={goNext} style={primaryBtn(false)}>
            {COPY.steps.next}
          </button>
        ) : (
          <button type="button" onClick={submit} style={primaryBtn(false)}>
            {COPY.steps.submit}
          </button>
        )}
      </div>
    </div>
  );
}
