"use client";

/**
 * /landing-pages — Ozvor Pages hub: list sites, create a new one.
 *
 * Ozvor Pages is the 5-page AI-search-ready website builder (issue #208).
 * This replaces the "Coming soon" teaser now that the full CRUD API (PR-3)
 * and the 5-page generator (PR-4) are live.
 *
 * Entitlement UI: GET /api/landing/allowance drives whether the "New site"
 * action is shown at all. A locked tier (can_create=false, sites_used=0) gets
 * an honest upsell — no fake builder UI, no invented preview numbers. A
 * tenant that already has sites but is at their cap keeps read access to
 * those sites and just loses the "New site" action.
 *
 * Google Maps prefill (#208 PR-9): an optional "Paste your Google Maps link"
 * field at the top of the New-site form. "Fill from Google Maps" calls
 * POST /api/landing/places/resolve and pre-fills name/address/phone/website
 * — every field stays EDITABLE afterward (the user can correct anything;
 * never treated as read-only truth). The resolved place_id rides along in
 * form state and is submitted with the create call. A 503 (no server key
 * configured) hides the field for the rest of this session — simplest
 * consistent pattern, no separate probe-on-open round trip.
 *
 * Accessibility: every input labelled, aria-live status regions, 44px min
 * tap targets, focus-visible outlines (shared with brands/page.tsx pattern).
 */

import { useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ensureProvisioned } from "../../lib/supabase-browser";
import { slugify, validateSiteSlug } from "../../lib/landing-slug";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Allowance {
  max_sites: number | null;
  max_pages_per_site: number | null;
  sites_used: number;
  can_create: boolean;
}

interface SiteListItem {
  id: string;
  slug: string;
  status: "draft" | "published" | "suspended";
  business: { name?: string; [key: string]: unknown };
  created_at: string;
  updated_at: string;
  page_count: number;
  /** Open audit-plan fixes ready to apply on the next generate/regenerate (#208 PR-7). */
  open_fixes: number;
}

type LoadState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  suspended: "Suspended",
};

function statusColors(status: string): { bg: string; text: string } {
  if (status === "published") {
    return { bg: "var(--color-badge-status-active-bg)", text: "var(--color-badge-status-active-text)" };
  }
  if (status === "suspended") {
    return { bg: "var(--color-badge-status-error-bg)", text: "var(--color-badge-status-error-text)" };
  }
  return { bg: "var(--color-badge-status-warn-bg)", text: "var(--color-badge-status-warn-text)" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPagesHubPage() {
  const router = useRouter();

  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [slugFieldError, setSlugFieldError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Google Maps prefill (#208 PR-9) — see file header for the UX contract.
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsFieldAvailable, setMapsFieldAvailable] = useState(true);
  const [resolvingMaps, setResolvingMaps] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResolved, setMapsResolved] = useState(false);
  const [placeId, setPlaceId] = useState<string | null>(null);

  const nameId = useId();
  const categoryId = useId();
  const addressId = useId();
  const phoneId = useId();
  const websiteId = useId();
  const areasId = useId();
  const slugId = useId();
  const mapsUrlId = useId();

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      await ensureProvisioned();
      const [allowRes, sitesRes] = await Promise.all([
        apiFetch("/api/landing/allowance"),
        apiFetch("/api/landing/sites"),
      ]);
      if (!allowRes.ok || !sitesRes.ok) {
        setLoadError("Could not load your Ozvor Pages sites.");
        setLoadState("error");
        return;
      }
      const allowData = (await allowRes.json()) as Allowance;
      const sitesData = (await sitesRes.json()) as { sites?: SiteListItem[] };
      setAllowance(allowData);
      setSites(Array.isArray(sitesData.sites) ? sitesData.sites : []);
      setLoadState("loaded");
    } catch {
      setLoadError("Could not load your Ozvor Pages sites. Check your connection.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live slug feedback — mirrors the server rule (landing-slug.ts).
  useEffect(() => {
    const trimmed = customSlug.trim();
    setSlugFieldError(trimmed ? validateSiteSlug(trimmed) : null);
  }, [customSlug]);

  const slugPreview = (customSlug.trim() || slugify(name)) || "your-business";

  // Google Maps prefill (#208 PR-9). Pure lookup — pre-fills the form fields
  // and stashes place_id for the create call below. Deliberately overwrites
  // whatever's currently in the fields: "Fill from Google Maps" is an
  // explicit user action, and every field stays editable afterward.
  async function handleResolveMaps() {
    const trimmed = mapsUrl.trim();
    if (!trimmed || resolvingMaps) return;
    setResolvingMaps(true);
    setMapsError(null);
    setMapsResolved(false);
    try {
      const res = await apiFetch("/api/landing/places/resolve", {
        method: "POST",
        body: JSON.stringify({ maps_url: trimmed }),
      });
      if (res.status === 503) {
        // No server key configured — hide the field for the rest of this session.
        setMapsFieldAvailable(false);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setMapsError(data.message ?? "Could not look up that business. You can still fill in the form manually.");
        return;
      }
      const data = (await res.json()) as {
        place_id?: string;
        name?: string;
        address?: string | null;
        phone?: string | null;
        website?: string | null;
      };
      if (data.name) setName(data.name);
      if (data.address) setAddress(data.address);
      if (data.phone) setPhone(data.phone);
      if (data.website) setWebsite(data.website);
      setPlaceId(data.place_id ?? null);
      setMapsResolved(true);
    } catch {
      setMapsError("Could not look up that business. Check your connection and try again, or fill in the form manually.");
    } finally {
      setResolvingMaps(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    const trimmedSlug = customSlug.trim();
    if (trimmedSlug && validateSiteSlug(trimmedSlug)) return;

    setCreating(true);
    setFormError(null);
    try {
      const areas = serviceAreas.split(",").map((a) => a.trim()).filter(Boolean);
      const business: Record<string, unknown> = {};
      if (category.trim()) business.category = category.trim();
      if (address.trim()) business.address = address.trim();
      if (phone.trim()) business.phone = phone.trim();
      if (website.trim()) business.website = website.trim();
      if (areas.length > 0) business.serviceAreas = areas;

      const res = await apiFetch("/api/landing/sites", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(trimmedSlug ? { slug: trimmedSlug } : {}),
          business,
          ...(placeId ? { place_id: placeId } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string; code?: string });
        if (data.code === "SLUG_TAKEN" || data.code === "INVALID_SLUG") {
          setSlugFieldError(data.message ?? "That slug is not available.");
        } else {
          setFormError(data.message ?? "Could not create the site. Please try again.");
        }
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/landing-pages/${data.id}`);
    } catch {
      setFormError("Could not create the site. Please check your connection.");
    } finally {
      setCreating(false);
    }
  }

  const lockedNoSites = allowance !== null && !allowance.can_create && allowance.sites_used === 0;
  const cappedWithSites = allowance !== null && !allowance.can_create && allowance.sites_used > 0;

  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-2) 0" }}>
        Ozvor Pages
      </h1>
      <p style={{ color: "var(--color-muted)", margin: "0 0 var(--space-8) 0", fontSize: "var(--font-size-body-sm)", lineHeight: "var(--line-height-body)" }}>
        5-page websites structured for AI search — home, two service pages, FAQ and reviews, every page
        interlinked and built from your real business facts.
      </p>

      {loadError && (
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
          {loadError}
        </div>
      )}

      {loadState === "loading" && (
        <p aria-live="polite" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      )}

      {loadState !== "loading" && lockedNoSites && (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            marginBottom: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}>
            The website builder is included with Growth
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: "var(--line-height-body)", margin: "0 0 var(--space-5) 0" }}>
            Ozvor Pages generates a 5-page AI-search-ready website from your real business facts — home, two
            service pages, FAQ and reviews. It&rsquo;s included on the Growth plan (or buy a site standalone).
          </p>
          <a
            href="/pricing"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "var(--min-button-height)",
              padding: "0 var(--space-6)", backgroundColor: "var(--color-primary)", color: "#fff",
              borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body-sm)", fontWeight: 700, textDecoration: "none",
            }}
          >
            See plans →
          </a>
        </div>
      )}

      {loadState !== "loading" && !lockedNoSites && (
        <>
          {allowance?.can_create ? (
            showForm ? (
              <form
                onSubmit={handleCreate}
                aria-label="New Ozvor Pages site"
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
                  New site
                </h2>

                {formError && (
                  <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-4)" }}>
                    {formError}
                  </div>
                )}

                {mapsFieldAvailable && (
                  <Field id={mapsUrlId} label="Paste your Google Maps link" hint="optional">
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <input
                        id={mapsUrlId}
                        type="url"
                        value={mapsUrl}
                        onChange={(e) => {
                          setMapsUrl(e.target.value);
                          setMapsResolved(false);
                        }}
                        maxLength={2000}
                        placeholder="https://maps.app.goo.gl/..."
                        style={{ ...inputStyle, flex: "1 1 220px" }}
                        aria-describedby={mapsError ? `${mapsUrlId}-status` : undefined}
                      />
                      <button
                        type="button"
                        onClick={handleResolveMaps}
                        disabled={!mapsUrl.trim() || resolvingMaps}
                        style={secondaryButtonStyle(!mapsUrl.trim() || resolvingMaps)}
                      >
                        {resolvingMaps ? "Looking up…" : "Fill from Google Maps"}
                      </button>
                    </div>
                    <p
                      id={`${mapsUrlId}-status`}
                      role="status"
                      aria-live="polite"
                      style={{
                        margin: "var(--space-2) 0 0 0",
                        fontSize: "var(--font-size-caption)",
                        color: mapsError ? "var(--color-error)" : "var(--color-muted)",
                      }}
                    >
                      {mapsError ??
                        (mapsResolved
                          ? "Filled from Google Maps — check and edit anything below before creating your site."
                          : "We'll pre-fill the fields below from your Google Maps listing. Everything stays editable.")}
                    </p>
                    {/* SMB owners often don't know where the Maps share link
                        lives — teach it inline (founder request, #208 PR-9). */}
                    <details style={{ marginTop: "var(--space-2)" }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-primary)",
                          fontWeight: 600,
                          minHeight: "var(--min-tap-target, 44px)",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        Where do I find my Google Maps link?
                      </summary>
                      <ol
                        style={{
                          margin: "var(--space-2) 0 0 0",
                          paddingLeft: "var(--space-5)",
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-muted)",
                          lineHeight: 1.7,
                        }}
                      >
                        <li>
                          Open <strong>Google Maps</strong> (the app, or google.com/maps in your
                          browser).
                        </li>
                        <li>
                          Search for <strong>your business name</strong> and open its listing.
                        </li>
                        <li>
                          Tap/click <strong>Share</strong> (the arrow icon — on desktop it&apos;s
                          in the left panel under your business name).
                        </li>
                        <li>
                          Choose <strong>Copy link</strong> and paste it in the field above.
                        </li>
                      </ol>
                      <p
                        style={{
                          margin: "var(--space-2) 0 0 0",
                          fontSize: "var(--font-size-caption)",
                          color: "var(--color-muted)",
                        }}
                      >
                        Don&apos;t have a Google Maps listing? No problem — just fill in the
                        fields below by hand.
                      </p>
                    </details>
                  </Field>
                )}

                <Field id={nameId} label="Business name" required>
                  <input
                    id={nameId} value={name} onChange={(e) => setName(e.target.value)}
                    required maxLength={120} placeholder="Acme Plumbing" style={inputStyle}
                  />
                </Field>

                <Field id={categoryId} label="Category" hint="e.g. plumber, law firm, dentist">
                  <input id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} placeholder="Plumber" style={inputStyle} />
                </Field>

                <Field id={addressId} label="Address" hint="optional">
                  <input id={addressId} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="123 Main St, Austin, TX" style={inputStyle} />
                </Field>

                <Field id={phoneId} label="Phone" hint="optional">
                  <input id={phoneId} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="(512) 555-0100" style={inputStyle} />
                </Field>

                <Field id={websiteId} label="Website" hint="optional — used to crawl your own services/FAQ for the generator">
                  <input id={websiteId} type="url" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={253} placeholder="acmeplumbing.com" style={inputStyle} />
                </Field>

                <Field id={areasId} label="Service areas" hint="comma-separated, optional">
                  <input id={areasId} value={serviceAreas} onChange={(e) => setServiceAreas(e.target.value)} maxLength={300} placeholder="Austin, Round Rock, Cedar Park" style={inputStyle} />
                </Field>

                <Field id={slugId} label="Custom URL" hint="optional — leave blank to auto-generate">
                  <input
                    id={slugId} value={customSlug} onChange={(e) => setCustomSlug(e.target.value.toLowerCase())}
                    maxLength={64} placeholder={slugify(name) || "acme-plumbing-austin"} style={inputStyle}
                    aria-describedby={`${slugId}-preview`}
                    aria-invalid={Boolean(slugFieldError)}
                  />
                  <p id={`${slugId}-preview`} style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-caption)", color: slugFieldError ? "var(--color-error)" : "var(--color-muted)" }}>
                    {slugFieldError ?? `ozvor.com/l/${slugPreview}`}
                  </p>
                </Field>

                <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
                  <button
                    type="submit"
                    disabled={creating || !name.trim() || Boolean(customSlug.trim() && slugFieldError)}
                    style={primaryButtonStyle(creating || !name.trim() || Boolean(customSlug.trim() && slugFieldError))}
                  >
                    {creating ? "Creating…" : "Create site"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} disabled={creating} style={secondaryButtonStyle(creating)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                style={{ ...primaryButtonStyle(false), width: "auto", padding: "0 var(--space-6)", marginBottom: "var(--space-8)" }}
              >
                + New site
              </button>
            )
          ) : (
            cappedWithSites && (
              <p
                style={{
                  fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: "var(--line-height-body)",
                  marginBottom: "var(--space-8)",
                }}
              >
                You&rsquo;ve used all {allowance!.sites_used} of your {allowance!.max_sites} site(s).{" "}
                <a href="/pricing" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                  Upgrade or buy another site →
                </a>
              </p>
            )
          )}

          <div aria-live="polite">
            {sites.length === 0 ? (
              <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
                No sites yet. Create one above to get started.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {sites.map((site) => {
                  const colors = statusColors(site.status);
                  return (
                    <li key={site.id}>
                      <a
                        href={`/landing-pages/${site.id}`}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)",
                          padding: "var(--space-4) var(--space-5)", backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", textDecoration: "none",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "var(--color-text)" }}>
                            {site.business?.name || "Untitled site"}
                          </div>
                          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                            ozvor.com/l/{site.slug}
                          </div>
                          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "2px" }}>
                            {site.page_count} page{site.page_count === 1 ? "" : "s"} · updated {formatDate(site.updated_at)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-2)", flexShrink: 0 }}>
                          <span
                            role="status"
                            aria-label={`Status: ${STATUS_LABEL[site.status] ?? site.status}`}
                            style={{
                              display: "inline-block", padding: "2px 10px", borderRadius: "var(--radius-pill)",
                              fontSize: "var(--font-size-caption)", fontWeight: 600, color: colors.text, backgroundColor: colors.bg,
                            }}
                          >
                            {STATUS_LABEL[site.status] ?? site.status}
                          </span>
                          {site.open_fixes > 0 && (
                            <span
                              style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: "var(--radius-pill)",
                                fontSize: "var(--font-size-caption)", fontWeight: 600,
                                color: "var(--color-accent-ink)", backgroundColor: "var(--color-badge-ai-bg)", whiteSpace: "nowrap",
                              }}
                            >
                              {site.open_fixes} fix{site.open_fixes === 1 ? "" : "es"} ready
                            </span>
                          )}
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <style>{`
        button:focus-visible, a:focus-visible, input:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers (inline styles, token-driven — brands/page.tsx pattern)
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

const alertStyle: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  backgroundColor: "var(--color-badge-status-error-bg)",
  border: "1px solid var(--color-error)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-error)",
  fontSize: "var(--font-size-body-sm)",
};

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
    minHeight: "var(--min-tap-target)", padding: "0 var(--space-5)",
    backgroundColor: "transparent", color: "var(--color-text)",
    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-body-sm)", fontWeight: 600, fontFamily: "var(--font-family)",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  };
}
