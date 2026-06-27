"use client";

/**
 * /agency — Agency portfolio view
 *
 * Shows all client brands in a grouped table, sorted by lowest score first.
 * Brands are grouped by client_label; unlabelled brands appear last under
 * a "No client" section.
 *
 * Agency plan only — non-agency users see an upsell card.
 *
 * Accessibility: aria-live for async states, semantic headings, 44px tap targets.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/supabase-browser";

interface AgencyBrand {
  id: string;
  name: string;
  domain?: string | null;
  category?: string | null;
  region?: string;
  monitoring_enabled?: boolean;
  latest_score?: number | null;
  client_label?: string | null;
}

type ShareState = "idle" | "sharing" | "copied" | "error";

export default function AgencyPage() {
  const [planChecked, setPlanChecked] = useState(false);
  const [isAgency, setIsAgency] = useState(false);
  const [brands, setBrands] = useState<AgencyBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareStates, setShareStates] = useState<Record<string, ShareState>>({});

  const checkPlanAndLoad = useCallback(async () => {
    try {
      const planRes = await apiFetch("/api/billing/plan");
      const planData = planRes.ok ? await planRes.json() as { plan?: string } : null;
      const agency = planData?.plan === "agency";
      setIsAgency(agency);
      setPlanChecked(true);

      if (!agency) {
        setLoading(false);
        return;
      }

      const brandsRes = await apiFetch("/api/brands");
      if (brandsRes.ok) {
        const data = await brandsRes.json() as { brands?: AgencyBrand[] } | AgencyBrand[];
        const list: AgencyBrand[] = Array.isArray(data) ? data : (data.brands ?? []);
        setBrands(list);
      } else {
        setError("Could not load brands. Please try again.");
      }
    } catch {
      setError("Could not load your portfolio. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkPlanAndLoad();
  }, [checkPlanAndLoad]);

  async function handleShare(brandId: string) {
    setShareStates((prev) => ({ ...prev, [brandId]: "sharing" }));
    try {
      const res = await apiFetch(`/api/brands/${brandId}/share`, { method: "POST" });
      if (!res.ok) {
        setShareStates((prev) => ({ ...prev, [brandId]: "error" }));
        return;
      }
      const data = await res.json() as { token?: string };
      const url = `${window.location.origin}/r/${data.token ?? ""}`;
      await navigator.clipboard.writeText(url);
      setShareStates((prev) => ({ ...prev, [brandId]: "copied" }));
      setTimeout(() => {
        setShareStates((prev) => ({ ...prev, [brandId]: "idle" }));
      }, 2000);
    } catch {
      setShareStates((prev) => ({ ...prev, [brandId]: "error" }));
    }
  }

  // Group brands by client_label; unlabelled brands go last.
  function groupBrands(list: AgencyBrand[]): { label: string; brands: AgencyBrand[] }[] {
    // Sort lowest score first; null scores go last.
    const sorted = [...list].sort((a, b) => {
      if (a.latest_score == null && b.latest_score == null) return 0;
      if (a.latest_score == null) return 1;
      if (b.latest_score == null) return -1;
      return a.latest_score - b.latest_score;
    });

    const groups = new Map<string, AgencyBrand[]>();
    const noClient: AgencyBrand[] = [];

    for (const brand of sorted) {
      if (brand.client_label) {
        const existing = groups.get(brand.client_label) ?? [];
        existing.push(brand);
        groups.set(brand.client_label, existing);
      } else {
        noClient.push(brand);
      }
    }

    const result: { label: string; brands: AgencyBrand[] }[] = [];
    for (const [label, groupBrandList] of groups) {
      result.push({ label, brands: groupBrandList });
    }
    if (noClient.length > 0) {
      result.push({ label: "No client", brands: noClient });
    }
    return result;
  }

  if (!planChecked || loading) {
    return (
      <main
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        <p aria-live="polite" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      </main>
    );
  }

  if (!isAgency) {
    return (
      <main
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
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
          Agency portfolio
        </h1>
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
            Agency plan required
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body)", margin: "0 0 var(--space-6) 0", lineHeight: 1.6 }}>
            Agency portfolio view is an Agency plan feature. Upgrade to Agency to manage all your
            client brands in one place, share branded reports, and apply your agency&rsquo;s
            white-label identity.
          </p>
          <a
            href="/account"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "var(--min-button-height)",
              padding: "0 var(--space-6)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: 600,
              fontFamily: "var(--font-family)",
              textDecoration: "none",
            }}
          >
            Upgrade to Agency
          </a>
        </div>
      </main>
    );
  }

  const groups = groupBrands(brands);

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 var(--space-2) 0",
        }}
      >
        Agency portfolio
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-8) 0" }}>
        All client brands sorted by lowest Ozvor AI Visibility Score first.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-error-bg, rgba(239,68,68,0.08))",
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

      <div aria-live="polite">
        {brands.length === 0 ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
            No brands yet. Add brands from the{" "}
            <a href="/brands" style={{ color: "var(--color-primary)" }}>
              Brands
            </a>{" "}
            page.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
            {groups.map((group) => (
              <section key={group.label} aria-labelledby={`group-${group.label}`}>
                <h2
                  id={`group-${group.label}`}
                  style={{
                    fontSize: "var(--font-size-h4)",
                    fontWeight: 700,
                    margin: "0 0 var(--space-3) 0",
                    color: "var(--color-text)",
                  }}
                >
                  {group.label}
                </h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {group.brands.map((brand) => {
                    const shareState = shareStates[brand.id] ?? "idle";
                    return (
                      <li
                        key={brand.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-3)",
                          padding: "var(--space-3) var(--space-4)",
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          flexWrap: "wrap",
                        }}
                      >
                        {/* Brand info */}
                        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                          <a
                            href={`/brands/${brand.id}`}
                            style={{
                              fontWeight: 700,
                              color: "var(--color-text)",
                              textDecoration: "none",
                              fontSize: "var(--font-size-body)",
                            }}
                          >
                            {brand.name}
                          </a>
                          {brand.domain && (
                            <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                              {brand.domain}
                            </div>
                          )}
                        </div>

                        {/* Client label chip */}
                        {brand.client_label && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px var(--space-2)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "var(--radius-md)",
                              fontSize: "var(--font-size-caption)",
                              color: "var(--color-muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {brand.client_label}
                          </span>
                        )}

                        {/* Score badge */}
                        <PortfolioScoreBadge score={brand.latest_score ?? null} />

                        {/* Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
                          <button
                            onClick={() => void handleShare(brand.id)}
                            disabled={shareState === "sharing"}
                            aria-label={`Share report for ${brand.name}`}
                            style={{
                              minHeight: "var(--min-tap-target)",
                              padding: "0 var(--space-3)",
                              backgroundColor: "transparent",
                              color: shareState === "copied" ? "var(--color-success)" : "var(--color-primary)",
                              border: `1.5px solid ${shareState === "copied" ? "var(--color-success)" : "var(--color-primary)"}`,
                              borderRadius: "var(--radius-md)",
                              fontSize: "var(--font-size-caption)",
                              fontWeight: 700,
                              fontFamily: "var(--font-family)",
                              cursor: shareState === "sharing" ? "not-allowed" : "pointer",
                              opacity: shareState === "sharing" ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {shareState === "sharing"
                              ? "Sharing…"
                              : shareState === "copied"
                              ? "Copied!"
                              : "Share report"}
                          </button>
                          <a
                            href={`/brands/${brand.id}`}
                            aria-label={`View brand detail for ${brand.name}`}
                            style={{
                              minHeight: "var(--min-tap-target)",
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "0 var(--space-3)",
                              color: "var(--color-primary)",
                              fontSize: "var(--font-size-caption)",
                              fontWeight: 700,
                              fontFamily: "var(--font-family)",
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            View →
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Score badge — green ≥67, amber ≥34, red <34, muted for no score
// ---------------------------------------------------------------------------

function PortfolioScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          minWidth: "48px",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        No score
      </span>
    );
  }
  const color =
    score >= 67 ? "var(--color-success)" : score >= 34 ? "var(--color-warning, #e6a93f)" : "var(--color-error)";
  return (
    <span
      title="Latest Ozvor AI Visibility Score"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "1px",
        fontWeight: 800,
        color,
        fontSize: "var(--font-size-h4)",
        letterSpacing: "-0.02em",
        minWidth: "48px",
        justifyContent: "flex-end",
      }}
    >
      {score}
      <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 500 }}>
        /100
      </span>
    </span>
  );
}
