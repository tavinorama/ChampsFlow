"use client";

/**
 * /dashboard — TrustIndex AI flywheel hub
 *
 * Shows every brand with its latest TrustIndex Score and a weekly-monitoring
 * toggle (the never-ending flywheel). This is the screen SMBs check each week.
 *
 * Data: GET /api/brands (id, name, region, latest_score, monitoring_enabled).
 * Toggle: POST /api/brands/:id/monitoring { enabled }.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ensureProvisioned } from "../../lib/supabase-browser";

interface Brand {
  id: string;
  name: string;
  category?: string | null;
  region: "EU" | "US";
  latest_score?: number | null;
  monitoring_enabled?: boolean;
}

export default function DashboardPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // First-login provisioning: if this is a brand-new user with no tenant yet,
      // create their tenant + refresh the session so the next call is authorized.
      await ensureProvisioned();
      const res = await apiFetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        setBrands(data.brands ?? []);
      } else {
        setError("Could not load your dashboard.");
      }
    } catch {
      setError("Could not load your dashboard. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleMonitoring(brand: Brand) {
    if (busyId) return;
    setBusyId(brand.id);
    const next = !brand.monitoring_enabled;
    // optimistic
    setBrands((bs) => bs.map((b) => (b.id === brand.id ? { ...b, monitoring_enabled: next } : b)));
    try {
      const res = await apiFetch(`/api/brands/${brand.id}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // revert
      setBrands((bs) => bs.map((b) => (b.id === brand.id ? { ...b, monitoring_enabled: !next } : b)));
      setError("Could not update monitoring. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const monitored = brands.filter((b) => b.monitoring_enabled).length;
  const avg = brands.length
    ? Math.round(brands.reduce((s, b) => s + (b.latest_score ?? 0), 0) / brands.filter((b) => b.latest_score != null).length || 0)
    : null;

  return (
    <main style={{
      maxWidth: "880px", margin: "0 auto",
      padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
      fontFamily: "var(--font-family)", color: "var(--color-text)",
    }}>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-6) 0" }}>
        Dashboard
      </h1>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
        <Tile label="Brands tracked" value={String(brands.length)} />
        <Tile label="Avg TrustIndex" value={avg != null && !Number.isNaN(avg) ? String(avg) : "—"} />
        <Tile label="Weekly monitoring" value={`${monitored} active`} />
      </div>

      {error && (
        <div role="alert" style={{
          padding: "var(--space-3) var(--space-4)", backgroundColor: "#FEF2F2",
          border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)",
          color: "var(--color-error)", fontSize: "var(--font-size-body-sm)", marginBottom: "var(--space-6)",
        }}>{error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0 }}>Your brands</h2>
        <a href="/brands" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none", fontSize: "var(--font-size-body-sm)" }}>
          + Add brand
        </a>
      </div>

      <div aria-live="polite">
        {loading ? (
          <p style={{ color: "var(--color-muted)" }}>Loading…</p>
        ) : brands.length === 0 ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
            No brands yet. <a href="/brands" style={{ color: "var(--color-primary)" }}>Add your first brand</a> to run an audit.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {brands.map((b) => (
              <li key={b.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)",
                padding: "var(--space-4) var(--space-5)", backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <a href={`/brands/${b.id}`} style={{ fontWeight: 700, color: "var(--color-text)", textDecoration: "none" }}>{b.name}</a>
                  <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                    {b.region}{b.category ? ` · ${b.category}` : ""}
                  </div>
                </div>

                {typeof b.latest_score === "number"
                  ? <ScoreBadge score={b.latest_score} />
                  : <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>no audit yet</span>}

                <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", cursor: busyId === b.id ? "wait" : "pointer", flexShrink: 0 }}>
                  <input type="checkbox" checked={!!b.monitoring_enabled} disabled={busyId === b.id}
                    onChange={() => toggleMonitoring(b)} style={{ width: 18, height: 18, accentColor: "var(--color-primary)" }} />
                  <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>Weekly</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ marginTop: "var(--space-8)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
        Weekly monitoring re-runs the AI Visibility Audit every Monday so your TrustIndex Score trend keeps
        updating. Turn it on for the brands you want to track continuously.
      </p>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-1)" }}>{label}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 67 ? "var(--color-success)" : score >= 34 ? "#d97706" : "var(--color-error)";
  return (
    <span title="Latest TrustIndex Score" style={{
      display: "inline-flex", alignItems: "baseline", gap: "2px", flexShrink: 0,
      fontWeight: 800, color, fontSize: "var(--font-size-h3)", letterSpacing: "-0.02em",
    }}>
      {score}<span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 500 }}>/100</span>
    </span>
  );
}
