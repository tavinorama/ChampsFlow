"use client";

/**
 * /how-it-works — the system explaining itself.
 *
 * Renders GET /api/system/capabilities so customers see, live:
 *  - the 5-stage loop (Audit → Score → Plan → Publish → Monitor)
 *  - every tool/engine each stage uses, what it powers, the key/connection it
 *    needs, and whether it's currently connected
 *  - the always-on compliance controls
 *  - whether the platform is in live or demo mode
 *
 * This is the transparency surface: no black boxes, 100% of the machinery shown.
 */

import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/supabase-browser";

interface Tool {
  id: string;
  label: string;
  powers: string;
  key: string;
  connected: boolean;
  mockFallback?: boolean;
  euNote?: string;
  note?: string;
}
interface Stage {
  id: string;
  name: string;
  summary: string;
  tools: Tool[];
}
interface Capabilities {
  stages: Stage[];
  platform: Record<string, { label: string; connected: boolean; key: string }>;
  controls: string[];
  mode: "live" | "demo";
}

const STAGE_NUM: Record<string, string> = {
  audit: "1", score: "2", plan: "3", publish: "4", monitor: "5",
};

export default function HowItWorksPage() {
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/system/capabilities");
        if (res.ok) setCap(await res.json());
        else setErr(true);
      } catch {
        setErr(true);
      }
    })();
  }, []);

  return (
    <main style={{
      maxWidth: "880px", margin: "0 auto",
      padding: "var(--space-12) var(--space-4) var(--space-20)",
      fontFamily: "var(--font-family)", color: "var(--color-text)",
    }}>
      <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 var(--space-3) 0" }}>
        How TrustIndex AI works
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "60ch", margin: "0 0 var(--space-4) 0" }}>
        Every stage, every engine, every connection — shown live. Nothing runs
        silently. This page reads directly from the running system.
      </p>

      {cap && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-pill)",
          backgroundColor: cap.mode === "live" ? "rgba(15,180,136,0.12)" : "var(--color-surface-muted)",
          color: cap.mode === "live" ? "var(--color-success)" : "var(--color-muted)",
          fontSize: "var(--font-size-caption)", fontWeight: 700, marginBottom: "var(--space-8)",
          border: cap.mode === "live" ? "none" : "1px solid var(--color-border)",
        }}>
          {cap.mode === "live" ? "● Live mode — querying real AI engines" : "● Demo mode — deterministic sample data (no live keys connected)"}
        </div>
      )}

      {err && <p style={{ color: "var(--color-error)" }}>Could not load system status.</p>}
      {!cap && !err && <p style={{ color: "var(--color-muted)" }}>Loading system status…</p>}

      {/* The 5 stages */}
      {cap?.stages.map((stage) => (
        <section key={stage.id} style={{
          backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)", padding: "var(--space-6)", marginBottom: "var(--space-5)",
          boxShadow: "var(--shadow-card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <span style={{
              flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%",
              backgroundColor: "var(--color-primary)", color: "#fff", fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-body-sm)",
            }}>{STAGE_NUM[stage.id] ?? "•"}</span>
            <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, margin: 0 }}>{stage.name}</h2>
          </div>
          <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.65, margin: "0 0 var(--space-4) 0" }}>
            {stage.summary}
          </p>

          {stage.tools.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {stage.tools.map((t) => (
                <li key={t.id} style={{
                  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
                  gap: "var(--space-2)", padding: "var(--space-3)", backgroundColor: "var(--color-surface-muted)",
                  borderRadius: "var(--radius-md)",
                }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>{t.label}</div>
                    <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{t.powers}</div>
                    <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                      Needs: <code>{t.key}</code>
                    </div>
                    {t.euNote && <div style={{ fontSize: "var(--font-size-caption)", color: "#d97706" }}>⚠ {t.euNote}</div>}
                    {t.note && <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{t.note}</div>}
                  </div>
                  <ConnBadge connected={t.connected} mockFallback={t.mockFallback} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {/* Platform connections */}
      {cap && (
        <section style={{ marginBottom: "var(--space-5)" }}>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, marginBottom: "var(--space-3)" }}>Platform connections</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {Object.entries(cap.platform).map(([k, v]) => (
              <li key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>{v.label}</div>
                  <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>Needs: <code>{v.key}</code></div>
                </div>
                <ConnBadge connected={v.connected} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Always-on controls */}
      {cap && (
        <section style={{
          backgroundColor: "var(--color-teal-surface)", border: "1px solid var(--color-teal-border)",
          borderRadius: "var(--radius-lg)", padding: "var(--space-6)",
        }}>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
            Always-on safety &amp; compliance
          </h2>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {cap.controls.map((ctl, i) => (
              <li key={i} style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.6 }}>{ctl}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Google alignment — turns Google's own vendor-audit checklist into a trust statement */}
      <section style={{
        marginTop: "var(--space-8)",
        backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)", padding: "var(--space-6)",
      }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}>
          Aligned with Google&rsquo;s official AI-search guidance
        </h2>
        <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
          In 2026 Google published a{" "}
          <a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            generative-AI optimization guide
          </a>{" "}
          and three questions to vet any GEO vendor. Here is how we answer them &mdash; and where we go beyond Google&rsquo;s own tools.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          {[
            ["Does the advice cite official Google documentation?", "Yes. Our scoring and guidance reference Google&rsquo;s official generative-AI guide. We score crawlability and genuine, useful content &mdash; the levers Google endorses."],
            ["Is it aligned with Google&rsquo;s guidance?", "Yes. We do NOT score llms.txt, &lsquo;special AI schema&rsquo;, or artificial mentions &mdash; Google says these aren&rsquo;t required, so they don&rsquo;t affect your score. Schema is treated as standard SEO hygiene."],
            ["Does the tool admit it lacks Google&rsquo;s internal ranking data?", "Yes &mdash; explicitly. Every number is labelled measured vs. baseline. Our scores are directional, evidence-based estimates, never a claim of Google &lsquo;approval&rsquo; or access to internal ranking signals."],
          ].map(([q, a], i) => (
            <div key={i} style={{ borderLeft: "3px solid var(--color-success)", paddingLeft: "var(--space-3)" }}>
              <div style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 700, color: "var(--color-text)" }} dangerouslySetInnerHTML={{ __html: `✓ ${q}` }} />
              <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: a }} />
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: "var(--font-size-body)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}>
          Google Search Console vs. TrustIndex AI
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-caption)" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--color-muted)" }}>
                <th style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>What you get</th>
                <th style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Google Search Console AI report</th>
                <th style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>TrustIndex AI</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["AI engines covered", "Google only", "ChatGPT, Claude, Perplexity, Gemini + Google AI Overview"],
                ["Competitor benchmark", "—", "Who AI recommends instead of you"],
                ["What AI says about you", "—", "Citation evidence + sentiment per answer"],
                ["A plan to improve", "—", "Prioritized GEO plan + content drafts"],
                ["Scope", "Your own site only", "Your brand across the whole AI-answer surface"],
              ].map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{row[0]}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>{row[1]}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "var(--color-success)", fontWeight: 600 }}>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: "var(--space-3) 0 0 0" }}>
          Search Console tells you that you appeared in Google&rsquo;s AI features. TrustIndex AI tells you why, against whom, across every major AI engine &mdash; and what to do next.
        </p>
      </section>

      <p style={{ marginTop: "var(--space-8)", fontSize: "var(--font-size-body-sm)" }}>
        <a href="/account/connections" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
          → Connect your accounts &amp; keys
        </a>
      </p>
    </main>
  );
}

function ConnBadge({ connected, mockFallback }: { connected: boolean; mockFallback?: boolean }) {
  if (connected) {
    return <span style={badge("rgba(15,180,136,0.12)", "var(--color-success)")}>● Connected</span>;
  }
  return (
    <span style={badge("var(--color-surface-muted)", "var(--color-muted)")}>
      {mockFallback ? "Not connected · demo data" : "Not connected"}
    </span>
  );
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    flexShrink: 0, fontSize: "var(--font-size-caption)", fontWeight: 700,
    padding: "4px 10px", borderRadius: "var(--radius-pill)", backgroundColor: bg, color,
    whiteSpace: "nowrap",
  };
}
