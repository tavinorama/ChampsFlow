"use client";

/**
 * /dashboard — TrustIndex AI flywheel hub
 *
 * Shows every brand with its latest TrustIndex Score and a weekly-monitoring
 * toggle (the never-ending flywheel). This is the screen SMBs check each week.
 *
 * Data: GET /api/brands (id, name, region, latest_score, monitoring_enabled).
 * Toggle: POST /api/brands/:id/monitoring { enabled }.
 *
 * Featured brand: the brand with the most recent audit is featured at the top
 * with a compact TrustIndexScorecard, fetching its breakdown from the same
 * /api/brands/:id/score + /api/audits/:id/breakdown endpoints the brand
 * detail page uses. Gracefully degrades to the summary tiles on failure.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ensureProvisioned, getSupabase } from "../../lib/supabase-browser";
import { TrustIndexScorecard } from "../../components/TrustIndexScorecard";
import { ScoreTrend } from "../../components/ScoreTrend";

// Account areas surfaced on the dashboard main page (separate from brand info).
const ACCOUNT_LINKS: Array<{ href: string; title: string; desc: string }> = [
  { href: "/account/billing", title: "Billing & plan", desc: "Subscription, invoices, plan limits." },
  { href: "/account/integrations", title: "AI engines & keys", desc: "Connect your own provider keys." },
  { href: "/account/api-keys", title: "API keys", desc: "Pull your scores into your own tools." },
  { href: "/account/connections", title: "Connections", desc: "Publishing channels via secure OAuth." },
  { href: "/account/data-privacy", title: "Data & privacy", desc: "Export, delete, control your data." },
  { href: "/account/system-status", title: "System status", desc: "Live status of the audit engines." },
  { href: "/account/legal", title: "Legal", desc: "Terms, privacy, DPA, sub-processors." },
];

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
  competitors: Array<{ name: string; displacement: number }>;
  probeSummary?: string;
  trendData?: Array<{ recorded_at: string; score_overall: number | null }>;
}

async function loadFeaturedBreakdown(
  brand: Brand
): Promise<FeaturedData | null> {
  try {
    // Step 1: get latest audit id + scores
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
      competitors: [],
      trendData: (scoreData.trend ?? []) as Array<{
        recorded_at: string;
        score_overall: number | null;
      }>,
    };

    // Step 2: get breakdown for vector-level data + competitors + probes
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

export default function DashboardPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [featured, setFeatured] = useState<FeaturedData | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  // Account info (separate from brand data) for the dashboard's Account section.
  const [plan, setPlan] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // First-login provisioning: if this is a brand-new user with no tenant yet,
      // create their tenant + refresh the session so the next call is authorized.
      await ensureProvisioned();
      const res = await apiFetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        const loadedBrands: Brand[] = data.brands ?? [];
        setBrands(loadedBrands);

        // Feature the first brand that has a score (most likely most recent).
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

      // Account info (best-effort — runs after provisioning; never blocks the
      // dashboard). Plan + email for the Account & settings section.
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
    // optimistic
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
      // revert
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

  // Show featured scorecard only when we have breakdown data
  const showFeatured = featured !== null && !loading;
  // Show tiles when no featured data is available (fallback) or as supplemental summary
  const showTiles = !showFeatured && !loading;

  return (
    <main
      style={{
        maxWidth: "880px",
        margin: "0 auto",
        padding:
          "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 var(--space-6) 0",
        }}
      >
        Dashboard
      </h1>

      {error && (
        <div
          role="alert"
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

      {/* Featured brand scorecard — mirrors the landing hero */}
      {loading && (
        <p style={{ color: "var(--color-muted)" }}>Loading&hellip;</p>
      )}

      {featuredLoading && !loading && (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "var(--space-8)",
            color: "var(--color-muted)",
            fontSize: "var(--font-size-body-sm)",
          }}
        >
          Loading scorecard&hellip;
        </div>
      )}

      {showFeatured && featured && (
        <div style={{ marginBottom: "var(--space-8)" }}>
          <TrustIndexScorecard
            compact
            overall={featured.overall}
            vectors={{
              ai: featured.ai,
              performance: featured.performance,
              brand: featured.brand,
            }}
            competitors={featured.competitors}
            probeSummary={featured.probeSummary}
            brandName={featured.brandName}
          />
          {featured.trendData && featured.trendData.length >= 2 && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <ScoreTrend trend={featured.trendData} compact brandName={featured.brandName} />
            </div>
          )}
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              marginTop: "var(--space-3)",
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
            . View full breakdown and GEO plan.
          </p>
        </div>
      )}

      {/* Fallback summary tiles (shown when featured scorecard is not available) */}
      {showTiles && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-8)",
          }}
        >
          <Tile label="Brands tracked" value={String(brands.length)} />
          <Tile
            label="Avg TrustIndex"
            value={avg != null && !Number.isNaN(avg) ? String(avg) : "—"}
          />
          <Tile label="Weekly monitoring" value={`${monitored} active`} />
        </div>
      )}

      {/* Summary stats strip (always shown once brands load, below featured) */}
      {showFeatured && brands.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-6)",
            flexWrap: "wrap",
            marginBottom: "var(--space-6)",
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface-muted)",
            borderRadius: "var(--radius-md)",
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
              Avg TrustIndex{" "}
              <strong style={{ color: "var(--color-text)" }}>{avg}</strong>
            </span>
          )}
          <span>
            <strong style={{ color: "var(--color-text)" }}>{monitored}</strong>{" "}
            weekly monitoring active
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <h2
          style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0 }}
        >
          Your brands
        </h2>
        <a
          href="/brands"
          style={{
            color: "var(--color-primary)",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
          }}
        >
          + Add brand
        </a>
      </div>

      <div aria-live="polite">
        {loading ? null : brands.length === 0 ? (
          <p
            style={{
              color: "var(--color-muted)",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            No brands yet.{" "}
            <a href="/brands" style={{ color: "var(--color-primary)" }}>
              Add your first brand
            </a>{" "}
            to run an audit.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {brands.map((b) => (
              <li
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  padding: "var(--space-4) var(--space-5)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  // Highlight the featured brand row
                  boxShadow:
                    featured?.brandId === b.id
                      ? "0 0 0 2px var(--color-primary)"
                      : "var(--shadow-card)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <a
                    href={`/brands/${b.id}`}
                    style={{
                      fontWeight: 700,
                      color: "var(--color-text)",
                      textDecoration: "none",
                    }}
                  >
                    {b.name}
                  </a>
                  <div
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                    }}
                  >
                    {b.region}
                    {b.category ? ` · ${b.category}` : ""}
                  </div>
                </div>

                {typeof b.latest_score === "number" ? (
                  <ScoreMiniRing score={b.latest_score} />
                ) : (
                  <span
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                    }}
                  >
                    no audit yet
                  </span>
                )}

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    cursor: busyId === b.id ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!b.monitoring_enabled}
                    disabled={busyId === b.id}
                    onChange={() => toggleMonitoring(b)}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--color-primary)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                    }}
                  >
                    Weekly
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        style={{
          marginTop: "var(--space-8)",
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
        }}
      >
        Weekly monitoring re-runs the AI Visibility Audit every Monday so your
        TrustIndex Score trend keeps updating. Turn it on for the brands you want
        to track continuously.
      </p>

      {/* ── Account & settings — your account, separate from brand data ───── */}
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--color-border)",
          margin: "var(--space-10) 0 var(--space-6)",
        }}
      />
      <section aria-labelledby="account-heading">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            marginBottom: "var(--space-4)",
          }}
        >
          <h2 id="account-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0 }}>
            Account &amp; settings
          </h2>
          {accountEmail && (
            <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
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
            gap: "var(--space-3)",
            flexWrap: "wrap",
            padding: "var(--space-4) var(--space-5)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              Your plan
            </div>
            <div style={{ fontSize: "var(--font-size-h4)", fontWeight: 800, textTransform: "capitalize" }}>
              {plan ?? "Free"}
              {planStatus && planStatus !== "active" ? ` · ${planStatus}` : ""}
            </div>
          </div>
          <a
            href="/account/billing"
            style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none", fontSize: "var(--font-size-body-sm)" }}
          >
            Manage billing →
          </a>
        </div>

        {/* Account areas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {ACCOUNT_LINKS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              style={{
                display: "block",
                padding: "var(--space-4)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                color: "var(--color-text)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>{s.title}</div>
              <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{s.desc}</div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Summary tiles (fallback when no featured scorecard)
// ---------------------------------------------------------------------------

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "var(--color-text)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          marginTop: "var(--space-1)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini score ring for brand list rows — more visual than the flat ScoreBadge
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
      title={`TrustIndex Score: ${score} / 100`}
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
        aria-label={`TrustIndex Score ${score} out of 100`}
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
