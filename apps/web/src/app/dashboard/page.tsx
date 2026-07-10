"use client";

/**
 * /dashboard — Ozvor flywheel hub
 *
 * Shows every brand with its latest Ozvor AI Visibility Score and a weekly-monitoring
 * toggle (the never-ending flywheel). This is the screen SMBs check each week.
 *
 * Data: GET /api/brands (id, name, region, latest_score, monitoring_enabled).
 * Toggle: POST /api/brands/:id/monitoring { enabled }.
 *
 * Featured brand: the brand with the most recent audit is featured at the top
 * with a compact TrustIndexScorecard, fetching its breakdown from the same
 * /api/brands/:id/score + /api/audits/:id/breakdown endpoints the brand
 * detail page uses. Gracefully degrades to the summary tiles on failure.
 *
 * Visual language: matches the landing page design system —
 * dark-first surfaces, emerald (#27c98a) accents, mono uppercase eyebrows,
 * rounded cards, gradient CTAs, section rhythm (eyebrow → heading → content).
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ensureProvisioned, getSupabase } from "../../lib/supabase-browser";
import { TrustIndexScorecard, type ThreeScores } from "../../components/TrustIndexScorecard";
import { ScoreTrend } from "../../components/ScoreTrend";
import { ClaimedHistoryCard } from "../../components/ClaimedHistoryCard";

// ---------------------------------------------------------------------------
// Page-scoped styles injected once (keyframes + responsive overrides)
// ---------------------------------------------------------------------------

const DASHBOARD_STYLES = `
  @keyframes db-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
  @keyframes db-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  .db-rise { animation: db-rise .55s cubic-bezier(.2,.7,.2,1) both; }

  .db-brand-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    text-decoration: none;
    color: var(--color-text);
    transition: border-color .18s ease, box-shadow .18s ease, transform .15s ease;
  }
  .db-brand-card:hover {
    border-color: rgba(39,201,138,0.38);
    box-shadow: var(--shadow-card-hover);
    transform: translateY(-1px);
  }
  .db-brand-card--featured {
    border-color: rgba(39,201,138,0.4);
    box-shadow: 0 0 0 2px rgba(39,201,138,0.18), var(--shadow-card);
  }
  .db-brand-card--featured:hover {
    border-color: rgba(39,201,138,0.65);
    box-shadow: 0 0 0 2px rgba(39,201,138,0.28), var(--shadow-card-hover);
  }

  .db-account-link {
    display: block;
    padding: var(--space-4) var(--space-5);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--color-text);
    transition: border-color .18s ease, box-shadow .18s ease, transform .15s ease;
  }
  .db-account-link:hover {
    border-color: rgba(39,201,138,0.38);
    box-shadow: var(--shadow-card-hover);
    transform: translateY(-1px);
  }

  .db-monitoring-toggle:focus-visible {
    outline: var(--focus-outline-width) solid var(--color-focus-outline);
    outline-offset: var(--focus-outline-offset);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 640px) {
    .db-brand-card {
      flex-wrap: wrap;
      padding: var(--space-4) var(--space-5);
    }
    .db-stats-row {
      grid-template-columns: 1fr !important;
    }
    section[aria-labelledby="workflow-heading"] {
      grid-template-columns: 1fr !important;
    }
  }
  @media (max-width: 480px) {
    .db-account-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

function useDashboardStyles() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("db-page-styles")) return;
    const el = document.createElement("style");
    el.id = "db-page-styles";
    el.textContent = DASHBOARD_STYLES;
    document.head.appendChild(el);
  }, []);
}

// ---------------------------------------------------------------------------
// Account areas surfaced on the dashboard main page (separate from brand info).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Brand {
  id: string;
  name: string;
  category?: string | null;
  region: "EU" | "US";
  latest_score?: number | null;
  monitoring_enabled?: boolean;
}

interface FeaturedData {
  brandId: string;
  brandName: string;
  overall: number | null;
  ai: number | null;
  performance: number | null;
  brand: number | null;
  threeScores: ThreeScores | null;
  competitors: Array<{ name: string; displacement: number }>;
  probeSummary?: string;
  trendData?: Array<{ recorded_at: string; score_overall: number | null }>;
}

// ---------------------------------------------------------------------------
// Data loader — unchanged from original
// ---------------------------------------------------------------------------

async function loadFeaturedBreakdown(
  brand: Brand
): Promise<FeaturedData | null> {
  try {
    const scoreRes = await apiFetch(`/api/brands/${brand.id}/score`);
    if (!scoreRes.ok) return null;
    const scoreData = (await scoreRes.json()) as {
      latest?: {
        audit_id?: string;
        score_brand?: number | null;
        score_performance?: number | null;
        score_ai?: number | null;
        score_overall?: number | null;
      };
      trend?: Array<{ recorded_at: string; score_overall: number | null }>;
      threeScores?: {
        visibility: number | null;
        citationReadiness: number | null;
        executionProgress: number | null;
      };
    };
    const latest = scoreData.latest;
    if (!latest) return null;

    const partial: FeaturedData = {
      brandId: brand.id,
      brandName: brand.name,
      overall: latest.score_overall ?? null,
      ai: latest.score_ai ?? null,
      performance: latest.score_performance ?? null,
      brand: latest.score_brand ?? null,
      threeScores: scoreData.threeScores
        ? {
            visibility: scoreData.threeScores.visibility ?? null,
            citationReadiness: scoreData.threeScores.citationReadiness ?? null,
            executionProgress: scoreData.threeScores.executionProgress ?? null,
          }
        : null,
      competitors: [],
      trendData: (scoreData.trend ?? []) as Array<{
        recorded_at: string;
        score_overall: number | null;
      }>,
    };

    if (latest.audit_id) {
      const bdRes = await apiFetch(
        `/api/audits/${latest.audit_id}/breakdown`
      );
      if (bdRes.ok) {
        const bd = (await bdRes.json()) as {
          scores?: {
            ai?: number | null;
            performance?: number | null;
            brand?: number | null;
            overall?: number | null;
          };
          competitors?: Array<{
            name: string;
            mentions: number;
            displacement: number;
          }>;
          probes_total?: number;
        };
        if (bd.scores) {
          partial.ai = bd.scores.ai ?? partial.ai;
          partial.performance = bd.scores.performance ?? partial.performance;
          partial.brand = bd.scores.brand ?? partial.brand;
          partial.overall = bd.scores.overall ?? partial.overall;
        }
        partial.competitors = (bd.competitors ?? [])
          .filter((c) => c.displacement > 0)
          .map((c) => ({ name: c.name, displacement: c.displacement }));
        if (bd.probes_total) {
          partial.probeSummary = `${bd.probes_total} AI probes`;
        }
      }
    }

    return partial;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  useDashboardStyles();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [featured, setFeatured] = useState<FeaturedData | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await ensureProvisioned();
      const res = await apiFetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        const loadedBrands: Brand[] = data.brands ?? [];
        setBrands(loadedBrands);

        const candidate = loadedBrands.find(
          (b) => typeof b.latest_score === "number"
        );
        if (candidate) {
          setFeaturedLoading(true);
          void loadFeaturedBreakdown(candidate).then((fd) => {
            setFeatured(fd);
            setFeaturedLoading(false);
          });
        }
      } else {
        setError("Could not load your dashboard.");
      }

      try {
        const planRes = await apiFetch("/api/billing/plan");
        if (planRes.ok) {
          const pd = await planRes.json();
          setPlan(pd.plan ?? null);
          setPlanStatus(pd.status ?? null);
        }
      } catch {
        /* non-fatal */
      }
      try {
        const { data: u } = await getSupabase().auth.getUser();
        setAccountEmail(u.user?.email ?? null);
      } catch {
        /* non-fatal */
      }
    } catch {
      setError("Could not load your dashboard. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMonitoring(brand: Brand) {
    if (busyId) return;
    setBusyId(brand.id);
    const next = !brand.monitoring_enabled;
    setBrands((bs) =>
      bs.map((b) => (b.id === brand.id ? { ...b, monitoring_enabled: next } : b))
    );
    try {
      const res = await apiFetch(`/api/brands/${brand.id}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBrands((bs) =>
        bs.map((b) =>
          b.id === brand.id ? { ...b, monitoring_enabled: !next } : b
        )
      );
      setError("Could not update monitoring. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const monitored = brands.filter((b) => b.monitoring_enabled).length;
  const scoredBrands = brands.filter((b) => b.latest_score != null);
  const avg =
    scoredBrands.length > 0
      ? Math.round(
          scoredBrands.reduce((s, b) => s + (b.latest_score ?? 0), 0) /
            scoredBrands.length
        )
      : null;

  const showFeatured = featured !== null && !loading;
  const showTiles = !showFeatured && !loading;

  return (
    <main
      aria-label="Dashboard"
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "0 var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        aria-label="AI Visibility Score hero"
        style={{
          position: "relative",
          padding: "var(--space-10) var(--space-6) var(--space-8)",
          marginBottom: "var(--space-6)",
          backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        {/* Radial fade overlay so dot-grid fades into the surface */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(70% 65% at 50% 0%, transparent, var(--color-surface) 82%)",
            pointerEvents: "none",
            borderRadius: "var(--radius-xl)",
          }}
        />
        {/* Emerald glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(50% 40% at 50% 0%, rgba(39,201,138,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
            borderRadius: "var(--radius-xl)",
          }}
        />

        <div style={{ position: "relative" }}>
          {/* Eyebrow pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid rgba(39,201,138,0.32)",
              background: "rgba(39,201,138,0.07)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              color: "var(--color-accent-ink)",
              marginBottom: "var(--space-4)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#27c98a",
                display: "inline-block",
                animation: "db-pulse 2s infinite",
              }}
            />
            AI Search Trust Intelligence
          </div>

          {/* Heading */}
          <h1
            style={{
              margin: "0 0 var(--space-2) 0",
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "var(--color-text)",
            }}
          >
            Your AI Visibility{" "}
            <span
              style={{
                background: "linear-gradient(120deg,#3ad79a,#0e8a59)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Dashboard
            </span>
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body)",
              color: "var(--color-muted)",
              lineHeight: 1.55,
              maxWidth: 520,
            }}
          >
            Track how AI search engines cite your brand, monitor weekly score
            changes, and act on the gaps.
          </p>
        </div>
      </section>

      {/* ── ERROR ALERT ────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-badge-status-error-bg)",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-error)",
            fontSize: "var(--font-size-body-sm)",
            marginBottom: "var(--space-6)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── LOADING SKELETON ───────────────────────────────────────────── */}
      {loading && (
        <div
          aria-busy="true"
          aria-label="Loading your dashboard"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            marginBottom: "var(--space-8)",
          }}
        >
          {[120, 80, 60].map((h, i) => (
            <div
              key={i}
              style={{
                height: h,
                borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                opacity: 1 - i * 0.15,
              }}
            />
          ))}
        </div>
      )}

      {/* ── FEATURED SCORECARD — hero element ─────────────────────────── */}
      {featuredLoading && !loading && (
        <div
          aria-busy="true"
          aria-label="Loading featured scorecard"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "var(--space-8)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              color: "var(--color-muted)",
            }}
          >
            Loading scorecard&hellip;
          </div>
        </div>
      )}

      {showFeatured && featured && (
        <section
          aria-labelledby="featured-scorecard-heading"
          className="db-rise"
          style={{
            marginBottom: "var(--space-8)",
            background: "var(--color-surface)",
            border: "1px solid rgba(39,201,138,0.28)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-6)",
            boxShadow: "0 0 0 1px rgba(39,201,138,0.08), var(--shadow-card)",
          }}
        >
          {/* Section eyebrow */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              color: "var(--color-accent-ink)",
              marginBottom: "var(--space-3)",
            }}
          >
            Featured brand · Latest audit
          </div>

          <TrustIndexScorecard
            compact
            overall={featured.overall}
            threeScores={featured.threeScores ?? undefined}
            vectors={
              featured.threeScores == null
                ? {
                    ai: featured.ai,
                    performance: featured.performance,
                    brand: featured.brand,
                  }
                : undefined
            }
            competitors={featured.competitors}
            probeSummary={featured.probeSummary}
            brandName={featured.brandName}
          />

          {featured.trendData && featured.trendData.length >= 2 && (
            <div
              style={{
                marginTop: "var(--space-5)",
                padding: "var(--space-4) var(--space-5)",
                background: "var(--color-surface-muted)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase" as const,
                  color: "var(--color-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Score trend
              </div>
              <ScoreTrend trend={featured.trendData} compact brandName={featured.brandName} />
            </div>
          )}

          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              marginTop: "var(--space-4)",
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Showing latest audit for{" "}
            <a
              href={`/brands/${featured.brandId}`}
              style={{ color: "var(--color-primary)", fontWeight: 700 }}
            >
              {featured.brandName}
            </a>
            {" "}— view the full breakdown and GEO plan.
          </p>
        </section>
      )}

      {/* ── STATS STRIP (shown below featured or as fallback) ─────────── */}
      {showTiles && (
        <section
          aria-label="Summary statistics"
          className="db-stats-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--space-4)",
            marginBottom: "var(--space-8)",
          }}
        >
          <StatTile label="Brands tracked" value={String(brands.length)} />
          <StatTile
            label="Avg AI Visibility"
            value={avg != null && !Number.isNaN(avg) ? String(avg) : "—"}
          />
          <StatTile label="Weekly monitoring" value={`${monitored}`} suffix="active" />
        </section>
      )}

      {showFeatured && brands.length > 0 && (
        <div
          aria-label="Summary statistics"
          style={{
            display: "flex",
            gap: "var(--space-6)",
            flexWrap: "wrap",
            marginBottom: "var(--space-6)",
            padding: "var(--space-3) var(--space-5)",
            background: "var(--color-surface-muted)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          <span>
            <strong style={{ color: "var(--color-text)" }}>{brands.length}</strong>{" "}
            brand{brands.length === 1 ? "" : "s"} tracked
          </span>
          {avg != null && !Number.isNaN(avg) && (
            <span>
              Avg AI Visibility{" "}
              <strong style={{ color: "var(--color-text)" }}>{avg}</strong>
            </span>
          )}
          <span>
            <strong style={{ color: "var(--color-text)" }}>{monitored}</strong>{" "}
            weekly monitoring active
          </span>
        </div>
      )}

      {/* ── ACTION OPERATING SYSTEM — RankLayer-inspired workflow ─────── */}
      {!loading && (
        <section
          aria-labelledby="workflow-heading"
          className="db-rise"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(280px, 0.95fr)",
            gap: "var(--space-5)",
            marginBottom: "var(--space-8)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-6)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "var(--color-accent-ink)",
                marginBottom: "var(--space-2)",
              }}
            >
              Action loop
            </div>
            <h2
              id="workflow-heading"
              style={{
                margin: "0 0 var(--space-4)",
                fontSize: "var(--font-size-h2)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Audit → Fix → Approve → Measure
            </h2>
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[
                ["01", "Audit", "Run AI buyer prompts across the engines your customers use."],
                ["02", "Find gaps", "See competitors AI recommends, the prompt families they win, and the sources that support them."],
                ["03", "Generate fixes", "Turn every gap into a comparison page, LinkedIn proof post, FAQ/schema fix, or OrganicPosts task."],
                ["04", "Approve & measure", "Draft-and-confirm protects the brand while the weekly score shows whether the work moved trust."],
              ].map(([n, title, desc]) => (
                <div
                  key={n}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px minmax(0,1fr)",
                    gap: "var(--space-3)",
                    alignItems: "start",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-surface-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-ink)", fontWeight: 700 }}>{n}</span>
                  <span>
                    <strong style={{ display: "block", color: "var(--color-text)" }}>{title}</strong>
                    <span style={{ display: "block", marginTop: 3, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.5 }}>{desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(180deg, rgba(39,201,138,0.09), rgba(14,23,20,0.94))",
              border: "1px solid rgba(39,201,138,0.24)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-6)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "var(--color-accent-ink)",
                marginBottom: "var(--space-2)",
              }}
            >
              Fix queue preview
            </div>
            <h3 style={{ margin: "0 0 var(--space-4)", fontSize: "var(--font-size-h3)", fontWeight: 800 }}>
              How gaps become fixes
            </h3>
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[
                ["Comparison page", "Close a competitor-displacement gap with a page AI engines can cite."],
                ["LinkedIn proof post", "Turn customer proof into a source AI can cite."],
                ["FAQ schema", "Make your strongest buying answers machine-readable."],
              ].map(([title, desc]) => (
                <div key={title} style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "rgba(0,0,0,0.18)", border: "1px solid var(--color-border)" }}>
                  <strong>{title}</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.45 }}>{desc}</p>
                </div>
              ))}
            </div>
            <a
              href="/drafts"
              style={{
                display: "inline-flex",
                marginTop: "var(--space-4)",
                color: "#06140e",
                background: "linear-gradient(135deg,#27c98a,#0c7d54)",
                borderRadius: "var(--radius-md)",
                padding: "10px 16px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Open fix queue →
            </a>
          </div>
        </section>
      )}

      {/* ── BRANDS SECTION ─────────────────────────────────────────────── */}
      {!loading && (
        <section aria-labelledby="brands-heading">
          {/* Section header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "var(--space-4)",
              marginBottom: "var(--space-2)",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase" as const,
                  color: "var(--color-accent-ink)",
                  marginBottom: "var(--space-1)",
                }}
              >
                Your brands
              </div>
              <h2
                id="brands-heading"
                style={{
                  fontSize: "var(--font-size-h2)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  color: "var(--color-text)",
                }}
              >
                Brand scorecards
              </h2>
            </div>
            <a
              href="/brands"
              aria-label="Add a new brand"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                background: "linear-gradient(135deg,#27c98a,#0c7d54)",
                color: "#06140e",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: 700,
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                boxShadow: "0 6px 20px rgba(39,201,138,0.24)",
                minHeight: "var(--min-tap-target)",
                whiteSpace: "nowrap",
              }}
            >
              + Add brand
            </a>
          </div>

          {/* Brand list */}
          <div aria-live="polite" aria-label="Brand list">
            {brands.length === 0 ? (
              <EmptyBrandsState />
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "var(--space-4) 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                {brands.map((b) => (
                  <li key={b.id}>
                    <BrandCard
                      brand={b}
                      isFeatured={featured?.brandId === b.id}
                      busyId={busyId}
                      onToggle={toggleMonitoring}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Weekly monitoring explainer */}
      {!loading && brands.length > 0 && (
        <p
          style={{
            marginTop: "var(--space-6)",
            padding: "var(--space-4) var(--space-5)",
            background: "rgba(39,201,138,0.05)",
            border: "1px dashed rgba(39,201,138,0.28)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--color-accent-ink)", fontFamily: "var(--font-mono)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontSize: "0.625rem" }}>
            Weekly monitoring
          </strong>{" "}
          re-runs the AI Visibility Audit every Monday so your Ozvor AI Visibility
          Score trend keeps updating. Turn it on for the brands you want to track
          continuously.
        </p>
      )}

      {/* ── ACCOUNT & SETTINGS ─────────────────────────────────────────── */}
      <section
        aria-labelledby="account-heading"
        style={{ marginTop: "var(--space-12)" }}
      >
        {/* Section eyebrow + heading */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: "var(--color-accent-ink)",
            marginBottom: "var(--space-1)",
          }}
        >
          Your account
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            marginBottom: "var(--space-5)",
          }}
        >
          <h2
            id="account-heading"
            style={{
              fontSize: "var(--font-size-h2)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: 0,
              color: "var(--color-text)",
            }}
          >
            Your plan
          </h2>
          {accountEmail && (
            <span
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {accountEmail}
            </span>
          )}
        </div>

        {/* Plan strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            padding: "var(--space-5) var(--space-6)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: "var(--color-muted)",
                marginBottom: "var(--space-1)",
              }}
            >
              Your plan
            </div>
            <div
              style={{
                fontSize: "var(--font-size-h3)",
                fontWeight: 800,
                textTransform: "capitalize",
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}
            >
              {plan ?? "Free"}
              {planStatus && planStatus !== "active" ? (
                <span
                  style={{
                    marginLeft: "var(--space-2)",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-note-warn)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.06em",
                  }}
                >
                  · {planStatus}
                </span>
              ) : null}
            </div>
          </div>
          <a
            href="/account/billing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "linear-gradient(135deg,#27c98a,#0c7d54)",
              color: "#06140e",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 700,
              padding: "10px 18px",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              boxShadow: "0 6px 20px rgba(39,201,138,0.22)",
              minHeight: "var(--min-tap-target)",
              whiteSpace: "nowrap",
            }}
          >
            Manage billing →
          </a>
        </div>

        {/* Everything else (keys, API, connections, privacy, legal, system
            status) lives in Settings — one link, not a duplicated card grid. */}
        <a href="/account" className="db-account-link" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", width: "auto" }}>
          <span aria-hidden="true" style={{ fontSize: "1rem" }}>⚙</span>
          <span style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)" }}>
            Account &amp; settings
          </span>
          <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>&mdash; billing, keys, connections, privacy &rarr;</span>
        </a>
      </section>

      {/* ── DONE-FOR-YOU (OrganicPosts) — upsell card, not a nav tab ──────── */}
      {/* Recovered pre-account history (#218) — renders only when there is any. */}
      <ClaimedHistoryCard />

      <section aria-labelledby="dfy-heading" style={{ marginTop: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            padding: "var(--space-5) var(--space-6)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ maxWidth: "620px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--color-accent-ink)", marginBottom: "var(--space-1)" }}>
              Done for you
            </div>
            <h2 id="dfy-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-1)", color: "var(--color-text)" }}>
              Rather have a team run your GEO?
            </h2>
            <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.55, margin: 0 }}>
              OrganicPosts by Ozvor executes the whole plan for you — content, cadence, and monitoring.
            </p>
          </div>
          <a
            href="/organicposts"
            style={{ display: "inline-flex", alignItems: "center", height: "44px", padding: "0 var(--space-5)", background: "transparent", color: "var(--color-primary)", border: "1.5px solid var(--color-primary)", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Explore OrganicPosts &rarr;
          </a>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// StatTile — fallback summary tile when featured scorecard is unavailable
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div
      style={{
        padding: "var(--space-5) var(--space-5)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: "var(--color-muted)",
          marginBottom: "var(--space-2)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "clamp(2rem, 5vw, 2.75rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          background: "linear-gradient(120deg,#3ad79a,#0e8a59)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
      {suffix && (
        <div
          style={{
            marginTop: "var(--space-1)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          {suffix}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrandCard — single brand row in the brand list
// ---------------------------------------------------------------------------

function BrandCard({
  brand,
  isFeatured,
  busyId,
  onToggle,
}: {
  brand: Brand;
  isFeatured: boolean;
  busyId: string | null;
  onToggle: (brand: Brand) => void;
}) {
  return (
    <div
      className={`db-brand-card${isFeatured ? " db-brand-card--featured" : ""}`}
    >
      {/* Brand name + meta */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {isFeatured && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              color: "var(--color-accent-ink)",
              marginBottom: "var(--space-1)",
            }}
          >
            Featured
          </div>
        )}
        <a
          href={`/brands/${brand.id}`}
          style={{
            fontWeight: 700,
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
            textDecoration: "none",
            display: "block",
            lineHeight: 1.3,
          }}
        >
          {brand.name}
        </a>
        <div
          style={{
            marginTop: "var(--space-1)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {brand.region}
          {brand.category ? ` · ${brand.category}` : ""}
        </div>
      </div>

      {/* Score ring or placeholder */}
      {typeof brand.latest_score === "number" ? (
        <ScoreMiniRing score={brand.latest_score} />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            padding: "4px 10px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface-muted)",
            whiteSpace: "nowrap",
          }}
        >
          no audit yet
        </span>
      )}

      {/* View detail CTA */}
      <a
        href={`/brands/${brand.id}`}
        aria-label={`View full report for ${brand.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: "var(--font-size-caption)",
          fontWeight: 700,
          color: "var(--color-accent-ink)",
          textDecoration: "none",
          padding: "6px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid rgba(39,201,138,0.30)",
          background: "rgba(39,201,138,0.07)",
          whiteSpace: "nowrap",
          minHeight: "var(--min-tap-target)",
          transition: "background .15s ease, border-color .15s ease",
        }}
      >
        View report →
      </a>

      {/* Weekly monitoring toggle */}
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          cursor: busyId === brand.id ? "wait" : "pointer",
          flexShrink: 0,
          minHeight: "var(--min-tap-target)",
        }}
        aria-label={`Weekly monitoring for ${brand.name}: ${brand.monitoring_enabled ? "enabled" : "disabled"}`}
      >
        <input
          type="checkbox"
          className="db-monitoring-toggle"
          checked={!!brand.monitoring_enabled}
          disabled={busyId === brand.id}
          onChange={() => onToggle(brand)}
          aria-label={`Enable weekly monitoring for ${brand.name}`}
          style={{
            width: 18,
            height: 18,
            accentColor: "var(--color-primary)",
            cursor: busyId === brand.id ? "wait" : "pointer",
          }}
        />
        <span
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            userSelect: "none" as const,
          }}
        >
          Weekly
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyBrandsState — on-brand empty state
// ---------------------------------------------------------------------------

function EmptyBrandsState() {
  return (
    <div
      style={{
        marginTop: "var(--space-4)",
        padding: "var(--space-10) var(--space-6)",
        background: "var(--color-surface)",
        border: "1px dashed rgba(39,201,138,0.32)",
        borderRadius: "var(--radius-xl)",
        textAlign: "center",
      }}
    >
      {/* Decorative ring */}
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(39,201,138,0.10)",
          border: "2px solid rgba(39,201,138,0.28)",
          margin: "0 auto var(--space-5)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#27c98a"
            strokeWidth="1.8"
            fill="none"
            strokeDasharray="4 2"
          />
          <line x1="12" y1="8" x2="12" y2="16" stroke="#27c98a" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="8" y1="12" x2="16" y2="12" stroke="#27c98a" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>

      {/* Eyebrow */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: "var(--color-accent-ink)",
          marginBottom: "var(--space-2)",
        }}
      >
        No brands yet
      </div>

      <h3
        style={{
          fontSize: "var(--font-size-h2)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 var(--space-3)",
          color: "var(--color-text)",
        }}
      >
        Add your first brand
      </h3>
      <p
        style={{
          maxWidth: 420,
          margin: "0 auto var(--space-6)",
          fontSize: "var(--font-size-body-sm)",
          lineHeight: 1.6,
          color: "var(--color-muted)",
        }}
      >
        Run your first AI Visibility Audit and see how AI search engines cite
        your brand across ChatGPT, Claude, Perplexity, Gemini, and Google AI.
      </p>

      <a
        href="/brands"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          background: "linear-gradient(135deg,#27c98a,#0c7d54)",
          color: "#06140e",
          fontFamily: "var(--font-family)",
          fontSize: "var(--font-size-body)",
          fontWeight: 700,
          padding: "14px 24px",
          borderRadius: "var(--radius-md)",
          textDecoration: "none",
          boxShadow: "0 10px 28px rgba(39,201,138,0.28)",
          minHeight: "var(--min-tap-target)",
        }}
      >
        Run your first audit →
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreMiniRing — compact SVG ring for brand list rows
// ---------------------------------------------------------------------------

function ScoreMiniRing({ score }: { score: number }) {
  const r = 18;
  const strokeW = 4;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(100, score)) / 100;
  const color =
    score >= 67
      ? "var(--color-success)"
      : score >= 34
      ? "var(--color-note-warn)"
      : "var(--color-error)";
  const size = (r + strokeW) * 2;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <span
      title={`Ozvor AI Visibility Score: ${score} / 100`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Ozvor AI Visibility Score ${score} out of 100`}
        style={{ display: "block" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeW}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="10"
          fontWeight="800"
          fill={color}
          fontFamily="var(--font-family)"
          aria-hidden="true"
        >
          {score}
        </text>
      </svg>
      <span
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          fontWeight: 500,
        }}
        aria-hidden="true"
      >
        /100
      </span>
    </span>
  );
}
