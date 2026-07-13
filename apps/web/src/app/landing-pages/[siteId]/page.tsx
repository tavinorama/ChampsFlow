"use client";

/**
 * /landing-pages/[siteId] — Ozvor Pages site detail (issue #208, PR-5).
 *
 * - Business/theme edit form (PATCH /api/landing/sites/:id).
 * - Publish/unpublish toggle. The server re-checks the placeholder-content
 *   publish guard authoritatively (422 PLACEHOLDER_CONTENT) — this page
 *   surfaces that response verbatim; the page EDITOR (which has a page's
 *   sections loaded) additionally pre-checks client-side before attempting
 *   a page-level publish.
 * - Pages list (home first, server-sorted) → editor links; add/delete page
 *   respecting the 6-page cap.
 * - "Generate site" → POST .../generate, then light polling (no websockets)
 *   until pages change or ~2 minutes elapse.
 * - Testimonials panel with the exact rights-attestation checkbox label.
 * - Delete site (owner-only server-side; confirm() dialog client-side).
 */

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ensureProvisioned } from "../../../lib/supabase-browser";
import { pageTypeLabel, ADDABLE_PAGE_TYPES } from "../../../lib/landing-sections";
import { SITE_URL } from "../../../lib/site";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SiteBusiness {
  name?: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  serviceAreas?: string[];
  hours?: string | Record<string, string>;
  [key: string]: unknown;
}

interface SiteTheme {
  tone?: string;
  primary?: string;
  template?: string;
  [key: string]: unknown;
}

interface Site {
  id: string;
  brand_id: string | null;
  slug: string;
  status: "draft" | "published" | "suspended";
  business: SiteBusiness;
  theme: SiteTheme;
  review_themes: string[];
  created_at: string;
  updated_at: string;
  /** Open audit-plan fixes ready to apply on the next generate/regenerate (#208 PR-7). */
  open_fixes: number;
}

interface PageListItem {
  id: string;
  page_type: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  ai_readiness: { score?: number } | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Testimonial {
  id: string;
  author: string;
  body: string;
  rating: number | null;
  source: string;
  authorized: boolean;
  created_at: string;
}

type LoadState = "loading" | "loaded" | "error";
type GenerateState = "idle" | "queued" | "polling";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 24; // ~2 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SITE_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", suspended: "Suspended" };
const PAGE_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published" };

function badgeColors(status: string): { bg: string; text: string } {
  if (status === "published") return { bg: "var(--color-badge-status-active-bg)", text: "var(--color-badge-status-active-text)" };
  if (status === "suspended") return { bg: "var(--color-badge-status-error-bg)", text: "var(--color-badge-status-error-text)" };
  return { bg: "var(--color-badge-status-warn-bg)", text: "var(--color-badge-status-warn-text)" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function scoreColor(score: number): string {
  if (score >= 67) return "var(--color-success)";
  if (score >= 34) return "var(--color-accent-amber)";
  return "var(--color-error)";
}

function pagesSignature(pages: PageListItem[]): string {
  return pages.map((p) => `${p.id}:${p.updated_at}:${p.ai_readiness?.score ?? ""}`).sort().join("|");
}

// A site is an "ungenerated stub" the instant after create: exactly its home
// page exists and nothing has been generated yet (no ai_readiness score). We
// use this to auto-start generation so the user never lands on an empty draft
// with no idea what to do next.
function isUngeneratedStub(pages: PageListItem[]): boolean {
  return pages.length === 1 && pages[0]?.slug === "" && pages[0]?.ai_readiness?.score == null;
}

// The public address of a published site. SITE_URL flips to ozvor.com via
// NEXT_PUBLIC_SITE_URL; the display form drops the scheme for a clean read.
function liveUrl(slug: string): string {
  return `${SITE_URL.replace(/\/$/, "")}/l/${slug}`;
}
function liveUrlDisplay(slug: string): string {
  return liveUrl(slug).replace(/^https?:\/\//, "");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingSiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<PageListItem[]>([]);

  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);

  // Business/theme edit form
  const [bizName, setBizName] = useState("");
  const [bizCategory, setBizCategory] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizWebsite, setBizWebsite] = useState("");
  const [bizAreas, setBizAreas] = useState("");
  const [bizHours, setBizHours] = useState("");
  const [themeTone, setThemeTone] = useState("");
  const [themePrimary, setThemePrimary] = useState("");
  const [themeTemplate, setThemeTemplate] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);

  // Status toggle
  const [statusToggling, setStatusToggling] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Generate
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);
  const baselineSignature = useRef<string>("");

  // Add page
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageType, setNewPageType] = useState(ADDABLE_PAGE_TYPES[0] ?? "service");
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageSlug, setNewPageSlug] = useState("");
  const [addingPage, setAddingPage] = useState(false);
  const [addPageError, setAddPageError] = useState<string | null>(null);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);

  // Testimonials
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonialsLoaded, setTestimonialsLoaded] = useState(false);
  const [testAuthor, setTestAuthor] = useState("");
  const [testBody, setTestBody] = useState("");
  const [testRating, setTestRating] = useState("");
  const [testAuthorized, setTestAuthorized] = useState(false);
  const [addingTestimonial, setAddingTestimonial] = useState(false);
  const [testimonialError, setTestimonialError] = useState<string | null>(null);
  const [deletingTestimonialId, setDeletingTestimonialId] = useState<string | null>(null);

  // Delete site
  const [deletingSite, setDeletingSite] = useState(false);
  const [deleteSiteError, setDeleteSiteError] = useState<string | null>(null);

  const bizNameId = useId();
  const bizCategoryId = useId();
  const bizAddressId = useId();
  const bizPhoneId = useId();
  const bizWebsiteId = useId();
  const bizAreasId = useId();
  const bizHoursId = useId();
  const themeToneId = useId();
  const themePrimaryId = useId();
  const themeTemplateId = useId();
  const pageTypeId = useId();
  const pageTitleId = useId();
  const pageSlugId = useId();
  const testAuthorId = useId();
  const testBodyId = useId();
  const testRatingId = useId();
  const testAuthorizedId = useId();

  function showToast(message: string, kind: "success" | "error") {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 5000);
  }

  function applyBusinessDraft(s: Site) {
    setBizName(s.business?.name ?? "");
    setBizCategory(s.business?.category ?? "");
    setBizAddress(s.business?.address ?? "");
    setBizPhone(s.business?.phone ?? "");
    setBizWebsite(s.business?.website ?? "");
    setBizAreas(Array.isArray(s.business?.serviceAreas) ? s.business.serviceAreas.join(", ") : "");
    setBizHours(typeof s.business?.hours === "string" ? s.business.hours : "");
    setThemeTone(s.theme?.tone ?? "");
    setThemePrimary(typeof s.theme?.primary === "string" ? s.theme.primary : "");
    setThemeTemplate(typeof s.theme?.template === "string" ? s.theme.template : "");
  }

  const loadSite = useCallback(async (): Promise<{ site: Site; pages: PageListItem[] } | null> => {
    const res = await apiFetch(`/api/landing/sites/${siteId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { site: Site; pages: PageListItem[] };
    setSite(data.site);
    setPages(data.pages ?? []);
    return data;
  }, [siteId]);

  const loadTestimonials = useCallback(async () => {
    const res = await apiFetch(`/api/landing/sites/${siteId}/testimonials`);
    if (res.ok) {
      const data = (await res.json()) as { testimonials: Testimonial[] };
      setTestimonials(data.testimonials ?? []);
    }
    setTestimonialsLoaded(true);
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        await ensureProvisioned();
        const data = await loadSite();
        if (cancelled) return;
        if (!data) {
          setLoadError("Site not found.");
          setLoadState("error");
          return;
        }
        applyBusinessDraft(data.site);
        setLoadState("loaded");
        void loadTestimonials();
      } catch {
        if (!cancelled) {
          setLoadError("Could not load this site. Check your connection.");
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Stop any in-flight poll on unmount.
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Business/theme save
  // -------------------------------------------------------------------------
  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!bizName.trim() || savingBusiness) return;
    setSavingBusiness(true);
    setBusinessError(null);
    try {
      const areas = bizAreas.split(",").map((a) => a.trim()).filter(Boolean);
      const business: SiteBusiness = { name: bizName.trim() };
      if (bizCategory.trim()) business.category = bizCategory.trim();
      if (bizAddress.trim()) business.address = bizAddress.trim();
      if (bizPhone.trim()) business.phone = bizPhone.trim();
      if (bizWebsite.trim()) business.website = bizWebsite.trim();
      if (areas.length > 0) business.serviceAreas = areas;
      if (bizHours.trim()) business.hours = bizHours.trim();

      const theme: SiteTheme = {};
      if (themeTone.trim()) theme.tone = themeTone.trim();
      // Persist the brand colour + template so a business save never wipes them
      // (the PATCH replaces theme wholesale). Colour validated to a strict hex;
      // template must be a known preset ("" = auto from category).
      if (/^#[0-9a-fA-F]{6}$/.test(themePrimary.trim())) theme.primary = themePrimary.trim().toLowerCase();
      if (["classic", "modern", "bold", "minimal"].includes(themeTemplate)) theme.template = themeTemplate;

      const res = await apiFetch(`/api/landing/sites/${siteId}`, {
        method: "PATCH",
        body: JSON.stringify({ business, theme }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setBusinessError(data.message ?? "Could not save. Please try again.");
        return;
      }
      setSite((prev) => (prev ? { ...prev, business, theme } : prev));
      showToast("Business details saved.", "success");
    } catch {
      setBusinessError("Could not save. Please check your connection.");
    } finally {
      setSavingBusiness(false);
    }
  }

  // -------------------------------------------------------------------------
  // Publish / unpublish toggle
  // -------------------------------------------------------------------------
  async function handleToggleStatus() {
    if (!site || statusToggling) return;
    const nextStatus: "draft" | "published" = site.status === "published" ? "draft" : "published";
    setStatusToggling(true);
    setStatusError(null);
    try {
      const res = await apiFetch(`/api/landing/sites/${siteId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string; code?: string });
        setStatusError(data.message ?? "Could not update status. Please try again.");
        return;
      }
      setSite((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      // Also flip the pages list locally so the badges match the cascade the
      // server just did (content pages → published / all pages → draft).
      setPages((prev) =>
        prev.map((p) =>
          nextStatus === "published"
            ? p.ai_readiness?.score != null
              ? { ...p, status: "published" }
              : p
            : { ...p, status: "draft" }
        )
      );
      showToast(
        nextStatus === "published"
          ? "Your site is live. Share the link below."
          : "Site set back to draft.",
        "success"
      );
    } catch {
      setStatusError("Could not update status. Please check your connection.");
    } finally {
      setStatusToggling(false);
    }
  }

  // Copy the live URL to the clipboard (published sites) — the "I can't find my
  // site" moment made impossible: the address is one tap away.
  async function handleCopyLiveUrl() {
    if (!site) return;
    try {
      await navigator.clipboard.writeText(liveUrl(site.slug));
      showToast("Link copied.", "success");
    } catch {
      showToast("Could not copy the link. Select and copy it manually.", "error");
    }
  }

  // -------------------------------------------------------------------------
  // Download the whole site as a .zip of static HTML/CSS the client can drag
  // onto their own hosting/domain. Google Maps photos are intentionally left
  // out (Google's policy forbids redistributing the image files) — the README
  // inside the zip explains it; we flag it here too so it's never a surprise.
  // -------------------------------------------------------------------------
  async function handleDownloadZip() {
    if (!site || downloading) return;
    setDownloading(true);
    try {
      const res = await apiFetch(`/api/landing/sites/${siteId}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        showToast(data.message ?? "Could not build the download. Please try again.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${site.slug || "site"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Download ready. Note: Google photos aren’t included — see the README inside.", "success");
    } catch {
      showToast("Could not build the download. Please check your connection.", "error");
    } finally {
      setDownloading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Generate — enqueue, then light polling.
  // -------------------------------------------------------------------------
  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    pollCount.current = 0;
  }

  const pollForCompletion = useCallback(() => {
    pollTimer.current = setInterval(async () => {
      pollCount.current += 1;
      const data = await loadSite().catch(() => null);
      if (data) {
        const currentSignature = pagesSignature(data.pages);
        if (currentSignature !== baselineSignature.current) {
          stopPolling();
          setGenerateState("idle");
          // Point the user at the ONE remaining step so a ready-but-draft site
          // is never a dead end. Once published, the live-site banner takes over.
          setGenerateMessage(
            data.site?.status === "published"
              ? null
              : "Your 5-page site is ready. Click “Publish site” to make it live."
          );
          showToast(`Your site is ready — ${data.pages.length} pages.`, "success");
          return;
        }
      }
      if (pollCount.current >= MAX_POLLS) {
        stopPolling();
        setGenerateState("idle");
        setGenerateMessage("Still generating — refresh this page in a moment to check.");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, POLL_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSite]);

  // Core generate flow. `baselinePages` is the page set to diff against while
  // polling — pass the freshly-loaded pages (not stale state) so the first
  // poll doesn't false-positive. Used by the manual button AND the post-create
  // auto-start below.
  const runGenerate = useCallback(
    async (baselinePages: PageListItem[]) => {
      setGenerateMessage(null);
      baselineSignature.current = pagesSignature(baselinePages);
      try {
        const res = await apiFetch(`/api/landing/sites/${siteId}/generate`, { method: "POST" });
        if (res.status === 202) {
          setGenerateState("polling");
          setGenerateMessage("Building your 5-page site — this updates automatically.");
          pollForCompletion();
          return;
        }
        const data = await res.json().catch(() => ({}) as { message?: string; code?: string });
        if (res.status === 409) {
          // A run is already in flight (e.g. a refresh mid-build) — follow it to
          // completion instead of leaving the user staring at a stub.
          setGenerateState("polling");
          setGenerateMessage("Your site is already building — this updates automatically.");
          pollForCompletion();
          return;
        }
        if (res.status === 429) {
          setGenerateState("idle");
          setGenerateMessage(data.message ?? "Too many generate requests. Please try again in an hour.");
          return;
        }
        setGenerateState("idle");
        setGenerateMessage(data.message ?? "Could not start the generator. Please try again.");
      } catch {
        setGenerateState("idle");
        setGenerateMessage("Could not start the generator. Please check your connection.");
      }
    },
    [siteId, pollForCompletion]
  );

  async function handleGenerate() {
    if (generateState !== "idle") return;
    await runGenerate(pages);
  }

  // Guided flow: the moment a freshly-created site loads as an ungenerated stub,
  // start generation automatically. The user never sits on an empty draft
  // wondering what to do — they land straight in "Building your site…". Fires
  // once per mount; the stable server-side jobId dedupes any manual click.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (loadState !== "loaded" || !site || site.status === "suspended") return;
    if (generateState !== "idle") return;
    if (isUngeneratedStub(pages)) {
      autoStartedRef.current = true;
      void runGenerate(pages);
    }
  }, [loadState, site, pages, generateState, runGenerate]);

  // -------------------------------------------------------------------------
  // Add / delete page
  // -------------------------------------------------------------------------
  async function handleAddPage(e: React.FormEvent) {
    e.preventDefault();
    if (addingPage) return;
    setAddingPage(true);
    setAddPageError(null);
    try {
      const res = await apiFetch(`/api/landing/sites/${siteId}/pages`, {
        method: "POST",
        body: JSON.stringify({
          page_type: newPageType,
          title: newPageTitle.trim(),
          ...(newPageSlug.trim() ? { slug: newPageSlug.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setAddPageError(data.message ?? "Could not add the page. Please try again.");
        return;
      }
      setNewPageTitle("");
      setNewPageSlug("");
      setShowAddPage(false);
      await loadSite();
      showToast("Page added.", "success");
    } catch {
      setAddPageError("Could not add the page. Please check your connection.");
    } finally {
      setAddingPage(false);
    }
  }

  async function handleDeletePage(page: PageListItem) {
    if (deletingPageId) return;
    if (!window.confirm(`Delete the page "${page.title || page.slug}"? This cannot be undone.`)) return;
    setDeletingPageId(page.id);
    try {
      const res = await apiFetch(`/api/landing/pages/${page.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        showToast(data.message ?? "Could not delete the page.", "error");
        return;
      }
      setPages((prev) => prev.filter((p) => p.id !== page.id));
      showToast("Page deleted.", "success");
    } catch {
      showToast("Could not delete the page. Please check your connection.", "error");
    } finally {
      setDeletingPageId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Testimonials
  // -------------------------------------------------------------------------
  async function handleAddTestimonial(e: React.FormEvent) {
    e.preventDefault();
    if (!testBody.trim() || addingTestimonial) return;
    setAddingTestimonial(true);
    setTestimonialError(null);
    try {
      const res = await apiFetch(`/api/landing/sites/${siteId}/testimonials`, {
        method: "POST",
        body: JSON.stringify({
          author: testAuthor.trim(),
          body: testBody.trim(),
          ...(testRating ? { rating: parseInt(testRating, 10) } : {}),
          authorized: testAuthorized,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setTestimonialError(data.message ?? "Could not add the testimonial. Please try again.");
        return;
      }
      setTestAuthor("");
      setTestBody("");
      setTestRating("");
      setTestAuthorized(false);
      await loadTestimonials();
      showToast("Testimonial added.", "success");
    } catch {
      setTestimonialError("Could not add the testimonial. Please check your connection.");
    } finally {
      setAddingTestimonial(false);
    }
  }

  async function handleDeleteTestimonial(id: string) {
    if (deletingTestimonialId) return;
    if (!window.confirm("Delete this testimonial? This cannot be undone.")) return;
    setDeletingTestimonialId(id);
    try {
      const res = await apiFetch(`/api/landing/testimonials/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Could not delete the testimonial.", "error");
        return;
      }
      setTestimonials((prev) => prev.filter((t) => t.id !== id));
      showToast("Testimonial deleted.", "success");
    } catch {
      showToast("Could not delete the testimonial. Please check your connection.", "error");
    } finally {
      setDeletingTestimonialId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Delete site
  // -------------------------------------------------------------------------
  async function handleDeleteSite() {
    if (!site || deletingSite) return;
    const ok = window.confirm(
      `Delete "${site.business?.name || site.slug}" (ozvor.com/l/${site.slug})? This permanently deletes all ${pages.length} page(s) and cannot be undone.`
    );
    if (!ok) return;
    setDeletingSite(true);
    setDeleteSiteError(null);
    try {
      const res = await apiFetch(`/api/landing/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { message?: string });
        setDeleteSiteError(data.message ?? "Could not delete this site. Please try again.");
        return;
      }
      router.push("/landing-pages");
    } catch {
      setDeleteSiteError("Could not delete this site. Please check your connection.");
    } finally {
      setDeletingSite(false);
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

  if (loadState === "error" || !site) {
    return (
      <main style={pageStyle}>
        <p role="alert" style={{ color: "var(--color-error)" }}>{loadError ?? "Site not found."}</p>
        <a href="/landing-pages" style={{ color: "var(--color-primary)", fontWeight: 600 }}>← Back to Ozvor Pages</a>
      </main>
    );
  }

  const colors = badgeColors(site.status);

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

      <a href="/landing-pages" style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>
        ← Ozvor Pages
      </a>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", margin: "var(--space-3) 0 var(--space-2) 0" }}>
        <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          {site.business?.name || "Untitled site"}
        </h1>
        <span
          role="status" aria-label={`Status: ${SITE_STATUS_LABEL[site.status] ?? site.status}`}
          style={{ display: "inline-block", padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: "var(--font-size-caption)", fontWeight: 600, color: colors.text, backgroundColor: colors.bg }}
        >
          {SITE_STATUS_LABEL[site.status] ?? site.status}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", margin: "0 0 var(--space-6) 0" }}>
        <p style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--font-size-body-sm)", margin: 0 }}>
          ozvor.com/l/{site.slug}
        </p>
        <a
          href={`/landing-pages/${siteId}/leads`}
          style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}
        >
          View leads →
        </a>
      </div>

      {/* ── Live site banner — unmissable once published ─────────────────── */}
      {site.status === "published" && (
        <section
          aria-label="Your live site"
          style={{
            backgroundColor: "var(--color-badge-status-active-bg)",
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-5) var(--space-6)",
            marginBottom: "var(--space-6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <span aria-hidden="true" style={{ fontSize: "var(--font-size-h3)" }}>✅</span>
            <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0, color: "var(--color-badge-status-active-text)" }}>
              Your site is live
            </h2>
          </div>
          <p style={{ margin: "0 0 var(--space-4) 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)" }}>
            Anyone can open it now. Share this link.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
            <a
              href={liveUrl(site.slug)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: "1 1 240px", minWidth: 0, wordBreak: "break-all",
                fontFamily: "var(--font-mono)", fontSize: "var(--font-size-body)", fontWeight: 700,
                color: "var(--color-primary)", textDecoration: "underline",
              }}
            >
              {liveUrlDisplay(site.slug)} ↗
            </a>
            <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
              <a
                href={liveUrl(site.slug)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minHeight: "var(--min-tap-target)", padding: "0 var(--space-5)",
                  backgroundColor: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body-sm)", fontWeight: 700, textDecoration: "none",
                }}
              >
                Open my site
              </a>
              <button type="button" onClick={handleCopyLiveUrl} style={secondaryButtonStyle(false)}>
                Copy link
              </button>
            </div>
          </div>
        </section>
      )}

      {site.status === "suspended" && (
        <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-6)" }}>
          This site is suspended. Contact support.
        </div>
      )}

      {/* ── Actions: generate + publish toggle ─────────────────────────── */}
      <section
        aria-labelledby="generate-heading"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", marginBottom: "var(--space-6)", boxShadow: "var(--shadow-card)" }}
      >
        <h2 id="generate-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
          Generate
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: "var(--line-height-body)", margin: "0 0 var(--space-4) 0" }}>
          Builds (or rebuilds) the 5-page bundle from this site&rsquo;s business facts and authorized testimonials.
          Existing pages are versioned before being overwritten — nothing is lost.
        </p>
        {site.open_fixes > 0 && (
          <div
            role="status"
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
              padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-4)",
              backgroundColor: "var(--color-badge-ai-bg)", border: "1px solid var(--color-accent-ink)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)" }}>
              <strong>{site.open_fixes}</strong> audit fix{site.open_fixes === 1 ? "" : "es"} ready — regenerating will apply them.
            </span>
            <a href="/drafts" style={{ color: "var(--color-accent-ink)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none", whiteSpace: "nowrap" }}>
              View fixes →
            </a>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-4)" }}>
          <button
            type="button" onClick={handleGenerate} disabled={generateState !== "idle"}
            aria-busy={generateState !== "idle"}
            style={primaryButtonStyle(generateState !== "idle", "auto")}
          >
            {generateState === "idle" ? "Generate site" : "Generating…"}
          </button>
          <button
            type="button" onClick={handleToggleStatus} disabled={statusToggling || site.status === "suspended"}
            style={secondaryButtonStyle(statusToggling || site.status === "suspended")}
          >
            {statusToggling ? "Updating…" : site.status === "published" ? "Unpublish site" : "Publish site"}
          </button>
          {site.status === "published" && (
            <button
              type="button" onClick={handleDownloadZip} disabled={downloading}
              aria-busy={downloading}
              style={secondaryButtonStyle(downloading)}
            >
              {downloading ? "Preparing…" : "Download site (.zip)"}
            </button>
          )}
        </div>
        {site.status === "published" && (
          <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: "var(--line-height-body)" }}>
            Ready-to-host HTML &amp; CSS — drag it onto your own domain. Google Maps photos aren&rsquo;t
            included (Google&rsquo;s policy doesn&rsquo;t allow redistributing the image files); the README
            inside shows where to drop your own.
          </p>
        )}
        {generateMessage && (
          <p aria-live="polite" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
            {generateMessage}
          </p>
        )}
        {statusError && (
          <p role="alert" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-body-sm)", color: "var(--color-error)" }}>
            {statusError}
          </p>
        )}
      </section>

      {/* ── Business / theme edit form ─────────────────────────────────── */}
      <form
        onSubmit={handleSaveBusiness} aria-label="Edit business details"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", marginBottom: "var(--space-6)", boxShadow: "var(--shadow-card)" }}
      >
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>Business details</h2>
        {businessError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-4)" }}>{businessError}</div>}

        <Field id={bizNameId} label="Business name" required>
          <input id={bizNameId} value={bizName} onChange={(e) => setBizName(e.target.value)} required maxLength={120} style={inputStyle} />
        </Field>
        <Field id={bizCategoryId} label="Category" hint="optional">
          <input id={bizCategoryId} value={bizCategory} onChange={(e) => setBizCategory(e.target.value)} maxLength={80} style={inputStyle} />
        </Field>
        <Field id={bizAddressId} label="Address" hint="optional">
          <input id={bizAddressId} value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} maxLength={200} style={inputStyle} />
        </Field>
        <Field id={bizPhoneId} label="Phone" hint="optional">
          <input id={bizPhoneId} type="tel" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} maxLength={40} style={inputStyle} />
        </Field>
        <Field id={bizWebsiteId} label="Website" hint="optional">
          <input id={bizWebsiteId} type="url" value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} maxLength={253} style={inputStyle} />
        </Field>
        <Field id={bizAreasId} label="Service areas" hint="comma-separated, optional">
          <input id={bizAreasId} value={bizAreas} onChange={(e) => setBizAreas(e.target.value)} maxLength={300} style={inputStyle} />
        </Field>
        <Field id={bizHoursId} label="Hours" hint="optional, e.g. Mon–Fri 9am–5pm">
          <input id={bizHoursId} value={bizHours} onChange={(e) => setBizHours(e.target.value)} maxLength={200} style={inputStyle} />
        </Field>
        <Field id={themePrimaryId} label="Brand colour" hint="your accent — buttons, links and highlights across the site">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(themePrimary) ? themePrimary : "#0c7d54"}
              onChange={(e) => setThemePrimary(e.target.value)}
              aria-label="Brand colour picker"
              style={{ width: "44px", height: "38px", padding: 0, border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer" }}
            />
            <input
              id={themePrimaryId}
              value={themePrimary}
              onChange={(e) => setThemePrimary(e.target.value)}
              placeholder="#0c7d54"
              maxLength={7}
              style={{ ...inputStyle, maxWidth: "150px", fontFamily: "monospace" }}
            />
          </div>
        </Field>
        <Field id={themeTemplateId} label="Template" hint="the visual style — fonts and shape of the whole site">
          <select id={themeTemplateId} value={themeTemplate} onChange={(e) => setThemeTemplate(e.target.value)} style={inputStyle}>
            <option value="">Auto — pick from my category</option>
            <option value="classic">Classic — elegant serif</option>
            <option value="modern">Modern — clean sans</option>
            <option value="bold">Bold — punchy &amp; strong</option>
            <option value="minimal">Minimal — airy &amp; light</option>
          </select>
        </Field>
        <Field id={themeToneId} label="Brand tone" hint="optional — a short style note for future content">
          <input id={themeToneId} value={themeTone} onChange={(e) => setThemeTone(e.target.value)} maxLength={120} placeholder="warm, professional, no-nonsense" style={inputStyle} />
        </Field>

        <button type="submit" disabled={savingBusiness || !bizName.trim()} style={primaryButtonStyle(savingBusiness || !bizName.trim(), "auto")}>
          {savingBusiness ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* ── Pages list ──────────────────────────────────────────────────── */}
      <section aria-labelledby="pages-heading" style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <h2 id="pages-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0 }}>
            Pages ({pages.length}/6)
          </h2>
          {pages.length < 6 && !showAddPage && (
            <button type="button" onClick={() => setShowAddPage(true)} style={secondaryButtonStyle(false)}>
              + Add page
            </button>
          )}
        </div>

        {showAddPage && (
          <form
            onSubmit={handleAddPage} aria-label="Add a page"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)", marginBottom: "var(--space-4)" }}
          >
            {addPageError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-3)" }}>{addPageError}</div>}
            <Field id={pageTypeId} label="Page type" required>
              <select id={pageTypeId} value={newPageType} onChange={(e) => setNewPageType(e.target.value)} style={inputStyle}>
                {ADDABLE_PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>{pageTypeLabel(t)}</option>
                ))}
              </select>
            </Field>
            <Field id={pageTitleId} label="Title" hint="optional">
              <input id={pageTitleId} value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} maxLength={120} style={inputStyle} />
            </Field>
            <Field id={pageSlugId} label="URL slug" hint="optional — auto-generated from title if left blank">
              <input id={pageSlugId} value={newPageSlug} onChange={(e) => setNewPageSlug(e.target.value.toLowerCase())} maxLength={64} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <button type="submit" disabled={addingPage} style={primaryButtonStyle(addingPage, "auto")}>
                {addingPage ? "Adding…" : "Add page"}
              </button>
              <button type="button" onClick={() => setShowAddPage(false)} disabled={addingPage} style={secondaryButtonStyle(addingPage)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {pages.length === 0 ? (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>No pages yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {pages.map((page) => {
              const isHome = page.slug === "";
              const pColors = badgeColors(page.status);
              const score = page.ai_readiness?.score;
              return (
                <li
                  key={page.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}
                >
                  <a href={`/landing-pages/${siteId}/pages/${page.id}`} style={{ minWidth: 0, textDecoration: "none", color: "var(--color-text)", flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>
                      {page.title || pageTypeLabel(page.page_type)}
                      {isHome && <span style={{ color: "var(--color-muted)", fontWeight: 400 }}> (home)</span>}
                    </div>
                    <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                      {pageTypeLabel(page.page_type)} · /{page.slug}
                    </div>
                  </a>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
                    {typeof score === "number" && (
                      <span title="AI readiness score" style={{ fontWeight: 700, color: scoreColor(score), fontSize: "var(--font-size-body-sm)" }}>
                        {score}
                      </span>
                    )}
                    <span
                      role="status" aria-label={`Status: ${PAGE_STATUS_LABEL[page.status] ?? page.status}`}
                      style={{ display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius-pill)", fontSize: "var(--font-size-caption)", fontWeight: 600, color: pColors.text, backgroundColor: pColors.bg }}
                    >
                      {PAGE_STATUS_LABEL[page.status] ?? page.status}
                    </span>
                    {!isHome && (
                      <button
                        type="button" onClick={() => handleDeletePage(page)} disabled={deletingPageId === page.id}
                        aria-label={`Delete page ${page.title || page.slug}`}
                        style={{ minHeight: "var(--min-tap-target)", minWidth: "var(--min-tap-target)", padding: "0 var(--space-3)", backgroundColor: "transparent", color: "var(--color-error)", border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-caption)", cursor: deletingPageId === page.id ? "not-allowed" : "pointer" }}
                      >
                        {deletingPageId === page.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section
        aria-labelledby="testimonials-heading"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", marginBottom: "var(--space-6)", boxShadow: "var(--shadow-card)" }}
      >
        <h2 id="testimonials-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>
          Testimonials
        </h2>

        {testimonialsLoaded && testimonials.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-5) 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {testimonials.map((t) => (
              <li key={t.id} style={{ padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
                      {t.author || "Anonymous"}{typeof t.rating === "number" && <span style={{ color: "var(--color-muted)", fontWeight: 400 }}> · {t.rating}/5</span>}
                    </div>
                    <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)" }}>{t.body}</p>
                    <span
                      style={{
                        display: "inline-block", marginTop: "var(--space-2)", padding: "1px 8px", borderRadius: "var(--radius-pill)",
                        fontSize: "var(--font-size-caption)", fontWeight: 600,
                        color: t.authorized ? "var(--color-badge-status-active-text)" : "var(--color-badge-status-neutral-text)",
                        backgroundColor: t.authorized ? "var(--color-badge-status-active-bg)" : "var(--color-badge-status-neutral-bg)",
                      }}
                    >
                      {t.authorized ? "Authorized to publish" : "Not authorized"}
                    </span>
                  </div>
                  <button
                    type="button" onClick={() => handleDeleteTestimonial(t.id)} disabled={deletingTestimonialId === t.id}
                    aria-label={`Delete testimonial from ${t.author || "anonymous"}`}
                    style={{ minHeight: "var(--min-tap-target)", minWidth: "var(--min-tap-target)", flexShrink: 0, backgroundColor: "transparent", color: "var(--color-error)", border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-caption)", cursor: deletingTestimonialId === t.id ? "not-allowed" : "pointer" }}
                  >
                    {deletingTestimonialId === t.id ? "…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddTestimonial} aria-label="Add a testimonial">
          {testimonialError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-3)" }}>{testimonialError}</div>}
          <Field id={testAuthorId} label="Author" hint="optional">
            <input id={testAuthorId} value={testAuthor} onChange={(e) => setTestAuthor(e.target.value)} maxLength={120} style={inputStyle} />
          </Field>
          <Field id={testBodyId} label="Testimonial" required>
            <textarea id={testBodyId} value={testBody} onChange={(e) => setTestBody(e.target.value)} required maxLength={2000} rows={3} style={textareaStyle} />
          </Field>
          <Field id={testRatingId} label="Rating" hint="optional, 1–5">
            <select id={testRatingId} value={testRating} onChange={(e) => setTestRating(e.target.value)} style={inputStyle}>
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} / 5</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", margin: "var(--space-2) 0 var(--space-4) 0" }}>
            <input
              id={testAuthorizedId} type="checkbox" checked={testAuthorized}
              onChange={(e) => setTestAuthorized(e.target.checked)}
              style={{ marginTop: "3px", width: "18px", height: "18px", accentColor: "var(--color-primary)" }}
            />
            <label htmlFor={testAuthorizedId} style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-text)" }}>
              I have the right to publish this testimonial
            </label>
          </div>
          <button type="submit" disabled={addingTestimonial || !testBody.trim()} style={primaryButtonStyle(addingTestimonial || !testBody.trim(), "auto")}>
            {addingTestimonial ? "Adding…" : "Add testimonial"}
          </button>
        </form>
      </section>

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <section aria-labelledby="danger-heading" style={{ border: "1px solid var(--color-error)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)" }}>
        <h2 id="danger-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0", color: "var(--color-error)" }}>
          Delete this site
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: "var(--line-height-body)", margin: "0 0 var(--space-4) 0" }}>
          Permanently removes this site and all {pages.length} of its page(s). This cannot be undone.
        </p>
        {deleteSiteError && <div role="alert" style={{ ...alertStyle, marginBottom: "var(--space-4)" }}>{deleteSiteError}</div>}
        <button
          type="button" onClick={handleDeleteSite} disabled={deletingSite}
          style={{ minHeight: "var(--min-button-height)", padding: "0 var(--space-6)", backgroundColor: "transparent", color: "var(--color-error)", border: "1.5px solid var(--color-error)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body)", fontWeight: 700, cursor: deletingSite ? "not-allowed" : "pointer", opacity: deletingSite ? 0.6 : 1 }}
        >
          {deletingSite ? "Deleting…" : "Delete site"}
        </button>
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
// Small presentational helpers (inline styles, token-driven)
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  maxWidth: "820px",
  margin: "0 auto",
  padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
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
  backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: "auto", padding: "var(--space-3) var(--space-4)", resize: "vertical", lineHeight: "var(--line-height-body)",
};

function primaryButtonStyle(disabled: boolean, width: "100%" | "auto" = "100%"): React.CSSProperties {
  return {
    width, minHeight: "var(--min-button-height)", padding: width === "auto" ? "0 var(--space-6)" : undefined,
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
