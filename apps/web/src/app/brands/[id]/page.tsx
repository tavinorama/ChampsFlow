"use client";

/**
 * /brands/[id] — Ozvor AI Visibility Score detail + deep breakdown
 *
 * - Polls a running audit (?audit=<id>) to completion, else loads latest score.
 * - Shows the overall Ozvor AI Visibility Score + 3 vectors.
 * - Deep breakdown per vector: the component math, each input labelled
 *   "measured" (real signal this audit) vs "baseline" (placeholder pending
 *   the site-crawl/entity slice) — honest about what is and isn't live.
 * - AI vector shows the per-prompt EVIDENCE: which buyer prompt, which engine,
 *   cited?, position, and which sources — answering "why this AI score?".
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/supabase-browser";
import { TrustIndexScorecard, VECTOR_COLORS, type ThreeScores } from "../../../components/TrustIndexScorecard";
import { ScoreTrend } from "../../../components/ScoreTrend";
import { PromptsPanel } from "./PromptsPanel";
import { confidenceLabel } from "../../../lib/confidence";

interface AuditState {
  id?: string;
  status: "pending" | "running" | "complete" | "failed";
  score_brand: number | null;
  score_performance: number | null;
  score_ai: number | null;
  providers_used?: string[] | null;
}

interface Evidence {
  engine: string;
  prompt: string | null;
  cited: boolean;
  position: number | null;
  sources: string[];
  mentionRate: number | null;
  runsCount: number | null;
  rawTextSnippet: string | null;
}

interface Breakdown {
  scores: { brand: number; performance: number; ai: number; overall: number | null } | null;
  components: {
    brand: Record<string, number | boolean>;
    performance: Record<string, number | boolean>;
    ai: Record<string, number | boolean>;
  } | null;
  measured: Record<string, string[]> | null;
  baseline: Record<string, string[]> | null;
  probes_total: number;
  probes_cited: number | null;
  probe_repeat: number | null;
  site_crawl: { reachable: boolean; domain: string | null; findings: string[] } | null;
  competitors: Array<{ name: string; mentions: number; displacement: number }>;
  offsite: {
    live: boolean;
    score: number;
    sources: Array<{ id: string; label: string; domain: string; present: boolean; count: number }>;
    findings: string[];
  } | null;
  content: {
    analyzed: boolean;
    pagesAnalyzed: number;
    score: number;
    traits: { statistics: number; quotations: number; sourcedClaims: number; answerShaped: number; depth: number };
    findings: string[];
  } | null;
  sentiment: {
    analyzed: boolean;
    score: number;
    positive: number;
    neutral: number;
    negative: number;
    mentionsClassified: number;
    findings: string[];
  } | null;
  reddit: {
    live: boolean;
    score: number;
    threadCount: number;
    subreddits: string[];
    sentiment: { positive: number; neutral: number; negative: number; score: number };
    findings: string[];
  } | null;
  entity: {
    live: boolean;
    found: boolean;
    wikidataId: string | null;
    hasWikipedia: boolean;
    properties: { officialWebsite: boolean; industry: boolean; inception: boolean; description: boolean; crunchbase: boolean; linkedin: boolean };
    domainConsistent: boolean | null;
    completeness: number;
    findings: string[];
  } | null;
  evidence: Evidence[];
  topSources: Array<{ domain: string; label: string; type?: string; usedPct?: number; avgCitations?: number; isYou?: boolean; count?: number }>;
}

// Attribution types
interface AttributionMetricPoint {
  date: string;
  sessions?: number;
  users?: number;
  clicks?: number;
  impressions?: number;
}

interface AttributionMetricSeries {
  cachedAt: string;
  periodStart: string;
  periodEnd: string;
  series: AttributionMetricPoint[];
}

const POLL_MS = 2500;
const MAX_POLLS = 80;

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT (GPT-4o)",
  google: "Gemini",
  gemini: "Gemini",
  perplexity: "Perplexity",
  dataforseo: "Google AI Overview",
  serp: "Google AI Overview",
};

export default function BrandDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const brandId = params?.id ?? "";
  const auditId = search?.get("audit") ?? "";

  const [audit, setAudit] = useState<AuditState | null>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [threeScores, setThreeScores] = useState<ThreeScores | null>(null);
  const [statusMsg, setStatusMsg] = useState("Loading…");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [resolvedAuditId, setResolvedAuditId] = useState<string>("");
  const [brandName, setBrandName] = useState<string | undefined>(undefined);
  const [trend, setTrend] = useState<Array<{ recorded_at: string; score_overall: number | null; score_ai?: number | null; score_performance?: number | null; score_brand?: number | null }>>([]);
  const [brandSettings, setBrandSettings] = useState<{
    tracked_models: string[] | null;
    tracking_frequency: string | null;
  } | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied" | "error">("idle");
  const pollCount = useRef(0);
  const [section, setSection] = useState<DashSection>("overview");

  // Attribution state — loaded async, non-blocking
  const [attributionSummary, setAttributionSummary] = useState<string | null>(null);
  const [attributionConfigured, setAttributionConfigured] = useState<boolean | null>(null);
  const [ga4Metrics, setGa4Metrics] = useState<AttributionMetricSeries | null>(null);
  const [gscMetrics, setGscMetrics] = useState<AttributionMetricSeries | null>(null);
  const [attributionLoadState, setAttributionLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const computeOverall = useCallback((a: AuditState): number | null => {
    if (a.score_brand == null || a.score_performance == null || a.score_ai == null) return null;
    return Math.round(a.score_brand * 0.3 + a.score_performance * 0.35 + a.score_ai * 0.35);
  }, []);

  const loadBreakdown = useCallback(async (aId: string) => {
    try {
      const res = await apiFetch(`/api/audits/${aId}/breakdown`);
      if (res.ok) setBreakdown(await res.json());
    } catch {
      /* non-fatal */
    }
  }, []);

  // Fetch brand name (non-blocking — scorecard degrades gracefully without it).
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/brands");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { brands?: Array<{ id: string; name: string }> };
        const match = (data.brands ?? []).find((b) => b.id === brandId);
        if (match && !cancelled) setBrandName(match.name);
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  // Fetch brand settings (tracked_models, tracking_frequency) — non-blocking.
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/brands/${brandId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { tracked_models?: string[] | null; tracking_frequency?: string | null };
        if (!cancelled) {
          setBrandSettings({
            tracked_models: data.tracked_models ?? null,
            tracking_frequency: data.tracking_frequency ?? null,
          });
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  // Fetch plan tier — non-blocking, graceful on failure.
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/billing/plan");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { plan?: string };
        if (!cancelled && data.plan) setPlanTier(data.plan);
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  // Poll a running audit.
  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (cancelled) return;
      pollCount.current += 1;
      try {
        const res = await apiFetch(`/api/audits/${auditId}`);
        if (res.ok) {
          const a: AuditState = await res.json();
          setAudit(a);
          if (a.status === "complete") {
            setOverall(computeOverall(a));
            setStatusMsg("Audit complete.");
            setResolvedAuditId(auditId);
            void loadBreakdown(auditId);
            return;
          }
          if (a.status === "failed") {
            setStatusMsg("The audit failed. Please run it again.");
            return;
          }
          setStatusMsg(a.status === "running" ? "Probing AI engines…" : "Queued…");
        }
      } catch {
        /* keep polling */
      }
      if (pollCount.current < MAX_POLLS && !cancelled) timer = setTimeout(poll, POLL_MS);
      else if (!cancelled) setStatusMsg("Still working… refresh in a moment.");
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [auditId, computeOverall, loadBreakdown]);

  // On load without ?audit, fetch latest score, then its breakdown.
  useEffect(() => {
    if (auditId || !brandId) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/brands/${brandId}/score`);
        if (res.ok) {
          const data = await res.json();
          const latest = data.latest;
          setTrend(
            (data.trend ?? []) as Array<{
              recorded_at: string;
              score_overall: number | null;
              score_ai?: number | null;
              score_performance?: number | null;
              score_brand?: number | null;
            }>
          );
          // Read threeScores from the updated API response when available.
          if (data.threeScores) {
            setThreeScores({
              visibility: data.threeScores.visibility ?? null,
              citationReadiness: data.threeScores.citationReadiness ?? null,
              executionProgress: data.threeScores.executionProgress ?? null,
            });
          }
          if (latest) {
            setAudit({
              status: "complete",
              score_brand: latest.score_brand,
              score_performance: latest.score_performance,
              score_ai: latest.score_ai,
            });
            setOverall(latest.score_overall ?? null);
            setStatusMsg("Latest Ozvor AI Visibility Score.");
            if (latest.audit_id) {
              setResolvedAuditId(latest.audit_id);
              void loadBreakdown(latest.audit_id);
            }
          } else {
            setStatusMsg("No audit yet. Run one from your brands list.");
          }
        }
      } catch {
        setStatusMsg("Could not load the score.");
      }
    })();
  }, [auditId, brandId, loadBreakdown]);

  // Load attribution data when the Attribution section is opened (lazy).
  useEffect(() => {
    if (section !== "attribution" || !brandId) return;
    if (attributionLoadState !== "idle") return;
    setAttributionLoadState("loading");
    let cancelled = false;
    void (async () => {
      try {
        const [summaryRes, metricsRes] = await Promise.all([
          apiFetch(`/api/brands/${brandId}/attribution/summary`),
          apiFetch(`/api/brands/${brandId}/google/metrics`),
        ]);
        if (cancelled) return;
        if (summaryRes.ok) {
          const sd = (await summaryRes.json()) as {
            summary?: string | null;
            configured?: boolean;
            ga4Available?: boolean;
            gscAvailable?: boolean;
          };
          setAttributionSummary(sd.summary ?? null);
          setAttributionConfigured(sd.configured ?? (sd.ga4Available === true || sd.gscAvailable === true));
        } else {
          setAttributionConfigured(false);
        }
        if (metricsRes.ok) {
          const md = (await metricsRes.json()) as {
            configured?: boolean;
            ga4?: AttributionMetricSeries | null;
            gsc?: AttributionMetricSeries | null;
          };
          setGa4Metrics(md.ga4 ?? null);
          setGscMetrics(md.gsc ?? null);
          if (md.configured === false) setAttributionConfigured(false);
        }
        if (!cancelled) setAttributionLoadState("ready");
      } catch {
        if (!cancelled) setAttributionLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [section, brandId, attributionLoadState]);

  const isWorking = audit?.status === "pending" || audit?.status === "running" || (!audit && !!auditId);

  async function handleShare() {
    setShareState("sharing");
    try {
      const res = await apiFetch(`/api/brands/${brandId}/share`, { method: "POST" });
      if (!res.ok) { setShareState("error"); return; }
      const data = (await res.json()) as { token?: string };
      const url = `${window.location.origin}/r/${data.token ?? ""}`;
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch { setShareState("error"); }
  }

  return (
    <main style={{
      maxWidth: "1180px", margin: "0 auto",
      padding: "var(--space-6) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
      fontFamily: "var(--font-family)", color: "var(--color-text)",
    }}>
      <style>{DASH_STYLES}</style>
      <div className="bd-shell">
        {/* ── Sidebar nav ───────────────────────────────────────────── */}
        <nav className="bd-nav" aria-label="Brand dashboard sections">
          <a href="/dashboard" className="bd-back" style={{ color: "var(--color-primary)", textDecoration: "none", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}>
            ← Dashboard
          </a>
          <div className="bd-brandname">{brandName ?? "Your brand"}</div>
          <div className="bd-navlist" role="tablist" aria-orientation="vertical">
            {DASH_NAV.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={section === item.id}
                aria-current={section === item.id ? "page" : undefined}
                className={`bd-navitem${section === item.id ? " bd-navitem--active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Main panel ────────────────────────────────────────────── */}
        <div className="bd-main">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
            <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              Ozvor AI Visibility Score
            </h1>
            {planTier === "agency" && (
              <button
                onClick={() => void handleShare()}
                disabled={shareState === "sharing"}
                aria-label="Share report — copy link to clipboard"
                style={{
                  minHeight: "var(--min-tap-target)",
                  padding: "0 var(--space-4)",
                  backgroundColor: "transparent",
                  color: shareState === "copied" ? "var(--color-success)" : "var(--color-primary)",
                  border: `1.5px solid ${shareState === "copied" ? "var(--color-success)" : "var(--color-primary)"}`,
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: 700,
                  fontFamily: "var(--font-family)",
                  cursor: shareState === "sharing" ? "not-allowed" : "pointer",
                  opacity: shareState === "sharing" ? 0.6 : 1,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {shareState === "sharing" ? "Sharing…" : shareState === "copied" ? "Link copied!" : "Share report"}
              </button>
            )}
          </div>
          <div aria-live="polite" style={{ marginBottom: "var(--space-6)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
            {isWorking ? <Spinner label={statusMsg} /> : statusMsg}
          </div>

      {section === "overview" && (<>
      {/* Scorecard hero — matches the landing page hero mockup */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <TrustIndexScorecard
          overall={breakdown?.scores?.overall ?? overall}
          threeScores={threeScores ?? undefined}
          vectors={
            threeScores == null
              ? {
                  ai: breakdown?.scores?.ai ?? audit?.score_ai ?? null,
                  performance: breakdown?.scores?.performance ?? audit?.score_performance ?? null,
                  brand: breakdown?.scores?.brand ?? audit?.score_brand ?? null,
                }
              : undefined
          }
          competitors={
            (breakdown?.competitors ?? [])
              .filter((c) => c.displacement > 0)
              .map((c) => ({ name: c.name, displacement: c.displacement }))
          }
          probeSummary={
            breakdown?.probes_total
              ? `${breakdown.probes_total} AI probes${audit?.providers_used?.length ? ` · ${audit.providers_used.length} engines` : ""}`
              : undefined
          }
          brandName={brandName}
        />
        {/* Export + methodology link row */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "var(--space-4)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          <a
            href="/how-we-measure"
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              textDecoration: "underline",
              fontFamily: "var(--font-family)",
              alignSelf: "center",
            }}
          >
            How is this measured?
          </a>
          <ExportCsvButton auditId={resolvedAuditId} />
        </div>
      </div>

      {/* Score trend chart — shown prominently when history exists */}
      {trend.length >= 2 && (
        <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="score-trend-heading">
          <h2 id="score-trend-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>
            Your Ozvor AI Visibility Score over time
          </h2>
          <div style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            boxShadow: "var(--shadow-card)",
          }}>
            <ScoreTrend trend={trend} brandName={brandName} multiSeries />
          </div>
        </section>
      )}
      {trend.length < 2 && audit?.status === "complete" && (
        <section style={{ marginBottom: "var(--space-6)" }}>
          <ScoreTrend trend={trend} brandName={brandName} />
        </section>
      )}

      {/* Three vectors — expandable with component breakdown */}
      <VectorPanel
        label="AI" weight="35%" hint="Are you cited in AI answers?"
        value={audit?.score_ai ?? null}
        components={breakdown?.components?.ai}
        measured={breakdown?.measured?.ai} baseline={breakdown?.baseline?.ai}
        explainer="Measured from real probes: how often AI engines mention your brand (citation rate), how high it ranks in the answer (position), and how it is portrayed (sentiment, classified from the answer text)."
      >
        {breakdown?.sentiment && <SentimentBreakdown sentiment={breakdown.sentiment} />}
        {breakdown?.evidence && breakdown.evidence.length > 0 && (
          <EvidenceTable evidence={breakdown.evidence} probeRepeat={breakdown.probe_repeat} />
        )}
      </VectorPanel>

      <VectorPanel
        label="Performance" weight="35%" hint="Technical & citation share"
        value={audit?.score_performance ?? null}
        components={breakdown?.components?.performance}
        measured={breakdown?.measured?.performance} baseline={breakdown?.baseline?.performance}
        explainer="Aligned with Google's official 2026 generative-AI guidance. Scored: citation share-of-voice vs competitors, Google AI Overview presence, schema.org coverage (standard SEO hygiene — not 'AI schema', which Google says isn't required), AI-crawler access (crawlability, which Google endorses), and multi-page content citation-worthiness. llms.txt is shown for reference only — Google states it is not required, so it does not affect your score."
      >
        {breakdown?.content && <ContentTraits content={breakdown.content} />}
        {breakdown?.site_crawl && <CrawlFindings crawl={breakdown.site_crawl} />}
      </VectorPanel>

      <VectorPanel
        label="Brand" weight="30%" hint="Entity authority & presence"
        value={audit?.score_brand ?? null}
        components={breakdown?.components?.brand}
        measured={breakdown?.measured?.brand} baseline={breakdown?.baseline?.brand}
        explainer="Measured now: citation volume across the AI engines queried; off-site authority (Reddit, Wikipedia, G2 and other sources AI cites most); a Reddit deep-dive (threads, subreddits, sentiment — the #1 cited source); cross-source entity consistency (Wikidata/Wikipedia); plus on-site identity & E-E-A-T from the live crawl."
      >
        {breakdown?.entity && <EntityGraphPanel entity={breakdown.entity} />}
        {breakdown?.reddit && <RedditPanel reddit={breakdown.reddit} />}
        {breakdown?.offsite && <OffsitePresence offsite={breakdown.offsite} />}
        {breakdown?.site_crawl && <CrawlFindings crawl={breakdown.site_crawl} />}
      </VectorPanel>

      {/* Competitor benchmark — who AI recommends instead of you */}
      <CompetitorBenchmark brandId={brandId} benchmark={breakdown?.competitors ?? []} />

      {/* Domains by type — donut of cited-source categories */}
      <DomainsByTypeCard sources={breakdown?.topSources ?? []} />

      {/* Done-for-you — hand the plan to OrganicPosts (the paid service) */}
      <DoneForYou brandId={brandId} brandName={brandName} overallScore={breakdown?.scores?.overall ?? overall} />

      {breakdown && (
        <p style={{ marginTop: "var(--space-6)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          <strong>How to read this:</strong> &ldquo;Measured&rdquo; values come from this audit&rsquo;s live AI probes
          {breakdown.site_crawl?.reachable ? " and a live crawl of your website" : ""}.
          &ldquo;Baseline&rdquo; values are neutral placeholders shown transparently when a data source
          isn&rsquo;t connected yet — never presented as real signal.
        </p>
      )}
      </>)}

      {/* ── Sources section — Find Key Sources ──────────────────────── */}
      {section === "sources" && (
        <TopSourcesPanel sources={breakdown?.topSources ?? []} />
      )}

      {/* ── Content section — plan + studio (our "execute" edge) ─────── */}
      {section === "content" && (<>
        <GeoContentPlan brandId={brandId} auditId={resolvedAuditId} />
        <ContentStudio brandId={brandId} />
      </>)}

      {/* ── Models section — engines + frequency ────────────────────── */}
      {section === "models" && (
        <AiModelsPanel
          brandId={brandId}
          settings={brandSettings}
          planTier={planTier}
          onSettingsSaved={(updated) => setBrandSettings(updated)}
        />
      )}

      {/* ── Prompts section — managed prompt library ────────────────── */}
      {section === "prompts" && (
        <PromptsPanel brandId={brandId} />
      )}

      {/* ── Attribution section — GA4 + GSC overlaid on Visibility Score ── */}
      {section === "attribution" && (
        <AttributionPanel
          brandId={brandId}
          loadState={attributionLoadState}
          configured={attributionConfigured}
          summary={attributionSummary}
          ga4Metrics={ga4Metrics}
          gscMetrics={gscMetrics}
          scoreTrend={trend}
        />
      )}

      {/* ── Settings section — brand basics + account links ─────────── */}
      {section === "settings" && (<>
        <SettingsCard brandName={brandName} />
        <PublicProfilesCard brandId={brandId} />
      </>)}
        </div>{/* /bd-main */}
      </div>{/* /bd-shell */}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dashboard sections (Peec-style sidebar nav) + Domains-by-type donut
// ---------------------------------------------------------------------------

type DashSection = "overview" | "content" | "sources" | "models" | "prompts" | "settings" | "attribution";

const DASH_NAV: { id: DashSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content" },
  { id: "sources", label: "Sources" },
  { id: "models", label: "Models" },
  { id: "prompts", label: "Prompts" },
  { id: "attribution", label: "Attribution" },
  { id: "settings", label: "Settings" },
];

const DASH_STYLES = `
  .bd-shell { display: grid; grid-template-columns: 220px 1fr; gap: var(--space-8); align-items: start; }
  .bd-nav { position: sticky; top: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
  .bd-back { display: inline-block; margin-bottom: var(--space-2); }
  .bd-brandname { font-size: var(--font-size-body); font-weight: 800; color: var(--color-text); letter-spacing: -0.01em; margin-bottom: var(--space-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bd-navlist { display: flex; flex-direction: column; gap: 2px; }
  .bd-navitem { text-align: left; background: transparent; border: none; cursor: pointer; font-family: var(--font-family); font-size: var(--font-size-body-sm); font-weight: 600; color: var(--color-muted); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); min-height: var(--min-tap-target); transition: background 0.12s, color 0.12s; }
  .bd-navitem:hover { background: var(--color-surface-muted); color: var(--color-text); }
  .bd-navitem--active { background: var(--color-badge-ai-bg); color: var(--color-primary); }
  .bd-navitem:focus-visible { outline: var(--focus-outline-width) solid var(--color-focus-outline); outline-offset: 2px; }
  .bd-main { min-width: 0; }
  @media (max-width: 900px) {
    .bd-shell { grid-template-columns: 1fr; gap: var(--space-5); }
    .bd-nav { position: static; }
    .bd-navlist { flex-direction: row; overflow-x: auto; gap: var(--space-1); padding-bottom: var(--space-1); -webkit-overflow-scrolling: touch; }
    .bd-navitem { white-space: nowrap; flex: 0 0 auto; }
    .bd-brandname { display: none; }
  }
`;

const DONUT_TYPE_COLORS: Record<string, string> = {
  UGC: "#f59e0b", Review: "#2563eb", Social: "#7c3aed", Reference: "#0fb488",
  News: "#ef4444", Web: "#64748b", You: "#0A7E5A",
};

function DomainsByTypeCard({ sources }: { sources: TopSource[] }) {
  const counts = new Map<string, number>();
  for (const s of sources) {
    const t = ((s as { type?: string }).type) || "Web";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (total === 0) return null;

  const size = 140, stroke = 22, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const arcs = entries.map(([type, count]) => {
    const frac = count / total;
    const seg = { type, dash: frac * C, off: offset };
    offset += frac * C;
    return seg;
  });

  return (
    <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="domains-by-type-heading">
      <h2 id="domains-by-type-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>
        Domains by type
      </h2>
      <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-6)" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Cited sources across ${total} domains by type`} style={{ flexShrink: 0 }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-surface-muted)" strokeWidth={stroke} />
          {arcs.map((a) => (
            <circle key={a.type} cx={cx} cy={cy} r={r} fill="none"
              stroke={DONUT_TYPE_COLORS[a.type] ?? "#64748b"} strokeWidth={stroke}
              strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.off}
              transform={`rotate(-90 ${cx} ${cy})`} />
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--color-text)" fontFamily="var(--font-family)">{total}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-family)">domains</text>
        </svg>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: "160px" }}>
          {entries.map(([type, count]) => (
            <li key={type} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)" }}>
              <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: DONUT_TYPE_COLORS[type] ?? "#64748b", flexShrink: 0 }} />
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{type}</span>
              <span style={{ color: "var(--color-muted)", marginLeft: "auto" }}>{count} · {Math.round((count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Attribution Panel — GA4 + GSC overlaid with Ozvor AI Visibility Score trend
// ---------------------------------------------------------------------------

interface AttributionPanelProps {
  brandId: string;
  loadState: "idle" | "loading" | "ready" | "error";
  configured: boolean | null;
  summary: string | null;
  ga4Metrics: AttributionMetricSeries | null;
  gscMetrics: AttributionMetricSeries | null;
  scoreTrend: Array<{ recorded_at: string; score_overall: number | null }>;
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "less than 1 hour ago";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}


function AttributionPanel({
  brandId,
  loadState,
  configured,
  summary,
  ga4Metrics,
  gscMetrics,
  scoreTrend,
}: AttributionPanelProps) {
  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-6)",
    boxShadow: "var(--shadow-card)",
    marginBottom: "var(--space-4)",
  };

  const headingStyle: React.CSSProperties = {
    fontSize: "var(--font-size-h3)",
    fontWeight: 700,
    margin: "0 0 var(--space-4) 0",
    color: "var(--color-text)",
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadState === "idle" || loadState === "loading") {
    return (
      <section aria-labelledby="attribution-heading" style={{ marginBottom: "var(--space-8)" }}>
        <h2 id="attribution-heading" style={headingStyle}>Attribution</h2>
        <div style={cardStyle} aria-busy="true" aria-label="Loading attribution data">
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: 0 }}>
            Loading attribution data…
          </p>
        </div>
      </section>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (loadState === "error") {
    return (
      <section aria-labelledby="attribution-heading" style={{ marginBottom: "var(--space-8)" }}>
        <h2 id="attribution-heading" style={headingStyle}>Attribution</h2>
        <div style={{ ...cardStyle, borderColor: "var(--color-border)" }}>
          <p role="status" style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: 0 }}>
            Attribution data unavailable. Please try refreshing the page.
          </p>
        </div>
      </section>
    );
  }

  // ── State A: Google OAuth not configured at all ────────────────────────────
  if (configured === false && !ga4Metrics && !gscMetrics) {
    return (
      <section aria-labelledby="attribution-heading" style={{ marginBottom: "var(--space-8)" }}>
        <h2 id="attribution-heading" style={headingStyle}>Attribution</h2>
        <div style={cardStyle}>
          <div
            style={{
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-4)",
            }}
            role="status"
          >
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.6 }}>
              Google Analytics &amp; Search Console aren&rsquo;t connected yet.
            </p>
          </div>
          <a
            href="/account/connections"
            style={{
              display: "inline-block",
              color: "var(--color-primary)",
              fontWeight: 600,
              fontSize: "var(--font-size-body-sm)",
              textDecoration: "none",
              marginBottom: "var(--space-4)",
            }}
          >
            Connect data sources →
          </a>
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
            See how your Ozvor AI Visibility Score correlates with organic traffic.
          </p>
        </div>
      </section>
    );
  }

  // ── State B: Configured but no data yet for this brand ────────────────────
  const hasGa4Data = ga4Metrics && ga4Metrics.series.length > 0;
  const hasGscData = gscMetrics && gscMetrics.series.length > 0;

  if (!hasGa4Data && !hasGscData) {
    return (
      <section aria-labelledby="attribution-heading" style={{ marginBottom: "var(--space-8)" }}>
        <h2 id="attribution-heading" style={headingStyle}>Attribution</h2>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-4)",
              padding: "var(--space-6) var(--space-4)",
              textAlign: "center",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
              <path d="M12 8v4l2 2" />
            </svg>
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              No data sources connected for this brand yet.
            </p>
            <a
              href="/account/connections"
              style={{
                display: "inline-block",
                minHeight: "var(--min-tap-target)",
                padding: "0 var(--space-5)",
                lineHeight: "var(--min-tap-target)",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "var(--font-size-body-sm)",
                textDecoration: "none",
                borderRadius: "var(--radius-md)",
              }}
              aria-label="Connect Google Analytics 4 or Search Console"
            >
              Connect GA4 or Search Console
            </a>
            <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
              Connect Google Analytics 4 or Search Console to see whether your organic traffic moves with your Visibility Score.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── State C: Data available — render overlay chart ─────────────────────────
  // Build normalized time series for the chart.
  // Score trend is the reference timeline (chronological).
  const chronoTrend = [...scoreTrend]
    .filter((r): r is { recorded_at: string; score_overall: number } => r.score_overall !== null)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  // For attribution series, we use their own date axis (may differ from score trend frequency).
  // Build independent date sets for GA4 and GSC.
  const ga4Points = hasGa4Data ? ga4Metrics!.series : [];
  const gscPoints = hasGscData ? gscMetrics!.series : [];

  // Merge all unique dates (score + ga4 + gsc) into a unified timeline.
  const dateSet = new Set<string>();
  for (const r of chronoTrend) dateSet.add(r.recorded_at.substring(0, 10));
  for (const p of ga4Points) dateSet.add(p.date.substring(0, 10));
  for (const p of gscPoints) dateSet.add(p.date.substring(0, 10));
  const unifiedDates = [...dateSet].sort();

  // Map score to unified timeline.
  const scoreByDate = new Map<string, number>();
  for (const r of chronoTrend) scoreByDate.set(r.recorded_at.substring(0, 10), r.score_overall);
  const scoreValues = unifiedDates.map((d) => scoreByDate.get(d) ?? null);

  // GA4 sessions per unified date.
  const ga4ByDate = new Map<string, number>();
  for (const p of ga4Points) if ((p.sessions ?? 0) > 0) ga4ByDate.set(p.date.substring(0, 10), p.sessions ?? 0);
  const ga4RawValues = unifiedDates.map((d) => ga4ByDate.get(d) ?? null);
  const ga4HasAnyData = ga4RawValues.some((v) => v !== null);

  // GSC clicks per unified date.
  const gscByDate = new Map<string, number>();
  for (const p of gscPoints) if ((p.clicks ?? 0) > 0) gscByDate.set(p.date.substring(0, 10), p.clicks ?? 0);
  const gscRawValues = unifiedDates.map((d) => gscByDate.get(d) ?? null);
  const gscHasAnyData = gscRawValues.some((v) => v !== null);

  // Normalize GA4 and GSC to 0–100 for overlay.
  const ga4NonNull = ga4RawValues.filter((v): v is number => v !== null);
  const gscNonNull = gscRawValues.filter((v): v is number => v !== null);
  const ga4Max = ga4NonNull.length > 0 ? Math.max(...ga4NonNull) : 1;
  const gscMax = gscNonNull.length > 0 ? Math.max(...gscNonNull) : 1;

  // Build SVG chart data.
  const viewW = 400;
  const viewH = 100;
  const padX = 4;
  const padY = 6;
  const n = unifiedDates.length;

  function xAt(i: number): number {
    return n <= 1 ? viewW / 2 : (i / (n - 1)) * (viewW - padX * 2) + padX;
  }
  function yAt(normalizedValue: number): number {
    return viewH - padY - (normalizedValue / 100) * (viewH - padY * 2);
  }

  // Collect score segments (arrays of point strings, each being a connected segment).
  function collectSegments(values: (number | null)[], normalizeMax: number): Array<{ x: number; y: number }[]> {
    const result: Array<{ x: number; y: number }[]> = [];
    let current: { x: number; y: number }[] = [];
    values.forEach((v, i) => {
      if (v !== null) {
        const normalized = (v / normalizeMax) * 100;
        current.push({ x: xAt(i), y: yAt(normalized) });
      } else {
        if (current.length >= 2) result.push(current);
        current = [];
      }
    });
    if (current.length >= 2) result.push(current);
    return result;
  }

  const scoreSegments = collectSegments(scoreValues, 100);
  const ga4Segments = ga4HasAnyData ? collectSegments(ga4RawValues, ga4Max) : [];
  const gscSegments = gscHasAnyData ? collectSegments(gscRawValues, gscMax) : [];

  // Determine time labels.
  const firstDate = unifiedDates[0] ?? "";
  const lastDate = unifiedDates[unifiedDates.length - 1] ?? "";
  function fmtDate(d: string): string {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // CachedAt — use the most recent cachedAt.
  const cachedAt = ga4Metrics?.cachedAt ?? gscMetrics?.cachedAt ?? null;

  // Connected info for chips.
  const ga4Connection = hasGa4Data
    ? { connected: true, label: ga4Metrics!.series[0] ? "Connected" : "Connected" }
    : { connected: false, label: "Not connected" };
  const gscConnection = hasGscData
    ? { connected: true, label: "Connected" }
    : { connected: false, label: "Not connected" };

  const SCORE_COLOR = "var(--color-primary)";
  const GA4_COLOR = "#f59e0b";
  const GSC_COLOR = "#7c3aed";

  return (
    <section aria-labelledby="attribution-heading" style={{ marginBottom: "var(--space-8)" }}>
      <h2 id="attribution-heading" style={headingStyle}>Attribution</h2>

      <div style={cardStyle}>
        {/* Header row with title + update time */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            marginBottom: summary ? "var(--space-4)" : "var(--space-5)",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
            Organic traffic trends overlaid with your Ozvor AI Visibility Score.
          </p>
          {cachedAt && (
            <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
              Updated {relativeTime(cachedAt)}
            </span>
          )}
        </div>

        {/* Summary callout (AI-generated insight) */}
        {summary && (
          <div
            style={{
              backgroundColor: "var(--color-badge-ai-bg, rgba(37,99,235,0.06))",
              border: "1px solid rgba(37,99,235,0.2)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
              marginBottom: "var(--space-5)",
            }}
            role="note"
            aria-label="Attribution summary"
          >
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: 1.7 }}>
              {summary}
            </p>
          </div>
        )}

        {/* Chart legend */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            marginBottom: "var(--space-3)",
          }}
          aria-hidden="true"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 600 }}>
            <span style={{ width: "14px", height: "3px", borderRadius: "2px", backgroundColor: SCORE_COLOR, display: "inline-block" }} />
            Visibility Score
          </span>
          {ga4HasAnyData && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 600 }}>
              <span style={{ width: "14px", height: "3px", borderRadius: "2px", backgroundColor: GA4_COLOR, display: "inline-block" }} />
              Organic Sessions (GA4)
            </span>
          )}
          {gscHasAnyData && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontWeight: 600 }}>
              <span style={{ width: "14px", height: "3px", borderRadius: "2px", backgroundColor: GSC_COLOR, display: "inline-block" }} />
              Search Clicks (GSC)
            </span>
          )}
        </div>

        {/* SVG overlay chart */}
        <svg
          width="100%"
          viewBox={`0 0 ${viewW} ${viewH}`}
          role="img"
          aria-label={`Attribution chart: Ozvor AI Visibility Score${ga4HasAnyData ? ", organic sessions from GA4" : ""}${gscHasAnyData ? ", search clicks from GSC" : ""} over time`}
          style={{ display: "block", overflow: "visible", marginBottom: "var(--space-1)" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Score segments */}
          {scoreSegments.map((seg, si) => (
            <polyline
              key={`score-${si}`}
              points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke={SCORE_COLOR}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* GA4 sessions segments */}
          {ga4Segments.map((seg, si) => (
            <polyline
              key={`ga4-${si}`}
              points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke={GA4_COLOR}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 2"
            />
          ))}
          {/* GSC clicks segments */}
          {gscSegments.map((seg, si) => (
            <polyline
              key={`gsc-${si}`}
              points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke={GSC_COLOR}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 2"
            />
          ))}
        </svg>

        {/* Date axis labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "var(--space-5)",
          }}
          aria-hidden="true"
        >
          <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{fmtDate(firstDate)}</span>
          <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{fmtDate(lastDate)}</span>
        </div>

        {/* Data source status chips */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}
          aria-label="Attribution data source status"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-caption)" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: "var(--font-size-badge)",
                backgroundColor: ga4Connection.connected ? "var(--color-badge-connected-bg, rgba(15,180,136,0.12))" : "var(--color-surface-muted)",
                color: ga4Connection.connected ? "var(--color-badge-connected-text, #0fb488)" : "var(--color-muted)",
              }}
            >
              GA4
            </span>
            <span style={{ color: "var(--color-muted)" }}>
              {ga4Connection.connected
                ? `Connected${ga4Metrics?.periodStart ? ` · ${fmtDate(ga4Metrics.periodStart)}–${fmtDate(ga4Metrics.periodEnd)}` : ""}`
                : "Not connected"}
            </span>
            {!ga4Connection.connected && (
              <a href="/account/connections" style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }} aria-label="Connect Google Analytics 4">
                Connect →
              </a>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-caption)" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: "var(--font-size-badge)",
                backgroundColor: gscConnection.connected ? "var(--color-badge-connected-bg, rgba(15,180,136,0.12))" : "var(--color-surface-muted)",
                color: gscConnection.connected ? "var(--color-badge-connected-text, #0fb488)" : "var(--color-muted)",
              }}
            >
              GSC
            </span>
            <span style={{ color: "var(--color-muted)" }}>
              {gscConnection.connected
                ? `Connected${gscMetrics?.periodStart ? ` · ${fmtDate(gscMetrics.periodStart)}–${fmtDate(gscMetrics.periodEnd)}` : ""}`
                : "Not connected"}
            </span>
            {!gscConnection.connected && (
              <a href="/account/connections" style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }} aria-label="Connect Google Search Console">
                Connect →
              </a>
            )}
          </div>
        </div>

        {/* Manage link */}
        <a
          href="/account/connections"
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            textDecoration: "underline",
          }}
        >
          Manage data sources
        </a>
      </div>
    </section>
  );
}

function SettingsCard({ brandName }: { brandName: string | undefined }) {
  return (
    <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="settings-heading">
      <h2 id="settings-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}>
        Settings
      </h2>
      <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          Brand: <strong style={{ color: "var(--color-text)" }}>{brandName ?? "—"}</strong>. Choose which AI engines and how often we track in the <strong>Models</strong> tab.
        </p>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <a href="/account/billing" style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>Manage plan &amp; billing →</a>
          <a href="/account" style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>Account settings →</a>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Public profiles settings card — per-brand profile URL management
// ---------------------------------------------------------------------------

const BRAND_PROFILE_FIELDS: { apiKey: string; stateKey: ProfileUrlStateKey; label: string; placeholder: string }[] = [
  { apiKey: "linkedin_url",    stateKey: "linkedinUrl",    label: "LinkedIn",   placeholder: "https://linkedin.com/company/your-brand"        },
  { apiKey: "reddit_url",      stateKey: "redditUrl",      label: "Reddit",     placeholder: "https://reddit.com/r/your-brand"                },
  { apiKey: "wikipedia_url",   stateKey: "wikipediaUrl",   label: "Wikipedia",  placeholder: "https://en.wikipedia.org/wiki/Your_Brand"       },
  { apiKey: "g2_url",          stateKey: "g2Url",          label: "G2",         placeholder: "https://g2.com/products/your-brand"             },
  { apiKey: "trustpilot_url",  stateKey: "trustpilotUrl",  label: "Trustpilot", placeholder: "https://trustpilot.com/review/yourdomain.com"   },
  { apiKey: "crunchbase_url",  stateKey: "crunchbaseUrl",  label: "Crunchbase", placeholder: "https://crunchbase.com/organization/your-brand"  },
  { apiKey: "youtube_url",     stateKey: "youtubeUrl",     label: "YouTube",    placeholder: "https://youtube.com/@YourBrand"                 },
];

type ProfileUrlStateKey = "linkedinUrl" | "redditUrl" | "wikipediaUrl" | "g2Url" | "trustpilotUrl" | "crunchbaseUrl" | "youtubeUrl";
type ProfileUrlsState = Record<ProfileUrlStateKey, string>;

const EMPTY_PROFILE_URLS: ProfileUrlsState = {
  linkedinUrl: "", redditUrl: "", wikipediaUrl: "",
  g2Url: "", trustpilotUrl: "", crunchbaseUrl: "", youtubeUrl: "",
};

function profilesFromApiData(data: Record<string, unknown>): ProfileUrlsState {
  return {
    linkedinUrl:    typeof data.linkedin_url    === "string" ? data.linkedin_url    : "",
    redditUrl:      typeof data.reddit_url      === "string" ? data.reddit_url      : "",
    wikipediaUrl:   typeof data.wikipedia_url   === "string" ? data.wikipedia_url   : "",
    g2Url:          typeof data.g2_url          === "string" ? data.g2_url          : "",
    trustpilotUrl:  typeof data.trustpilot_url  === "string" ? data.trustpilot_url  : "",
    crunchbaseUrl:  typeof data.crunchbase_url  === "string" ? data.crunchbase_url  : "",
    youtubeUrl:     typeof data.youtube_url     === "string" ? data.youtube_url     : "",
  };
}

function PublicProfilesCard({ brandId }: { brandId: string }) {
  const [urls, setUrls] = useState<ProfileUrlsState>(EMPTY_PROFILE_URLS);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/brands/${brandId}`);
        if (!res.ok || cancelled) { setLoadState("error"); return; }
        const data = (await res.json()) as Record<string, unknown>;
        if (!cancelled) {
          setUrls(profilesFromApiData(data));
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const body: Record<string, string> = {};
      for (const f of BRAND_PROFILE_FIELDS) {
        body[f.apiKey] = urls[f.stateKey].trim();
      }
      const res = await apiFetch(`/api/brands/${brandId}/profiles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setSaveStatus("error"); return; }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((cur) => cur === "saved" ? "idle" : cur), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const profileInputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", height: "48px", padding: "0 var(--space-4)",
    fontSize: "var(--font-size-body)", fontFamily: "var(--font-family)", color: "var(--color-text)",
    backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)", outline: "none",
  };

  return (
    <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="public-profiles-heading">
      <h2 id="public-profiles-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}>
        Public profiles
      </h2>
      <p style={{ margin: "0 0 var(--space-4) 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
        Paste your brand&rsquo;s exact profile URLs. The audit uses these to confirm your presence on each platform directly — more accurate than name searches.
      </p>

      {loadState === "loading" && (
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>Loading…</p>
      )}

      {loadState === "error" && (
        <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--font-size-body-sm)" }}>
          Could not load profile URLs. Please refresh the page.
        </p>
      )}

      {loadState === "ready" && (
        <form
          onSubmit={(e) => void handleSave(e)}
          aria-label="Public profile URLs"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            boxShadow: "var(--shadow-card)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {BRAND_PROFILE_FIELDS.map((f) => {
            const inputId = `profiles-${f.stateKey}-${brandId}`;
            return (
              <div key={f.stateKey}>
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
                  value={urls[f.stateKey]}
                  onChange={(e) => setUrls((prev) => ({ ...prev, [f.stateKey]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={profileInputStyle}
                  autoComplete="url"
                />
              </div>
            );
          })}

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap", paddingTop: "var(--space-2)" }}>
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving}
              style={{
                minHeight: "var(--min-button-height)",
                padding: "0 var(--space-6)",
                backgroundColor: saving ? "var(--color-muted)" : "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body)",
                fontWeight: 600,
                fontFamily: "var(--font-family)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save profiles"}
            </button>

            <div aria-live="polite" aria-atomic="true" style={{ minHeight: "1.4em" }}>
              {saveStatus === "saved" && (
                <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-success)", fontWeight: 700 }}>
                  Saved.
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-error)", fontWeight: 700 }}>
                  Could not save. Please try again.
                </span>
              )}
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Done-for-you — OrganicPosts engagement handoff (the paid consultancy arm)
// Placeholder prices — the founder sets the real numbers (kept in sync with
// the /organicposts page). The card sells the off-platform execution the app
// only diagnoses (publishing, schema, Reddit/LinkedIn/entity), not the drafts.
// ---------------------------------------------------------------------------

const DFY_SKUS: { sku: "geo_sprint" | "managed_geo"; name: string; price: string; priceNote: string; desc: string }[] = [
  {
    sku: "geo_sprint",
    name: "GEO Sprint",
    price: "$2,400",
    priceNote: "one-time · 30 days",
    desc: "We execute your accepted plan: publish your drafts, implement schema on your site, seed your Reddit / LinkedIn / G2 presence, create your Wikidata entity, then re-audit.",
  },
  {
    sku: "managed_geo",
    name: "Managed GEO",
    price: "$1,900",
    priceNote: "per month",
    desc: "We run the whole flywheel for you every week — content, publishing, off-site authority, monitoring, and a monthly visibility report.",
  },
];

interface EngagementRow { brand_id: string; sku: string; status: string }

type DfyFormState = {
  companySize: string;
  volume: string;
  timeline: string;
  workEmail: string;
};

const FORM_DEFAULTS: DfyFormState = {
  companySize: "",
  volume: "",
  timeline: "",
  workEmail: "",
};

const selectInputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  padding: "0 var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body-sm)",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--font-size-caption)",
  fontWeight: 700,
  color: "var(--color-text)",
  marginBottom: "var(--space-1)",
};

function buildNote(form: DfyFormState, brandName: string | undefined, overallScore: number | null): string {
  const parts: string[] = [];
  if (brandName) parts.push(`Brand: ${brandName}`);
  if (overallScore != null) parts.push(`Ozvor AI Visibility Score: ${overallScore}/100`);
  if (form.companySize) parts.push(`Company size: ${form.companySize}`);
  if (form.volume) parts.push(`Volume: ${form.volume}/mo`);
  if (form.timeline) parts.push(`Timeline: ${form.timeline}`);
  return parts.join(" | ");
}

function DoneForYou({
  brandId,
  brandName,
  overallScore,
}: {
  brandId: string;
  brandName: string | undefined;
  overallScore: number | null;
}) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  // Which SKU card is showing the intake form (null = none open)
  const [activeSku, setActiveSku] = useState<string | null>(null);
  const [form, setForm] = useState<DfyFormState>(FORM_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Track which SKU just confirmed so we can show the success message
  const [confirmedSku, setConfirmedSku] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/engagements");
        if (!res.ok) return;
        const data = (await res.json()) as { engagements?: EngagementRow[] };
        if (cancelled) return;
        setRequested(new Set((data.engagements ?? []).filter((e) => e.brand_id === brandId).map((e) => e.sku)));
      } catch {
        /* non-blocking — the card still lets them request */
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  function openIntake(sku: string) {
    setActiveSku(sku);
    setForm(FORM_DEFAULTS);
    setError("");
  }

  function cancelIntake() {
    setActiveSku(null);
    setError("");
  }

  async function submitIntake(e: React.FormEvent, sku: string) {
    e.preventDefault();
    if (busy) return;
    if (!form.companySize || !form.volume || !form.timeline) {
      setError("Please complete all required fields.");
      return;
    }
    setBusy(true);
    setError("");
    const note = buildNote(form, brandName, overallScore);
    const email = form.workEmail.trim() || undefined;
    try {
      const res = await apiFetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, sku, note, email }),
      });
      if (!res.ok) throw new Error();
      setRequested((s) => { const n = new Set(s); n.add(sku); return n; });
      setConfirmedSku(sku);
      setActiveSku(null);
    } catch {
      setError("Could not send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateForm(field: keyof DfyFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <section
      aria-labelledby="dfy-heading"
      style={{
        marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderLeft: "4px solid var(--color-accent-amber)",
        borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
      }}
    >
      <h2 id="dfy-heading" style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-4) 0" }}>
        DIY or done-for-you?
      </h2>

      {/* Two-path framing block */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "var(--space-3)", marginBottom: "var(--space-6)",
      }}>
        {/* Path A — DIY */}
        <div style={{
          padding: "var(--space-4)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-surface-muted)",
        }}>
          <div style={{ fontWeight: 800, fontSize: "var(--font-size-body-sm)", marginBottom: "var(--space-2)" }}>
            Do it yourself — Growth plan
          </div>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>
            You have the plan and the drafts. Use the Content Studio above to generate and approve content,
            then publish it yourself. Your Growth subscription includes unlimited re-audits so you can
            track the lift week by week.
          </p>
        </div>

        {/* Path B — DFY */}
        <div style={{
          padding: "var(--space-4)",
          border: "1px solid var(--color-accent-amber)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "rgba(224,152,47,0.06)",
        }}>
          <div style={{ fontWeight: 800, fontSize: "var(--font-size-body-sm)", marginBottom: "var(--space-2)" }}>
            Done-for-you — OrganicPosts
          </div>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>
            Our team publishes the fixes for you — content, schema, Reddit / LinkedIn / G2 authority,
            Wikidata entity — while you focus on your business. We re-audit monthly so you see the
            citation lift without lifting a finger.
          </p>
        </div>
      </div>

      {/* SKU cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
        {DFY_SKUS.map((o) => {
          const done = requested.has(o.sku);
          const isOpen = activeSku === o.sku;
          const justConfirmed = confirmedSku === o.sku;

          return (
            <div
              key={o.sku}
              style={{
                border: `1px solid ${isOpen ? "var(--color-accent-amber)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                backgroundColor: isOpen ? "rgba(224,152,47,0.04)" : "var(--color-surface)",
                transition: "border-color 0.15s ease",
              }}
            >
              <div style={{ fontWeight: 800 }}>{o.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "var(--font-size-h3)", fontWeight: 800 }}>{o.price}</span>
                <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{o.priceNote}</span>
              </div>
              <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.55, margin: 0, flex: 1 }}>
                {o.desc}
              </p>

              {/* Confirmation message */}
              {done && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: "var(--space-2)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "rgba(12,138,99,0.08)",
                    border: "1px solid var(--color-success)",
                  }}
                >
                  <p style={{ margin: "0 0 var(--space-1) 0", fontWeight: 700, fontSize: "var(--font-size-caption)", color: "var(--color-success)" }}>
                    Request sent — the founder will reach out within 1 business day.
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                    Next: you&rsquo;ll receive an email to confirm scope and schedule a short intro call.
                  </p>
                </div>
              )}

              {/* CTA — open intake or already done */}
              {!done && !isOpen && (
                <button
                  type="button"
                  onClick={() => openIntake(o.sku)}
                  style={{
                    marginTop: "var(--space-2)", minHeight: "44px", padding: "0 var(--space-4)",
                    backgroundColor: "var(--color-primary)", color: "#fff",
                    border: "none", borderRadius: "var(--radius-md)",
                    fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: "pointer",
                  }}
                >
                  Let us publish the fix
                </button>
              )}

              {/* Intake form (revealed when this SKU is selected) */}
              {isOpen && (
                <form
                  onSubmit={(e) => void submitIntake(e, o.sku)}
                  aria-label={`Discovery intake for ${o.name}`}
                  style={{
                    marginTop: "var(--space-2)",
                    display: "flex", flexDirection: "column", gap: "var(--space-3)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                    Two quick questions so we can scope the right plan for you.
                  </p>

                  {/* Company size */}
                  <div>
                    <label htmlFor={`company-size-${o.sku}`} style={labelStyle}>
                      Company size <span aria-hidden="true" style={{ color: "var(--color-error)" }}>*</span>
                    </label>
                    <select
                      id={`company-size-${o.sku}`}
                      required
                      value={form.companySize}
                      onChange={(e) => updateForm("companySize", e.target.value)}
                      style={selectInputStyle}
                    >
                      <option value="" disabled>Select&hellip;</option>
                      <option value="1-10">1–10 people</option>
                      <option value="11-50">11–50 people</option>
                      <option value="51-200">51–200 people</option>
                      <option value="200+">200+ people</option>
                    </select>
                  </div>

                  {/* Content volume */}
                  <div>
                    <label htmlFor={`volume-${o.sku}`} style={labelStyle}>
                      Content volume per month <span aria-hidden="true" style={{ color: "var(--color-error)" }}>*</span>
                    </label>
                    <select
                      id={`volume-${o.sku}`}
                      required
                      value={form.volume}
                      onChange={(e) => updateForm("volume", e.target.value)}
                      style={selectInputStyle}
                    >
                      <option value="" disabled>Select&hellip;</option>
                      <option value="2-4">2–4 posts</option>
                      <option value="5-8">5–8 posts</option>
                      <option value="8+">8+ posts</option>
                    </select>
                  </div>

                  {/* Timeline */}
                  <div>
                    <label htmlFor={`timeline-${o.sku}`} style={labelStyle}>
                      Timeline <span aria-hidden="true" style={{ color: "var(--color-error)" }}>*</span>
                    </label>
                    <select
                      id={`timeline-${o.sku}`}
                      required
                      value={form.timeline}
                      onChange={(e) => updateForm("timeline", e.target.value)}
                      style={selectInputStyle}
                    >
                      <option value="" disabled>Select&hellip;</option>
                      <option value="ASAP">ASAP — ready to start now</option>
                      <option value="this quarter">This quarter</option>
                      <option value="exploring">Just exploring for now</option>
                    </select>
                  </div>

                  {/* Work email (optional) */}
                  <div>
                    <label htmlFor={`email-${o.sku}`} style={labelStyle}>
                      Work email <span style={{ fontWeight: 400, color: "var(--color-muted)" }}>(optional — pre-fills the intro call invite)</span>
                    </label>
                    <input
                      id={`email-${o.sku}`}
                      type="email"
                      autoComplete="email"
                      value={form.workEmail}
                      onChange={(e) => updateForm("workEmail", e.target.value)}
                      placeholder="you@company.com"
                      style={{ ...selectInputStyle, height: "44px" }}
                    />
                  </div>

                  {error && (
                    <p role="alert" style={{ margin: 0, color: "var(--color-error)", fontSize: "var(--font-size-caption)", fontWeight: 600 }}>
                      {error}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button
                      type="submit"
                      disabled={busy}
                      style={{
                        flex: 1, minHeight: "44px", padding: "0 var(--space-4)",
                        backgroundColor: busy ? "var(--color-surface-muted)" : "var(--color-primary)",
                        color: busy ? "var(--color-muted)" : "#fff",
                        border: "none", borderRadius: "var(--radius-md)",
                        fontWeight: 700, fontSize: "var(--font-size-body-sm)",
                        cursor: busy ? "default" : "pointer",
                      }}
                    >
                      {busy ? "Sending…" : "Send request"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelIntake}
                      style={{
                        minHeight: "44px", padding: "0 var(--space-3)",
                        backgroundColor: "transparent", color: "var(--color-muted)",
                        border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                        fontWeight: 600, fontSize: "var(--font-size-body-sm)", cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {(justConfirmed || !done) && (
                    <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                      No payment now. We confirm scope on a short intro call first.
                    </p>
                  )}
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "var(--space-4) 0 0 0", lineHeight: 1.6 }}>
        Pricing is indicative — we confirm scope on a short intro call. <a href="/organicposts" style={{ color: "var(--color-primary)", fontWeight: 600 }}>See full service details</a>.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Content Studio (C4) — draft blog/LinkedIn/FAQ, approve/discard
// ---------------------------------------------------------------------------

interface ContentItem {
  id: string; content_type: string; title: string | null; body: string;
  schema_markup: string | null; ai_generated: boolean; status: string;
  rationale?: string | null; // why this piece closes the audit gap
}

// --- GEO trait heuristics (client-side, no imports needed) ---

function analyzeGeoTraits(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  // Statistics: numbers with %, $, €, or magnitude words; 4-digit years; count-nouns
  const stats = (body.match(/\b\d[\d,]*\.?\d*\s*%|\b\d[\d,]*\.?\d*\s*(billion|million|thousand|k\b)|\$[\d,.]+|€[\d,.]+|\b\d{4}\b|\b\d+\s*(percent|users|customers|companies|brands|studies|reports)/gi) ?? []).length;
  // Sourced claims: attribution phrases and citation patterns
  const sourced = (body.match(/according to|research from|a \d{4} study|study found|survey found|found that|as reported|cited by/gi) ?? []).length;
  // Answer-shaped: question mark present
  const answerShaped = /\?/.test(body);
  // Quotations: curly or straight quotes containing ≥10 chars
  const quotations =
    (body.match(/[“”][^“”]{10,}[“”]/g) ?? []).length > 0 ||
    (body.match(/"[^"]{10,}"/g) ?? []).length > 0;
  // Depth tier by word count
  const depthTier: "strong" | "ok" | "weak" = words >= 600 ? "strong" : words >= 300 ? "ok" : "weak";
  return { stats, sourced, answerShaped, quotations, words, depthTier };
}

function readingGrade(body: string): number {
  // Flesch-Kincaid Grade Level approximation (client-side, no library)
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
  const wordList = body.trim().split(/\s+/).filter(Boolean);
  const words = wordList.length || 1;
  const syllables = wordList.reduce((acc, word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    const count = w.replace(/[^aeiouy]/g, "").length || 1;
    return acc + Math.max(1, count);
  }, 0);
  return Math.round(0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59);
}

function downloadJsonLd(markup: string, title: string) {
  const blob = new Blob([markup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.slice(0, 40).replace(/\s+/g, "-")}-schema.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const REGEN_BUTTONS: { label: string; instructions: string }[] = [
  { label: "Shorter", instructions: "Make it significantly shorter, under 300 words." },
  { label: "Add data", instructions: "Add at least 2 specific statistics or data points with sources." },
  { label: "FAQ-shaped", instructions: "Rewrite this as a question-and-answer FAQ format." },
  { label: "Remove jargon", instructions: "Rewrite using plain, accessible language. Avoid technical jargon." },
  { label: "Add statistics", instructions: "Strengthen with at least 3 specific statistics. Use [PLACEHOLDER: source] if unknown." },
];

function miniBtn(primary: boolean): React.CSSProperties {
  return {
    minHeight: "32px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
    borderRadius: "var(--radius-sm)", cursor: "pointer",
    border: primary ? "none" : "1px solid var(--color-border)",
    backgroundColor: primary ? "var(--color-success)" : "transparent",
    color: primary ? "#fff" : "var(--color-muted)",
  };
}

function ContentStudio({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [type, setType] = useState<"blog" | "linkedin" | "faq">("blog");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [busy, setBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Inline edit state
  const [editBody, setEditBody] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Regen quick-button state: "itemId-buttonIndex"
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  // Copy feedback: "copy-{id}" | "copymd-{id}" | "copyjsonld-{id}"
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/brands/${brandId}/content`);
      if (res.ok) setItems((await res.json()).content ?? []);
    } catch { /* ignore */ }
  }, [brandId]);
  useEffect(() => { void load(); }, [load]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: type, topic: topic.trim(), tone, length }),
      });
      if (res.ok) {
        setGenerateError(null);
        setTopic("");
        await load();
      } else if (res.status === 402) {
        const data = await res.json() as { body?: string };
        setGenerateError(data.body ?? "An AI key is required to generate drafts.");
      } else {
        setGenerateError("Draft generation failed. Please try again.");
      }
    } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await apiFetch(`/api/content/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch { void load(); }
  }

  async function saveBody(item: ContentItem) {
    const newBody = editBody[item.id];
    if (newBody == null || newBody === item.body) return;
    setSavingId(item.id);
    try {
      const res = await apiFetch(`/api/content/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newBody }),
      });
      if (res.ok) {
        setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, body: newBody } : x)));
        setEditBody((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        setSavedId(item.id);
        setTimeout(() => setSavedId((cur) => (cur === item.id ? null : cur)), 2000);
      }
    } finally {
      setSavingId(null);
    }
  }

  async function regen(item: ContentItem, btnIndex: number) {
    const key = `${item.id}-${btnIndex}`;
    if (regenBusy) return;
    setRegenBusy(key);
    try {
      await apiFetch(`/api/brands/${brandId}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: item.content_type,
          topic: item.title ?? item.content_type,
          instructions: REGEN_BUTTONS[btnIndex].instructions,
          tone,
          length,
        }),
      });
      await load();
    } finally {
      setRegenBusy(null);
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch { /* clipboard unavailable */ }
  }

  const selectStyle: React.CSSProperties = {
    height: "40px", padding: "0 var(--space-3)",
    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
    backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)",
    fontSize: "var(--font-size-body-sm)",
  };

  return (
    <section style={{
      marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
    }}>
      <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>Content Studio</h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        Draft citation-worthy content for the gaps in your plan. <strong>AI-generated drafts</strong> — you review,
        edit, and approve. Nothing publishes automatically.
      </p>

      {/* Generate form — type, tone, length, topic */}
      <form onSubmit={generate} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <select
          aria-label="Content type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          style={selectStyle}
        >
          <option value="blog">Blog post</option>
          <option value="linkedin">LinkedIn post</option>
          <option value="faq">FAQ entry</option>
        </select>

        {/* Tone selector */}
        <select
          aria-label="Tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          style={selectStyle}
        >
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="technical">Technical</option>
          <option value="playful">Playful</option>
        </select>

        {/* Length selector */}
        <select
          aria-label="Length"
          value={length}
          onChange={(e) => setLength(e.target.value as typeof length)}
          style={selectStyle}
        >
          <option value="short">Short (~300w)</option>
          <option value="medium">Medium (~600w)</option>
          <option value="long">Long (~1000w)</option>
        </select>

        <input
          aria-label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (e.g. from an accepted plan action)"
          style={{ flex: "1 1 240px", minWidth: 0, height: "40px", padding: "0 var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)", fontSize: "var(--font-size-body-sm)" }}
        />
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          style={{ height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: busy || !topic.trim() ? "not-allowed" : "pointer", opacity: busy || !topic.trim() ? 0.6 : 1 }}
        >
          {busy ? "Drafting…" : "Generate draft"}
        </button>
      </form>

      {generateError && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            margin: "var(--space-2) 0",
            color: "var(--color-muted)",
            fontSize: "var(--font-size-body-sm)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ whiteSpace: "pre-line" }}>{generateError}</span>
          {" "}
          <a
            href="/account/integrations"
            style={{ color: "var(--color-primary)", textDecoration: "underline" }}
          >
            Add your AI key →
          </a>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>No drafts yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {items.map((it) => {
            const geo = analyzeGeoTraits(it.body);
            const grade = readingGrade(it.body);
            const currentBody = editBody[it.id] ?? it.body;
            const isDirty = editBody[it.id] != null && editBody[it.id] !== it.body;

            function badgeStyle(level: "green" | "muted" | "weak"): React.CSSProperties {
              const base: React.CSSProperties = { fontSize: "var(--font-size-badge)", fontWeight: 700, padding: "1px 5px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap" };
              if (level === "green") return { ...base, backgroundColor: "var(--color-success-subtle)", color: "var(--color-success)" };
              if (level === "muted") return { ...base, backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)" };
              return { ...base, backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)", opacity: 0.6 };
            }

            return (
              <li key={it.id} style={{
                padding: "var(--space-4)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                backgroundColor: it.status === "approved" ? "var(--color-success-surface)" : "var(--color-surface)",
                opacity: it.status === "discarded" ? 0.5 : 1,
              }}>
                {/* Type + AI label row */}
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 800, textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-badge-ai-bg)", color: "var(--color-badge-ai-text)" }}>{it.content_type}</span>
                  {/* AC-C4-3: non-removable AI label */}
                  <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)" }}>✦ AI-generated</span>
                  {it.schema_markup && <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, color: "var(--color-success)" }}>schema.org ✓</span>}
                  {it.status === "approved" && <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, color: "var(--color-success)" }}>✓ APPROVED</span>}
                </div>

                {/* GEO trait coverage badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-1)" }} role="group" aria-label="GEO trait coverage">
                  <span style={badgeStyle(geo.stats >= 2 ? "green" : geo.stats === 1 ? "muted" : "weak")}>Stats: {geo.stats}</span>
                  <span style={badgeStyle(geo.sourced >= 2 ? "green" : geo.sourced === 1 ? "muted" : "weak")}>Sourced: {geo.sourced}</span>
                  <span style={badgeStyle(geo.answerShaped ? "green" : "weak")}>Q+A: {geo.answerShaped ? "yes" : "no"}</span>
                  <span style={badgeStyle(geo.quotations ? "green" : "weak")}>Quote: {geo.quotations ? "yes" : "no"}</span>
                  <span style={badgeStyle(geo.depthTier === "strong" ? "green" : geo.depthTier === "ok" ? "muted" : "weak")}>Depth: {geo.depthTier}</span>
                </div>
                <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0", lineHeight: 1.4 }}>
                  {geo.words} words · Grade {grade}
                </p>

                {it.rationale && (
                  <p style={{
                    fontSize: "var(--font-size-caption)", color: "var(--color-muted)",
                    fontStyle: "italic", lineHeight: 1.5, margin: "0 0 var(--space-2) 0",
                    borderLeft: "3px solid var(--color-border)",
                    paddingLeft: "var(--space-2)",
                  }}>
                    <strong style={{ fontStyle: "normal" }}>Why this piece:</strong> {it.rationale}
                  </p>
                )}

                {it.title && <div style={{ fontWeight: 700, marginBottom: "var(--space-1)" }}>{it.title}</div>}

                {/* Editable body textarea (replaces read-only pre) */}
                <textarea
                  aria-label="Draft body"
                  value={currentBody}
                  onChange={(e) => setEditBody((prev) => ({ ...prev, [it.id]: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box", minHeight: "120px", resize: "vertical",
                    fontFamily: "var(--font-family)", fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)", lineHeight: 1.5,
                    background: "var(--color-surface-muted)",
                    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                    padding: "var(--space-2) var(--space-3)",
                    marginBottom: "var(--space-2)",
                  }}
                />

                {/* Save button + confirmation (only visible when dirty) */}
                {isDirty && (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                    <button
                      type="button"
                      disabled={savingId === it.id}
                      onClick={() => void saveBody(it)}
                      style={{ ...miniBtn(true), fontSize: "var(--font-size-badge)" }}
                    >
                      {savingId === it.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
                <div aria-live="polite" style={{ minHeight: "1.4em", marginBottom: "var(--space-2)" }}>
                  {savedId === it.id && (
                    <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-success)", fontWeight: 700 }}>Saved</span>
                  )}
                </div>

                {/* Approve / Discard actions */}
                <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                  <button type="button" onClick={() => void setStatus(it.id, "approved")} style={miniBtn(true)}>Approve</button>
                  <button type="button" onClick={() => void setStatus(it.id, "discarded")} style={miniBtn(false)}>Discard</button>
                </div>

                {/* Copy + export buttons */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                  <button
                    type="button"
                    aria-label="Copy draft body to clipboard"
                    onClick={() => void copyText(`copy-${it.id}`, it.body)}
                    style={{ ...miniBtn(false), fontSize: "var(--font-size-badge)" }}
                  >
                    {copiedKey === `copy-${it.id}` ? "Copied!" : "Copy body"}
                  </button>
                  <button
                    type="button"
                    aria-label="Copy draft as Markdown to clipboard"
                    onClick={() => void copyText(`copymd-${it.id}`, `# ${it.title ?? ""}\n\n${it.body}`)}
                    style={{ ...miniBtn(false), fontSize: "var(--font-size-badge)" }}
                  >
                    {copiedKey === `copymd-${it.id}` ? "Copied!" : "Copy as Markdown"}
                  </button>
                </div>

                {/* Schema.org JSON-LD — only when schema_markup is present */}
                {it.schema_markup && (
                  <details style={{ marginBottom: "var(--space-3)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: "var(--space-2)" }}>schema.org JSON-LD</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-family)", fontSize: "var(--font-size-caption)", margin: "0 0 var(--space-2) 0", background: "var(--color-surface-muted)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", overflow: "auto", maxHeight: "200px" }}>
                      <code>{(() => { try { return JSON.stringify(JSON.parse(it.schema_markup!), null, 2); } catch { return it.schema_markup!; } })()}</code>
                    </pre>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        aria-label="Copy JSON-LD to clipboard"
                        onClick={() => void copyText(`copyjsonld-${it.id}`, it.schema_markup!)}
                        style={{ ...miniBtn(false), fontSize: "var(--font-size-badge)" }}
                      >
                        {copiedKey === `copyjsonld-${it.id}` ? "Copied!" : "Copy JSON-LD"}
                      </button>
                      <button
                        type="button"
                        aria-label="Download schema as JSON file"
                        onClick={() => downloadJsonLd(it.schema_markup!, it.title ?? it.content_type)}
                        style={{ ...miniBtn(false), fontSize: "var(--font-size-badge)" }}
                      >
                        Download .json
                      </button>
                    </div>
                  </details>
                )}

                {/* Regenerate quick buttons */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-3)" }} role="group" aria-label="Quick regenerate options">
                  {REGEN_BUTTONS.map((btn, idx) => {
                    const key = `${it.id}-${idx}`;
                    const isActive = regenBusy === key;
                    return (
                      <button
                        key={btn.label}
                        type="button"
                        disabled={!!regenBusy}
                        aria-label={`Regenerate: ${btn.label}`}
                        onClick={() => void regen(it, idx)}
                        style={{
                          fontSize: "var(--font-size-badge)", fontWeight: 700, padding: "6px 8px",
                          borderRadius: "var(--radius-sm)", cursor: regenBusy ? "not-allowed" : "pointer",
                          border: "1px solid var(--color-border)", background: "var(--color-surface-muted)",
                          color: isActive ? "var(--color-primary)" : "var(--color-muted)",
                          opacity: regenBusy && !isActive ? 0.5 : 1,
                          minHeight: "32px",
                        }}
                      >
                        {isActive ? "Regenerating…" : btn.label}
                      </button>
                    );
                  })}
                </div>

                {/* "Why this gets cited" helper */}
                <details style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Why does this get cited by AI?</summary>
                  <div style={{ lineHeight: 1.6, marginTop: "var(--space-2)", paddingLeft: "var(--space-2)" }}>
                    AI search engines (ChatGPT, Perplexity, Claude, Gemini) cite content that is:<br />
                    &bull; <strong>Specific</strong> &mdash; includes real statistics and named sources<br />
                    &bull; <strong>Structured</strong> &mdash; answers questions directly (&ldquo;What is X? Answer: &hellip;&rdquo;)<br />
                    &bull; <strong>Quotable</strong> &mdash; contains short, memorable phrases<br />
                    &bull; <strong>Authoritative</strong> &mdash; attributed to a credible voice<br /><br />
                    Strengthen the weak badges above to improve citation odds.
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Action Cards (C3) — generate + accept/reject/done recommendations + calendar
// ---------------------------------------------------------------------------

interface PlanTask {
  id: string;
  vector: "brand" | "performance" | "ai";
  gap: string;
  action: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  priority: number;
  status: string; // 'proposed' | 'accepted' | 'rejected' | 'done'
  evidence?: string | null;
  metric?: string | null;
  owner?: string | null; // 'you' | 'organicposts' | 'platform'
}
interface CalItem { week: number; topic: string; channel: string; vector: string }

function GeoContentPlan({ brandId, auditId }: { brandId: string; auditId: string }) {
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [calendar, setCalendar] = useState<CalItem[]>([]);
  const [hasPlan, setHasPlan] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/brands/${brandId}/plan`);
      if (res.ok) {
        const d = await res.json();
        setHasPlan(!!d.plan);
        setTasks(d.tasks ?? []);
        setCalendar(d.plan?.calendar ?? []);
      }
    } catch { /* ignore */ }
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    if (busy || !auditId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/audits/${auditId}/plan`, { method: "POST" });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  async function setStatus(taskId: string, status: string) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await apiFetch(`/api/plan-tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch { void load(); }
  }

  const vColor = (v: string) =>
    VECTOR_COLORS[v as keyof typeof VECTOR_COLORS] ?? VECTOR_COLORS.brand;

  const metaBadge = (label: string, kind: "effort" | "impact") => (
    <span style={{
      fontSize: "var(--font-size-badge)", fontWeight: 700, textTransform: "uppercase",
      padding: "2px 6px", borderRadius: "var(--radius-sm)",
      backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)",
    }}>
      {kind}: {label}
    </span>
  );

  const ownerBadge = (owner: string | null | undefined) => {
    if (!owner) return null;
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      you: { bg: "rgba(120,120,140,0.15)", color: "var(--color-muted)", label: "You act" },
      organicposts: { bg: "rgba(15,180,136,0.12)", color: "var(--color-success)", label: "OrganicPosts" },
      platform: { bg: "rgba(59,130,246,0.12)", color: "var(--color-accent-cyan, #60a5fa)", label: "Platform" },
    };
    const s = styles[owner] ?? styles.you;
    return (
      <span style={{
        fontSize: "var(--font-size-badge)", fontWeight: 700, textTransform: "uppercase",
        padding: "2px 6px", borderRadius: "var(--radius-sm)",
        backgroundColor: s.bg, color: s.color,
      }}>
        {s.label}
      </span>
    );
  };

  const doneTasks = tasks.filter((t) => t.status === "done").length;

  return (
    <section style={{
      marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: 0 }}>Action Cards</h2>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !auditId}
          style={{
            height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff",
            border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)",
            cursor: busy || !auditId ? "not-allowed" : "pointer", opacity: busy || !auditId ? 0.6 : 1,
          }}
        >
          {busy ? "Generating…" : hasPlan ? "Regenerate plan" : "Generate plan"}
        </button>
      </div>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        Evidence-backed actions from your audit. Each card shows the specific finding, what to fix, and how to know it worked.{" "}
        <strong>Accept what you&rsquo;ll tackle</strong> — OrganicPosts can execute the rest.
      </p>

      {tasks.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          {auditId ? "No plan yet — click Generate plan." : "Run an audit first, then generate a plan."}
        </p>
      ) : (
        <>
          {/* Progress indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-3)",
            marginBottom: "var(--space-4)", padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)",
          }}>
            <div style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: "var(--color-border)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "3px",
                backgroundColor: "var(--color-success)",
                width: tasks.length > 0 ? `${Math.round((doneTasks / tasks.length) * 100)}%` : "0%",
                transition: "width 0.3s ease",
              }} />
            </div>
            <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: 0, whiteSpace: "nowrap", fontWeight: 600 }}>
              {doneTasks} of {tasks.length} actions done
            </p>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {tasks.map((t) => (
              <li
                key={t.id}
                role="article"
                style={{
                  padding: "var(--space-4)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  borderLeft: `4px solid ${t.status === "done" ? "var(--color-success)" : vColor(t.vector)}`,
                  opacity: t.status === "rejected" ? 0.4 : t.status === "done" ? 0.7 : 1,
                  backgroundColor: t.status === "accepted" ? "var(--color-success-surface, rgba(39,201,138,0.07))"
                    : t.status === "done" ? "var(--color-success-surface, rgba(39,201,138,0.07))"
                    : "var(--color-surface)",
                  transition: "opacity 0.2s ease, background-color 0.2s ease",
                }}
              >
                {/* Header row: vector + impact + effort + owner badges */}
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "var(--font-size-badge)", fontWeight: 800, textTransform: "uppercase",
                    color: vColor(t.vector), padding: "2px 6px", borderRadius: "var(--radius-sm)",
                    border: `1px solid ${vColor(t.vector)}22`,
                    backgroundColor: `${vColor(t.vector)}11`,
                  }}>
                    {t.vector}
                  </span>
                  {metaBadge(t.impact, "impact")}
                  {metaBadge(t.effort, "effort")}
                  {ownerBadge(t.owner)}
                  {t.status === "accepted" && (
                    <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, color: "var(--color-success)", marginLeft: "auto" }}>
                      ACCEPTED
                    </span>
                  )}
                  {t.status === "done" && (
                    <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, color: "var(--color-success)", marginLeft: "auto" }}>
                      ✓ DONE
                    </span>
                  )}
                  {t.status === "rejected" && (
                    <span style={{ fontSize: "var(--font-size-badge)", fontWeight: 700, color: "var(--color-muted)", marginLeft: "auto" }}>
                      DISMISSED
                    </span>
                  )}
                </div>

                {/* Gap summary — what's wrong */}
                <p style={{
                  fontSize: "var(--font-size-body-sm)", color: "var(--color-text)",
                  margin: "0 0 var(--space-1) 0", lineHeight: 1.5,
                }}>
                  {t.gap}
                </p>

                {/* Evidence line */}
                {t.evidence && (
                  <p
                    aria-label="Audit finding"
                    style={{
                      fontSize: "var(--font-size-caption)", color: "var(--color-muted)",
                      fontStyle: "italic", margin: "0 0 var(--space-2) 0", lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ fontStyle: "normal", color: "var(--color-muted)" }}>Finding:</strong>{" "}
                    {t.evidence}
                  </p>
                )}

                {/* Action line */}
                <p style={{
                  fontSize: "var(--font-size-body-sm)", fontWeight: 700, color: "var(--color-text)",
                  margin: "0 0 var(--space-2) 0", lineHeight: 1.5,
                }}>
                  {t.action}
                </p>

                {/* Metric line */}
                {t.metric && (
                  <p style={{
                    fontSize: "var(--font-size-caption)", color: "var(--color-muted)",
                    margin: "0 0 var(--space-3) 0", lineHeight: 1.5,
                  }}>
                    <strong style={{ color: "var(--color-muted)" }}>Watch:</strong>{" "}
                    {t.metric}
                  </p>
                )}
                {!t.metric && <div style={{ marginBottom: "var(--space-3)" }} />}

                {/* Status controls */}
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  {t.status === "proposed" && (
                    <>
                      <button
                        type="button"
                        aria-label={`Accept action: ${t.action}`}
                        onClick={() => setStatus(t.id, "accepted")}
                        style={{
                          minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                          borderRadius: "var(--radius-sm)", cursor: "pointer", border: "none",
                          backgroundColor: "var(--color-success)", color: "#fff",
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss action: ${t.action}`}
                        onClick={() => setStatus(t.id, "rejected")}
                        style={{
                          minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                          borderRadius: "var(--radius-sm)", cursor: "pointer",
                          border: "1px solid var(--color-border)", backgroundColor: "transparent", color: "var(--color-muted)",
                        }}
                      >
                        Dismiss
                      </button>
                    </>
                  )}

                  {t.status === "accepted" && (
                    <>
                      <button
                        type="button"
                        aria-label={`Mark done: ${t.action}`}
                        onClick={() => setStatus(t.id, "done")}
                        style={{
                          minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                          borderRadius: "var(--radius-sm)", cursor: "pointer", border: "none",
                          backgroundColor: "var(--color-accent-amber, #e6a93f)", color: "#fff",
                        }}
                      >
                        Mark done
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss action: ${t.action}`}
                        onClick={() => setStatus(t.id, "rejected")}
                        style={{
                          minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                          borderRadius: "var(--radius-sm)", cursor: "pointer",
                          border: "1px solid var(--color-border)", backgroundColor: "transparent", color: "var(--color-muted)",
                        }}
                      >
                        Dismiss
                      </button>
                    </>
                  )}

                  {t.status === "done" && (
                    <button
                      type="button"
                      aria-label={`Reopen action: ${t.action}`}
                      onClick={() => setStatus(t.id, "proposed")}
                      style={{
                        minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                        borderRadius: "var(--radius-sm)", cursor: "pointer",
                        border: "1px solid var(--color-border)", backgroundColor: "transparent", color: "var(--color-muted)",
                      }}
                    >
                      Reopen
                    </button>
                  )}

                  {t.status === "rejected" && (
                    <button
                      type="button"
                      aria-label={`Reopen action: ${t.action}`}
                      onClick={() => setStatus(t.id, "proposed")}
                      style={{
                        minHeight: "44px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
                        borderRadius: "var(--radius-sm)", cursor: "pointer",
                        border: "1px solid var(--color-border)", backgroundColor: "transparent", color: "var(--color-muted)",
                      }}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {calendar.length > 0 && (
            <>
              <h3 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>4-week content calendar</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)" }}>
                {calendar.map((c) => (
                  <div key={c.week} style={{ padding: "var(--space-4)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)", borderTop: `3px solid ${vColor(c.vector)}` }}>
                    <div style={{ fontSize: "var(--font-size-badge)", fontWeight: 800, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "var(--space-1)" }}>Week {c.week} · {c.channel}</div>
                    <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{c.topic}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Competitor benchmark — manage competitors + show "who AI recommends instead"
// ---------------------------------------------------------------------------

function CompetitorBenchmark({
  brandId,
  benchmark,
}: {
  brandId: string;
  benchmark: Array<{ name: string; mentions: number; displacement: number }>;
}) {
  const [competitors, setCompetitors] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/brands/${brandId}/competitors`);
      if (res.ok) setCompetitors((await res.json()).competitors ?? []);
    } catch { /* ignore */ }
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/brands/${brandId}/competitors`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) { setName(""); await load(); }
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/brands/${brandId}/competitors/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  }

  const benchByName = new Map(benchmark.map((b) => [b.name.toLowerCase(), b]));

  return (
    <section style={{
      marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
    }}>
      <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
        Who AI recommends instead of you
      </h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        Add the competitors you care about. On the next audit we count how often each appears in the
        same AI answers — and how often they show up <strong>while you&rsquo;re absent</strong> (displacement).
      </p>

      {/* Benchmark results (from last audit) */}
      {benchmark.length > 0 ? (
        <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-5)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-body-sm)" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-muted)", textAlign: "left" }}>
                <th style={thStyle}>Competitor</th>
                <th style={thStyle}>AI mentions</th>
                <th style={thStyle}>While you were absent</th>
              </tr>
            </thead>
            <tbody>
              {benchmark.map((b) => (
                <tr key={b.name} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={tdStyle}><strong>{b.name}</strong></td>
                  <td style={tdStyle}>{b.mentions}</td>
                  <td style={{ ...tdStyle, color: b.displacement > 0 ? "var(--color-error)" : "var(--color-muted)", fontWeight: b.displacement > 0 ? 700 : 400 }}>
                    {b.displacement > 0 ? `⚠ ${b.displacement} prompts` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginBottom: "var(--space-4)" }}>
          No competitor data yet — add competitors below, then run an audit.
        </p>
      )}

      {/* Manage competitors */}
      <form onSubmit={add} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Competitor brand name"
          style={{ flex: "1 1 220px", minWidth: 0, height: "40px", padding: "0 var(--space-3)", fontSize: "var(--font-size-body-sm)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }}
        />
        <button type="submit" disabled={busy || !name.trim()} style={{ height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: busy || !name.trim() ? "not-allowed" : "pointer", opacity: busy || !name.trim() ? 0.6 : 1 }}>
          Add competitor
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {competitors.map((cmp) => {
          const b = benchByName.get(cmp.name.toLowerCase());
          return (
            <span key={cmp.id} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", padding: "4px 6px 4px 10px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-muted)", fontSize: "var(--font-size-caption)" }}>
              {cmp.name}{b ? ` · ${b.mentions} mentions` : ""}
              <button onClick={() => remove(cmp.id)} aria-label={`Remove ${cmp.name}`} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-muted)", fontWeight: 700, fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}>×</button>
            </span>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vector panel — expandable, shows component math + measured/baseline tags
// ---------------------------------------------------------------------------

function VectorPanel({
  label, weight, hint, value, components, measured, baseline, explainer, children,
}: {
  label: string; weight: string; hint: string; value: number | null;
  components?: Record<string, number | boolean>;
  measured?: string[]; baseline?: string[]; explainer: string;
  children?: React.ReactNode;
}) {
  const pct = value == null ? 0 : value;
  const measuredSet = new Set(measured ?? []);
  return (
    <details style={{
      backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)", padding: "var(--space-4) var(--space-5)", marginBottom: "var(--space-4)",
    }}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--space-2)" }}>
          <div>
            <span style={{ fontWeight: 800 }}>{label}</span>{" "}
            <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>· {weight} of overall · {hint}</span>
          </div>
          <span style={{ fontWeight: 800, letterSpacing: "-0.02em", fontSize: "var(--font-size-h3)" }}>{value == null ? "—" : value}</span>
        </div>
        <div style={{ height: "8px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-muted)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: "var(--color-primary)", transition: "width 0.6s ease" }} />
        </div>
        <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-primary)", fontWeight: 600 }}>▾ Show breakdown</span>
      </summary>

      <div style={{ marginTop: "var(--space-4)" }}>
        <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, marginTop: 0 }}>{explainer}</p>

        {components && (
          <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {Object.entries(components).map(([k, v]) => {
              const isMeasured = measuredSet.has(k);
              const display = typeof v === "boolean" ? (v ? "yes" : "no") : `${Math.round((v as number) * 100)}%`;
              return (
                <li key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--font-size-body-sm)" }}>
                  <span style={{ color: "var(--color-text)" }}>{camel(k)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ fontWeight: 700 }}>{display}</span>
                    <span style={{
                      fontSize: "var(--font-size-badge)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                      padding: "2px 6px", borderRadius: "var(--radius-sm)",
                      backgroundColor: isMeasured ? "var(--color-badge-connected-bg)" : "var(--color-surface-muted)",
                      color: isMeasured ? "var(--color-badge-connected-text)" : "var(--color-muted)",
                      border: isMeasured ? "none" : "1px solid var(--color-border)",
                    }}>
                      {isMeasured ? "measured" : "baseline"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {children}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Site-crawl findings — shown under Brand & Performance
// ---------------------------------------------------------------------------

function CrawlFindings({ crawl }: { crawl: { reachable: boolean; domain: string | null; findings: string[] } }) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        {crawl.reachable
          ? `Live website crawl${crawl.domain ? ` — ${crawl.domain}` : ""}`
          : "Website crawl — not available"}
      </p>
      {!crawl.reachable && (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-note-warn)", margin: "0 0 var(--space-2) 0" }}>
          {crawl.domain
            ? "We couldn't reach your site, so these inputs use neutral baselines."
            : "Add your website domain to the brand to measure these from your real site."}
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {crawl.findings.map((f, i) => (
          <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content citation-worthiness — Princeton GEO traits (under Performance)
// ---------------------------------------------------------------------------

const TRAIT_LABELS: Record<string, string> = {
  statistics: "Statistics & data points",
  sourcedClaims: "Sourced claims (citations)",
  answerShaped: "Answer-shaped passages (FAQ/Q&A)",
  quotations: "Direct quotations",
  depth: "Depth (headings, lists, length)",
};

function ContentTraits({ content }: {
  content: { analyzed: boolean; pagesAnalyzed: number; score: number; traits: Record<string, number>; findings: string[] };
}) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Content citation-worthiness{content.analyzed ? ` — ${content.pagesAnalyzed} page${content.pagesAnalyzed === 1 ? "" : "s"} analyzed` : " — not analyzed"}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {["statistics", "sourcedClaims", "answerShaped", "quotations", "depth"].map((k) => {
          const v = content.traits[k] ?? 0;
          const pct = Math.round(v * 100);
          return (
            <div key={k}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-caption)", marginBottom: "2px" }}>
                <span>{TRAIT_LABELS[k] ?? k}</span>
                <span style={{ fontWeight: 700, color: v >= 0.5 ? "var(--color-success)" : "var(--color-note-warn)" }}>{pct}%</span>
              </div>
              <div style={{ height: "6px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-muted)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", backgroundColor: v >= 0.5 ? "var(--color-success)" : "var(--color-note-warn)" }} />
              </div>
            </div>
          );
        })}
      </div>
      {content.findings.length > 0 && (
        <ul style={{ margin: "var(--space-2) 0 0 0", paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {content.findings.map((f, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Off-site presence — sources AI cites most (Reddit/Wikipedia/G2/...)
// ---------------------------------------------------------------------------

function OffsitePresence({ offsite }: {
  offsite: { live: boolean; score: number; sources: Array<{ id: string; label: string; present: boolean; count: number }>; findings: string[] };
}) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Off-site authority — sources AI cites most {offsite.live ? "(live)" : "(demo data)"}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {offsite.sources.map((s) => (
          <span key={s.id} style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
            padding: "4px 10px", borderRadius: "var(--radius-pill)", fontSize: "var(--font-size-caption)", fontWeight: 600,
            backgroundColor: s.present ? "rgba(15,180,136,0.12)" : "var(--color-surface-muted)",
            color: s.present ? "var(--color-success)" : "var(--color-muted)",
            border: s.present ? "none" : "1px solid var(--color-border)",
          }}>
            {s.present ? "●" : "○"} {s.label}{s.present && s.count ? ` · ${s.count}` : ""}
          </span>
        ))}
      </div>
      {offsite.findings.length > 0 && (
        <ul style={{ margin: "var(--space-2) 0 0 0", paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {offsite.findings.map((f, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sentiment — how the brand is portrayed in AI answers (AI vector)
// ---------------------------------------------------------------------------

function SentimentBreakdown({ sentiment }: {
  sentiment: { analyzed: boolean; score: number; positive: number; neutral: number; negative: number; mentionsClassified: number; findings: string[] };
}) {
  const total = sentiment.mentionsClassified || 1;
  const seg = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Brand perception{sentiment.analyzed ? ` — ${sentiment.mentionsClassified} answer${sentiment.mentionsClassified === 1 ? "" : "s"} classified · score ${Math.round(sentiment.score * 100)}/100` : " — not enough mentions (neutral baseline)"}
      </p>
      {sentiment.analyzed && (
        <div style={{ display: "flex", height: "10px", borderRadius: "var(--radius-pill)", overflow: "hidden", marginBottom: "var(--space-2)" }}>
          {sentiment.positive > 0 && <div style={{ width: seg(sentiment.positive), backgroundColor: "var(--color-success)" }} title={`Positive: ${sentiment.positive}`} />}
          {sentiment.neutral > 0 && <div style={{ width: seg(sentiment.neutral), backgroundColor: "var(--color-border)" }} title={`Neutral: ${sentiment.neutral}`} />}
          {sentiment.negative > 0 && <div style={{ width: seg(sentiment.negative), backgroundColor: "var(--color-error)" }} title={`Negative: ${sentiment.negative}`} />}
        </div>
      )}
      {sentiment.analyzed && (
        <div style={{ display: "flex", gap: "var(--space-3)", fontSize: "var(--font-size-caption)", marginBottom: "var(--space-2)" }}>
          <span style={{ color: "var(--color-success)", fontWeight: 600 }}>● {sentiment.positive} positive</span>
          <span style={{ color: "var(--color-muted)", fontWeight: 600 }}>● {sentiment.neutral} neutral</span>
          <span style={{ color: "var(--color-error)", fontWeight: 600 }}>● {sentiment.negative} negative</span>
        </div>
      )}
      {sentiment.findings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {sentiment.findings.map((f, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reddit deep-dive (C5) — the #1 AI-cited source
// ---------------------------------------------------------------------------

function RedditPanel({ reddit }: {
  reddit: { live: boolean; score: number; threadCount: number; subreddits: string[]; sentiment: { positive: number; neutral: number; negative: number; score: number }; findings: string[] };
}) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Reddit — the #1 source AI cites {reddit.live ? "(live)" : "(demo data)"}
      </p>
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--font-size-body-sm)" }}><strong>{reddit.threadCount}</strong> thread{reddit.threadCount === 1 ? "" : "s"}</span>
        <span style={{ fontSize: "var(--font-size-body-sm)" }}><strong>{reddit.subreddits.length}</strong> subreddit{reddit.subreddits.length === 1 ? "" : "s"}</span>
        <span style={{ fontSize: "var(--font-size-body-sm)" }}>Reddit score <strong>{Math.round(reddit.score * 100)}/100</strong></span>
      </div>
      {reddit.subreddits.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
          {reddit.subreddits.map((s) => (
            <span key={s} style={{ fontSize: "var(--font-size-caption)", fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }}>{s}</span>
          ))}
        </div>
      )}
      {reddit.findings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {reddit.findings.map((f, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity graph (C7) — cross-source consistency (Wikidata/Wikipedia)
// ---------------------------------------------------------------------------

const ENTITY_PROP_LABELS: Record<string, string> = {
  officialWebsite: "Official website", industry: "Industry", inception: "Founded date",
  description: "Description", crunchbase: "Crunchbase ID", linkedin: "LinkedIn ID",
};

function EntityGraphPanel({ entity }: {
  entity: { live: boolean; found: boolean; wikidataId: string | null; hasWikipedia: boolean; properties: Record<string, boolean>; domainConsistent: boolean | null; completeness: number; findings: string[] };
}) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Knowledge-graph entity {entity.live ? "(live)" : "(demo data)"}
      </p>
      {!entity.found ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-note-warn)", lineHeight: 1.5, margin: "0 0 var(--space-2) 0" }}>
          No knowledge-graph entity resolved — AI engines may not recognize you as a distinct entity. High-value gap.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)", fontSize: "var(--font-size-body-sm)" }}>
            <span>Wikidata <strong>{entity.wikidataId}</strong></span>
            <span style={{ color: entity.hasWikipedia ? "var(--color-success)" : "var(--color-muted)" }}>{entity.hasWikipedia ? "Wikipedia ✓" : "no Wikipedia article"}</span>
            <span>completeness <strong>{Math.round(entity.completeness * 100)}/100</strong></span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            {Object.entries(entity.properties).map(([k, present]) => (
              <span key={k} style={{
                fontSize: "var(--font-size-caption)", fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)",
                backgroundColor: present ? "rgba(15,180,136,0.12)" : "var(--color-surface-muted)",
                color: present ? "var(--color-success)" : "var(--color-muted)",
                border: present ? "none" : "1px solid var(--color-border)",
              }}>{present ? "●" : "○"} {ENTITY_PROP_LABELS[k] ?? k}</span>
            ))}
          </div>
        </>
      )}
      {entity.findings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {entity.findings.map((f, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text)", lineHeight: 1.5 }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI evidence table — per prompt × engine
// ---------------------------------------------------------------------------

// confidenceLabel — imported from ../../../lib/confidence (see that file for the rule definition)

function EvidenceTable({
  evidence,
  probeRepeat,
}: {
  evidence: Evidence[];
  probeRepeat: number | null;
}) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p
        style={{
          fontSize: "var(--font-size-caption)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--color-muted)",
          margin: "0 0 var(--space-2) 0",
        }}
      >
        Evidence — every prompt we asked, per engine
      </p>

      {/* Noise-floor note — only shown when multi-run probing was performed */}
      {probeRepeat != null && probeRepeat > 1 && (
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            margin: "0 0 var(--space-3) 0",
            lineHeight: 1.6,
          }}
        >
          AI answers are non-deterministic — we probe each question multiple
          times and report the citation rate, not a single result.{" "}
          <a
            href="/how-we-measure"
            style={{
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontWeight: 600,
            }}
          >
            How we measure →
          </a>
        </p>
      )}

      <div
        style={{
          overflowX: "auto",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--font-size-caption)",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "var(--color-surface-muted)",
                textAlign: "left",
              }}
            >
              <th style={thStyle}>Buyer prompt</th>
              <th style={thStyle}>Engine</th>
              <th style={thStyle}>Cited?</th>
              <th style={thStyle}>Confidence</th>
              <th style={thStyle}>Position</th>
              <th style={thStyle}>Sources</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e, i) => {
              const conf = confidenceLabel(e.mentionRate, e.runsCount);
              // Chip color per confidence level — token-only, no magic colors
              const chipColor =
                conf.level === "high"
                  ? "var(--color-success)"
                  : conf.level === "low"
                  ? "var(--color-error)"
                  : "var(--color-muted)";
              const chipBg =
                conf.level === "high"
                  ? "var(--color-success-subtle)"
                  : conf.level === "low"
                  ? "var(--color-error-subtle, rgba(239,68,68,0.08))"
                  : "var(--color-surface-muted)";

              // Cap raw text at 2000 chars defensively (server already caps but be safe)
              const snippet =
                e.rawTextSnippet && e.rawTextSnippet.length > 0
                  ? e.rawTextSnippet.slice(0, 2000)
                  : null;

              return (
                <tr
                  key={i}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td style={tdStyle}>{e.prompt ?? "—"}</td>
                  <td style={tdStyle}>
                    {ENGINE_LABEL[e.engine] ?? e.engine}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: e.cited
                          ? "var(--color-success)"
                          : "var(--color-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {e.cited ? "✓ cited" : "— no"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {/* Confidence chip */}
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "var(--font-size-badge)",
                        fontWeight: 700,
                        padding: "2px var(--space-2)",
                        borderRadius: "var(--radius-pill)",
                        color: chipColor,
                        backgroundColor: chipBg,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conf.text}
                    </span>

                    {/* Expandable raw AI answer — only when snippet exists */}
                    {snippet !== null && (
                      <details
                        style={{
                          marginTop: "var(--space-1)",
                          fontSize: "var(--font-size-caption)",
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            color: "var(--color-primary)",
                            fontWeight: 600,
                            userSelect: "none",
                            listStyle: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--space-1)",
                          }}
                          aria-label="See actual AI answer"
                        >
                          ▶ See actual AI answer
                        </summary>
                        <pre
                          style={{
                            marginTop: "var(--space-2)",
                            padding: "var(--space-2) var(--space-3)",
                            backgroundColor: "var(--color-surface-muted)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-md)",
                            whiteSpace: "pre-wrap",
                            fontFamily: "var(--font-family)",
                            fontSize: "var(--font-size-caption)",
                            color: "var(--color-muted)",
                            lineHeight: 1.5,
                            maxHeight: "200px",
                            overflowY: "auto",
                            wordBreak: "break-word",
                          }}
                        >
                          {snippet}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {e.position != null ? `#${e.position}` : "—"}
                  </td>
                  <td style={tdStyle}>
                    {e.sources.length > 0
                      ? e.sources.map((s, j) => (
                          <div
                            key={j}
                            style={{
                              color: "var(--color-primary)",
                              wordBreak: "break-all",
                            }}
                          >
                            {s}
                          </div>
                        ))
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", fontWeight: 700, color: "var(--color-muted)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", color: "var(--color-text)", verticalAlign: "top" };

function camel(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// AI Models panel — configure which engines to probe + tracking frequency
// ---------------------------------------------------------------------------

interface AiModelsProps {
  brandId: string;
  settings: { tracked_models: string[] | null; tracking_frequency: string | null } | null;
  planTier: string | null;
  onSettingsSaved: (updated: { tracked_models: string[]; tracking_frequency: string }) => void;
}

const AI_ENGINES: { id: string; label: string }[] = [
  { id: "openai", label: "ChatGPT" },
  { id: "anthropic", label: "Claude" },
  { id: "perplexity", label: "Perplexity" },
  { id: "gemini", label: "Gemini" },
  { id: "serp", label: "Google AI Overview" },
];

const AI_ENGINES_COMING_SOON: string[] = ["DeepSeek R1", "Grok", "Llama"];

const DEFAULT_MODELS = ["openai", "anthropic", "perplexity", "gemini", "serp"];

function AiModelsPanel({ brandId, settings, planTier, onSettingsSaved }: AiModelsProps) {
  const [localModels, setLocalModels] = useState<string[]>(
    settings?.tracked_models ?? DEFAULT_MODELS
  );
  const [localFreq, setLocalFreq] = useState<"weekly" | "daily">(
    (settings?.tracking_frequency === "daily" ? "daily" : "weekly")
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [modelError, setModelError] = useState("");

  // Sync local state when settings prop is loaded/updated
  useEffect(() => {
    if (!settings) return;
    setLocalModels(settings.tracked_models ?? DEFAULT_MODELS);
    setLocalFreq(settings.tracking_frequency === "daily" ? "daily" : "weekly");
  }, [settings]);

  const isLoading = settings === null;

  // Detect whether anything has changed from last-saved settings
  const hasChanges =
    settings !== null &&
    (JSON.stringify(localModels.slice().sort()) !==
      JSON.stringify((settings.tracked_models ?? DEFAULT_MODELS).slice().sort()) ||
      localFreq !== (settings.tracking_frequency === "daily" ? "daily" : "weekly"));

  function toggleModel(id: string) {
    setModelError("");
    setLocalModels((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) {
          setModelError("At least one AI model must be selected.");
          return prev;
        }
        return prev.filter((m) => m !== id);
      }
      return [...prev, id];
    });
  }

  async function save() {
    if (saving || !hasChanges) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await apiFetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracked_models: localModels,
          tracking_frequency: localFreq,
        }),
      });
      if (res.status === 403) {
        const data = (await res.json()) as { error?: { message?: string } };
        setSaveError(
          data.error?.message ??
            "Daily tracking is an Agency-plan feature. Upgrade to Agency to enable daily monitoring."
        );
        return;
      }
      if (!res.ok) throw new Error("Save failed");
      onSettingsSaved({ tracked_models: localModels, tracking_frequency: localFreq });
      setSavedOk(true);
      // Reset savedOk after 2s
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      setSaveError("Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const loadingOpacity: React.CSSProperties = isLoading ? { opacity: 0.4 } : {};

  const comingSoonBadgeStyle: React.CSSProperties = {
    fontSize: "var(--font-size-badge)",
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-surface-muted)",
    color: "var(--color-muted)",
    marginLeft: "var(--space-2)",
  };

  return (
    <section
      aria-labelledby="ai-models-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        boxShadow: "var(--shadow-card)",
        marginBottom: "var(--space-4)",
      }}
    >
      <h2
        id="ai-models-heading"
        style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}
      >
        AI Models
      </h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        Choose which AI engines to probe in every audit — and how often. Changes take effect on the next audit run.
      </p>

      {/* Engine checkboxes */}
      <div
        role="group"
        aria-label="AI engines to probe"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginBottom: "var(--space-4)", ...loadingOpacity }}
      >
        {AI_ENGINES.map((engine) => (
          <label
            key={engine.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              minHeight: "var(--min-tap-target)",
              cursor: "pointer",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 600,
              color: "var(--color-text)",
              padding: "0 var(--space-1)",
            }}
          >
            <input
              type="checkbox"
              checked={localModels.includes(engine.id)}
              onChange={() => toggleModel(engine.id)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--color-primary)", flexShrink: 0 }}
            />
            {engine.label}
          </label>
        ))}

        {/* Coming soon rows */}
        {AI_ENGINES_COMING_SOON.map((name) => {
          const csId = `engine-cs-${name.toLowerCase().replace(/\s+/g, "-")}`;
          return (
            <label
              key={name}
              htmlFor={csId}
              aria-disabled="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                minHeight: "var(--min-tap-target)",
                opacity: 0.5,
                cursor: "not-allowed",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "0 var(--space-1)",
              }}
            >
              <input
                id={csId}
                type="checkbox"
                disabled
                style={{ width: "18px", height: "18px", cursor: "not-allowed", flexShrink: 0 }}
              />
              {name}
              <span style={comingSoonBadgeStyle}>Coming soon</span>
            </label>
          );
        })}
      </div>

      {modelError && (
        <p role="alert" style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-error)", fontWeight: 600 }}>
          {modelError}
        </p>
      )}

      {/* Tracking frequency */}
      <fieldset
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-4)",
          ...loadingOpacity,
        }}
      >
        <legend style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 700, color: "var(--color-text)", padding: "0 var(--space-2)" }}>
          Tracking frequency
        </legend>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minHeight: "var(--min-tap-target)",
            cursor: "pointer",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          <input
            type="radio"
            name={`freq-${brandId}`}
            value="weekly"
            checked={localFreq === "weekly"}
            onChange={() => setLocalFreq("weekly")}
            style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--color-primary)", flexShrink: 0 }}
          />
          Weekly
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minHeight: "var(--min-tap-target)",
            opacity: planTier !== "agency" ? 0.5 : 1,
            cursor: planTier !== "agency" ? "not-allowed" : "pointer",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 600,
              color: "var(--color-text)",
              cursor: planTier !== "agency" ? "not-allowed" : "pointer",
              flex: 1,
            }}
          >
            <input
              type="radio"
              name={`freq-${brandId}`}
              value="daily"
              checked={localFreq === "daily"}
              onChange={() => setLocalFreq("daily")}
              disabled={planTier !== "agency"}
              style={{
                width: "18px",
                height: "18px",
                cursor: planTier !== "agency" ? "not-allowed" : "pointer",
                accentColor: "var(--color-primary)",
                flexShrink: 0,
              }}
            />
            Daily
          </label>
          {planTier !== "agency" && (
            <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontStyle: "italic" }}>
              (Agency plan only — upgrade to enable daily monitoring)
            </span>
          )}
        </div>
      </fieldset>

      {/* Save button + feedback */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !hasChanges}
          aria-busy={saving}
          style={{
            minHeight: "44px",
            padding: "0 var(--space-5)",
            backgroundColor: saving || !hasChanges ? "var(--color-surface-muted)" : "var(--color-primary)",
            color: saving || !hasChanges ? "var(--color-muted)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontWeight: 700,
            fontSize: "var(--font-size-body-sm)",
            cursor: saving || !hasChanges ? "not-allowed" : "pointer",
            fontFamily: "var(--font-family)",
            transition: "background-color 0.15s ease",
          }}
        >
          {saving ? "Saving…" : "Save AI settings"}
        </button>

        {savedOk && (
          <span
            role="status"
            aria-live="polite"
            style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-success)", fontWeight: 700 }}
          >
            Saved
          </span>
        )}
      </div>

      {saveError && (
        <p
          role="alert"
          style={{ margin: "var(--space-3) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-error)", fontWeight: 600, lineHeight: 1.5 }}
        >
          {saveError}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Top Cited Sources panel — searchable table of where AI finds answers
// ---------------------------------------------------------------------------

type TopSource = { domain: string; label: string; type?: string; usedPct?: number; avgCitations?: number; isYou?: boolean; count?: number };

function typeTag(type: string | undefined): React.ReactElement {
  if (!type) return <span style={{ color: "var(--color-muted)" }}>—</span>;

  const colorMap: Record<string, { bg: string; fg: string }> = {
    UGC:       { bg: "rgba(99,102,241,0.12)",   fg: "#6366f1" },
    Review:    { bg: "rgba(234,179,8,0.12)",    fg: "#ca8a04" },
    Social:    { bg: "rgba(59,130,246,0.12)",   fg: "#2563eb" },
    Reference: { bg: "rgba(139,92,246,0.12)",   fg: "#7c3aed" },
    News:      { bg: "rgba(239,68,68,0.12)",    fg: "#dc2626" },
    You:       { bg: "var(--color-badge-connected-bg)", fg: "var(--color-badge-connected-text)" },
    Web:       { bg: "var(--color-surface-muted)", fg: "var(--color-muted)" },
  };

  const colors = colorMap[type] ?? colorMap["Web"];
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: "var(--radius-sm)",
      fontSize: "var(--font-size-badge)",
      fontWeight: 700,
      backgroundColor: colors.bg,
      color: colors.fg,
      whiteSpace: "nowrap",
    }}>
      {type}
    </span>
  );
}

function TopSourcesPanel({ sources }: { sources: TopSource[] }) {
  const [query, setQuery] = useState("");

  const isEnriched = sources.length > 0 && sources[0]?.usedPct !== undefined;

  // Sort: enriched → usedPct desc; legacy → count desc
  const sorted = [...sources].sort((a, b) => {
    if (isEnriched) return (b.usedPct ?? 0) - (a.usedPct ?? 0);
    return (b.count ?? 0) - (a.count ?? 0);
  });

  const capped = sorted.slice(0, 25);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? capped.filter(
        (s) => s.domain.toLowerCase().includes(q) || (s.label ?? "").toLowerCase().includes(q)
      )
    : capped;

  return (
    <section
      aria-labelledby="top-sources-heading"
      style={{
        marginBottom: "var(--space-4)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h2
        id="top-sources-heading"
        style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-4) 0" }}
      >
        Where AI gets its answers about you
      </h2>

      {sources.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>
          No sources cited yet — run an audit to discover where AI finds information about your brand.
        </p>
      ) : (
        <>
          {/* Search input */}
          <div style={{ marginBottom: "var(--space-3)" }}>
            <input
              type="search"
              aria-label="Filter by domain"
              placeholder="Filter by domain…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "320px",
                height: "var(--min-tap-target)",
                padding: "0 var(--space-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-muted)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-body-sm)",
                fontFamily: "var(--font-family)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* No-match state */}
          {filtered.length === 0 && q ? (
            <p
              role="status"
              aria-live="polite"
              style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}
            >
              No sources match &ldquo;<em>{query}</em>&rdquo;.
            </p>
          ) : (
            /* Table */
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-body-sm)" }}>
                <caption
                  style={{
                    position: "absolute",
                    width: "1px",
                    height: "1px",
                    padding: 0,
                    margin: "-1px",
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                >
                  Top cited sources by AI engines
                </caption>
                <thead>
                  <tr style={{ backgroundColor: "var(--color-surface-muted)", textAlign: "left" }}>
                    <th scope="col" style={thStyle}>Domain</th>
                    <th scope="col" style={thStyle}>Type</th>
                    <th scope="col" style={thStyle}>{isEnriched ? "Used %" : "Citations"}</th>
                    <th scope="col" style={thStyle}>Avg. Citations</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((src) => (
                    <tr
                      key={src.domain}
                      style={{
                        borderTop: "1px solid var(--color-border)",
                        backgroundColor: src.isYou ? "var(--color-success-surface)" : "transparent",
                      }}
                    >
                      {/* Domain */}
                      <td style={tdStyle}>
                        <span style={{ fontWeight: src.isYou ? 700 : 400 }}>
                          {src.label || src.domain}
                        </span>
                        {src.isYou && (
                          <span style={{
                            display: "inline-block",
                            marginLeft: "var(--space-2)",
                            padding: "2px 6px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "var(--font-size-badge)",
                            fontWeight: 700,
                            backgroundColor: "var(--color-badge-connected-bg)",
                            color: "var(--color-badge-connected-text)",
                          }}>
                            You
                          </span>
                        )}
                      </td>
                      {/* Type */}
                      <td style={tdStyle}>{typeTag(src.type)}</td>
                      {/* Used % or Citations */}
                      <td style={tdStyle}>
                        {src.usedPct != null
                          ? `${src.usedPct}%`
                          : src.count != null
                          ? src.count
                          : "—"}
                      </td>
                      {/* Avg. Citations */}
                      <td style={tdStyle}>
                        {src.avgCitations != null ? src.avgCitations.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Export CSV button — downloads audit data
// ---------------------------------------------------------------------------

function ExportCsvButton({ auditId }: { auditId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    if (!auditId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/audits/${auditId}/export?format=csv`);
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      // Get filename from Content-Disposition header if available, fallback to generic
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
      a.download = match?.[1] ?? "trustindex-export.csv";
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy || !auditId}
        aria-label="Export audit data as CSV"
        aria-busy={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          height: "var(--min-tap-target)",
          padding: "0 var(--space-4)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-primary)",
          border: "1.5px solid var(--color-primary)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: 600,
          fontFamily: "var(--font-family)",
          cursor: busy || !auditId ? "not-allowed" : "pointer",
          opacity: busy || !auditId ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "Exporting…" : "Export CSV"}
      </button>
      {error && (
        <p role="alert" style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <span aria-hidden="true" style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid var(--color-border)", borderTopColor: "var(--color-primary)", display: "inline-block", animation: "tia-spin 0.8s linear infinite" }} />
      {label}
      <style>{`@keyframes tia-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
