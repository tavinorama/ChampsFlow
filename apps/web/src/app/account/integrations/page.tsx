"use client";

/**
 * /account/integrations — AI engines, keys & tool connections.
 *
 * The connection surface customers asked for: see every AI engine / SERP / MCP
 * the audit uses, what it needs, whether it's connected, and (BYOK) a slot to
 * provide their own API key. Each row explains what the connection powers and
 * what data it accesses — full transparency before they connect anything.
 *
 * Live status comes from GET /api/system/capabilities. BYOK key submission
 * posts to /api/account/provider-keys (stored encrypted; never returned).
 */

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/supabase-browser";

interface Tool {
  id: string; label: string; powers: string; key: string;
  connected: boolean; mockFallback?: boolean; euNote?: string; note?: string;
}
interface Stage { id: string; name: string; tools: Tool[] }
interface Capabilities { stages: Stage[]; mode: "live" | "demo" }

// Which provider tools accept a customer-supplied (BYOK) key.
const BYOK = new Set(["anthropic", "openai", "gemini", "perplexity", "serp"]);

export default function IntegrationsPage() {
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/system/capabilities");
        if (res.ok) setCap(await res.json());
        else setErr(true);
      } catch { setErr(true); }
    })();
  }, []);

  // Flatten the AI/data tools from the audit + plan stages.
  const aiTools: Tool[] = cap
    ? cap.stages
        .filter((s) => s.id === "audit" || s.id === "plan")
        .flatMap((s) => s.tools)
        .filter((t, i, arr) => arr.findIndex((x) => x.label === t.label) === i)
    : [];
  const publishTools: Tool[] = cap
    ? cap.stages.filter((s) => s.id === "publish").flatMap((s) => s.tools)
    : [];

  return (
    <main style={{
      maxWidth: "780px", margin: "0 auto",
      padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
      fontFamily: "var(--font-family)", color: "var(--color-text)",
    }}>
      <a href="/account" style={{ color: "var(--color-primary)", textDecoration: "none", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}>← Account</a>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-4) 0 var(--space-2) 0" }}>
        AI engines, keys &amp; connections
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, margin: "0 0 var(--space-6) 0" }}>
        Connect your own AI provider keys (optional), or let Ozvor use its
        included keys. Every connection shows what it powers and what data it
        accesses. <a href="/how-it-works" style={{ color: "var(--color-primary)" }}>See how the audit works →</a>
      </p>

      {err && <p style={{ color: "var(--color-error)" }}>Could not load connection status.</p>}
      {!cap && !err && <p style={{ color: "var(--color-muted)" }}>Loading…</p>}

      {/* AI / data engines (BYOK) */}
      {aiTools.length > 0 && (
        <>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>AI search engines &amp; data</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-8)" }}>
            {aiTools.map((t) => <ProviderRow key={t.label} tool={t} byok={BYOK.has(t.id)} />)}
          </div>
        </>
      )}

      {/* Publishing channels (OAuth) */}
      {publishTools.length > 0 && (
        <>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>Publishing channels</h2>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-3) 0" }}>
            Connect via secure OAuth on the <a href="/account/connections" style={{ color: "var(--color-primary)" }}>Connections</a> page. We store encrypted tokens — never your password.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {publishTools.map((t) => <ProviderRow key={t.label} tool={t} byok={false} oauth />)}
          </div>
        </>
      )}

      {/* MCP / tools — roadmap */}
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "var(--space-8) 0 var(--space-3) 0" }}>Tool connectors (MCP)</h2>
      <div style={{ padding: "var(--space-5)", border: "1px dashed var(--color-border)", borderRadius: "var(--radius-md)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
        Connect external tools (analytics, CRM, CMS) via MCP for richer signal and
        publishing. <strong>Coming soon</strong> — you&rsquo;ll authorize each tool here and
        see exactly what data it reads or writes before enabling it.
      </div>
    </main>
  );
}

function ProviderRow({ tool, byok, oauth }: { tool: Tool; byok: boolean; oauth?: boolean }) {
  const [open, setOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveKey() {
    if (!keyVal.trim() || saving) return;
    setSaving(true);
    try {
      // Stored encrypted server-side; the value is never returned to the client.
      const res = await apiFetch("/api/account/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tool.id, key: keyVal.trim() }),
      });
      if (res.ok) { setSaved(true); setKeyVal(""); setOpen(false); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", backgroundColor: "var(--color-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{tool.label}</div>
          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{tool.powers}</div>
          {tool.euNote && <div style={{ fontSize: "var(--font-size-caption)", color: "#d97706" }}>⚠ {tool.euNote}</div>}
          {tool.note && <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{tool.note}</div>}
        </div>
        <span style={{
          flexShrink: 0, fontSize: "var(--font-size-caption)", fontWeight: 700, padding: "4px 10px",
          borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
          backgroundColor: (tool.connected || saved) ? "rgba(15,180,136,0.12)" : "var(--color-surface-muted)",
          color: (tool.connected || saved) ? "var(--color-success)" : "var(--color-muted)",
          border: (tool.connected || saved) ? "none" : "1px solid var(--color-border)",
        }}>
          {tool.connected ? "● Platform key active" : saved ? "● Your key saved" : tool.mockFallback ? "Demo data" : "Not connected"}
        </span>
      </div>

      {byok && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {!open ? (
            <button onClick={() => setOpen(true)} style={linkBtn}>+ Use my own API key (BYOK)</button>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <input
                type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)}
                placeholder={`Paste your ${tool.label} API key`} autoComplete="off"
                style={{ flex: "1 1 240px", minWidth: 0, height: "40px", padding: "0 var(--space-3)", fontSize: "var(--font-size-body-sm)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }}
              />
              <button onClick={saveKey} disabled={saving || !keyVal.trim()} style={{ ...solidBtn, opacity: saving || !keyVal.trim() ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save key"}
              </button>
            </div>
          )}
          <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", margin: "var(--space-2) 0 0 0" }}>
            Stored encrypted (AES-256-GCM). Never displayed again or sent to the browser.
          </p>
        </div>
      )}

      {oauth && !tool.connected && (
        <a href="/account/connections" style={{ ...linkBtn, display: "inline-block", marginTop: "var(--space-3)" }}>
          Connect via OAuth →
        </a>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "var(--color-primary)",
  fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: "pointer", textDecoration: "none",
};
const solidBtn: React.CSSProperties = {
  height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: "pointer",
};
