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

// ---------------------------------------------------------------------------
// Types mirrored from the API (audits.ts)
// ---------------------------------------------------------------------------

interface BrandRow {
  id: string;
  name: string;
  domain: string | null;
  monitoring_enabled: boolean;
  latest_score: number | null;
}

interface TrendPoint {
  recorded_at: string;
  score_overall: number | null;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function DashboardV3() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("overview");
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
        if (!cancelled) setAuthError(true);
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

  const openPortal = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/portal", { method: "POST" });
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

  const overall = score?.latest?.score_overall ?? activeBrand?.latest_score ?? null;
  // /api/brands/:id/score returns trend ORDER BY recorded_at DESC (newest-first),
  // so reverse() gives oldest→newest, left→right — the correct sparkline order.
  const trendPoints = useMemo(
    () => (score?.trend ?? []).map((t) => t.score_overall).filter((n): n is number => n != null).reverse(),
    [score]
  );
  const tone = scoreTone(overall);

  // ---- render --------------------------------------------------------------
  const title = TAB_TITLE[tab];

  return (
    <div style={S.shell}>
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

        {/* Footer: theme toggle + logged-in profile */}
        <div style={{ marginTop: "auto", paddingTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <button onClick={toggleTheme} style={S.themeBtn} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <div style={S.profile}>
            <span style={S.avatar} aria-hidden="true">{(userEmail ?? "?").trim().charAt(0).toUpperCase()}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.profileEmail} title={userEmail ?? undefined}>{userEmail ?? "Signed in"}</div>
              <Link href="/account/data-privacy" style={S.profileLink}>Account &amp; profile</Link>
            </div>
          </div>
          <Link href="/dashboard" style={S.backLink}>← Back to current dashboard</Link>
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
            trendPoints={trendPoints}
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
          />
        ) : tab === "donext" ? (
          <DoNextTab tasks={tasks} loading={tasksLoading} onToggle={toggleTask} brandId={activeBrandId} />
        ) : tab === "content" ? (
          <ContentTab items={content} loading={contentLoading} onSet={setContentStatus} brandId={activeBrandId} />
        ) : tab === "competitors" ? (
          <CompetitorsTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : tab === "sources" ? (
          <SourcesTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : tab === "pages" ? (
          <PagesTab sites={sites} loading={sitesLoading} />
        ) : tab === "connections" ? (
          <ConnectionsTab />
        ) : tab === "billing" ? (
          <BillingTab billing={billing} loading={billingLoading} onManage={openPortal} />
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
  brandName, overall, threeScores, trendPoints, tone, loading, onRunAudit, auditBusy, auditMsg,
}: {
  brandName?: string;
  overall: number | null;
  threeScores?: ThreeScores;
  trendPoints: number[];
  tone: { label: string; bg: string; fg: string };
  loading: boolean;
  brandId: string;
  onRunAudit: () => void;
  auditBusy: boolean;
  auditMsg: string | null;
}) {
  const hasData = overall != null || (threeScores && threeScores.visibility != null);
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
          {trendPoints.length >= 2 ? <Sparkline points={trendPoints} /> : <div style={S.muted}>Run a couple of audits to see your trend.</div>}
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

      <p style={S.note}>
        Every number here comes from real questions run on real AI engines. When we can’t measure something, we say so —
        we never invent a score.
      </p>
    </>
  );
}

function BrandsTab({ brands, onOpen, canAdd, atLimit, maxBrands, onAdd }: {
  brands: BrandRow[];
  onOpen: (id: string) => void;
  canAdd: boolean;
  atLimit: boolean;
  maxBrands: number | null;
  onAdd: () => void;
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
            <button key={b.id} onClick={() => onOpen(b.id)} style={{ ...S.card, ...S.fcard }}>
              <div style={S.fname}>{b.name}</div>
              <div style={S.frow}>
                <b style={S.fscore}>{b.latest_score ?? "—"}</b>
                <span style={{ ...S.pill, background: tone.bg, color: tone.fg }}>● {tone.label}</span>
              </div>
              <div style={S.fmeta}>{b.monitoring_enabled ? "Weekly monitoring on" : "Monitoring off"}</div>
            </button>
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
  tasks, loading, onToggle, brandId,
}: {
  tasks: PlanTask[] | null;
  loading: boolean;
  onToggle: (id: string, done: boolean) => void;
  brandId: string;
}) {
  if (loading || tasks === null) return <div style={S.muted}>Loading your fix list…</div>;

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "rejected");
  const done = tasks.filter((t) => t.status === "done");

  if (tasks.length === 0) {
    return (
      <div style={{ ...S.card, padding: "var(--space-6)", textAlign: "center" }}>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)" }}>No action plan yet for this brand.</p>
        <Link href={`/brands/${brandId}`} style={{ ...S.btnPri, display: "inline-block" }}>Run an audit to build your plan →</Link>
      </div>
    );
  }

  return (
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
  );
}

const CONTENT_TAG: Record<string, string> = { blog: "Blog post", linkedin: "LinkedIn post", faq: "FAQ answer" };

function ContentTab({
  items, loading, onSet, brandId,
}: {
  items: ContentPiece[] | null;
  loading: boolean;
  onSet: (id: string, status: "approved" | "discarded") => void;
  brandId: string;
}) {
  if (loading || items === null) return <div style={S.muted}>Loading your drafts…</div>;

  const drafts = items.filter((c) => c.status === "draft");
  const live = items.filter((c) => c.status === "approved" || c.status === "published");

  if (items.length === 0) {
    return (
      <div style={{ ...S.card, padding: "var(--space-6)", textAlign: "center" }}>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)" }}>No content drafts yet.</p>
        <Link href={`/brands/${brandId}?section=content`} style={{ ...S.btnPri, display: "inline-block" }}>Open Content Studio →</Link>
      </div>
    );
  }

  return (
    <>
      <div style={S.secH}>Ready to review <span style={S.secN}>— we drafted these. Review, then approve.</span></div>
      {drafts.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No drafts waiting. New drafts appear here after each audit.</div>
      ) : (
        <div style={S.drafts}>
          {drafts.map((c) => (
            <div key={c.id} style={{ ...S.card, ...S.draft }}>
              <span style={S.draftTag}>◆ {CONTENT_TAG[c.content_type] ?? c.content_type}</span>
              <div style={S.draftTitle}>{c.title || "Untitled draft"}</div>
              <div style={S.draftPreview}>{c.body.slice(0, 220)}{c.body.length > 220 ? "…" : ""}</div>
              <div style={S.draftRow}>
                <button onClick={() => onSet(c.id, "approved")} style={S.btnPri}>Approve</button>
                <Link href={`/brands/${brandId}?section=content`} style={S.btnGhost}>Edit</Link>
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
  );
}

const ENGINE_LABEL: Record<string, string> = {
  openai: "ChatGPT", anthropic: "Claude", perplexity: "Perplexity",
  gemini: "Gemini", google: "Gemini", serp: "Google AI",
};

function NeedAudit({ brandId, msg }: { brandId: string; msg: string }) {
  return (
    <div style={{ ...S.card, padding: "var(--space-6)", textAlign: "center" }}>
      <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)" }}>{msg}</p>
      <Link href={`/brands/${brandId}`} style={{ ...S.btnPri, display: "inline-block" }}>Run an audit →</Link>
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
        <NeedAudit brandId={brandId} msg="Run an audit to see who AI names instead of you." />
      ) : !breakdown ? (
        <NeedAudit brandId={brandId} msg="Couldn’t load the latest audit. Try running a fresh one." />
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
  if (loading) return <div style={S.muted}>Loading your sources…</div>;
  if (!hasAudit) return <NeedAudit brandId={brandId} msg="Run an audit to see where AI gets its answers about you." />;
  if (!breakdown) return <NeedAudit brandId={brandId} msg="Couldn’t load the latest audit. Try running a fresh one." />;

  const sources = (breakdown.offsite?.sources ?? []).filter((s) => s.label || s.domain);

  // Group evidence prompts → how many engines named the brand for each.
  const byPrompt = new Map<string, { cited: number; total: number }>();
  for (const e of breakdown.evidence ?? []) {
    const q = (e.prompt ?? "").trim();
    if (!q) continue;
    const cur = byPrompt.get(q) ?? { cited: 0, total: 0 };
    cur.total += 1;
    if (e.cited) cur.cited += 1;
    byPrompt.set(q, cur);
  }
  const prompts = [...byPrompt.entries()].slice(0, 8);

  return (
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

      <div style={S.secH}>The questions we test <span style={S.secN}>— real buyer prompts run on each AI</span></div>
      {prompts.length === 0 ? (
        <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No prompt evidence in the last audit.</div>
      ) : (
        <div style={S.card}>
          {prompts.map(([q, s], i) => (
            <div key={q} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{q}</div>
              <div style={S.actWhy}>You’re named by {s.cited} of {s.total} checks.</div>
            </div>
          ))}
        </div>
      )}
      <p style={S.note}>Same method every time, on real AI engines. <Link href="/how-we-measure" style={{ color: "var(--color-primary)", fontWeight: 600 }}>See exactly how we measure →</Link></p>
    </>
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

function ConnectionsTab() {
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
      <div style={S.card}>
        {[
          { key: "SC", name: "Google Search Console", note: "See which AI answers send visits" },
          { key: "GA", name: "Google Analytics", note: "Track visitors from AI tools" },
        ].map((c, i) => (
          <div key={c.key} style={{ ...S.actRow, gridTemplateColumns: "auto 1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
            <span style={S.engIco}>{c.key}</span>
            <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={S.actWhy}>{c.note}</div></div>
            <Link href="/account/connections" style={S.btnGhost}>Connect</Link>
          </div>
        ))}
      </div>
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

function BillingTab({ billing, loading, onManage }: { billing: BillingPlan | null; loading: boolean; onManage: () => void }) {
  if (loading || billing === null) return <div style={S.muted}>Loading your plan…</div>;
  const renews = billing.renewal_date ? new Date(billing.renewal_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
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
            <>
              <button onClick={onManage} style={billing.plan === "agency" ? S.btnPri : S.btnGhost}>Manage plan &amp; payment</button>
              <button onClick={onManage} style={S.btnGhost}>Invoices</button>
              <button onClick={onManage} style={S.btnGhost}>Cancel</button>
            </>
          ) : billing.plan === "agency" ? (
            <span style={{ ...S.imp, background: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)", alignSelf: "center" }}>Granted plan — contact support to change</span>
          ) : (
            <Link href="/pricing" style={S.btnPri}>See plans</Link>
          )}
        </div>
      </div>
      <p style={S.note}>
        {billing.managed_by_stripe
          ? "Update your card, download invoices, or cancel — all in the secure Stripe billing portal. Cancel anytime, no lock-in; your plan stays active until the end of the paid period."
          : "This plan isn’t billed through Stripe. Contact support to change it."}
      </p>
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
  shell: { display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-family)" },
  rail: { borderRight: "1px solid var(--color-border)", padding: "var(--space-5) var(--space-3)", display: "flex", flexDirection: "column", gap: "2px", background: "var(--color-surface)" },
  brand: { display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1) var(--space-2) var(--space-4)" },
  v3tag: { marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: "var(--color-primary)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-pill)", padding: "1px 6px" },
  navH: { fontSize: "0.66rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", margin: "var(--space-4) var(--space-2) var(--space-1)", fontWeight: 700 },
  nav: { display: "flex", flexDirection: "column", gap: "2px" },
  navItem: { display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "9px 10px", borderRadius: "var(--radius-md)", color: "var(--color-muted)", background: "transparent", border: "none", cursor: "pointer", font: "inherit", fontSize: "0.9rem", fontWeight: 500, width: "100%" },
  navItemOn: { background: "var(--color-success-surface, var(--color-badge-connected-bg))", color: "var(--color-primary)", fontWeight: 700 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "currentColor", flex: "0 0 auto" },
  badge: { background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-pill)", fontSize: "0.66rem", fontWeight: 700, padding: "1px 7px" },
  backLink: { marginTop: "auto", paddingTop: "var(--space-4)", color: "var(--color-muted)", fontSize: "0.8rem", textDecoration: "none" },

  main: { padding: "var(--space-6)", maxWidth: 1120, width: "100%" },
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
  profileEmail: { fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  profileLink: { fontSize: "0.72rem", color: "var(--color-muted)", textDecoration: "none" },
};
