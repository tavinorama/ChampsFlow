"use client";

/**
 * /account/api-keys — D2 Public API key management.
 *
 * Create, list, and revoke tenant-scoped API keys for the read-only public API
 * (/api/v1/*). The secret is shown exactly once, at creation, in a copy-once
 * box — the server only ever stores its hash. Includes inline docs (base URL,
 * auth header, endpoints, a curl example) so a developer can go from key → first
 * call without leaving the page.
 *
 * Backend: routes/api-keys.ts
 *   GET/POST/DELETE /api/account/api-keys (JWT, owner to mutate)
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/supabase-browser";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface CreatedKey extends ApiKey {
  key: string;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Public API base — same origin (Next rewrites /api/* → Hono backend), so an
  // external caller uses the site origin. Falls back to the production domain.
  const [base, setBase] = useState("https://ozvor.com");
  useEffect(() => {
    if (typeof window !== "undefined") setBase(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/account/api-keys");
      if (res.ok) {
        const json = await res.json();
        setKeys(json.data ?? []);
      } else {
        setErr("Could not load your API keys.");
      }
    } catch {
      setErr("Could not load your API keys.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    if (creating) return;
    setCreating(true);
    setErr(null);
    setCreated(null);
    try {
      const res = await apiFetch("/api/account/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "API key" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreated(json as CreatedKey);
        setName("");
        await load();
      } else if (res.status === 403) {
        setErr("Only the account owner can create API keys.");
      } else if (res.status === 409) {
        setErr(json?.message ?? "You have reached the maximum number of active keys.");
      } else {
        setErr(json?.message ?? "Could not create the key.");
      }
    } catch {
      setErr("Could not create the key.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (revoking) return;
    if (!window.confirm("Revoke this key? Any system using it will immediately lose access.")) return;
    setRevoking(id);
    setErr(null);
    try {
      const res = await apiFetch(`/api/account/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (created?.id === id) setCreated(null);
        await load();
      } else if (res.status === 403) {
        setErr("Only the account owner can revoke API keys.");
      } else {
        setErr("Could not revoke the key.");
      }
    } catch {
      setErr("Could not revoke the key.");
    } finally {
      setRevoking(null);
    }
  }

  function copyKey(text: string) {
    try {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can select manually */
    }
  }

  const active = (keys ?? []).filter((k) => !k.revoked_at);

  return (
    <main
      style={{
        maxWidth: "780px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <a
        href="/account"
        style={{ color: "var(--color-primary)", textDecoration: "none", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}
      >
        ← Account
      </a>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-4) 0 var(--space-2) 0" }}>
        API keys
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, margin: "0 0 var(--space-6) 0" }}>
        Pull your Ozvor AI Visibility Scores and audit history into your own tools — dashboards,
        spreadsheets, Zapier, anything that speaks HTTP. Keys are read-only and scoped to your
        workspace.
      </p>

      {err && (
        <p
          role="alert"
          style={{
            color: "var(--color-error)",
            fontSize: "var(--font-size-body-sm)",
            backgroundColor: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.3)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            margin: "0 0 var(--space-5) 0",
          }}
        >
          {err}
        </p>
      )}

      {/* One-time reveal of a freshly created key */}
      {created && (
        <div
          style={{
            border: "1px solid var(--color-primary)",
            backgroundColor: "rgba(39,201,138,0.08)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            margin: "0 0 var(--space-6) 0",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "var(--space-2)" }}>
            Your new key “{created.name}” — copy it now
          </div>
          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginBottom: "var(--space-3)" }}>
            This is the only time the full key is shown. Store it somewhere safe; we keep only a hash.
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <code
              style={{
                flex: "1 1 280px",
                minWidth: 0,
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "var(--font-size-body-sm)",
                backgroundColor: "var(--color-surface-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {created.key}
            </code>
            <button onClick={() => copyKey(created.key)} style={solidBtn}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Create */}
      <section
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          backgroundColor: "var(--color-surface)",
          marginBottom: "var(--space-8)",
        }}
      >
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>Create a key</h2>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Zapier, Production dashboard)"
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createKey();
            }}
            style={{
              flex: "1 1 260px",
              minWidth: 0,
              height: "40px",
              padding: "0 var(--space-3)",
              fontSize: "var(--font-size-body-sm)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface-muted)",
              color: "var(--color-text)",
            }}
          />
          <button onClick={() => void createKey()} disabled={creating} style={{ ...solidBtn, opacity: creating ? 0.6 : 1 }}>
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>
        <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", margin: "var(--space-2) 0 0 0" }}>
          Only the account owner can create or revoke keys. Up to 10 active keys.
        </p>
      </section>

      {/* List */}
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
        Your keys {keys ? `(${active.length} active)` : ""}
      </h2>
      {!keys && <p style={{ color: "var(--color-muted)" }}>Loading…</p>}
      {keys && keys.length === 0 && (
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
          No keys yet. Create one above to start calling the API.
        </p>
      )}
      {keys && keys.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-8)" }}>
          {keys.map((k) => {
            const revoked = !!k.revoked_at;
            return (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-4)",
                  backgroundColor: "var(--color-surface)",
                  opacity: revoked ? 0.55 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    {k.name}
                    <span
                      style={{
                        fontSize: "var(--font-size-caption)",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-pill)",
                        backgroundColor: revoked ? "var(--color-surface-muted)" : "rgba(39,201,138,0.12)",
                        color: revoked ? "var(--color-muted)" : "var(--color-success)",
                      }}
                    >
                      {revoked ? "Revoked" : "Active"}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "2px" }}>
                    {k.prefix}••••••••
                  </div>
                  <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "2px" }}>
                    Created {fmtDate(k.created_at)} · Last used {fmtDate(k.last_used_at)}
                  </div>
                </div>
                {!revoked && (
                  <button
                    onClick={() => void revokeKey(k.id)}
                    disabled={revoking === k.id}
                    style={dangerBtn}
                  >
                    {revoking === k.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Docs */}
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "var(--space-8) 0 var(--space-3) 0" }}>
        Using the API
      </h2>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          backgroundColor: "var(--color-surface)",
          fontSize: "var(--font-size-body-sm)",
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: "0 0 var(--space-2) 0" }}>
          Base URL: <code style={codeInline}>{base}/api/v1</code>
        </p>
        <p style={{ margin: "0 0 var(--space-3) 0" }}>
          Authenticate with your key in the <code style={codeInline}>Authorization</code> header.
        </p>
        <pre style={codeBlock}>
{`curl ${base}/api/v1/brands \\
  -H "Authorization: Bearer ${created?.key ?? "ozk_live_…"}"`}
        </pre>
        <div style={{ marginTop: "var(--space-3)" }}>
          <div style={{ fontWeight: 700, marginBottom: "var(--space-1)" }}>Endpoints (read-only)</div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--color-muted)" }}>
            <li><code style={codeInline}>GET /v1/me</code> — your workspace, plan and key scopes</li>
            <li><code style={codeInline}>GET /v1/brands</code> — all brands + latest Ozvor AI Visibility Score</li>
            <li><code style={codeInline}>GET /v1/brands/:id</code> — brand detail + score breakdown</li>
            <li><code style={codeInline}>GET /v1/brands/:id/audits</code> — recent audits for a brand</li>
            <li><code style={codeInline}>GET /v1/audits/:id</code> — a single audit&rsquo;s scores</li>
          </ul>
        </div>
        <p style={{ margin: "var(--space-3) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          Rate limit: 120 requests/minute per key. Keys are scoped to your workspace and read-only.
        </p>
      </div>
    </main>
  );
}

const solidBtn: React.CSSProperties = {
  height: "40px",
  padding: "0 var(--space-4)",
  backgroundColor: "var(--color-primary)",
  color: "#06140e",
  border: "none",
  borderRadius: "var(--radius-md)",
  fontWeight: 700,
  fontSize: "var(--font-size-body-sm)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dangerBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 var(--space-3)",
  background: "none",
  color: "var(--color-error)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontWeight: 700,
  fontSize: "var(--font-size-caption)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const codeInline: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "0.85em",
  backgroundColor: "var(--color-surface-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  padding: "1px 5px",
};

const codeBlock: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "var(--font-size-caption)",
  backgroundColor: "var(--color-surface-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3)",
  overflowX: "auto",
  whiteSpace: "pre",
  margin: 0,
  color: "var(--color-text)",
};
