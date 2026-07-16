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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ensureProvisioned, isSupabaseConfigured } from "../../lib/supabase-browser";
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
  pages: false,
  connections: false,
  billing: false,
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
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [content, setContent] = useState<ContentPiece[] | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

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
          .then(async (r) => (r.ok ? ((await r.json()) as { plan?: string }) : null))
          .then((d) => { if (!cancelled && d?.plan) setPlanTier(d.plan); })
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
      if (res.ok) setScore((await res.json()) as ScorePayload);
    } catch {
      /* non-fatal — overview shows the empty state */
    } finally {
      setScoreLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async (brandId: string) => {
    setTasksLoading(true);
    setTasks(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/plan`);
      if (res.ok) setTasks(((await res.json()) as { tasks?: PlanTask[] }).tasks ?? []);
      else setTasks([]);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadContent = useCallback(async (brandId: string) => {
    setContentLoading(true);
    setContent(null);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/content`);
      if (res.ok) setContent(((await res.json()) as { content?: ContentPiece[] }).content ?? []);
      else setContent([]);
    } catch {
      setContent([]);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const loadBreakdown = useCallback(async (auditId: string) => {
    setBreakdownLoading(true);
    setBreakdown(null);
    try {
      const res = await apiFetch(`/api/audits/${auditId}/breakdown`);
      if (res.ok) setBreakdown((await res.json()) as Breakdown);
    } catch {
      /* non-fatal — tab shows empty state */
    } finally {
      setBreakdownLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeBrandId) {
      void loadScore(activeBrandId);
      setTasks(null);
      setContent(null);
      setBreakdown(null);
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
      void loadBreakdown(latestAuditId);
    }
  }, [tab, activeBrandId, tasks, content, breakdown, tasksLoading, contentLoading, breakdownLoading, latestAuditId, loadTasks, loadContent, loadBreakdown]);

  // Optimistic mutations -----------------------------------------------------
  const toggleTask = useCallback(async (taskId: string, done: boolean) => {
    const next = done ? "done" : "accepted";
    setTasks((prev) => (prev ? prev.map((t) => (t.id === taskId ? { ...t, status: next } : t)) : prev));
    try {
      const res = await apiFetch(`/api/plan-tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error();
    } catch {
      // revert on failure
      setTasks((prev) => (prev ? prev.map((t) => (t.id === taskId ? { ...t, status: done ? "accepted" : "done" } : t)) : prev));
    }
  }, []);

  const setContentStatus = useCallback(async (id: string, status: "approved" | "discarded") => {
    setContent((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, status } : c)) : prev));
    try {
      const res = await apiFetch(`/api/content/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
    } catch {
      setContent((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, status: "draft" } : c)) : prev));
    }
  }, []);

  // ---- auth gate -----------------------------------------------------------
  useEffect(() => {
    if (authError && isSupabaseConfigured()) router.replace("/login");
  }, [authError, router]);

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

        <Link href="/dashboard" style={S.backLink}>← Back to current dashboard</Link>
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
          />
        ) : tab === "brands" ? (
          <BrandsTab brands={brands} onOpen={(id) => { setActiveBrandId(id); setTab("overview"); }} />
        ) : tab === "donext" ? (
          <DoNextTab tasks={tasks} loading={tasksLoading} onToggle={toggleTask} brandId={activeBrandId} />
        ) : tab === "content" ? (
          <ContentTab items={content} loading={contentLoading} onSet={setContentStatus} brandId={activeBrandId} />
        ) : tab === "competitors" ? (
          <CompetitorsTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : tab === "sources" ? (
          <SourcesTab breakdown={breakdown} loading={breakdownLoading || scoreLoading} hasAudit={!!latestAuditId} brandId={activeBrandId} />
        ) : (
          <MigratingTab tab={tab} brandId={activeBrandId} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function OverviewTab({
  brandName, overall, threeScores, trendPoints, tone, loading, brandId,
}: {
  brandName?: string;
  overall: number | null;
  threeScores?: ThreeScores;
  trendPoints: number[];
  tone: { label: string; bg: string; fg: string };
  loading: boolean;
  brandId: string;
}) {
  const hasData = overall != null || (threeScores && threeScores.visibility != null);
  return (
    <>
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
          <p style={{ margin: 0, color: "var(--color-muted)" }}>No audit yet for this brand.</p>
          <Link href={`/brands/${brandId}`} style={{ ...S.btnPri, marginTop: "var(--space-4)", display: "inline-block" }}>Run the first audit →</Link>
        </div>
      )}

      <p style={S.note}>
        Every number here comes from real questions run on real AI engines. When we can’t measure something, we say so —
        we never invent a score.
      </p>
    </>
  );
}

function BrandsTab({ brands, onOpen }: { brands: BrandRow[]; onOpen: (id: string) => void }) {
  // A brand with no score yet counts as needing attention (it needs its first
  // audit) — null → 0, not a healthy 100. Keeps the "N need attention" badge honest.
  const needsWork = brands.filter((b) => (b.latest_score ?? 0) < 55).length;
  return (
    <>
      <div style={S.secH}>
        Your client brands <span style={S.secN}>— {brands.length} brand{brands.length === 1 ? "" : "s"}{needsWork ? ` · ${needsWork} need${needsWork === 1 ? "s" : ""} attention` : ""}</span>
      </div>
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

function CompetitorsTab({
  breakdown, loading, hasAudit, brandId,
}: {
  breakdown: Breakdown | null;
  loading: boolean;
  hasAudit: boolean;
  brandId: string;
}) {
  if (loading) return <div style={S.muted}>Loading your competitors…</div>;
  if (!hasAudit) return <NeedAudit brandId={brandId} msg="Run an audit to see who AI names instead of you." />;
  if (!breakdown) return <NeedAudit brandId={brandId} msg="Couldn’t load the latest audit. Try running a fresh one." />;

  const comps = [...(breakdown.competitors ?? [])].sort((a, b) => b.displacement - a.displacement || b.mentions - a.mentions);
  if (comps.length === 0) {
    return <div style={{ ...S.card, padding: "var(--space-6)", color: "var(--color-muted)" }}>No competitors surfaced in the last audit — AI didn’t name a rival ahead of you. Add competitors to track them directly.</div>;
  }
  const maxDisp = Math.max(...comps.map((c) => c.displacement), 1);

  return (
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
  );
}

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
};
