"use client";

/**
 * /landing-pages/[siteId]/pages/[pageId] — Ozvor Pages page editor (issue #208, PR-5).
 *
 * Title/slug + SEO fields, an ordered sections editor (no drag lib — up/down
 * buttons), a version history panel, and a publish toggle. The publish
 * toggle pre-checks the placeholder-content guard client-side (this editor
 * has the page's sections loaded, unlike the site detail page) using the
 * same marker the server checks (apps/api/src/routes/landing.ts
 * containsPlaceholder / lib/landing-sections.ts's mirror) — the server
 * re-checks authoritatively regardless.
 *
 * Section field editors cover every known type from
 * packages/llm/src/landing-generate.ts's LandingSectionType; anything else
 * (a future generator shape, or hand-edited JSON) renders through a generic,
 * never-crashing fallback (string/number fields editable, everything else a
 * read-only preview).
 */

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ensureProvisioned } from "../../../../../lib/supabase-browser";
import {
  KNOWN_SECTION_TYPES,
  type LandingSection,
  type LandingSectionType,
  createSection,
  sectionTypeLabel,
  sectionsWithPlaceholder,
  pageTypeLabel,
} from "../../../../../lib/landing-sections";
import { SectionRenderer } from "../../../../../components/landing-public/SectionRenderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageSeo {
  title: string;
  description: string;
}

interface PageData {
  id: string;
  site_id: string;
  page_type: string;
  slug: string;
  title: string;
  sections: LandingSection[];
  seo: PageSeo;
  ai_readiness: { score?: number } | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionItem {
  version: number;
  saved_by: string;
  created_at: string;
}

type LoadState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function serializeDraft(title: string, slug: string, seo: PageSeo, sections: LandingSection[]): string {
  return JSON.stringify({ title, slug, seo, sections });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPageEditorPage() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const { siteId, pageId } = params;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [isHome, setIsHome] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [sections, setSections] = useState<LandingSection[]>([]);
  const baselineRef = useRef("");

  // Site theme + slug for an accurate live preview (fetched once).
  const [siteTheme, setSiteTheme] = useState<unknown>(undefined);
  const [siteSlug, setSiteSlug] = useState("");

  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [publishToggling, setPublishToggling] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [addType, setAddType] = useState<LandingSectionType>(KNOWN_SECTION_TYPES[0] as LandingSectionType);

  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const titleId = useId();
  const slugId = useId();
  const seoTitleId = useId();
  const seoDescId = useId();

  // Fetch the site's theme + slug once so the live preview matches production.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/landing/sites/${siteId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { site?: { theme?: unknown; slug?: string } };
        setSiteTheme(data.site?.theme);
        setSiteSlug(data.site?.slug ?? "");
      } catch {
        // Non-fatal — the preview falls back to the default theme.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function showToast(message: string, kind: "success" | "error") {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 5000);
  }

  function applyPageData(data: PageData) {
    setPage(data);
    setIsHome(data.slug === "");
    setTitle(data.title ?? "");
    setSlug(data.slug ?? "");
    setSeoTitle(data.seo?.title ?? "");
    setSeoDescription(data.seo?.description ?? "");
    setSections(Array.isArray(data.sections) ? data.sections : []);
    baselineRef.current = serializeDraft(data.title ?? "", data.slug ?? "", data.seo ?? { title: "", description: "" }, Array.isArray(data.sections) ? data.sections : []);
  }

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const res = await apiFetch(`/api/landing/pages/${pageId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { page: PageData };
    applyPageData(data.page);
    return data.page;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const loadVersions = useCallback(async () => {
    const res = await apiFetch(`/api/landing/pages/${pageId}/versions`);
    if (res.ok) {
      const data = (await res.json()) as { versions: VersionItem[] };
      setVersions(data.versions ?? []);
    }
    setVersionsLoaded(true);
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        await ensureProvisioned();
        const p = await loadPage();
        if (cancelled) return;
        if (!p) {
          setLoadError("Page not found.");
          setLoadState("error");
          return;
        }
        setLoadState("loaded");
        void loadVersions();
      } catch {
        if (!cancelled) {
          setLoadError("Could not load this page. Check your connection.");
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const dirty = serializeDraft(title, slug, { title: seoTitle, description: seoDescription }, sections) !== baselineRef.current;

  // -------------------------------------------------------------------------
  // Section list mutations
  // -------------------------------------------------------------------------
  function updateSectionAt(index: number, next: LandingSection) {
    setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
  }
  function moveSection(index: number, dir: -1 | 1) {
    setSections((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index] as LandingSection;
      next[index] = next[target] as LandingSection;
      next[target] = tmp;
      return next;
    });
  }
  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }
  function addSection() {
    setSections((prev) => [...prev, createSection(addType)]);
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!page || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const seo: PageSeo = { title: seoTitle.slice(0, 70), description: seoDescription.slice(0, 160) };
      const res = await apiFetch(`/api/landing/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), slug: slug.trim(), sections, seo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setSaveError(data.message ?? "Could not save. Please try again.");
        return;
      }
      baselineRef.current = serializeDraft(title.trim(), slug.trim(), seo, sections);
      setPage((prev) => (prev ? { ...prev, title: title.trim(), slug: slug.trim(), seo, sections } : prev));
      showToast("Saved — previous version kept.", "success");
      void loadVersions();
    } catch {
      setSaveError("Could not save. Please check your connection.");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Publish toggle — client-side placeholder pre-check, server re-checks.
  // -------------------------------------------------------------------------
  async function handlePublishToggle() {
    if (!page || publishToggling) return;
    const nextStatus: "draft" | "published" = page.status === "published" ? "draft" : "published";
    setPublishError(null);

    if (nextStatus === "published") {
      if (dirty) {
        setPublishError("Save your changes before publishing.");
        return;
      }
      const offending = sectionsWithPlaceholder(sections);
      if (offending.length > 0) {
        const list = offending.map((i) => `#${i + 1} (${sectionTypeLabel((sections[i] as LandingSection).type)})`).join(", ");
        setPublishError(`Section${offending.length > 1 ? "s" : ""} ${list} still ${offending.length > 1 ? "have" : "has"} placeholder content. Fill them in before publishing.`);
        return;
      }
    }

    setPublishToggling(true);
    try {
      const res = await apiFetch(`/api/landing/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setPublishError(data.message ?? "Could not update status. Please try again.");
        return;
      }
      setPage((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      showToast(nextStatus === "published" ? "Page published." : "Page set back to draft.", "success");
    } catch {
      setPublishError("Could not update status. Please check your connection.");
    } finally {
      setPublishToggling(false);
    }
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------
  async function handleRestore(version: number) {
    if (restoringVersion !== null) return;
    if (!window.confirm(`Restore version ${version}? Your current state will be saved as a new version first.`)) return;
    setRestoringVersion(version);
    try {
      const res = await apiFetch(`/api/landing/pages/${pageId}/versions/${version}/restore`, { method: "POST" });
      if (!res.ok) {
        showToast("Could not restore that version.", "error");
        return;
      }
      await loadPage();
      await loadVersions();
      showToast(`Restored v${version} — current state was saved as a new version.`, "success");
    } catch {
      showToast("Could not restore that version. Please check your connection.", "error");
    } finally {
      setRestoringVersion(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loadState === "loading") {
    return (
      <main style={pageStyle}>
        <p aria-live="polite" style={{ color: "var(--color-muted)" }}>Loading…</p>
      </main>
    );
  }

  if (loadState === "error" || !page) {
    return (
      <main style={pageStyle}>
        <p role="alert" style={{ color: "var(--color-error)" }}>{loadError ?? "Page not found."}</p>
        <a href={`/landing-pages/${siteId}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>← Back to site</a>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      {toast && (
        <div
          role="status" aria-live="polite" aria-atomic="true"
          style={{
            position: "fixed", top: "var(--space-4)", left: "50%", transform: "translateX(-50%)", zIndex: 100,
            backgroundColor: toast.kind === "success" ? "var(--color-success)" : "var(--color-error)",
            color: "#fff", padding: "var(--space-3) var(--space-6)", borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body-sm)", fontWeight: 600, boxShadow: "var(--shadow-modal)", whiteSpace: "nowrap",
          }}
        >
          {toast.message}
        </div>
      )}

      <a href={`/landing-pages/${siteId}`} style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>
        ← Back to site
      </a>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", margin: "var(--space-3) 0 var(--space-6) 0" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            {pageTypeLabel(page.page_type)}{isHome ? " (home)" : ""}
          </h1>
          {dirty && (
            <span
              style={{ display: "inline-block", marginTop: "var(--space-2)", padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: "var(--font-size-caption)", fontWeight: 600, color: "var(--color-badge-status-warn-text)", backgroundColor: "var(--color-badge-status-warn-bg)" }}
            >
              Unsaved changes
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button type="button" onClick={handleSave} disabled={saving || !dirty} style={primaryButtonStyle(saving || !dirty)}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button" onClick={handlePublishToggle} disabled={publishToggling || (dirty && page.status !== "published")}
            title={dirty && page.status !== "published" ? "Save your changes before publishing" : undefined}
            style={secondaryButtonStyle(publishToggling || (dirty && page.status !== "published"))}
          >
            {publishToggling ? "Updating…" : page.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {saveError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-4)" }}>{saveError}</div>}
      {publishError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-4)" }}>{publishError}</div>}

      {/* ── Title / slug ────────────────────────────────────────────────── */}
      <section style={cardStyle}>
        <Field id={titleId} label="Title" required>
          <input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} style={inputStyle} />
        </Field>
        <Field id={slugId} label="URL slug" hint={isHome ? "home page uses the site root URL" : undefined}>
          <input id={slugId} value={isHome ? "" : slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={isHome} maxLength={64} style={{ ...inputStyle, opacity: isHome ? 0.6 : 1 }} placeholder={isHome ? "(site root)" : undefined} />
        </Field>
      </section>

      {/* ── SEO ─────────────────────────────────────────────────────────── */}
      <section style={cardStyle}>
        <h2 style={sectionHeadingStyle}>SEO</h2>
        <Field id={seoTitleId} label="SEO title" hint={`${seoTitle.length}/70`}>
          <input id={seoTitleId} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value.slice(0, 70))} maxLength={70} style={inputStyle} />
        </Field>
        <Field id={seoDescId} label="SEO description" hint={`${seoDescription.length}/160`}>
          <textarea id={seoDescId} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value.slice(0, 160))} maxLength={160} rows={2} style={textareaStyle} />
        </Field>
      </section>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <section style={cardStyle} aria-labelledby="sections-heading">
        <h2 id="sections-heading" style={sectionHeadingStyle}>Sections ({sections.length})</h2>

        {sections.length === 0 && (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", marginBottom: "var(--space-4)" }}>
            No sections yet — add one below.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
          {sections.map((section, index) => (
            <SectionCard
              key={index}
              section={section}
              index={index}
              total={sections.length}
              onChange={updateSectionAt}
              onMove={moveSection}
              onRemove={removeSection}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
          <label htmlFor="add-section-type" style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}>
            Add section:
          </label>
          <select id="add-section-type" value={addType} onChange={(e) => setAddType(e.target.value as LandingSectionType)} style={{ ...inputStyle, width: "auto" }}>
            {KNOWN_SECTION_TYPES.map((t) => (
              <option key={t} value={t}>{sectionTypeLabel(t)}</option>
            ))}
          </select>
          <button type="button" onClick={addSection} style={secondaryButtonStyle(false)}>+ Add section</button>
        </div>
      </section>

      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <section style={cardStyle} aria-labelledby="preview-heading">
        <h2 id="preview-heading" style={sectionHeadingStyle}>Live preview</h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", marginBottom: "var(--space-3)" }}>
          Exactly how this page renders, with your brand colour and template — updates as you edit. Save to publish.
        </p>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: "#ffffff",
            maxHeight: "640px",
            overflowY: "auto",
          }}
        >
          {sections.length === 0 ? (
            <p style={{ padding: "var(--space-8)", color: "var(--color-muted)", textAlign: "center" }}>
              Add sections to see the preview.
            </p>
          ) : (
            <SectionRenderer sections={sections} theme={siteTheme} siteSlug={siteSlug || "preview"} />
          )}
        </div>
      </section>

      {/* ── Versions ────────────────────────────────────────────────────── */}
      <section style={cardStyle} aria-labelledby="versions-heading">
        <h2 id="versions-heading" style={sectionHeadingStyle}>Version history</h2>
        {!versionsLoaded ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>Loading…</p>
        ) : versions.length === 0 ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>No previous versions yet — saving creates one.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {versions.map((v) => (
              <li key={v.version} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)" }}>
                <span style={{ fontSize: "var(--font-size-body-sm)" }}>
                  v{v.version} · {v.saved_by} · {formatDateTime(v.created_at)}
                </span>
                <button
                  type="button" onClick={() => handleRestore(v.version)} disabled={restoringVersion !== null}
                  style={secondaryButtonStyle(restoringVersion !== null)}
                >
                  {restoringVersion === v.version ? "Restoring…" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — header (type label + reorder/remove) + per-type field body.
// ---------------------------------------------------------------------------

function SectionCard({ section, index, total, onChange, onMove, onRemove }: {
  section: LandingSection;
  index: number;
  total: number;
  onChange: (index: number, next: LandingSection) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  const idBase = useId();
  const set = (key: string, value: unknown) => onChange(index, { ...section, [key]: value });

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", backgroundColor: "var(--color-surface-muted)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <span style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
          #{index + 1} — {sectionTypeLabel(section.type)}
        </span>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move section ${index + 1} up`} style={iconButtonStyle}>↑</button>
          <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1} aria-label={`Move section ${index + 1} down`} style={iconButtonStyle}>↓</button>
          <button type="button" onClick={() => onRemove(index)} aria-label={`Remove section ${index + 1}`} style={{ ...iconButtonStyle, color: "var(--color-error)", borderColor: "var(--color-error)" }}>×</button>
        </div>
      </div>

      <SectionFields idBase={idBase} section={section} set={set} onChange={(next) => onChange(index, next)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionFields — dispatches to a per-type editor; unknown types fall back
// to a generic, never-crashing renderer.
// ---------------------------------------------------------------------------

function SectionFields({ idBase, section, set, onChange }: {
  idBase: string;
  section: LandingSection;
  set: (key: string, value: unknown) => void;
  onChange: (next: LandingSection) => void;
}) {
  const str = (key: string): string => (typeof section[key] === "string" ? (section[key] as string) : "");
  const list = (key: string): unknown[] => (Array.isArray(section[key]) ? (section[key] as unknown[]) : []);

  switch (section.type) {
    case "hero":
      return (
        <>
          <Field id={`${idBase}-headline`} label="Headline">
            <input id={`${idBase}-headline`} value={str("headline")} onChange={(e) => set("headline", e.target.value)} maxLength={120} style={inputStyle} />
          </Field>
          <Field id={`${idBase}-subheadline`} label="Subheadline">
            <input id={`${idBase}-subheadline`} value={str("subheadline")} onChange={(e) => set("subheadline", e.target.value)} maxLength={200} style={inputStyle} />
          </Field>
          <Field id={`${idBase}-cta`} label="CTA label">
            <input id={`${idBase}-cta`} value={str("cta_label")} onChange={(e) => set("cta_label", e.target.value)} maxLength={40} style={inputStyle} />
          </Field>
        </>
      );

    case "services":
    case "areas":
      return (
        <>
          <Field id={`${idBase}-heading`} label="Heading">
            <input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={inputStyle} />
          </Field>
          <Field id={`${idBase}-items`} label={section.type === "services" ? "Services" : "Areas"}>
            <StringListEditor items={list("items")} onChange={(next) => set("items", next)} addLabel={section.type === "services" ? "+ Add service" : "+ Add area"} idBase={`${idBase}-items`} />
          </Field>
        </>
      );

    case "map_nap":
      return (
        <>
          <Field id={`${idBase}-name`} label="Business name"><input id={`${idBase}-name`} value={str("name")} onChange={(e) => set("name", e.target.value)} maxLength={120} style={inputStyle} /></Field>
          <Field id={`${idBase}-address`} label="Address"><input id={`${idBase}-address`} value={str("address")} onChange={(e) => set("address", e.target.value)} maxLength={200} style={inputStyle} /></Field>
          <Field id={`${idBase}-phone`} label="Phone"><input id={`${idBase}-phone`} value={str("phone")} onChange={(e) => set("phone", e.target.value)} maxLength={40} style={inputStyle} /></Field>
          <Field id={`${idBase}-website`} label="Website"><input id={`${idBase}-website`} value={str("website")} onChange={(e) => set("website", e.target.value)} maxLength={253} style={inputStyle} /></Field>
        </>
      );

    case "cta":
      return (
        <>
          <Field id={`${idBase}-heading`} label="Heading"><input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={120} style={inputStyle} /></Field>
          <Field id={`${idBase}-cta`} label="Button label"><input id={`${idBase}-cta`} value={str("cta_label")} onChange={(e) => set("cta_label", e.target.value)} maxLength={40} style={inputStyle} /></Field>
          <Field id={`${idBase}-phone`} label="Phone (target)"><input id={`${idBase}-phone`} value={str("phone")} onChange={(e) => set("phone", e.target.value)} maxLength={40} style={inputStyle} /></Field>
          <Field id={`${idBase}-website`} label="Website (target)"><input id={`${idBase}-website`} value={str("website")} onChange={(e) => set("website", e.target.value)} maxLength={253} style={inputStyle} /></Field>
        </>
      );

    case "hours":
      return (
        <>
          <Field id={`${idBase}-heading`} label="Heading"><input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={inputStyle} /></Field>
          <Field id={`${idBase}-hours`} label="Hours"><input id={`${idBase}-hours`} value={str("hours")} onChange={(e) => set("hours", e.target.value)} maxLength={200} style={inputStyle} /></Field>
        </>
      );

    case "trust":
      return (
        <>
          <Field id={`${idBase}-heading`} label="Heading"><input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={inputStyle} /></Field>
          <Field id={`${idBase}-themes`} label="Themes">
            <StringListEditor items={list("themes")} onChange={(next) => set("themes", next)} addLabel="+ Add theme" idBase={`${idBase}-themes`} />
          </Field>
          {typeof section["testimonial_count"] === "number" && (
            <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
              Based on {section["testimonial_count"] as number} testimonial(s) — computed by the generator.
            </p>
          )}
        </>
      );

    case "faq":
      return (
        <Field id={`${idBase}-heading`} label="Heading">
          <input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={{ ...inputStyle, marginBottom: "var(--space-3)" }} />
          <FaqItemsEditor items={list("items") as Array<{ q?: string; a?: string }>} onChange={(next) => set("items", next)} />
        </Field>
      );

    case "proof":
      return (
        <Field id={`${idBase}-heading`} label="Heading">
          <input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={{ ...inputStyle, marginBottom: "var(--space-3)" }} />
          <ProofItemsEditor items={list("items") as Array<{ author?: string; body?: string; rating?: number | null }>} onChange={(next) => set("items", next)} />
        </Field>
      );

    case "text": {
      const links = section["links"];
      if (Array.isArray(links)) {
        return (
          <>
            <Field id={`${idBase}-heading`} label="Heading"><input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={inputStyle} /></Field>
            <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
              Internal links to the other pages of this site — labels are editable, destinations are not.
            </p>
            {(links as Array<{ label?: string; slug?: string }>).map((link, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <input
                  aria-label={`Link ${i + 1} label`} value={link.label ?? ""} maxLength={60}
                  onChange={(e) => {
                    const next = (links as Array<{ label?: string; slug?: string }>).map((l, j) => (j === i ? { ...l, label: e.target.value } : l));
                    set("links", next);
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  /{link.slug || ""}
                </span>
              </div>
            ))}
          </>
        );
      }
      return (
        <>
          <Field id={`${idBase}-heading`} label="Heading"><input id={`${idBase}-heading`} value={str("heading")} onChange={(e) => set("heading", e.target.value)} maxLength={80} style={inputStyle} /></Field>
          <Field id={`${idBase}-body`} label="Body">
            <textarea id={`${idBase}-body`} value={str("body")} onChange={(e) => set("body", e.target.value)} maxLength={2000} rows={4} style={textareaStyle} />
          </Field>
        </>
      );
    }

    default:
      return <GenericSectionFields idBase={idBase} section={section} onChange={onChange} />;
  }
}

// ---------------------------------------------------------------------------
// Reusable field editors
// ---------------------------------------------------------------------------

function StringListEditor({ items, onChange, addLabel, idBase }: {
  items: unknown[]; onChange: (next: unknown[]) => void; addLabel: string; idBase: string;
}) {
  return (
    <div>
      {items.map((item, i) => {
        const isString = typeof item === "string";
        let preview = "";
        if (!isString) {
          try { preview = JSON.stringify(item); } catch { preview = String(item); }
        }
        return (
          <div key={i} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <input
              id={`${idBase}-${i}`}
              value={isString ? (item as string) : preview}
              readOnly={!isString}
              aria-label={isString ? `Item ${i + 1}` : `Item ${i + 1} (complex value — not editable here)`}
              onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
              style={{ ...inputStyle, flex: 1, color: isString ? "var(--color-text)" : "var(--color-muted)" }}
            />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`} style={iconButtonStyle}>×</button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...items, ""])} style={secondaryButtonStyle(false)}>{addLabel}</button>
    </div>
  );
}

function FaqItemsEditor({ items, onChange }: {
  items: Array<{ q?: string; a?: string }>; onChange: (next: Array<{ q?: string; a?: string }>) => void;
}) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 600, color: "var(--color-muted)" }}>Question {i + 1}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove FAQ item ${i + 1}`} style={iconButtonStyle}>×</button>
          </div>
          <input
            aria-label={`FAQ question ${i + 1}`} value={item.q ?? ""} maxLength={200}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, q: e.target.value } : it)))}
            style={{ ...inputStyle, marginBottom: "var(--space-2)" }} placeholder="Question"
          />
          <textarea
            aria-label={`FAQ answer ${i + 1}`} value={item.a ?? ""} maxLength={1000} rows={2}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, a: e.target.value } : it)))}
            style={textareaStyle} placeholder="Answer"
          />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { q: "", a: "" }])} style={secondaryButtonStyle(false)}>+ Add question</button>
    </div>
  );
}

function ProofItemsEditor({ items, onChange }: {
  items: Array<{ author?: string; body?: string; rating?: number | null }>;
  onChange: (next: Array<{ author?: string; body?: string; rating?: number | null }>) => void;
}) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 600, color: "var(--color-muted)" }}>Review {i + 1}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove review ${i + 1}`} style={iconButtonStyle}>×</button>
          </div>
          <input
            aria-label={`Reviewer name ${i + 1}`} value={item.author ?? ""} maxLength={120}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, author: e.target.value } : it)))}
            style={{ ...inputStyle, marginBottom: "var(--space-2)" }} placeholder="Author"
          />
          <textarea
            aria-label={`Review body ${i + 1}`} value={item.body ?? ""} maxLength={1000} rows={2}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, body: e.target.value } : it)))}
            style={{ ...textareaStyle, marginBottom: "var(--space-2)" }} placeholder="Review text"
          />
          <select
            aria-label={`Rating ${i + 1}`} value={item.rating != null ? String(item.rating) : ""}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, rating: e.target.value ? Number(e.target.value) : null } : it)))}
            style={{ ...inputStyle, width: "auto" }}
          >
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n} / 5</option>))}
          </select>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { author: "", body: "", rating: null }])} style={secondaryButtonStyle(false)}>+ Add review</button>
    </div>
  );
}

/** Unknown section type — never crash. Editable for string/number/string[]
 *  fields; anything else (nested objects, mixed arrays) is a read-only preview. */
function GenericSectionFields({ idBase, section, onChange }: {
  idBase: string; section: LandingSection; onChange: (next: LandingSection) => void;
}) {
  const entries = Object.entries(section).filter(([k]) => k !== "type");
  if (entries.length === 0) {
    return <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}>No editable fields for this section type.</p>;
  }
  return (
    <div>
      {entries.map(([key, value]) => {
        const fieldId = `${idBase}-generic-${key}`;
        if (typeof value === "string") {
          return (
            <Field key={key} id={fieldId} label={key}>
              <input id={fieldId} value={value} onChange={(e) => onChange({ ...section, [key]: e.target.value })} style={inputStyle} />
            </Field>
          );
        }
        if (typeof value === "number") {
          return (
            <Field key={key} id={fieldId} label={key}>
              <input id={fieldId} type="number" value={value} onChange={(e) => onChange({ ...section, [key]: Number(e.target.value) })} style={inputStyle} />
            </Field>
          );
        }
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
          return (
            <Field key={key} id={fieldId} label={key}>
              <StringListEditor items={value} onChange={(next) => onChange({ ...section, [key]: next })} addLabel={`+ Add ${key}`} idBase={fieldId} />
            </Field>
          );
        }
        let preview: string;
        try { preview = JSON.stringify(value).slice(0, 120); } catch { preview = String(value); }
        return (
          <p key={key} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
            <strong>{key}:</strong> {preview} <em>(complex value — not editable here)</em>
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers (inline styles, token-driven)
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  maxWidth: "820px",
  margin: "0 auto",
  padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  marginBottom: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "var(--font-size-h3)",
  fontWeight: 700,
  margin: "0 0 var(--space-4) 0",
};

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
  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, width: "100%", height: "auto", padding: "var(--space-3) var(--space-4)", resize: "vertical", lineHeight: "var(--line-height-body)",
};

const iconButtonStyle: React.CSSProperties = {
  minWidth: "var(--min-tap-target)", minHeight: "var(--min-tap-target)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  backgroundColor: "transparent", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
  color: "var(--color-text)", fontSize: "var(--font-size-body)", cursor: "pointer",
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: "var(--min-button-height)", padding: "0 var(--space-6)",
    backgroundColor: disabled ? "var(--color-muted)" : "var(--color-primary)", color: "#fff",
    border: "none", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body-sm)",
    fontWeight: 700, fontFamily: "var(--font-family)", cursor: disabled ? "not-allowed" : "pointer",
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
