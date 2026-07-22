"use client";

/**
 * Dashboard v3 — unified tabbed shell (STAGE 1, parallel route).
 *
 * Built per the "Ozvor dashboard — full proposal" mockup: a left rail grouped
 * into Agency (brand portfolio) · the selected brand's tabs · Account, with a
 * brand switcher up top. This route is PARALLEL to the live dashboard
 * (/dashboard + /brands/[id]) so nothing breaks during launch week — we migrate
 * one tab at a time, preview each, and flip the default only when solid.
 *
 * Stage 1 wires REAL data into two tabs:
 *   - Overview  → /api/brands/:id/score  (3-vector scorecard + trend sparkline)
 *   - Brands    → /api/brands            (portfolio cards with latest_score)
 * Every other tab renders an honest "migrating into this shell" card that links
 * to the current working page — no fabricated content.
 *
 * Reuses: OzvorScorecard (3-vector), apiFetch + ensureProvisioned, tokens.css.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ensureProvisioned, isSupabaseConfigured, getSupabase } from "../../lib/supabase-browser";
import { OzvorScorecard, type ThreeScores } from "../../components/OzvorScorecard";
import { CancelRetentionFlow } from "../../components/CancelRetentionFlow";

// ---------------------------------------------------------------------------
// Types mirrored from the API (audits.ts)
// ---------------------------------------------------------------------------

interface BrandRow {
  id: string;
  name: string;
  domain: string | null;
  monitoring_enabled: boolean;
  latest_score: number | null;
  // Public profile URLs — measured by the off-site GEO signal (editable in Connections).
  linkedin_url?: string | null;
  reddit_url?: string | null;
  wikipedia_url?: string | null;
  g2_url?: string | null;
  trustpilot_url?: string | null;
  crunchbase_url?: string | null;
  youtube_url?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  tiktok_url?: string | null;
}

const PROFILE_FIELDS: Array<{ key: keyof BrandRow; label: string; hint: string }> = [
  { key: "reddit_url", label: "Reddit", hint: "reddit.com/r/… or a profile/thread" },
  { key: "g2_url", label: "G2", hint: "g2.com/products/…" },
  { key: "trustpilot_url", label: "Trustpilot", hint: "trustpilot.com/review/…" },
  { key: "crunchbase_url", label: "Crunchbase", hint: "crunchbase.com/organization/…" },
  { key: "linkedin_url", label: "LinkedIn", hint: "linkedin.com/company/…" },
  { key: "wikipedia_url", label: "Wikipedia", hint: "en.wikipedia.org/wiki/…" },
  { key: "youtube_url", label: "YouTube", hint: "youtube.com/@…" },
  { key: "x_url", label: "X (Twitter)", hint: "x.com/…" },
  { key: "instagram_url", label: "Instagram", hint: "instagram.com/…" },
  { key: "facebook_url", label: "Facebook", hint: "facebook.com/…" },
  { key: "tiktok_url", label: "TikTok", hint: "tiktok.com/@…" },
];

interface TrendPoint {
  recorded_at: string;
  score_overall: number | null;
  score_ai?: number | null;
  score_performance?: number | null;
  score_brand?: number | null;
}

interface ScorePayload {
  latest: { score_overall: number | null; audit_id: string | null } | null;
  trend: TrendPoint[];
  threeScores: ThreeScores | null;
  executionProgress: number | null;
}

interface BreakdownCompetitor {
  name: string;
  mentions: number;
  displacement: number;
  providers?: Array<{ provider: string; mentions: number; displacement: number }>;
}

interface OffsiteSource {
  domain?: string;
  label?: string;
  count?: number;
  present?: boolean;
}

interface BreakdownEvidence {
  engine: string;
  prompt: string | null;
  cited: boolean;
  position?: number | null;
  sources?: unknown[];
  mentionRate?: number | null;
  rawTextSnippet?: string | null;
}

interface Breakdown {
  competitors: BreakdownCompetitor[];
  offsite: { sources?: OffsiteSource[] } | null;
  evidence: BreakdownEvidence[];
  probes_total?: number;
  probes_cited?: number | null;
}

interface LandingSite {
  id: string;
  slug: string;
  status: string;
  business: { name?: string } | null;
  page_count: number;
  open_fixes: number;
}

interface BillingPlan {
  plan: string;
  status: string;
  renewal_date: string | null;
  cancel_at_period_end: boolean;
  managed_by_stripe: boolean;
  usage?: {
    connected_accounts?: number | null;
    max_brands?: number | null;
    max_competitors?: number | null;
    prompts_per_audit?: number | null;
    weekly_monitoring?: boolean | null;
  };
}

interface PlanTask {
  id: string;
  vector: string;
  gap: string;
  action: string;
  effort: string;
  impact: string; // "high" | "medium" | "low"
  priority: number;
  status: string; // "proposed" | "accepted" | "rejected" | "done"
  evidence: string | null;
}

interface ContentPiece {
  id: string;
  content_type: string; // "blog" | "linkedin" | "faq"
  title: string | null;
  body: string;
  status: string; // "draft" | "approved" | "published" | "discarded"
  created_at: string;
}

type TabId =
  | "overview"
  | "donext"
  | "content"
  | "competitors"
  | "sources"
  | "pages"
  | "brands"
  | "connections"
  | "billing";

// Which tabs are live in this stage vs. linking out to the current page.
const MIGRATED: Record<TabId, boolean> = {
  overview: true,
  brands: true,
  donext: true,
  content: true,
  competitors: true,
  sources: true,
  pages: true,
  connections: true,
  billing: true,
};

// For not-yet-migrated tabs: where the working version lives today.
const CURRENT_ROUTE: Partial<Record<TabId, { href: (brandId: string) => string; label: string }>> = {
  donext: { href: (id) => `/brands/${id}?section=overview`, label: "the current fix list" },
  content: { href: (id) => `/brands/${id}?section=content`, label: "Content Studio" },
  competitors: { href: () => `/competitors`, label: "the Competitors page" },
  sources: { href: (id) => `/brands/${id}?section=sources`, label: "the Sources view" },
  pages: { href: () => `/landing-pages`, label: "Ozvor Pages" },
  connections: { href: () => `/account/connections`, label: "Connections" },
  billing: { href: () => `/account/billing`, label: "Billing" },
};

const TAB_TITLE: Record<TabId, { h1: string; sub: string }> = {
  overview: { h1: "How AI sees your brand", sub: "Checked across ChatGPT, Claude, Perplexity, Gemini & Google AI" },
  donext: { h1: "Your fix list", sub: "The highest-impact actions, in order" },
  content: { h1: "Content ready to publish", sub: "AI-drafted, labelled — nothing posts until you approve" },
  competitors: { h1: "Your competitors in AI", sub: "Who AI names when buyers ask" },
  sources: { h1: "Where AI gets its answers", sub: "The sources that decide who gets named" },
  pages: { h1: "Ozvor Pages", sub: "Your AI-ready mini-site" },
  brands: { h1: "Your client brands", sub: "Agency portfolio" },
  connections: { h1: "Connections", sub: "Which AIs we check + your data sources" },
  billing: { h1: "Billing", sub: "Plan & invoices" },
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 520;
  const h = 56;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - 6 - ((p - min) / span) * (h - 12);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id="v3spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#v3spark)" />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--color-primary)" />
    </svg>
  );
}

function scoreTone(score: number | null): { label: string; bg: string; fg: string } {
  if (score == null) return { label: "No data", bg: "var(--color-badge-status-neutral-bg)", fg: "var(--color-badge-status-neutral-text)" };
  if (score >= 75) return { label: "Strong", bg: "var(--color-badge-status-active-bg)", fg: "var(--color-badge-status-active-text)" };
  if (score >= 55) return { label: "Stable", bg: "var(--color-badge-connected-bg)", fg: "var(--color-success)" };
  return { label: "Needs work", bg: "var(--color-badge-status-warn-bg)", fg: "var(--color-badge-status-warn-text)" };
}

// Resize a chosen image file to a square `size`px thumbnail and return a
// compact data: URL. Cover-crops (center) so non-square photos aren't
// distorted. WebP keeps a 96px avatar to a couple of KB — small enough to
// live directly in a TEXT column, no storage bucket needed.
async function resizeToDataUrl(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    const s = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - s) / 2;
    const sy = (bitmap.height - s) / 2;
    ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, size, size);
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    bitmap.close?.();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function DashboardV3() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("overview");
  // Deep-link support: land on a specific tab via ?tab=… (e.g. the Google OAuth
  // callback returns to /dashboard-v3?tab=connections).
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && Object.prototype.hasOwnProperty.call(TAB_TITLE, t)) setTab(t as TabId);
    } catch { /* ignore */ }
  }, []);
  const [score, setScore] = useState<ScorePayload | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [maxBrands, setMaxBrands] = useState<number | null>(null); // plan brand limit; null = unknown/unlimited
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [content, setContent] = useState<ContentPiece[] | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [sites, setSites] = useState<LandingSite[] | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [billing, setBilling] = useState<BillingPlan | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // Guards against request races: the currently-selected brand. A per-brand
  // loader compares against this after its await and drops a stale response, so
  // switching brands fast never renders brand A's data under brand B.
  const brandReqRef = useRef("");
  const activeBrand = useMemo(() => brands.find((b) => b.id === activeBrandId) ?? null, [brands, activeBrandId]);
  const isAgency = planTier === "agency" || brands.length > 1;

  // ---- initial load: provision + brands + plan -----------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureProvisioned();
        const res = await apiFetch("/api/brands");
        if (res.status === 401) {
          if (!cancelled) setAuthError(true);
          return;
        }
        if (!res.ok) {
          // A transient 5xx (or a 403) must NOT log the user out — only a real
          // 401 does. Surface a retry banner and keep the session.
          if (!cancelled) setLoadError("Couldn’t load your dashboard.");
          return;
        }
        const data = (await res.json()) as { brands?: BrandRow[] };
        if (cancelled) return;
        const list = data.brands ?? [];
        setBrands(list);
        if (list[0]) setActiveBrandId(list[0].id);
        void apiFetch("/api/billing/plan")
          .then(async (r) => (r.ok ? ((await r.json()) as { plan?: string; usage?: { max_brands?: number | null } }) : null))
          .then((d) => {
            if (cancelled || !d) return;
            if (d.plan) setPlanTier(d.plan);
            // max_brands: number = hard limit; null = unlimited (super_admin).
            setMaxBrands(d.usage && "max_brands" in d.usage ? d.usage.max_brands ?? null : null);
          })
          .catch(() => {});
      } catch {
        // Network / parse failure is transient — surface a retry, never logout.
        if (!cancelled) setLoadError("Couldn’t load your dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- load score when the active brand changes ----------------------------
  const loadScore = useCallback(async (brandId: string) => {
    setScoreLoading(true);
    setScore(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/score`);
      const data = res.ok ? ((await res.json()) as ScorePayload) : null;
      if (brandReqRef.current !== brandId) return; // stale — brand switched
      if (data) setScore(data);
    } catch {
      /* non-fatal — overview shows the empty state */
    } finally {
      if (brandReqRef.current === brandId) setScoreLoading(false);
    }
  }, []);

  // ---- actions (Stage A): add brand, run audit ----------------------------
  const reloadBrands = useCallback(async (selectId?: string) => {
    try {
      const res = await apiFetch("/api/brands");
      if (!res.ok) return;
      const list = ((await res.json()) as { brands?: BrandRow[] }).brands ?? [];
      setBrands(list);
      if (selectId) setActiveBrandId(selectId);
    } catch {
      /* non-fatal */
    }
  }, []);

  const addBrand = useCallback(async (input: { name: string; domain: string; region: string }): Promise<string | null> => {
    const body: Record<string, unknown> = { name: input.name.trim(), region: input.region };
    if (input.domain.trim()) body.domain = input.domain.trim();
    const res = await apiFetch("/api/brands", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(d?.message ?? "Couldn't add the brand.");
    }
    const created = (await res.json()) as { id: string };
    await reloadBrands(created.id);
    return created.id;
  }, [reloadBrands]);

  const runAudit = useCallback(async (brandId: string) => {
    setAuditBusy(true);
    setAuditMsg(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/audit`, { method: "POST" });
      const d = (await res.json().catch(() => null)) as { message?: string; next_allowed_at?: string } | null;
      if (res.ok) {
        setAuditMsg("Audit started — running across the AI engines. Your score updates here in ~30–60s.");
        // Re-poll the score a few times so the new run surfaces without a manual refresh.
        for (const wait of [15000, 20000, 25000]) {
          await new Promise((r) => setTimeout(r, wait));
          if (brandReqRef.current !== brandId) return;
          await loadScore(brandId);
        }
      } else if (res.status === 429) {
        setAuditMsg(d?.message ?? "You've already run a manual audit for this brand recently. Scheduled monitoring keeps running.");
      } else {
        setAuditMsg(d?.message ?? "Couldn't start the audit. Try again in a moment.");
      }
    } catch {
      setAuditMsg("Couldn't start the audit. Check your connection and try again.");
    } finally {
      setAuditBusy(false);
    }
  }, [loadScore]);

  const atBrandLimit = maxBrands != null && brands.length >= maxBrands;

  const deleteBrand = useCallback(async (id: string) => {
    // Optimistic: drop it locally, move selection off it.
    setBrands((prev) => {
      const next = prev.filter((b) => b.id !== id);
      setActiveBrandId((cur) => (cur === id ? (next[0]?.id ?? "") : cur));
      return next;
    });
    try {
      const res = await apiFetch(`/api/brands/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      // Delete failed — the optimistic removal is wrong, so resync AND tell the
      // user (otherwise the brand silently reappears with no explanation).
      setLoadError("Couldn’t delete that brand — restored it.");
      await reloadBrands();
    }
  }, [reloadBrands]);

  const loadTasks = useCallback(async (brandId: string) => {
    setTasksLoading(true);
    setTasks(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/plan`);
      const next = res.ok ? (((await res.json()) as { tasks?: PlanTask[] }).tasks ?? []) : [];
      if (brandReqRef.current !== brandId) return; // stale — brand switched
      setTasks(next);
    } catch {
      if (brandReqRef.current === brandId) setTasks([]);
    } finally {
      if (brandReqRef.current === brandId) setTasksLoading(false);
    }
  }, []);

  const loadContent = useCallback(async (brandId: string) => {
    setContentLoading(true);
    setContent(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/content`);
      const next = res.ok ? (((await res.json()) as { content?: ContentPiece[] }).content ?? []) : [];
      if (brandReqRef.current !== brandId) return; // stale — brand switched
      setContent(next);
    } catch {
      if (brandReqRef.current === brandId) setContent([]);
    } finally {
      if (brandReqRef.current === brandId) setContentLoading(false);
    }
  }, []);

  const addTask = useCallback(async (brandId: string, action: string) => {
    const res = await apiFetch(`/api/brands/${brandId}/tasks`, { method: "POST", body: JSON.stringify({ action }) });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(d?.message ?? "Couldn't add that item.");
    }
    await loadTasks(brandId);
  }, [loadTasks]);

  const loadBreakdown = useCallback(async (auditId: string, brandId: string) => {
    setBreakdownLoading(true);
    setBreakdown(null);
    try {
      const res = await apiFetch(`/api/audits/${auditId}/breakdown`);
      const data = res.ok ? ((await res.json()) as Breakdown) : null;
      if (brandReqRef.current !== brandId) return; // stale — brand switched
      if (data) setBreakdown(data);
    } catch {
      /* non-fatal — tab shows empty state */
    } finally {
      if (brandReqRef.current === brandId) setBreakdownLoading(false);
    }
  }, []);

  // Tenant-level (not per-brand) — load once, on first tab open.
  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      const res = await apiFetch("/api/landing/sites");
      if (res.ok) setSites(((await res.json()) as { sites?: LandingSite[] }).sites ?? []);
      else setSites([]);
    } catch {
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, []);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await apiFetch("/api/billing/plan");
      if (res.ok) setBilling((await res.json()) as BillingPlan);
    } catch {
      /* non-fatal */
    } finally {
      setBillingLoading(false);
    }
  }, []);

  // Opens the Stripe Billing Portal. With flow="payment_method_update" the
  // customer lands DIRECTLY on the update-card screen (view + update payment
  // data); without it, the generic portal (invoices, plan changes, cancel).
  const openPortal = useCallback(async (flow?: "payment_method_update") => {
    try {
      const res = await apiFetch("/api/billing/portal", {
        method: "POST",
        ...(flow ? { body: JSON.stringify({ flow }) } : {}),
      });
      if (res.ok) {
        const d = (await res.json()) as { url?: string; portal_url?: string };
        const url = d.url ?? d.portal_url;
        if (url) window.location.href = url;
      }
    } catch {
      /* ignore — button stays */
    }
  }, []);

  useEffect(() => {
    if (activeBrandId) {
      brandReqRef.current = activeBrandId; // mark the current brand for race guards
      setScore(null); // clear synchronously so the prior brand's numbers never flash
      setTasks(null);
      setContent(null);
      setBreakdown(null);
      void loadScore(activeBrandId);
    }
  }, [activeBrandId, loadScore]);

  // Lazy-load per-tab data only when a tab is first opened.
  const latestAuditId = score?.latest?.audit_id ?? null;
  useEffect(() => {
    if (!activeBrandId) return;
    if (tab === "donext" && tasks === null && !tasksLoading) void loadTasks(activeBrandId);
    if (tab === "content" && content === null && !contentLoading) void loadContent(activeBrandId);
    // Competitors + Sources both read the latest audit's breakdown.
    if ((tab === "competitors" || tab === "sources") && breakdown === null && !breakdownLoading && latestAuditId) {
      void loadBreakdown(latestAuditId, activeBrandId);
    }
    if (tab === "pages" && sites === null && !sitesLoading) void loadSites();
    if (tab === "billing" && billing === null && !billingLoading) void loadBilling();
  }, [tab, activeBrandId, tasks, content, breakdown, sites, billing, tasksLoading, contentLoading, breakdownLoading, sitesLoading, billingLoading, latestAuditId, loadTasks, loadContent, loadBreakdown, loadSites, loadBilling]);

  // Optimistic mutations -----------------------------------------------------
  const toggleTask = useCallback(async (taskId: string, done: boolean) => {
    const next = done ? "done" : "accepted";
    let prevStatus: string | undefined; // snapshot the ACTUAL prior value to revert to
    setTasks((prev) => (prev ? prev.map((t) => {
      if (t.id !== taskId) return t;
      prevStatus = t.status;
      return { ...t, status: next };
    }) : prev));
    try {
      const res = await apiFetch(`/api/plan-tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error();
    } catch {
      if (prevStatus !== undefined) {
        setTasks((prev) => (prev ? prev.map((t) => (t.id === taskId ? { ...t, status: prevStatus as string } : t)) : prev));
      }
    }
  }, []);

  const setContentStatus = useCallback(async (id: string, status: "approved" | "discarded") => {
    let prevStatus: string | undefined; // snapshot the ACTUAL prior value to revert to
    setContent((prev) => (prev ? prev.map((c) => {
      if (c.id !== id) return c;
      prevStatus = c.status;
      return { ...c, status };
    }) : prev));
    try {
      const res = await apiFetch(`/api/content/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
    } catch {
      if (prevStatus !== undefined) {
        setContent((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, status: prevStatus as string } : c)) : prev));
      }
    }
  }, []);

  // ---- auth gate -----------------------------------------------------------
  useEffect(() => {
    if (authError && isSupabaseConfigured()) router.replace("/login");
  }, [authError, router]);

  // ---- session email (profile footer) --------------------------------------
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let live = true;
    void getSupabase().auth.getSession().then(({ data }) => {
      if (live) setUserEmail(data.session?.user?.email ?? null);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // ---- light/dark theme (same op-theme convention as the landing) ----------
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("op-theme") === "light" ? "light" : "dark";
      setTheme(stored);
      // The root layout's anti-FOUC script already applies this at boot; re-assert
      // here so the button label and the actual <html> attribute never desync.
      if (stored === "light") document.documentElement.setAttribute("data-theme", "light");
      else document.documentElement.removeAttribute("data-theme");
    } catch { /* ignore */ }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        if (next === "light") document.documentElement.setAttribute("data-theme", "light");
        else document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("op-theme", next);
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ---- avatar (small profile photo, resized client-side to a thumbnail) ----
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    let live = true;
    void apiFetch("/api/account/profile")
      .then(async (res) => {
        if (!res.ok) return;
        const j = (await res.json().catch(() => null)) as { email?: string; avatar_url?: string | null } | null;
        if (!live || !j) return;
        setAvatarUrl(j.avatar_url ?? null);
        if (j.email) setUserEmail((e) => e ?? j.email ?? null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const onPickAvatar = useCallback(async (file: File | null) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 96);
      const res = await apiFetch("/api/account/profile/avatar", {
        method: "PUT",
        body: JSON.stringify({ avatar_url: dataUrl }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { avatar_url?: string | null } | null;
        setAvatarUrl(j?.avatar_url ?? dataUrl);
      }
    } catch { /* ignore — bad image, leave avatar unchanged */ } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);
  const removeAvatar = useCallback(async () => {
    setAvatarBusy(true);
    try {
      const res = await apiFetch("/api/account/profile/avatar", {
        method: "PUT",
        body: JSON.stringify({ avatar_url: null }),
      });
      if (res.ok) setAvatarUrl(null);
    } catch { /* ignore */ } finally {
      setAvatarBusy(false);
    }
  }, []);

  const overall = score?.latest?.score_overall ?? activeBrand?.latest_score ?? null;
  const tone = scoreTone(overall);

  // ---- render --------------------------------------------------------------
  const title = TAB_TITLE[tab];

  return (
    <div style={S.shell}>
      {loadError && (
        <div
          role="alert"
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
            background: "var(--color-error, #d0433c)", color: "#fff",
            padding: "8px 14px", fontSize: "0.85rem", textAlign: "center",
          }}
        >
          {loadError}{" "}
          <button
            onClick={() => { setLoadError(null); void reloadBrands(); }}
            style={{ marginLeft: 8, background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
          >
            Try again
          </button>
        </div>
      )}
      {/* Sidebar */}
      <aside style={S.rail}>
        <div style={S.brand}>
          <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="10.5" fill="none" stroke="var(--color-primary)" strokeWidth="3" />
            <circle cx="13" cy="13" r="3.6" fill="var(--color-primary)" />
          </svg>
          <b style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>Ozvor</b>
          <span style={S.v3tag}>v3</span>
        </div>

        {/* Only the nav scrolls; the profile footer below stays pinned so the
            client's email is never clipped, whatever the viewport height. */}
        <div style={S.railScroll}>
          {isAgency && (
            <>
              <div style={S.navH}>Agency</div>
              <nav style={S.nav}>
                <NavItem label="Brands" active={tab === "brands"} badge={brands.length} onClick={() => setTab("brands")} />
              </nav>
            </>
          )}

          <div style={S.navH}>{activeBrand?.name ?? "Brand"}</div>
          <nav style={S.nav}>
            <NavItem label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
            <NavItem label="Do next" active={tab === "donext"} onClick={() => setTab("donext")} />
            <NavItem label="Content" active={tab === "content"} onClick={() => setTab("content")} />
            <NavItem label="Competitors" active={tab === "competitors"} onClick={() => setTab("competitors")} />
            <NavItem label="Sources" active={tab === "sources"} onClick={() => setTab("sources")} />
            <NavItem label="Ozvor Pages" active={tab === "pages"} onClick={() => setTab("pages")} />
          </nav>

          <div style={S.navH}>Account</div>
          <nav style={S.nav}>
            <NavItem label="Connections" active={tab === "connections"} onClick={() => setTab("connections")} />
            <NavItem label="Billing" active={tab === "billing"} onClick={() => setTab("billing")} />
          </nav>
        </div>

        {/* Footer: theme toggle + logged-in profile — pinned, never scrolls off */}
        <div style={{ flexShrink: 0, paddingTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <button onClick={toggleTheme} style={S.themeBtn} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <div style={S.profile}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              title="Change photo"
              aria-label="Change profile photo"
              style={{ ...S.avatar, padding: 0, border: "none", cursor: avatarBusy ? "wait" : "pointer", overflow: "hidden" }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="" width={30} height={30} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <span aria-hidden="true">{avatarBusy ? "…" : (userEmail ?? "?").trim().charAt(0).toUpperCase()}</span>}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.profileEmail} title={userEmail ?? undefined}>{userEmail ?? "Signed in"}</div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <button onClick={() => setTab("billing")} style={{ ...S.profileLink, border: "none", background: "transparent", cursor: "pointer", font: "inherit", padding: 0, textAlign: "left" }}>Account &amp; billing</button>
                {avatarUrl && (
                  <button onClick={() => void removeAvatar()} disabled={avatarBusy} style={{ ...S.profileLink, border: "none", background: "transparent", cursor: "pointer", font: "inherit", padding: 0, opacity: 0.7 }}>· Remove photo</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        <div style={S.top}>
          <div>
            <h1 style={S.h1}>{title.h1}</h1>
            <div style={S.sub}>{activeBrand ? `${activeBrand.name} · ${title.sub}` : title.sub}</div>
          </div>
          {brands.length > 0 && tab !== "brands" && (
            <select
              value={activeBrandId}
              onChange={(e) => setActiveBrandId(e.target.value)}
              style={S.pick}
              aria-label="Switch brand"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div style={S.muted}>Loading your workspace…</div>
        ) : brands.length === 0 ? (
          <EmptyBrands />
        ) : tab === "overview" ? (
          <OverviewTab
            brandName={activeBrand?.name}
            overall={overall}
            threeScores={score?.threeScores ?? undefined}
            trend={score?.trend ?? []}
            tone={tone}
            loading={scoreLoading}
            brandId={activeBrandId}
            onRunAudit={() => runAudit(activeBrandId)}
            auditBusy={auditBusy}
            auditMsg={auditMsg}
          />
        ) : tab === "brands" ? (
          <BrandsTab
            brands={brands}
            onOpen={(id) => { setActiveBrandId(id); setTab("overview"); }}
            canAdd={!atBrandLimit}
            atLimit={atBrandLimit}
            maxBrands={maxBrands}
            onAdd={() => setAddBrandOpen(true)}
            onDelete={deleteBrand}
          />
        ) : tab === "donext" ? (
          <DoNextTab tasks={tasks} loading={tasksLoading} onToggle={toggleTask} brandId={activeBrandId}
            onAddTask={(action) => addTask(activeBrandId, action)} />
        ) : tab === "content" ? (
          <ContentTab items={content} loading={contentLoading} onSet={setContentStatus} brandId={activeBrandId}
            onReload={() => loadContent(activeBrandId)} onGoConnections={() => setTab("connections")} />
        ) : tab === "competitors" ? (
          <CompetitorsTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : tab === "sources" ? (
          <SourcesTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : tab === "pages" ? (
          <PagesTab sites={sites} loading={sitesLoading} />
        ) : tab === "connections" ? (
          <ConnectionsTab brand={activeBrand} onProfilesSaved={() => reloadBrands()} />
        ) : tab === "billing" ? (
          <BillingTab billing={billing} loading={billingLoading} onManage={openPortal} onReload={loadBilling} />
        ) : (
          <MigratingTab tab={tab} brandId={activeBrandId} />
        )}
      </main>

      {addBrandOpen && (
        <AddBrandModal
          onClose={() => setAddBrandOpen(false)}
          onSubmit={async (input) => {
            const id = await addBrand(input);
            setAddBrandOpen(false);
            if (id) { setActiveBrandId(id); setTab("overview"); }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function OverviewTab({
  brandName, overall, threeScores, trend, tone, loading, brandId, onRunAudit, auditBusy, auditMsg,
}: {
  brandName?: string;
  overall: number | null;
  threeScores?: ThreeScores;
  trend: TrendPoint[];
  tone: { label: string; bg: string; fg: string };
  loading: boolean;
  brandId: string;
  onRunAudit: () => void;
  auditBusy: boolean;
  auditMsg: string | null;
}) {
  const hasData = overall != null || (threeScores && threeScores.visibility != null);
  const overallPts = trend.map((t) => t.score_overall).filter((n): n is number => n != null).reverse();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
        <button onClick={onRunAudit} disabled={auditBusy} style={{ ...S.btnPri, opacity: auditBusy ? 0.6 : 1, cursor: auditBusy ? "wait" : "pointer" }}>
          {auditBusy ? "Running…" : "Run audit now"}
        </button>
      </div>
      {auditMsg && (
        <div style={{ ...S.card, padding: "12px 16px", marginBottom: "var(--space-3)", fontSize: "0.86rem", color: "var(--color-text)", borderLeft: "3px solid var(--color-primary)" }}>{auditMsg}</div>
      )}
      <div style={{ ...S.card, ...S.hero }}>
        <div style={S.scoreCol}>
          <div style={S.scoreBig}>{overall ?? "—"}</div>
          <div style={S.scoreOf}>out of 100</div>
          <span style={{ ...S.pill, background: tone.bg, color: tone.fg, marginTop: "var(--space-2)" }}>● {tone.label}</span>
        </div>
        <div style={S.heroRight}>
          <h2 style={S.heroH2}>Your AI Visibility Score</h2>
          {overallPts.length >= 2 ? <Sparkline points={overallPts} /> : <div style={S.muted}>Run a couple of audits to see your trend.</div>}
          <p style={S.heroCap}>
            AI answers change a little every day, so this number moves a few points on its own. What matters is the trend.
            Finish the actions in <b>Do next</b> and it climbs over the next few weeks.
          </p>
        </div>
      </div>

      <div style={S.secH}>Your three scores <span style={S.secN}>— from real questions run on real AI engines</span></div>
      {loading ? (
        <div style={S.muted}>Loading score…</div>
      ) : hasData ? (
        <OzvorScorecard overall={overall} threeScores={threeScores} brandName={brandName} />
      ) : (
        <div style={{ ...S.card, padding: "var(--space-6)" }}>
          <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)" }}>No audit yet for this brand. Run the first one — it takes ~30–60 seconds across the AI engines.</p>
          <button onClick={onRunAudit} disabled={auditBusy} style={{ ...S.btnPri, opacity: auditBusy ? 0.6 : 1 }}>{auditBusy ? "Running…" : "Run the first audit"}</button>
        </div>
      )}

      {trend.length >= 2 && (
        <>
          <div style={S.secH}>Your scores over time <span style={S.secN}>— every audit since you started</span></div>
          <AnalyticsChart trend={trend} brandId={brandId} />
        </>
      )}

      <p style={S.note}>
        Every number here comes from real questions run on real AI engines. When we can’t measure something, we say so —
        we never invent a score.
      </p>
    </>
  );
}

// Derived Citation Readiness for a trend point (mirrors the server formula).
function citationReadinessOf(t: TrendPoint): number | null {
  if (t.score_performance == null || t.score_brand == null) return null;
  return Math.round(Math.max(0, Math.min(100, t.score_performance * 0.6 + t.score_brand * 0.4)));
}

const CHART_SERIES = [
  { key: "overall", label: "Overall", color: "var(--color-primary)", get: (t: TrendPoint) => t.score_overall ?? null },
  { key: "visibility", label: "Visibility", color: "#2563eb", get: (t: TrendPoint) => t.score_ai ?? null },
  { key: "citation", label: "Citation Readiness", color: "#7c3aed", get: citationReadinessOf },
];

const CHART_PERIODS: Array<{ key: string; label: string; days: number | null }> = [
  { key: "all", label: "All", days: null },
  { key: "90", label: "90d", days: 90 },
  { key: "30", label: "30d", days: 30 },
  { key: "7", label: "7d", days: 7 },
];

interface CompetitorTrendPoint { audit_id: string; date: string; brand_rate: number; competitors: Record<string, number>; }
interface CompetitorTrends { series: CompetitorTrendPoint[]; competitors: string[]; }
const COMPETITOR_COLORS = ["#dc2626", "#ea580c", "#ca8a04", "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#9333ea"];

function AnalyticsChart({ trend, brandId }: { trend: TrendPoint[]; brandId: string }) {
  const [period, setPeriod] = useState("all");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"scores" | "compare">("scores");

  // --- competitor overlay (lazy-loaded the first time "vs Competitors" opens) ---
  const [comp, setComp] = useState<CompetitorTrends | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compVisible, setCompVisible] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (mode !== "compare" || comp) return;
    setCompLoading(true);
    void apiFetch(`/api/brands/${brandId}/competitor-trends`)
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as CompetitorTrends;
        setComp(j);
        setCompVisible(Object.fromEntries(j.competitors.map((name) => [name, true])));
      })
      .catch(() => {})
      .finally(() => setCompLoading(false));
  }, [mode, comp, brandId]);

  // trend arrives newest-first; work oldest→newest and filter by period.
  const asc = useMemo(() => [...trend].reverse(), [trend]);
  const days = CHART_PERIODS.find((p) => p.key === period)?.days ?? null;
  const points = useMemo(() => {
    if (days == null) return asc;
    const cutoff = asc.length ? new Date(asc[asc.length - 1].recorded_at).getTime() - days * 86400000 : 0;
    return asc.filter((t) => new Date(t.recorded_at).getTime() >= cutoff);
  }, [asc, days]);
  const compPoints = useMemo(() => {
    const s = comp?.series ?? [];
    if (days == null) return s;
    const cutoff = s.length ? new Date(s[s.length - 1].date).getTime() - days * 86400000 : 0;
    return s.filter((t) => new Date(t.date).getTime() >= cutoff);
  }, [comp, days]);

  const W = 640, H = 200, padL = 30, padB = 22, padT = 10, padR = 10;
  const n = mode === "compare" ? compPoints.length : points.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB);
  const firstDate = mode === "compare" ? compPoints[0]?.date : points[0]?.recorded_at;
  const lastDate = mode === "compare" ? compPoints[n - 1]?.date : points[n - 1]?.recorded_at;
  const trackedComps = comp?.competitors ?? [];

  return (
    <div style={{ ...S.card, padding: "var(--space-4)" }}>
      {/* mode toggle */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "var(--space-3)" }}>
        {([["scores", "Your scores"], ["compare", "vs Competitors"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)}
            style={{ border: "1px solid var(--color-border)", background: mode === key ? "var(--color-primary)" : "transparent", color: mode === key ? "#fff" : "var(--color-muted)", borderRadius: "var(--radius-pill)", padding: "4px 12px", font: "inherit", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          {mode === "scores"
            ? CHART_SERIES.map((s) => (
                <button key={s.key} onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: "0.8rem", fontWeight: 600, opacity: hidden[s.key] ? 0.4 : 1 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "2px", background: s.color, display: "inline-block" }} />
                  {s.label}
                </button>
              ))
            : (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", fontWeight: 700 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "2px", background: "var(--color-primary)", display: "inline-block" }} />
                  Your brand
                </span>
                {trackedComps.map((name, i) => (
                  <button key={name} onClick={() => setCompVisible((v) => ({ ...v, [name]: !v[name] }))}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: "0.8rem", fontWeight: 600, opacity: compVisible[name] ? 1 : 0.4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "2px", background: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length], display: "inline-block" }} />
                    {name}
                  </button>
                ))}
              </>
            )}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {CHART_PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{ border: "1px solid var(--color-border)", background: period === p.key ? "var(--color-primary)" : "transparent", color: period === p.key ? "#fff" : "var(--color-muted)", borderRadius: "var(--radius-pill)", padding: "3px 10px", font: "inherit", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "compare" && (
        <p style={{ ...S.muted, fontSize: "0.74rem", margin: "0 0 var(--space-2)" }}>
          How often each brand is cited by AI, per audit — same questions, same denominator.
        </p>
      )}

      {mode === "compare" && compLoading ? (
        <div style={S.muted}>Loading competitor history…</div>
      ) : mode === "compare" && trackedComps.length === 0 ? (
        <div style={S.muted}>No competitors tracked yet. Add some in the Competitors tab to compare here.</div>
      ) : n < 2 ? (
        <div style={S.muted}>Not enough audits in this range.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={mode === "compare" ? "Citation rate vs competitors over time" : "Scores over time"} style={{ display: "block" }}>
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" />
              <text x={4} y={y(g) + 3} fontSize="9" fill="var(--color-muted)">{g}</text>
            </g>
          ))}
          {mode === "scores"
            ? CHART_SERIES.filter((s) => !hidden[s.key]).map((s) => {
                const d = points.map((t, i) => { const v = s.get(t); return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" ");
                return <polyline key={s.key} points={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
              })
            : (
              <>
                <polyline points={compPoints.map((t, i) => `${x(i)},${y(t.brand_rate)}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {trackedComps.filter((name) => compVisible[name]).map((name) => {
                  const idx = trackedComps.indexOf(name);
                  const d = compPoints.map((t, i) => `${x(i)},${y(t.competitors[name] ?? 0)}`).join(" ");
                  return <polyline key={name} points={d} fill="none" stroke={COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />;
                })}
              </>
            )}
        </svg>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)", fontSize: "0.72rem", marginTop: "4px", paddingLeft: padL }}>
        <span>{firstDate ? new Date(firstDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
        <span>{lastDate ? new Date(lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
      </div>
    </div>
  );
}

function BrandsTab({ brands, onOpen, canAdd, atLimit, maxBrands, onAdd, onDelete }: {
  brands: BrandRow[];
  onOpen: (id: string) => void;
  canAdd: boolean;
  atLimit: boolean;
  maxBrands: number | null;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  // A brand with no score yet counts as needing attention (it needs its first
  // audit) — null → 0, not a healthy 100. Keeps the "N need attention" badge honest.
  const needsWork = brands.filter((b) => (b.latest_score ?? 0) < 55).length;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div style={{ ...S.secH, margin: "var(--space-2) 2px var(--space-2)" }}>
          Your brands <span style={S.secN}>— {brands.length}{maxBrands != null ? ` of ${maxBrands}` : ""}{needsWork ? ` · ${needsWork} need${needsWork === 1 ? "s" : ""} attention` : ""}</span>
        </div>
        <button onClick={onAdd} disabled={!canAdd} title={atLimit ? "You've reached your plan's brand limit" : undefined}
          style={{ ...S.btnPri, opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "not-allowed" }}>
          + Add brand
        </button>
      </div>
      {atLimit && (
        <div style={{ ...S.card, padding: "12px 16px", marginBottom: "var(--space-3)", fontSize: "0.85rem", color: "var(--color-muted)", borderLeft: "3px solid var(--color-badge-status-warn-text)" }}>
          You’ve reached your plan’s limit of {maxBrands} brand{maxBrands === 1 ? "" : "s"}. <Link href="/pricing" style={{ color: "var(--color-primary)", fontWeight: 600 }}>Upgrade</Link> to add more.
        </div>
      )}
      <div style={S.folio}>
        {brands.map((b) => {
          const tone = scoreTone(b.latest_score);
          return (
            <div key={b.id} onClick={() => onOpen(b.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen(b.id); }}
              style={{ ...S.card, ...S.fcard, position: "relative" }}>
              <button
                aria-label={`Delete ${b.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete “${b.name}” and all its audits, competitors and content? This can’t be undone.`)) onDelete(b.id);
                }}
                style={{ position: "absolute", top: 8, right: 8, border: "none", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 4 }}
              >×</button>
              <div style={S.fname}>{b.name}</div>
              <div style={S.frow}>
                <b style={S.fscore}>{b.latest_score ?? "—"}</b>
                <span style={{ ...S.pill, background: tone.bg, color: tone.fg }}>● {tone.label}</span>
              </div>
              <div style={S.fmeta}>{b.monitoring_enabled ? "Weekly monitoring on" : "Monitoring off"}</div>
            </div>
          );
        })}
      </div>
      <p style={S.note}>White-label reports and pitch mode live here. Open a brand to see its full workspace.</p>
    </>
  );
}

function MigratingTab({ tab, brandId }: { tab: TabId; brandId: string }) {
  const route = CURRENT_ROUTE[tab];
  const href = route ? route.href(brandId) : "/dashboard";
  return (
    <div style={{ ...S.card, padding: "var(--space-8, 40px) var(--space-6)", textAlign: "center" }}>
      <div style={{ fontSize: "1.6rem", marginBottom: "var(--space-3)" }}>🚧</div>
      <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 800 }}>
        This tab is moving into the new dashboard
      </h2>
      <p style={{ margin: "0 auto var(--space-5)", color: "var(--color-muted)", maxWidth: "44ch", lineHeight: 1.6 }}>
        We’re migrating one tab at a time so nothing breaks. For now, {route?.label ?? "the current page"} still works
        exactly as before.
      </p>
      <Link href={href} style={{ ...S.btnPri, display: "inline-block" }}>Open {route?.label ?? "it"} →</Link>
    </div>
  );
}

function impactStyle(impact: string): React.CSSProperties {
  const k = (impact || "").toLowerCase();
  if (k === "high") return { background: "var(--color-badge-connected-bg)", color: "var(--color-success)" };
  if (k === "low") return { background: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" };
  return { background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)" }; // medium/default
}

function DoNextTab({
  tasks, loading, onToggle, brandId, onAddTask,
}: {
  tasks: PlanTask[] | null;
  loading: boolean;
  onToggle: (id: string, done: boolean) => void;
  brandId: string;
  onAddTask: (action: string) => Promise<void>;
}) {
  const open = (tasks ?? []).filter((t) => t.status !== "done" && t.status !== "rejected");
  const done = (tasks ?? []).filter((t) => t.status === "done");

  return (
    <>
      <AddTodo onAdd={onAddTask} />

      {loading || tasks === null ? (
        <div style={S.muted}>Loading your fix list…</div>
      ) : tasks.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>
          No plan yet — add your own to-dos above, or run an audit from the <b>Overview</b> tab to generate one.
        </div>
      ) : (
    <>
      <div style={S.secH}>
        Your fix list <span style={S.secN}>— {open.length} to do, {done.length} done. Finish these and your base score climbs.</span>
      </div>
      {open.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>All caught up — every fix is done. Nice work. 🎉</div>
      ) : (
        <div style={S.card}>
          {open.map((t, i) => (
            <div key={t.id} style={{ ...S.actRow, borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
              <button
                aria-label={`Mark "${t.action}" done`}
                onClick={() => onToggle(t.id, true)}
                style={S.chk}
              />
              <div>
                <div style={S.actTitle}>{t.action}</div>
                {(t.gap || t.evidence) && <div style={S.actWhy}>{t.gap || t.evidence}</div>}
              </div>
              <span style={{ ...S.imp, ...impactStyle(t.impact) }}>{t.impact ? `${t.impact[0].toUpperCase()}${t.impact.slice(1)} impact` : "Impact"}</span>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <div style={S.secH}>Done <span style={S.secN}>— nice work</span></div>
          <div style={S.card}>
            {done.map((t, i) => (
              <div key={t.id} style={{ ...S.actRow, opacity: 0.7, borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <button aria-label={`Reopen "${t.action}"`} onClick={() => onToggle(t.id, false)} style={{ ...S.chk, ...S.chkDone }}>✓</button>
                <div><div style={{ ...S.actTitle, textDecoration: "line-through", color: "var(--color-muted)" }}>{t.action}</div></div>
                <span style={{ ...S.imp, background: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" }}>Done</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={S.note}>Checking a box marks it done here and updates your Execution score. Nothing is published from this list.</p>
    </>
      )}
    </>
  );
}

function AddTodo({ onAdd }: { onAdd: (action: string) => Promise<void> }) {
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    const a = action.trim();
    if (!a || busy) return;
    setBusy(true); setErr(null);
    try { await onAdd(a); setAction(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn’t add that item."); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ ...S.card, padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
      <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "var(--space-2)" }}>Add your own to-do</div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. “Claim our Google Business Profile”" style={{ ...S.input, flex: 1, minWidth: 220 }}
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
        <button onClick={() => void add()} disabled={!action.trim() || busy} style={{ ...S.btnPri, opacity: !action.trim() || busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add"}</button>
      </div>
      {err && <div style={{ color: "var(--color-error)", fontSize: "0.8rem", marginTop: "var(--space-2)" }}>{err}</div>}
    </div>
  );
}

const CONTENT_TAG: Record<string, string> = { blog: "Blog post", linkedin: "LinkedIn post", faq: "FAQ answer" };

function ContentTab({
  items, loading, onSet, brandId, onReload, onGoConnections,
}: {
  items: ContentPiece[] | null;
  loading: boolean;
  onSet: (id: string, status: "approved" | "discarded") => void;
  brandId: string;
  onReload: () => void;
  onGoConnections: () => void;
}) {
  const drafts = (items ?? []).filter((c) => c.status === "draft");
  const live = (items ?? []).filter((c) => c.status === "approved" || c.status === "published");

  return (
    <>
      <div style={{ ...S.card, padding: "12px 16px", marginBottom: "var(--space-3)", fontSize: "0.85rem", color: "var(--color-muted)", borderLeft: "3px solid var(--color-primary)" }}>
        Drafts are generated with <b>your own AI API key</b> (BYOK). Add or check it in{" "}
        <button onClick={onGoConnections} style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontWeight: 600, cursor: "pointer", font: "inherit", padding: 0 }}>Connections →</button>
      </div>

      <GenerateDraft brandId={brandId} onDone={onReload} onNeedKey={onGoConnections} />

      {loading || items === null ? (
        <div style={S.muted}>Loading your drafts…</div>
      ) : (
    <>
      <div style={S.secH}>Ready to review <span style={S.secN}>— review, then approve.</span></div>
      {drafts.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No drafts waiting. Generate one above, or new drafts appear here after each audit.</div>
      ) : (
        <div style={S.drafts}>
          {drafts.map((c) => (
            <div key={c.id} style={{ ...S.card, ...S.draft }}>
              <span style={S.draftTag}>◆ {CONTENT_TAG[c.content_type] ?? c.content_type}</span>
              <div style={S.draftTitle}>{c.title || "Untitled draft"}</div>
              <div style={S.draftPreview}>{c.body.slice(0, 220)}{c.body.length > 220 ? "…" : ""}</div>
              <div style={S.draftRow}>
                <button onClick={() => onSet(c.id, "approved")} style={S.btnPri}>Approve</button>
                <button onClick={() => onSet(c.id, "discarded")} style={S.btnGhost}>Discard</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <>
          <div style={S.secH}>Approved &amp; published <span style={S.secN}>— {live.length}</span></div>
          <div style={S.card}>
            {live.map((c, i) => (
              <div key={c.id} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <div><div style={S.actTitle}>{c.title || "Untitled"}</div><div style={S.actWhy}>{CONTENT_TAG[c.content_type] ?? c.content_type}</div></div>
                <span style={{ ...S.imp, background: "var(--color-badge-connected-bg)", color: "var(--color-success)" }}>{c.status === "published" ? "Published" : "Approved"}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={S.note}>Everything here is AI-drafted and labelled. Nothing posts until you approve it.</p>
    </>
      )}
    </>
  );
}

function GenerateDraft({ brandId, onDone, onNeedKey }: { brandId: string; onDone: () => void; onNeedKey: () => void }) {
  const [type, setType] = useState("blog");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch(`/api/brands/${brandId}/content`, { method: "POST", body: JSON.stringify({ content_type: type, topic: t }) });
      const d = (await r.json().catch(() => null)) as { message?: string } | null;
      if (r.ok) { setTopic(""); setMsg("Draft generated — it’s in your review list below."); onDone(); }
      else if (r.status === 402 || r.status === 403 || (d?.message ?? "").toLowerCase().includes("key")) {
        setMsg("Add your AI API key in Connections first — content is generated with your own key (BYOK)."); onNeedKey();
      } else {
        setMsg(d?.message ?? "Couldn’t generate the draft. Try again.");
      }
    } catch {
      setMsg("Couldn’t generate the draft. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...S.card, padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
      <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "var(--space-2)" }}>Generate a draft</div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...S.input, flex: "0 0 auto" }}>
          <option value="blog">Blog post</option>
          <option value="linkedin">LinkedIn post</option>
          <option value="faq">FAQ answer</option>
        </select>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic — e.g. “how to choose an emergency plumber”" style={{ ...S.input, flex: 1, minWidth: 220 }}
          onKeyDown={(e) => { if (e.key === "Enter") void generate(); }} />
        <button onClick={() => void generate()} disabled={!topic.trim() || busy} style={{ ...S.btnPri, opacity: !topic.trim() || busy ? 0.6 : 1 }}>{busy ? "Generating…" : "Generate"}</button>
      </div>
      {msg && <div style={{ marginTop: "var(--space-2)", fontSize: "0.82rem", color: "var(--color-muted)" }}>{msg}</div>}
    </div>
  );
}

const ENGINE_LABEL: Record<string, string> = {
  openai: "ChatGPT", anthropic: "Claude", perplexity: "Perplexity",
  gemini: "Gemini", google: "Gemini", serp: "Google AI",
};

function NeedAudit({ msg }: { msg: string }) {
  return (
    <div style={{ ...S.card, padding: "var(--space-6)", textAlign: "center" }}>
      <p style={{ margin: 0, color: "var(--color-muted)" }}>{msg} Run one from the <b>Overview</b> tab.</p>
    </div>
  );
}

function TrackedCompetitors({ brandId }: { brandId: string }) {
  const [list, setList] = useState<Array<{ id: string; name: string }> | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void apiFetch(`/api/brands/${brandId}/competitors`)
      .then(async (r) => (r.ok ? (((await r.json()) as { competitors?: Array<{ id: string; name: string }> }).competitors ?? []) : []))
      .then((l) => { if (live) setList(l); })
      .catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [brandId]);

  async function add() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(`/api/brands/${brandId}/competitors`, { method: "POST", body: JSON.stringify({ name: n }) });
      if (!r.ok) { const d = (await r.json().catch(() => null)) as { message?: string } | null; throw new Error(d?.message ?? "Couldn't add that competitor."); }
      const created = (await r.json()) as { id: string; name?: string };
      setList((prev) => [...(prev ?? []), { id: created.id, name: created.name ?? n }]);
      setName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add that competitor.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setList((prev) => (prev ?? []).filter((c) => c.id !== id));
    try { await apiFetch(`/api/brands/${brandId}/competitors/${id}`, { method: "DELETE" }); } catch { /* best-effort */ }
  }

  return (
    <>
      <div style={S.secH}>Competitors you track <span style={S.secN}>— added here, they’re measured in every future audit</span></div>
      <div style={{ ...S.card, padding: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competitor name" style={{ ...S.input, flex: 1, minWidth: 180 }}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <button onClick={() => void add()} disabled={!name.trim() || busy} style={{ ...S.btnPri, opacity: !name.trim() || busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Track"}</button>
        </div>
        {err && <div style={{ color: "var(--color-error)", fontSize: "0.8rem", marginTop: "var(--space-2)" }}>{err}</div>}
        {list && list.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "var(--space-3)" }}>
            {list.map((c) => (
              <span key={c.id} style={{ ...S.engChip, display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px" }}>
                {c.name}
                <button onClick={() => void remove(c.id)} aria-label={`Remove ${c.name}`} style={{ border: "none", background: "transparent", color: "var(--color-muted)", cursor: "pointer", font: "inherit", padding: 0, lineHeight: 1, fontSize: "1rem" }}>×</button>
              </span>
            ))}
          </div>
        )}
        {list && list.length === 0 && <div style={{ ...S.actWhy, marginTop: "var(--space-2)" }}>No tracked competitors yet. The audit still auto-discovers rivals — add your own to always measure them.</div>}
      </div>
    </>
  );
}

function CompetitorsTab({
  breakdown, loading, hasAudit, brandId,
}: {
  breakdown: Breakdown | null;
  loading: boolean;
  hasAudit: boolean;
  brandId: string;
}) {
  const comps = [...(breakdown?.competitors ?? [])].sort((a, b) => b.displacement - a.displacement || b.mentions - a.mentions);
  const maxDisp = Math.max(...comps.map((c) => c.displacement), 1);

  return (
    <>
      <TrackedCompetitors brandId={brandId} />

      {loading ? (
        <div style={S.muted}>Loading the latest audit…</div>
      ) : !hasAudit ? (
        <NeedAudit msg="Run an audit to see who AI names instead of you." />
      ) : !breakdown ? (
        <NeedAudit msg="Couldn’t load the latest audit. Try running a fresh one." />
      ) : comps.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No competitors surfaced in the last audit — AI didn’t name a rival ahead of you.</div>
      ) : (
    <>
      <div style={S.secH}>Who AI names when buyers ask <span style={S.secN}>— across the engines we check</span></div>
      <div style={S.card}>
        {comps.map((c, i) => {
          const engines = (c.providers ?? []).filter((p) => p.mentions > 0);
          return (
            <div key={c.name} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
              <div>
                <div style={S.actTitle}>{c.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                  {engines.length === 0 ? (
                    <span style={S.actWhy}>Named in {c.mentions} answer{c.mentions === 1 ? "" : "s"}</span>
                  ) : engines.map((p) => (
                    <span key={p.provider} style={{ ...S.engChip, ...(p.displacement > 0 ? S.engChipRed : null) }}>
                      {ENGINE_LABEL[p.provider] ?? p.provider}
                    </span>
                  ))}
                </div>
              </div>
              <span style={{ ...S.imp, background: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" }}>
                {c.mentions} mention{c.mentions === 1 ? "" : "s"}
              </span>
            </div>
          );
        })}
      </div>

      <div style={S.secH}>How often AI picks them over you <span style={S.secN}>— prompts where they were cited and you weren’t</span></div>
      <div style={S.card}>
        {comps.filter((c) => c.displacement > 0).length === 0 ? (
          <div style={{ padding: "var(--space-5)", color: "var(--color-muted)" }}>None displaced you in the last audit. Keep it up.</div>
        ) : comps.filter((c) => c.displacement > 0).map((c, i) => (
          <div key={c.name} style={{ ...S.compRow, borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
            <span style={S.actTitle}>{c.name}</span>
            <div style={S.compTrack}><i style={{ display: "block", height: "100%", borderRadius: "99px", background: "var(--color-error)", width: `${(c.displacement / maxDisp) * 100}%` }} /></div>
            <span style={{ textAlign: "right", color: "var(--color-muted)", fontWeight: 700, fontSize: "0.82rem" }}>{c.displacement}</span>
          </div>
        ))}
      </div>
      <p style={S.note}>Chips show which engines named each competitor; a red chip means they were cited there without you.</p>
    </>
      )}
    </>
  );
}

// Sources tab — where AI gets its answers + the prompts we test.
function SourcesTab({
  breakdown, loading, hasAudit, brandId,
}: {
  breakdown: Breakdown | null;
  loading: boolean;
  hasAudit: boolean;
  brandId: string;
}) {
  const [deepOpen, setDeepOpen] = useState(false);
  const sources = (breakdown?.offsite?.sources ?? []).filter((s) => s.label || s.domain);

  // Group evidence per prompt → which engines named the brand vs which didn't.
  const byPrompt = new Map<string, { cited: string[]; missed: string[] }>();
  for (const e of breakdown?.evidence ?? []) {
    const q = (e.prompt ?? "").trim();
    if (!q) continue;
    const cur = byPrompt.get(q) ?? { cited: [], missed: [] };
    const eng = ENGINE_LABEL[e.engine] ?? e.engine;
    (e.cited ? cur.cited : cur.missed).push(eng);
    byPrompt.set(q, cur);
  }
  const prompts = [...byPrompt.entries()].slice(0, 12);

  return (
    <>
      <ManagePrompts brandId={brandId} />

      {loading ? (
        <div style={S.muted}>Loading your sources…</div>
      ) : !hasAudit ? (
        <NeedAudit msg="Run an audit to see where AI gets its answers about you." />
      ) : !breakdown ? (
        <NeedAudit msg="Couldn’t load the latest audit. Try running a fresh one." />
      ) : (
        <>
          <div style={S.secH}>Where AI gets its answers <span style={S.secN}>— the sources that decide who gets named</span></div>
          {sources.length === 0 ? (
            <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No off-site sources measured in the last audit yet.</div>
          ) : (
            <div style={S.card}>
              {sources.map((s, i) => (
                <div key={(s.label ?? s.domain ?? "") + i} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                  <div>
                    <div style={S.actTitle}>{s.label ?? s.domain}</div>
                    {s.domain && s.label && <div style={S.actWhy}>{s.domain}</div>}
                  </div>
                  <span style={{ ...S.imp, ...(s.present ? { background: "var(--color-badge-connected-bg)", color: "var(--color-success)" } : { background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)" }) }}>
                    {s.present ? `Present${s.count ? ` · ${s.count}` : ""}` : "Not found"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <div style={S.secH}>What each AI answered <span style={S.secN}>— per prompt, who named you</span></div>
            <button onClick={() => setDeepOpen(true)} style={S.btnGhost}>🔬 Deep dive — full audit</button>
          </div>
          {prompts.length === 0 ? (
            <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No prompt evidence in the last audit.</div>
          ) : (
            <div style={S.card}>
              {prompts.map(([q, s], i) => (
                <div key={q} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{q}</div>
                  <div style={{ ...S.actWhy, marginTop: "3px" }}>
                    {s.cited.length > 0
                      ? <span><b style={{ color: "var(--color-success)" }}>Cited by</b> {s.cited.join(", ")}{s.missed.length ? ` · not by ${s.missed.join(", ")}` : ""}</span>
                      : <span><b style={{ color: "var(--color-badge-status-warn-text)" }}>Not cited</b> by {s.missed.join(", ") || "any engine"}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p style={S.note}>Same method every time, on real AI engines. The Deep dive shows every engine’s raw answer per prompt.</p>
        </>
      )}

      {deepOpen && breakdown && <DeepDiveModal evidence={breakdown.evidence ?? []} onClose={() => setDeepOpen(false)} />}
    </>
  );
}

function ManagePrompts({ brandId }: { brandId: string }) {
  const [defaults, setDefaults] = useState<Array<{ text: string }> | null>(null);
  const [custom, setCustom] = useState<Array<{ id: string; text: string }>>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/brands/${brandId}/prompts`);
      if (r.ok) {
        const d = (await r.json()) as { defaults?: Array<{ text: string }>; custom?: Array<{ id: string; text: string }> };
        setDefaults(d.defaults ?? []);
        setCustom(d.custom ?? []);
      } else setDefaults([]);
    } catch { setDefaults([]); }
  }, [brandId]);
  useEffect(() => { void reload(); }, [reload]);

  async function add() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(`/api/brands/${brandId}/prompts`, { method: "POST", body: JSON.stringify({ text: t }) });
      if (r.ok) { setText(""); await reload(); }
      else { const d = (await r.json().catch(() => null)) as { error?: string; code?: string } | null; setErr(d?.code === "PROMPT_TOO_LONG" ? "Max 200 characters." : d?.error ?? "Couldn’t add (max 10 custom prompts)."); }
    } catch { setErr("Couldn’t add. Try again."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setCustom((prev) => prev.filter((p) => p.id !== id));
    try { await apiFetch(`/api/brands/${brandId}/prompts/${id}`, { method: "DELETE" }); } catch { /* best-effort */ }
  }

  const total = (defaults?.length ?? 0) + custom.length;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div style={S.secH}>The questions we run <span style={S.secN}>— {total} prompt{total === 1 ? "" : "s"} on every audit; add your own</span></div>
        <button onClick={() => setOpen((o) => !o)} style={S.btnGhost}>{open ? "Hide" : "Manage prompts"}</button>
      </div>
      {open && (
        <div style={{ ...S.card, padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a buyer question — e.g. “best CRM for small law firms”" style={{ ...S.input, flex: 1, minWidth: 240 }}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }} maxLength={200} />
            <button onClick={() => void add()} disabled={!text.trim() || busy} style={{ ...S.btnPri, opacity: !text.trim() || busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add prompt"}</button>
          </div>
          {err && <div style={{ color: "var(--color-error)", fontSize: "0.8rem", marginTop: "var(--space-2)" }}>{err}</div>}
          {custom.length > 0 && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <div style={{ ...S.actWhy, marginBottom: "6px" }}>Your custom prompts ({custom.length}/10):</div>
              {custom.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", padding: "6px 0", borderTop: "1px solid var(--color-border)" }}>
                  <span style={{ fontSize: "0.86rem" }}>{p.text}</span>
                  <button onClick={() => void remove(p.id)} aria-label="Remove" style={{ border: "none", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: "1rem" }}>×</button>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...S.note, marginTop: "var(--space-2)" }}>Custom prompts are added to your default set and run on every future audit.</p>
        </div>
      )}
    </>
  );
}

function DeepDiveModal({ evidence, onClose }: { evidence: BreakdownEvidence[]; onClose: () => void }) {
  // Group by prompt → list every engine's probe.
  const byPrompt = new Map<string, BreakdownEvidence[]>();
  for (const e of evidence) {
    const q = (e.prompt ?? "").trim() || "(no prompt)";
    const arr = byPrompt.get(q) ?? [];
    arr.push(e);
    byPrompt.set(q, arr);
  }
  return (
    <div style={S.overlay} onClick={onClose} role="presentation">
      <div style={{ ...S.modal, maxWidth: 760, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Full audit">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800 }}>Full audit — every prompt × engine</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.3rem", color: "var(--color-muted)" }}>×</button>
        </div>
        {[...byPrompt.entries()].map(([q, rows]) => (
          <div key={q} style={{ ...S.card, padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "var(--space-2)" }}>{q}</div>
            {rows.map((r, i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ ...S.engChip }}>{ENGINE_LABEL[r.engine] ?? r.engine}</span>
                  <span style={{ ...S.imp, ...(r.cited ? { background: "var(--color-badge-connected-bg)", color: "var(--color-success)" } : { background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)" }) }}>
                    {r.cited ? `Cited${r.position != null ? ` · #${r.position}` : ""}` : "Not cited"}
                  </span>
                </div>
                {r.rawTextSnippet && <div style={{ ...S.actWhy, marginTop: "6px", borderLeft: "3px solid var(--color-border)", paddingLeft: "10px", lineHeight: 1.5 }}>{r.rawTextSnippet}</div>}
              </div>
            ))}
          </div>
        ))}
        {byPrompt.size === 0 && <div style={S.muted}>No probe evidence in this audit.</div>}
      </div>
    </div>
  );
}

const PUBLIC_SITE_BASE = "https://ozvor.com/l/";

function PagesTab({ sites, loading }: { sites: LandingSite[] | null; loading: boolean }) {
  if (loading || sites === null) return <div style={S.muted}>Loading your sites…</div>;
  if (sites.length === 0) {
    return (
      <div style={{ ...S.card, padding: "var(--space-6)", textAlign: "center" }}>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)" }}>No AI-ready sites yet.</p>
        <Link href="/landing-pages" style={{ ...S.btnPri, display: "inline-block" }}>Build a 5-page site →</Link>
      </div>
    );
  }
  return (
    <>
      <div style={S.secH}>Your AI-ready sites <span style={S.secN}>— built to be easy for AI to read and cite</span></div>
      <div style={S.card}>
        {sites.map((s, i) => {
          const live = s.status === "live" || s.status === "published";
          return (
            <div key={s.id} style={{ ...S.actRow, gridTemplateColumns: "1fr auto auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
              <div>
                <div style={S.actTitle}>{s.business?.name || s.slug}</div>
                <div style={S.actWhy}>{PUBLIC_SITE_BASE}{s.slug} · {s.page_count} page{s.page_count === 1 ? "" : "s"}{s.open_fixes ? ` · ${s.open_fixes} fix${s.open_fixes === 1 ? "" : "es"} to apply` : ""}</div>
              </div>
              <span style={{ ...S.imp, ...(live ? { background: "var(--color-badge-connected-bg)", color: "var(--color-success)" } : { background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)" }) }}>{live ? "Live" : "Draft"}</span>
              <Link href={`/landing-pages/${s.id}`} style={S.btnGhost}>Edit</Link>
            </div>
          );
        })}
      </div>
      <p style={S.note}>These pages carry the structured data (hours, reviews, service area) that AI engines read when they decide who to name.</p>
    </>
  );
}

const CHECK_ENGINES = [
  { key: "GPT", name: "ChatGPT", by: "OpenAI" },
  { key: "C", name: "Claude", by: "Anthropic" },
  { key: "Px", name: "Perplexity", by: "Perplexity AI" },
  { key: "G", name: "Gemini", by: "Google" },
  { key: "AIO", name: "Google AI Overviews", by: "Google Search" },
];

const BYOK_PROVIDERS = [
  { id: "openai", label: "OpenAI (ChatGPT)", hint: "sk-…" },
  { id: "anthropic", label: "Anthropic (Claude)", hint: "sk-ant-…" },
  { id: "gemini", label: "Google Gemini", hint: "AI…" },
  { id: "perplexity", label: "Perplexity", hint: "pplx-…" },
  { id: "serp", label: "Google AI Overview (DataForSEO)", hint: "login:password" },
];

interface OzvorApiKey { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string; }

function ConnectionsTab({ brand, onProfilesSaved }: { brand: BrandRow | null; onProfilesSaved: () => void }) {
  const [connected, setConnected] = useState<string[] | null>(null);
  const [apiKeys, setApiKeys] = useState<OzvorApiKey[] | null>(null);
  const [minted, setMinted] = useState<string | null>(null); // plaintext shown once
  const [newKeyName, setNewKeyName] = useState("");
  const [busy, setBusy] = useState(false);

  const reloadProviders = useCallback(async () => {
    try {
      const r = await apiFetch("/api/account/provider-keys");
      if (r.ok) setConnected(((await r.json()) as { providers?: string[] }).providers ?? []);
      else setConnected([]);
    } catch { setConnected([]); }
  }, []);
  const reloadApiKeys = useCallback(async () => {
    try {
      const r = await apiFetch("/api/account/api-keys");
      if (r.ok) setApiKeys(((await r.json()) as { data?: OzvorApiKey[] }).data ?? []);
      else setApiKeys([]);
    } catch { setApiKeys([]); }
  }, []);
  useEffect(() => { void reloadProviders(); void reloadApiKeys(); }, [reloadProviders, reloadApiKeys]);

  async function generateKey() {
    if (busy) return;
    setBusy(true); setMinted(null);
    try {
      const r = await apiFetch("/api/account/api-keys", { method: "POST", body: JSON.stringify({ name: newKeyName.trim() || "Dashboard key" }) });
      if (r.ok) { const d = (await r.json()) as { key?: string }; if (d.key) setMinted(d.key); setNewKeyName(""); await reloadApiKeys(); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function revokeKey(id: string) {
    setApiKeys((prev) => (prev ?? []).filter((k) => k.id !== id));
    try { await apiFetch(`/api/account/api-keys/${id}`, { method: "DELETE" }); } catch { /* best-effort */ }
  }

  return (
    <>
      <div style={S.secH}>Which AIs we check for you <span style={S.secN}>— run on every audit, on our keys</span></div>
      <div style={S.card}>
        {CHECK_ENGINES.map((e, i) => (
          <div key={e.key} style={{ ...S.actRow, gridTemplateColumns: "auto 1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
            <span style={S.engIco}>{e.key}</span>
            <div><div style={{ fontWeight: 600 }}>{e.name}</div><div style={S.actWhy}>{e.by}</div></div>
            <span style={{ ...S.imp, background: "var(--color-badge-connected-bg)", color: "var(--color-success)" }}>On</span>
          </div>
        ))}
      </div>

      {brand && <ProfilesSection brand={brand} onSaved={onProfilesSaved} />}

      <div style={S.secH}>Your content keys (BYOK) <span style={S.secN}>— content drafts are generated with YOUR API key</span></div>
      <div style={S.card}>
        {BYOK_PROVIDERS.map((p, i) => (
          <ByokRow key={p.id} provider={p} connected={(connected ?? []).includes(p.id)} loading={connected === null}
            onSaved={reloadProviders} onRemoved={reloadProviders} first={i === 0} />
        ))}
      </div>
      <p style={S.note}>Keys are encrypted at rest and never shown again. Audits always run on Ozvor’s keys; only content generation uses yours.</p>

      <div style={S.secH}>Your Ozvor API key <span style={S.secN}>— call the audit API from your own terminal or code</span></div>
      <div style={{ ...S.card, padding: "var(--space-4)" }}>
        {minted && (
          <div style={{ ...S.card, padding: "12px 14px", marginBottom: "var(--space-3)", borderLeft: "3px solid var(--color-primary)" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>Copy your key now — it won’t be shown again:</div>
            <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.82rem", wordBreak: "break-all" }}>{minted}</code>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CI, my-script)" style={{ ...S.input, flex: 1, minWidth: 180 }} />
          <button onClick={() => void generateKey()} disabled={busy} style={{ ...S.btnPri, opacity: busy ? 0.6 : 1 }}>{busy ? "Generating…" : "Generate API key"}</button>
        </div>
        {apiKeys && apiKeys.filter((k) => !k.revoked_at).length > 0 && (
          <div style={{ marginTop: "var(--space-3)" }}>
            {apiKeys.filter((k) => !k.revoked_at).map((k) => (
              <div key={k.id} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", padding: "10px 0", borderTop: "1px solid var(--color-border)" }}>
                <div><div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{k.name}</div><div style={S.actWhy}><code>{k.prefix}…</code> · added {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
                <button onClick={() => void revokeKey(k.id)} style={S.btnGhost}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={S.secH}>Optional: connect your data <span style={S.secN}>— to see clicks &amp; traffic from AI</span></div>
      {brand ? <GoogleConnect brandId={brand.id} /> : <div style={{ ...S.card, padding: "var(--space-4)", color: "var(--color-muted)" }}>Add a brand first to connect its Google data.</div>}
      {/* Social profiles (X/Instagram/Facebook/TikTok) live in "Your public
          profiles" above — not duplicated here (founder, 2026-07-17). */}
    </>
  );
}

interface GoogleConn { id: string; kind: "ga4" | "gsc"; ga4_property_id: string | null; gsc_site_url: string | null; revoked_at: string | null; }
const GOOGLE_KINDS: Array<{ kind: "gsc" | "ga4"; key: string; name: string; note: string }> = [
  { kind: "gsc", key: "SC", name: "Google Search Console", note: "See which AI answers send visits" },
  { kind: "ga4", key: "GA", name: "Google Analytics", note: "Track visitors from AI tools" },
];

function GoogleConnect({ brandId }: { brandId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [conns, setConns] = useState<GoogleConn[] | null>(null);
  const [busyKind, setBusyKind] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/brands/${brandId}/google/connections`);
      setConns(r.ok ? (((await r.json()) as { connections?: GoogleConn[] }).connections ?? []) : []);
    } catch { setConns([]); }
  }, [brandId]);
  useEffect(() => {
    let live = true;
    void apiFetch("/api/google/status")
      .then(async (r) => { if (live && r.ok) setConfigured(((await r.json()) as { configured?: boolean }).configured ?? false); })
      .catch(() => { if (live) setConfigured(false); });
    void reload();
    return () => { live = false; };
  }, [reload]);

  async function connect(kind: "ga4" | "gsc") {
    setBusyKind(kind);
    try {
      const ret = encodeURIComponent("/dashboard-v3?tab=connections");
      const r = await apiFetch(`/api/brands/${brandId}/google/connect/${kind}?return=${ret}`, { method: "POST" });
      if (r.ok) {
        const d = (await r.json()) as { authorizationUrl?: string; configured?: boolean };
        if (d.authorizationUrl) { window.location.href = d.authorizationUrl; return; }
      }
    } catch { /* ignore */ }
    setBusyKind(null); // only reached if we didn't redirect
  }
  async function disconnect(id: string) {
    setConns((prev) => (prev ?? []).filter((x) => x.id !== id));
    try { await apiFetch(`/api/brands/${brandId}/google/connections/${id}`, { method: "DELETE" }); } catch { /* best-effort */ }
    void reload();
  }

  return (
    <div style={S.card}>
      {GOOGLE_KINDS.map((c, i) => {
        const active = (conns ?? []).find((x) => x.kind === c.kind && !x.revoked_at);
        const detail = active ? (active.gsc_site_url ?? active.ga4_property_id ?? null) : null;
        return (
          <div key={c.kind} style={{ ...S.actRow, gridTemplateColumns: "auto 1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
            <span style={S.engIco}>{c.key}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={S.actWhy}>{active ? (detail ? `Connected · ${detail}` : "Connected") : c.note}</div>
            </div>
            {active ? (
              <button onClick={() => void disconnect(active.id)} style={S.btnGhost}>Disconnect</button>
            ) : (
              <button onClick={() => void connect(c.kind)} disabled={busyKind === c.kind || configured === false}
                title={configured === false ? "Google connection isn’t configured yet" : undefined}
                style={{ ...S.btnPri, opacity: busyKind === c.kind || configured === false ? 0.55 : 1, cursor: configured === false ? "not-allowed" : "pointer" }}>
                {busyKind === c.kind ? "Opening…" : "Connect"}
              </button>
            )}
          </div>
        );
      })}
      {configured === false && (
        <p style={{ ...S.note, margin: "var(--space-3) var(--space-2) 0" }}>Google connections aren’t configured on this environment yet.</p>
      )}
    </div>
  );
}

function ProfilesSection({ brand, onSaved }: { brand: BrandRow; onSaved: () => void }) {
  const initial = useCallback(() => {
    const v: Record<string, string> = {};
    for (const f of PROFILE_FIELDS) v[f.key as string] = ((brand[f.key] as string | null | undefined) ?? "");
    return v;
  }, [brand]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Reset the form when the active brand changes.
  useEffect(() => { setVals(initial()); setMsg(null); }, [initial]);

  async function save() {
    setBusy(true); setMsg(null);
    const body: Record<string, string | null> = {};
    // Profile fields are URLs; the field hints show scheme-less examples
    // (e.g. "linkedin.com/company/…"). The API requires a parseable URL, so
    // prepend https:// when the user omitted the scheme instead of erroring.
    const withScheme = (raw: string): string | null => {
      const t = raw.trim();
      if (!t) return null;
      return /^https?:\/\//i.test(t) ? t : `https://${t}`;
    };
    for (const f of PROFILE_FIELDS) body[f.key as string] = withScheme(vals[f.key as string] ?? "");
    try {
      const r = await apiFetch(`/api/brands/${brand.id}/profiles`, { method: "PATCH", body: JSON.stringify(body) });
      if (r.ok) { setMsg("Saved — these feed your off-site GEO signal on the next audit."); onSaved(); }
      else { const d = (await r.json().catch(() => null)) as { message?: string } | null; setMsg(d?.message ?? "Couldn’t save."); }
    } catch { setMsg("Couldn’t save. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div id="brand-profiles" style={S.secH}>Your public profiles <span style={S.secN}>— for {brand.name}; measured as off-site GEO signal</span></div>
      <div style={{ ...S.card, padding: "var(--space-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--space-3)" }}>
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key as string} style={S.label}>{f.label}
              <input value={vals[f.key as string] ?? ""} onChange={(e) => setVals((p) => ({ ...p, [f.key as string]: e.target.value }))} placeholder={f.hint} style={S.input} />
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-1)" }}>
          <button onClick={() => void save()} disabled={busy} style={{ ...S.btnPri, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save profiles"}</button>
          {msg && <span style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>{msg}</span>}
        </div>
      </div>
      <p style={S.note}>These connect your SEO presence to your GEO visibility — AI engines lean on Reddit, G2, Wikipedia and the like when they decide who to name.</p>
    </>
  );
}

function ByokRow({ provider, connected, loading, onSaved, onRemoved, first }: {
  provider: { id: string; label: string; hint: string };
  connected: boolean;
  loading: boolean;
  onSaved: () => void;
  onRemoved: () => void;
  first: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const k = key.trim();
    if (k.length < 8 || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/account/provider-keys", { method: "POST", body: JSON.stringify({ provider: provider.id, key: k }) });
      if (r.ok) { setKey(""); setEditing(false); onSaved(); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/account/provider-keys/${provider.id}`, { method: "DELETE" });
      if (r.ok) onRemoved();
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div style={{ ...S.actRow, gridTemplateColumns: "1fr auto", alignItems: editing ? "start" : "center", borderTop: first ? "none" : "1px solid var(--color-border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{provider.label}</div>
        {editing ? (
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "6px", flexWrap: "wrap" }}>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider.hint} autoFocus
              style={{ ...S.input, flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
            <button onClick={() => void save()} disabled={key.trim().length < 8 || busy} style={{ ...S.btnPri, opacity: key.trim().length < 8 || busy ? 0.6 : 1 }}>Save</button>
            <button onClick={() => { setEditing(false); setKey(""); }} style={S.btnGhost}>Cancel</button>
          </div>
        ) : (
          <div style={S.actWhy}>{loading ? "…" : connected ? "Key saved — used for your content generation" : "No key yet — add yours to generate content"}</div>
        )}
      </div>
      {!editing && (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {connected && <span style={{ ...S.imp, background: "var(--color-badge-connected-bg)", color: "var(--color-success)" }}>Connected</span>}
          <button onClick={() => setEditing(true)} style={S.btnGhost}>{connected ? "Replace" : "Add key"}</button>
          {connected && <button onClick={() => void remove()} disabled={busy} style={S.btnGhost}>Remove</button>}
        </div>
      )}
    </div>
  );
}

const PLAN_LABEL: Record<string, string> = { free: "Free", growth: "Growth — $99/mo", agency: "Agency — $549/mo" };

function BillingTab({ billing, loading, onManage, onReload }: { billing: BillingPlan | null; loading: boolean; onManage: (flow?: "payment_method_update") => void; onReload: () => void }) {
  // In-app cancellation with the compliant retention flow (survey → 30%-off
  // save-offer → confirm). Hook must run before any early return.
  const [cancelOpen, setCancelOpen] = useState(false);
  if (loading || billing === null) return <div style={S.muted}>Loading your plan…</div>;
  const renews = billing.renewal_date ? new Date(billing.renewal_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
  const stripeManaged = billing.managed_by_stripe;
  return (
    <>
      <div style={S.secH}>Your plan</div>
      <div style={{ ...S.card, padding: "var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>{PLAN_LABEL[billing.plan] ?? billing.plan}</div>
          <div style={{ color: "var(--color-muted)", fontSize: "0.86rem", marginTop: "3px" }}>
            {billing.status === "active" ? "Active" : billing.status}
            {renews ? ` · ${billing.cancel_at_period_end ? "ends" : "renews"} ${renews}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {billing.plan !== "agency" && (
            <Link href="/pricing" style={S.btnPri}>Upgrade</Link>
          )}
          {billing.managed_by_stripe ? (
            <Link href="/pricing" style={S.btnGhost}>Compare plans</Link>
          ) : billing.plan === "agency" ? (
            <span style={{ ...S.imp, background: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)", alignSelf: "center" }}>Granted plan — contact support to change</span>
          ) : (
            <Link href="/pricing" style={S.btnPri}>See plans</Link>
          )}
        </div>
      </div>

      {billing.usage && (
        <>
          <div style={S.secH}>What’s included <span style={S.secN}>— your plan’s real limits, live from the API</span></div>
          <div style={S.card}>
            {[
              { label: "Client brands", value: billing.usage.max_brands == null ? "Unlimited" : `Up to ${billing.usage.max_brands}` },
              { label: "Competitors per brand", value: billing.usage.max_competitors == null ? "Unlimited" : `Up to ${billing.usage.max_competitors}` },
              { label: "Prompts per audit", value: billing.usage.prompts_per_audit != null ? String(billing.usage.prompts_per_audit) : "—" },
              { label: "Weekly monitoring", value: billing.usage.weekly_monitoring ? "On" : "Manual audits only" },
              { label: "Connected accounts", value: billing.usage.connected_accounts != null ? String(billing.usage.connected_accounts) : "—" },
            ].map((row, i) => (
              <div key={row.label} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-muted)", fontSize: "0.88rem" }}>{row.label}</span>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={S.secH}>Payment &amp; billing data <span style={S.secN}>— view and update, all in the secure Stripe portal</span></div>
      <div style={S.card}>
        {([
          { label: "Update payment method", note: "Change the card or payment method on file", cta: "Update", primary: true, action: () => onManage("payment_method_update") },
          { label: "Invoices & billing history", note: "Every charge, receipt and invoice — view or download", cta: "View", action: () => onManage() },
          { label: "Manage plan", note: "Change plan or billing interval in the Stripe portal", cta: "Manage", action: () => onManage() },
          { label: "Cancel plan", note: "Cancels at period end — you keep everything you paid for. We’ll ask why (optional) and offer 30% off to stay.", cta: "Cancel", danger: true, action: () => setCancelOpen(true) },
        ] as Array<{ label: string; note: string; cta: string; primary?: boolean; danger?: boolean; action: () => void }>).map((row, i) => (
          <div key={row.label} style={{ ...S.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)", opacity: stripeManaged ? 1 : 0.55 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{row.label}</div>
              <div style={S.actWhy}>{row.note}</div>
            </div>
            <button
              onClick={row.action}
              disabled={!stripeManaged}
              title={stripeManaged ? undefined : "Available on card-billed (Stripe) subscriptions"}
              style={{ ...(row.primary ? S.btnPri : S.btnGhost), ...(row.danger ? { color: "var(--color-error)", borderColor: "var(--color-error)" } : {}), cursor: stripeManaged ? "pointer" : "not-allowed" }}
            >
              {row.cta}
            </button>
          </div>
        ))}
      </div>

      <p style={S.note}>
        {stripeManaged
          ? "Card details are entered only on Stripe’s secure page — Ozvor never sees or stores them. Cancel anytime; your plan stays active until the end of the paid period."
          : "This plan is granted manually and isn’t billed through Stripe, so the payment actions above are inactive. Contact support to change it."}
      </p>

      {cancelOpen && (
        <CancelRetentionFlow
          plan={billing.plan}
          renewalLabel={renews}
          onKeep={() => { setCancelOpen(false); onReload(); }}
          onCancelled={() => { setCancelOpen(false); onReload(); }}
        />
      )}
    </>
  );
}

function AddBrandModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (input: { name: string; domain: string; region: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, domain, region });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the brand.");
      setBusy(false);
    }
  }

  return (
    <div style={S.overlay} onClick={onClose} role="presentation">
      <div style={S.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a brand">
        <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--font-size-h3)", fontWeight: 800 }}>Add a brand</h2>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)", fontSize: "0.86rem" }}>We’ll check how AI engines describe it and build your plan.</p>
        <label style={S.label}>Brand name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Plumbing" style={S.input}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        </label>
        <label style={S.label}>Website <span style={{ color: "var(--color-faint, var(--color-muted))", fontWeight: 400 }}>(optional)</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acmeplumbing.com" style={S.input} />
        </label>
        <label style={S.label}>Primary market
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={S.input}>
            <option value="US">United States / global</option>
            <option value="EU">European Union</option>
          </select>
        </label>
        {error && <div style={{ color: "var(--color-error)", fontSize: "0.82rem", marginBottom: "var(--space-3)" }}>{error}</div>}
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={() => void submit()} disabled={!name.trim() || busy} style={{ ...S.btnPri, opacity: !name.trim() || busy ? 0.6 : 1 }}>
            {busy ? "Adding…" : "Add brand"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyBrands() {
  return (
    <div style={{ ...S.card, padding: "var(--space-8, 40px) var(--space-6)", textAlign: "center" }}>
      <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--font-size-h3)", fontWeight: 800 }}>Add your first brand</h2>
      <p style={{ margin: "0 auto var(--space-5)", color: "var(--color-muted)", maxWidth: "40ch", lineHeight: 1.6 }}>
        Add a brand to see how AI engines describe it — and what to fix.
      </p>
      <Link href="/create" style={{ ...S.btnPri, display: "inline-block" }}>Add a brand →</Link>
    </div>
  );
}

function NavItem({ label, active, badge, onClick }: { label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...S.navItem, ...(active ? S.navItemOn : null) }}>
      <span style={{ ...S.dot, opacity: active ? 1 : 0.5 }} />
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {badge != null && badge > 0 && <span style={S.badge}>{badge}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — all via tokens.css so light/dark come for free.
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  // Fit the viewport: the shell is exactly one screen tall and never scrolls the
  // page — the sidebar and the main area each scroll internally if their content
  // overflows. Grid columns shrink the rail on smaller screens.
  // gridTemplateRows minmax(0,1fr) is load-bearing: an implicit `auto` row is
  // CONTENT-sized, so tall tab content grew the row past 100dvh and the shell's
  // overflow:hidden clipped the bottom of the sidebar (the email). minmax(0,1fr)
  // clamps the single row to exactly the shell height; panes scroll internally.
  // Measured live in prod: aside 1008px in a 960px shell before, 960px after.
  shell: { display: "grid", gridTemplateColumns: "clamp(200px, 18vw, 240px) 1fr", gridTemplateRows: "minmax(0, 1fr)", height: "100dvh", minHeight: 0, overflow: "hidden", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-family)" },
  rail: { borderRight: "1px solid var(--color-border)", padding: "var(--space-5) var(--space-3)", display: "flex", flexDirection: "column", gap: "2px", background: "var(--color-surface)", overflow: "hidden", minHeight: 0 },
  railScroll: { display: "flex", flexDirection: "column", gap: "2px", flex: 1, overflowY: "auto", minHeight: 0 },
  brand: { display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1) var(--space-2) var(--space-4)" },
  v3tag: { marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: "var(--color-primary)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-pill)", padding: "1px 6px" },
  navH: { fontSize: "0.66rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", margin: "var(--space-4) var(--space-2) var(--space-1)", fontWeight: 700 },
  nav: { display: "flex", flexDirection: "column", gap: "2px" },
  navItem: { display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "9px 10px", borderRadius: "var(--radius-md)", color: "var(--color-muted)", background: "transparent", border: "none", cursor: "pointer", font: "inherit", fontSize: "0.9rem", fontWeight: 500, width: "100%" },
  navItemOn: { background: "var(--color-success-surface, var(--color-badge-connected-bg))", color: "var(--color-primary)", fontWeight: 700 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "currentColor", flex: "0 0 auto" },
  badge: { background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-pill)", fontSize: "0.66rem", fontWeight: 700, padding: "1px 7px" },
  backLink: { marginTop: "auto", paddingTop: "var(--space-4)", color: "var(--color-muted)", fontSize: "0.8rem", textDecoration: "none" },

  main: { padding: "var(--space-6)", maxWidth: 1120, width: "100%", height: "100vh", overflowY: "auto", minHeight: 0 },
  top: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-5)" },
  h1: { margin: 0, fontSize: "var(--font-size-h2)", fontWeight: 800, letterSpacing: "-0.02em" },
  sub: { color: "var(--color-muted)", fontSize: "0.9rem", marginTop: "3px" },
  pick: { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "8px 12px", font: "inherit", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" },

  card: { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" },
  hero: { padding: "var(--space-6)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-6)", alignItems: "center", marginBottom: "var(--space-2)" },
  scoreCol: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 150 },
  scoreBig: { fontSize: "4rem", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  scoreOf: { color: "var(--color-muted)", fontSize: "0.8rem", fontWeight: 600 },
  heroRight: { display: "flex", flexDirection: "column", gap: "var(--space-3)" },
  heroH2: { margin: 0, fontSize: "1.05rem", fontWeight: 700 },
  heroCap: { color: "var(--color-muted)", fontSize: "0.9rem", maxWidth: "54ch", margin: 0, lineHeight: 1.6 },

  secH: { display: "flex", alignItems: "center", gap: "var(--space-2)", margin: "var(--space-6) 2px var(--space-3)", fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.01em" },
  secN: { color: "var(--color-muted)", fontWeight: 500, fontSize: "0.85rem" },
  note: { margin: "var(--space-5) 2px 0", color: "var(--color-muted)", fontSize: "0.8rem", lineHeight: 1.6 },
  muted: { color: "var(--color-muted)", fontSize: "0.9rem", padding: "var(--space-3) 2px" },
  pill: { display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "var(--radius-pill)", fontSize: "0.76rem", fontWeight: 700 },
  btnPri: { background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", padding: "9px 16px", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none", border: "none", cursor: "pointer" },

  folio: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" },
  fcard: { padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)", cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--color-text)" },
  fname: { fontWeight: 700, fontSize: "0.98rem" },
  frow: { display: "flex", alignItems: "center", gap: "var(--space-3)" },
  fscore: { fontSize: "2.1rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  fmeta: { color: "var(--color-muted)", fontSize: "0.82rem", fontWeight: 600 },

  // Do next (fix list)
  actRow: { padding: "13px 18px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "var(--space-3)", alignItems: "center" },
  actTitle: { fontWeight: 700, fontSize: "0.96rem" },
  actWhy: { color: "var(--color-muted)", fontSize: "0.84rem", marginTop: "2px", lineHeight: 1.5 },
  chk: { width: 24, height: 24, borderRadius: "7px", border: "2px solid var(--color-border)", background: "transparent", cursor: "pointer", flex: "0 0 auto", padding: 0, color: "#fff", fontWeight: 800, fontSize: "0.8rem", lineHeight: 1 },
  chkDone: { background: "var(--color-primary)", borderColor: "var(--color-primary)" },
  imp: { padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" },

  // Content drafts
  drafts: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-4)" },
  draft: { padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" },
  draftTag: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", fontWeight: 700, color: "var(--color-accent-ink)", background: "var(--color-badge-ai-bg)", padding: "3px 9px", borderRadius: "var(--radius-pill)", alignSelf: "flex-start" },
  draftTitle: { fontWeight: 700, fontSize: "0.98rem" },
  draftPreview: { color: "var(--color-muted)", fontSize: "0.86rem", lineHeight: 1.5, borderLeft: "3px solid var(--color-border)", paddingLeft: "var(--space-3)" },
  draftRow: { display: "flex", gap: "var(--space-2)", marginTop: "2px", flexWrap: "wrap" },
  btnGhost: { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "7px 13px", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", textDecoration: "none" },

  // Competitors + sources
  engChip: { fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-muted)", color: "var(--color-muted)" },
  engChipRed: { background: "var(--color-badge-status-error-bg)", color: "var(--color-badge-status-error-text)" },
  compRow: { display: "grid", gridTemplateColumns: "150px 1fr 42px", gap: "var(--space-3)", alignItems: "center", padding: "11px 18px" },
  compTrack: { height: "9px", borderRadius: "99px", background: "var(--color-border)", overflow: "hidden" },
  engIco: { width: 30, height: 30, borderRadius: "8px", background: "var(--color-surface-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.72rem", color: "var(--color-text)", flex: "0 0 auto" },

  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(8,14,11,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)", zIndex: 50 },
  modal: { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-modal, var(--shadow-card))", padding: "var(--space-6)", width: "100%", maxWidth: 420 },
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "var(--space-3)" },
  input: { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "9px 12px", font: "inherit", fontSize: "0.9rem", fontWeight: 400 },

  // Sidebar footer (theme + profile)
  themeBtn: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-muted)", cursor: "pointer", font: "inherit", fontSize: "0.82rem", fontWeight: 600, width: "100%" },
  profile: { display: "flex", alignItems: "center", gap: "9px", padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--color-surface-muted)" },
  avatar: { width: 30, height: 30, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.82rem", flex: "0 0 auto" },
  // Wrap the email instead of truncating it — the sidebar column is narrower
  // than a full address, so nowrap+ellipsis was cutting off ".com". break-word
  // lets it wrap to a second line and show in full.
  profileEmail: { fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text)", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.25 },
  profileLink: { fontSize: "0.72rem", color: "var(--color-muted)", textDecoration: "none" },
};
