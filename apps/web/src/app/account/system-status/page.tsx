"use client";

/**
 * /account/system-status — Live operational status for authenticated users.
 *
 * Preserves the full transparency surface previously on /how-it-works:
 *  - Live/demo mode badge
 *  - 5-stage tool cards (label, powers, "Needs: <key>", euNote, note, ConnBadge)
 *  - Platform connections list
 *  - Always-on safety & compliance controls
 *
 * This page is authenticated app chrome (no marketing nav/footer).
 */

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/supabase-browser";
import { BottomNav } from "../../../components/BottomNav";

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
  audit: "1",
  score: "2",
  plan: "3",
  publish: "4",
  monitor: "5",
};

export default function SystemStatusPage() {
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
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--color-surface-muted)",
        paddingBottom: "calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))",
        fontFamily: "var(--font-family)",
      }}
    >
      {/* Page header */}
      <header
        style={{
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          padding: "0 var(--space-4)",
          height: "48px",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <a
          href="/account"
          aria-label="Back to Account"
          style={{
            color: "var(--color-primary)",
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
            minHeight: "var(--min-tap-target, 44px)",
            display: "flex",
            alignItems: "center",
          }}
        >
          &#8592; Back
        </a>
        <h1
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 600,
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          System Status
        </h1>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{
          maxWidth: "880px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) var(--space-12)",
        }}
      >
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            maxWidth: "60ch",
            margin: "0 0 var(--space-6) 0",
          }}
        >
          Every stage, every engine, every connection — shown live. This page reads
          directly from the running system so nothing runs silently.
        </p>

        {/* Live / demo badge */}
        {cap && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              borderRadius: "var(--radius-pill)",
              backgroundColor:
                cap.mode === "live"
                  ? "var(--color-badge-connected-bg)"
                  : "var(--color-surface-muted)",
              color:
                cap.mode === "live"
                  ? "var(--color-badge-connected-text)"
                  : "var(--color-muted)",
              fontSize: "var(--font-size-caption)",
              fontWeight: 700,
              marginBottom: "var(--space-8)",
              border:
                cap.mode === "live"
                  ? "none"
                  : "1px solid var(--color-border)",
            }}
            aria-live="polite"
          >
            {cap.mode === "live"
              ? "● Live mode — querying real AI engines"
              : "● Demo mode — deterministic sample data (no live keys connected)"}
          </div>
        )}

        {err && (
          <p role="alert" style={{ color: "var(--color-error)" }}>
            Could not load system status.
          </p>
        )}
        {!cap && !err && (
          <p aria-busy="true" style={{ color: "var(--color-muted)" }}>
            Loading system status…
          </p>
        )}

        {/* The 5 stages */}
        {cap?.stages.map((stage) => (
          <section
            key={stage.id}
            aria-labelledby={`stage-${stage.id}-heading`}
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-6)",
              marginBottom: "var(--space-5)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--font-size-body-sm)",
                }}
              >
                {STAGE_NUM[stage.id] ?? "•"}
              </span>
              <h2
                id={`stage-${stage.id}-heading`}
                style={{
                  fontSize: "var(--font-size-h2)",
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {stage.name}
              </h2>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.65,
                margin: "0 0 var(--space-4) 0",
              }}
            >
              {stage.summary}
            </p>

            {stage.tools.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {stage.tools.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface-muted)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "var(--font-size-body-sm)",
                        }}
                      >
                        {t.label}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-muted)",
                        }}
                      >
                        {t.powers}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-muted)",
                        }}
                      >
                        Needs: <code>{t.key}</code>
                      </div>
                      {t.euNote && (
                        <div
                          style={{
                            fontSize: "var(--font-size-caption)",
                            color: "var(--color-note-warn)",
                          }}
                        >
                          &#9888; {t.euNote}
                        </div>
                      )}
                      {t.note && (
                        <div
                          style={{
                            fontSize: "var(--font-size-caption)",
                            color: "var(--color-muted)",
                          }}
                        >
                          {t.note}
                        </div>
                      )}
                    </div>
                    <ConnBadge
                      connected={t.connected}
                      mockFallback={t.mockFallback}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Platform connections */}
        {cap && (
          <section
            aria-labelledby="platform-connections-heading"
            style={{ marginBottom: "var(--space-5)" }}
          >
            <h2
              id="platform-connections-heading"
              style={{
                fontSize: "var(--font-size-h3)",
                fontWeight: 700,
                marginBottom: "var(--space-3)",
              }}
            >
              Platform connections
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              {Object.entries(cap.platform).map(([k, v]) => (
                <li
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-3)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-size-body-sm)",
                      }}
                    >
                      {v.label}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Needs: <code>{v.key}</code>
                    </div>
                  </div>
                  <ConnBadge connected={v.connected} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Always-on safety & compliance */}
        {cap && (
          <section
            aria-labelledby="safety-controls-heading"
            style={{
              backgroundColor: "var(--color-teal-surface)",
              border: "1px solid var(--color-teal-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-6)",
            }}
          >
            <h2
              id="safety-controls-heading"
              style={{
                fontSize: "var(--font-size-h3)",
                fontWeight: 700,
                margin: "0 0 var(--space-3) 0",
              }}
            >
              Always-on safety &amp; compliance
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: "var(--space-5)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              {cap.controls.map((ctl, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-text)",
                    lineHeight: 1.6,
                  }}
                >
                  {ctl}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Link to connections */}
        <p style={{ marginTop: "var(--space-8)", fontSize: "var(--font-size-body-sm)" }}>
          <a
            href="/account/connections"
            style={{ color: "var(--color-primary)", fontWeight: 700 }}
          >
            &#8594; Manage platform connections
          </a>
        </p>
      </main>

      <BottomNav />

      <style>{`
        a:focus-visible,
        button:focus-visible {
          outline: var(--focus-outline-width, 3px) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset, 2px);
        }
      `}</style>
    </div>
  );
}

function ConnBadge({
  connected,
  mockFallback,
}: {
  connected: boolean;
  mockFallback?: boolean;
}) {
  if (connected) {
    return (
      <span style={badge("var(--color-badge-connected-bg)", "var(--color-badge-connected-text)")}>
        ● Connected
      </span>
    );
  }
  return (
    <span style={badge("var(--color-surface-muted)", "var(--color-muted)")}>
      {mockFallback ? "Not connected · demo data" : "Not connected"}
    </span>
  );
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: "var(--font-size-caption)",
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: bg,
    color,
    whiteSpace: "nowrap",
  };
}
