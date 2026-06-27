"use client";

/**
 * /brands — Ozvor brand list + create + trigger audit
 *
 * Flow:
 *  - Create a brand profile (name, domain, category, region).
 *  - Each brand row shows its latest Ozvor AI Visibility Score (if any) and a
 *    "Run audit" action that POSTs to /api/brands/:id/audit and navigates
 *    to the brand detail page where the score streams in.
 *
 * region drives the provider routing gate (EU excludes Perplexity until SCCs).
 *
 * Calls the API at same-origin /api/* (Next rewrites to the Hono API).
 * Accessibility: labelled inputs, aria-live for async status, 44px tap targets.
 */

import { useState, useEffect, useId, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/supabase-browser";

type Region = "EU" | "US";

interface Brand {
  id: string;
  name: string;
  domain?: string | null;
  category?: string | null;
  region: Region;
  latest_score?: number | null;
}

const PROFILE_FIELDS: { key: string; label: string; placeholder: string; stateKey: ProfileUrlKey }[] = [
  { key: "linkedin_url",    label: "LinkedIn",    placeholder: "https://linkedin.com/company/your-brand",  stateKey: "linkedinUrl"    },
  { key: "reddit_url",     label: "Reddit",      placeholder: "https://reddit.com/r/your-brand",           stateKey: "redditUrl"      },
  { key: "wikipedia_url",  label: "Wikipedia",   placeholder: "https://en.wikipedia.org/wiki/Your_Brand",  stateKey: "wikipediaUrl"   },
  { key: "g2_url",         label: "G2",          placeholder: "https://g2.com/products/your-brand",        stateKey: "g2Url"          },
  { key: "trustpilot_url", label: "Trustpilot",  placeholder: "https://trustpilot.com/review/yourdomain.com", stateKey: "trustpilotUrl" },
  { key: "crunchbase_url", label: "Crunchbase",  placeholder: "https://crunchbase.com/organization/your-brand", stateKey: "crunchbaseUrl" },
  { key: "youtube_url",    label: "YouTube",     placeholder: "https://youtube.com/@YourBrand",            stateKey: "youtubeUrl"     },
];

type ProfileUrlKey = "linkedinUrl" | "redditUrl" | "wikipediaUrl" | "g2Url" | "trustpilotUrl" | "crunchbaseUrl" | "youtubeUrl";
type ProfileUrlState = Record<ProfileUrlKey, string>;

const EMPTY_PROFILE_URLS: ProfileUrlState = {
  linkedinUrl: "", redditUrl: "", wikipediaUrl: "",
  g2Url: "", trustpilotUrl: "", crunchbaseUrl: "", youtubeUrl: "",
};

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  // Default to US so all 5 engines run. EU region gates OpenAI/Gemini/Perplexity
  // behind *_EU_ENABLED flags, which would silently collapse the audit to Claude
  // only — the multi-engine result is the whole value prop, so US is the safer
  // default. (EU residency stays selectable for users who require it.)
  const [region, setRegion] = useState<Region>("US");
  const [creating, setCreating] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  // Public profile URL state
  const [profileUrls, setProfileUrls] = useState<ProfileUrlState>(EMPTY_PROFILE_URLS);
  const [profilesExpanded, setProfilesExpanded] = useState(false);

  const nameId = useId();
  const domainId = useId();
  const categoryId = useId();
  const regionId = useId();
  const profilesSectionId = useId();

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/brands", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setBrands(Array.isArray(data) ? data : (data.brands ?? []));
      } else if (res.status === 404) {
        // No list endpoint yet — start empty (create still works).
        setBrands([]);
      }
    } catch {
      setError("Could not load your brands. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrands();
  }, [loadBrands]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          domain: domain.trim() || undefined,
          category: category.trim() || undefined,
          region,
          ...(profileUrls.linkedinUrl.trim()    ? { linkedin_url:    profileUrls.linkedinUrl.trim()    } : {}),
          ...(profileUrls.redditUrl.trim()      ? { reddit_url:      profileUrls.redditUrl.trim()      } : {}),
          ...(profileUrls.wikipediaUrl.trim()   ? { wikipedia_url:   profileUrls.wikipediaUrl.trim()   } : {}),
          ...(profileUrls.g2Url.trim()          ? { g2_url:          profileUrls.g2Url.trim()          } : {}),
          ...(profileUrls.trustpilotUrl.trim()  ? { trustpilot_url:  profileUrls.trustpilotUrl.trim()  } : {}),
          ...(profileUrls.crunchbaseUrl.trim()  ? { crunchbase_url:  profileUrls.crunchbaseUrl.trim()  } : {}),
          ...(profileUrls.youtubeUrl.trim()     ? { youtube_url:     profileUrls.youtubeUrl.trim()     } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Could not create the brand. Please try again.");
        return;
      }
      setName("");
      setDomain("");
      setCategory("");
      setProfileUrls(EMPTY_PROFILE_URLS);
      setProfilesExpanded(false);
      await loadBrands();
    } catch {
      setError("Could not create the brand. Please check your connection.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRunAudit(brandId: string) {
    if (triggering) return;
    setTriggering(brandId);
    setError(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/audit`, { method: "POST" });
      if (!res.ok) {
        setError("Could not start the audit. Please try again.");
        return;
      }
      const data = await res.json();
      // Navigate to the brand detail; the audit streams in there.
      router.push(`/brands/${brandId}?audit=${data.audit_id ?? ""}`);
    } catch {
      setError("Could not start the audit. Please check your connection.");
    } finally {
      setTriggering(null);
    }
  }

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
          margin: "0 0 var(--space-2) 0",
        }}
      >
        Your brands
      </h1>
      <p style={{ color: "var(--color-muted)", margin: "0 0 var(--space-8) 0", fontSize: "var(--font-size-body-sm)" }}>
        Add a brand, then run an AI Visibility Audit to see your Ozvor AI Visibility Score.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "#FEF2F2",
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

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        aria-label="Add a brand"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          marginBottom: "var(--space-8)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>
          Add a brand
        </h2>

        <Field id={nameId} label="Brand name" required>
          <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} required
            placeholder="Acme CRM" style={inputStyle} />
        </Field>

        <Field id={domainId} label="Website domain" hint="optional">
          <input id={domainId} value={domain} onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com" style={inputStyle} />
        </Field>

        <Field id={categoryId} label="Category" hint="e.g. CRM, accounting, law firm">
          <input id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)}
            placeholder="CRM" style={inputStyle} />
        </Field>

        <Field id={regionId} label="Data region" hint="drives AI-provider data routing">
          <select id={regionId} value={region} onChange={(e) => setRegion(e.target.value as Region)} style={inputStyle}>
            <option value="EU">EU (GDPR — excludes Perplexity until SCCs confirmed)</option>
            <option value="US">US</option>
          </select>
        </Field>

        {/* ── Public profiles — collapsible section ─────────────────── */}
        <div style={{ marginBottom: "var(--space-4)" }}>
          <button
            type="button"
            aria-expanded={profilesExpanded}
            aria-controls={profilesSectionId}
            onClick={() => setProfilesExpanded((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-primary)",
              fontWeight: 700,
              fontSize: "var(--font-size-body-sm)",
              fontFamily: "var(--font-family)",
              minHeight: "var(--min-tap-target)",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: "var(--font-size-caption)", transition: "transform 0.15s ease", display: "inline-block", transform: profilesExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            Public profiles (optional)
          </button>

          <div
            id={profilesSectionId}
            role="region"
            aria-label="Public profile URLs"
            hidden={!profilesExpanded}
            style={{ marginTop: "var(--space-3)" }}
          >
            <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              Paste your brand&rsquo;s exact profile URLs. The audit uses these to confirm your presence on each platform directly — more accurate than name searches.
            </p>
            {PROFILE_FIELDS.map((f) => {
              const inputId = `create-profile-${f.stateKey}`;
              return (
                <div key={f.stateKey} style={{ marginBottom: "var(--space-3)" }}>
                  <label
                    htmlFor={inputId}
                    style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}
                  >
                    {f.label}{" "}
                    <span style={{ color: "var(--color-muted)", fontWeight: 400, fontSize: "var(--font-size-caption)" }}>
                      (optional, improves audit accuracy)
                    </span>
                  </label>
                  <input
                    id={inputId}
                    type="url"
                    pattern="https?://.*"
                    value={profileUrls[f.stateKey]}
                    onChange={(e) => setProfileUrls((prev) => ({ ...prev, [f.stateKey]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={inputStyle}
                    autoComplete="url"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <button type="submit" disabled={creating || !name.trim()} style={primaryButtonStyle(creating || !name.trim())}>
          {creating ? "Adding…" : "Add brand"}
        </button>
      </form>

      {/* Brand list */}
      <div aria-live="polite">
        {loading ? (
          <p style={{ color: "var(--color-muted)" }}>Loading…</p>
        ) : brands.length === 0 ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
            No brands yet. Add one above to run your first audit.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {brands.map((b) => (
              <li key={b.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)",
                  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <a href={`/brands/${b.id}`} style={{ fontWeight: 700, color: "var(--color-text)", textDecoration: "none" }}>
                    {b.name}
                  </a>
                  <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                    {b.region}{b.category ? ` · ${b.category}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexShrink: 0 }}>
                  {typeof b.latest_score === "number" && (
                    <ScoreBadge score={b.latest_score} />
                  )}
                  <button onClick={() => handleRunAudit(b.id)} disabled={triggering === b.id}
                    style={secondaryButtonStyle(triggering === b.id)}>
                    {triggering === b.id ? "Starting…" : "Run audit"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers (inline styles, token-driven)
// ---------------------------------------------------------------------------

function Field({ id, label, hint, required, children }: {
  id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <label htmlFor={id} style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
        {label}{" "}
        {required ? <span aria-hidden="true" style={{ color: "var(--color-error)" }}>*</span>
          : hint ? <span style={{ color: "var(--color-muted)", fontWeight: 400, fontSize: "var(--font-size-caption)" }}>({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 67 ? "var(--color-success)" : score >= 34 ? "#d97706" : "var(--color-error)";
  return (
    <span title="Latest Ozvor AI Visibility Score" style={{
      display: "inline-flex", alignItems: "baseline", gap: "2px",
      fontWeight: 800, color, fontSize: "var(--font-size-h3)", letterSpacing: "-0.02em",
    }}>
      {score}<span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 500 }}>/100</span>
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: "48px", padding: "0 var(--space-4)",
  fontSize: "var(--font-size-body)", fontFamily: "var(--font-family)", color: "var(--color-text)",
  backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", outline: "none",
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", height: "var(--min-button-height)",
    backgroundColor: disabled ? "var(--color-muted)" : "var(--color-primary)", color: "#fff",
    border: "none", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body)",
    fontWeight: 600, fontFamily: "var(--font-family)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: "var(--min-tap-target)", padding: "0 var(--space-4)",
    backgroundColor: "transparent", color: "var(--color-primary)",
    border: "1.5px solid var(--color-primary)", borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-body-sm)", fontWeight: 700, fontFamily: "var(--font-family)",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
  };
}
