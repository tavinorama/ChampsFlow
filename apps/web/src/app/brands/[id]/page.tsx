"use client";

/**
 * /brands/[id] — TrustIndex Score detail + deep breakdown
 *
 * - Polls a running audit (?audit=<id>) to completion, else loads latest score.
 * - Shows the overall TrustIndex Score + 3 vectors.
 * - Deep breakdown per vector: the component math, each input labelled
 *   "measured" (real signal this audit) vs "baseline" (placeholder pending
 *   the site-crawl/entity slice) — honest about what is and isn't live.
 * - AI vector shows the per-prompt EVIDENCE: which buyer prompt, which engine,
 *   cited?, position, and which sources — answering "why this AI score?".
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/supabase-browser";

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
  const [statusMsg, setStatusMsg] = useState("Loading…");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [resolvedAuditId, setResolvedAuditId] = useState<string>("");
  const pollCount = useRef(0);

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
          if (latest) {
            setAudit({
              status: "complete",
              score_brand: latest.score_brand,
              score_performance: latest.score_performance,
              score_ai: latest.score_ai,
            });
            setOverall(latest.score_overall ?? null);
            setStatusMsg("Latest TrustIndex Score.");
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

  const isWorking = audit?.status === "pending" || audit?.status === "running" || (!audit && !!auditId);

  return (
    <main style={{
      maxWidth: "760px", margin: "0 auto",
      padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
      fontFamily: "var(--font-family)", color: "var(--color-text)",
    }}>
      <a href="/dashboard" style={{ color: "var(--color-primary)", textDecoration: "none", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}>
        ← Dashboard
      </a>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-4) 0 var(--space-2) 0" }}>
        TrustIndex Score
      </h1>
      <div aria-live="polite" style={{ marginBottom: "var(--space-6)", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
        {isWorking ? <Spinner label={statusMsg} /> : statusMsg}
      </div>

      {/* Overall ring */}
      <div style={{
        backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-xl)", padding: "var(--space-8)", textAlign: "center",
        boxShadow: "var(--shadow-card)", marginBottom: "var(--space-6)",
      }}>
        <ScoreRing value={overall} />
        <p style={{ margin: "var(--space-4) 0 0 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
          Overall TrustIndex Score
          {breakdown?.probes_total ? ` · based on ${breakdown.probes_total} AI probes${breakdown.probes_cited != null ? `, cited in ${breakdown.probes_cited}` : ""}` : ""}
        </p>
      </div>

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
          <EvidenceTable evidence={breakdown.evidence} />
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

      {/* GEO Content Plan — what to publish (C3) */}
      <GeoContentPlan brandId={brandId} auditId={resolvedAuditId} />

      {/* Content Studio — draft the actual posts (C4) */}
      <ContentStudio brandId={brandId} />

      {/* Competitor benchmark — who AI recommends instead of you */}
      <CompetitorBenchmark brandId={brandId} benchmark={breakdown?.competitors ?? []} />

      {/* Done-for-you — hand the plan to OrganicPosts (the paid service) */}
      <DoneForYou brandId={brandId} />

      {breakdown && (
        <p style={{ marginTop: "var(--space-6)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          <strong>How to read this:</strong> &ldquo;Measured&rdquo; values come from this audit&rsquo;s live AI probes
          {breakdown.site_crawl?.reachable ? " and a live crawl of your website" : ""}.
          &ldquo;Baseline&rdquo; values are neutral placeholders shown transparently when a data source
          isn&rsquo;t connected yet — never presented as real signal.
        </p>
      )}
    </main>
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

function DoneForYou({ brandId }: { brandId: string }) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  async function request(sku: string) {
    if (busy) return;
    setBusy(sku);
    setError("");
    try {
      const res = await apiFetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, sku }),
      });
      if (!res.ok) throw new Error();
      setRequested((s) => { const n = new Set(s); n.add(sku); return n; });
    } catch {
      setError("Could not send your request. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={{
      marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)", borderLeft: "4px solid var(--color-accent-amber)",
      borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
    }}>
      <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
        Don&rsquo;t want to do it yourself?
      </h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-5) 0" }}>
        Your plan and drafts are ready — but publishing weekly, implementing schema, and building off-site
        authority takes time. <strong>OrganicPosts</strong> (our team) executes it for you.
      </p>

      {error && <p style={{ color: "var(--color-error)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-3) 0" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
        {DFY_SKUS.map((o) => {
          const done = requested.has(o.sku);
          return (
            <div key={o.sku} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <div style={{ fontWeight: 800 }}>{o.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "var(--font-size-h3)", fontWeight: 800 }}>{o.price}</span>
                <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{o.priceNote}</span>
              </div>
              <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.55, margin: 0, flex: 1 }}>{o.desc}</p>
              <button
                type="button"
                disabled={done || busy === o.sku}
                onClick={() => void request(o.sku)}
                style={{
                  marginTop: "var(--space-2)", minHeight: "40px", padding: "0 var(--space-4)",
                  backgroundColor: done ? "var(--color-surface-muted)" : "var(--color-primary)",
                  color: done ? "var(--color-muted)" : "#fff",
                  border: done ? "1px solid var(--color-border)" : "none",
                  borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)",
                  cursor: done || busy === o.sku ? "default" : "pointer",
                }}
              >
                {done ? "Requested ✓ — we'll reach out" : busy === o.sku ? "Sending…" : "Request this"}
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "var(--space-4) 0 0 0", lineHeight: 1.6 }}>
        Pricing is indicative — we confirm scope on a short intro call. <a href="/organicposts" style={{ color: "var(--color-primary)", fontWeight: 600 }}>See full details</a>.
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
}

function ContentStudio({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [type, setType] = useState<"blog" | "linkedin" | "faq">("blog");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

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
        body: JSON.stringify({ content_type: type, topic: topic.trim() }),
      });
      if (res.ok) { setTopic(""); await load(); }
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

      <form onSubmit={generate} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} style={{ height: "40px", padding: "0 var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)", fontSize: "var(--font-size-body-sm)" }}>
          <option value="blog">Blog post</option>
          <option value="linkedin">LinkedIn post</option>
          <option value="faq">FAQ entry</option>
        </select>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (e.g. from an accepted plan action)"
          style={{ flex: "1 1 240px", minWidth: 0, height: "40px", padding: "0 var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)", fontSize: "var(--font-size-body-sm)" }} />
        <button type="submit" disabled={busy || !topic.trim()} style={{ height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", cursor: busy || !topic.trim() ? "not-allowed" : "pointer", opacity: busy || !topic.trim() ? 0.6 : 1 }}>
          {busy ? "Drafting…" : "Generate draft"}
        </button>
      </form>

      {items.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>No drafts yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {items.map((it) => (
            <li key={it.id} style={{
              padding: "var(--space-4)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
              backgroundColor: it.status === "approved" ? "rgba(15,180,136,0.06)" : "var(--color-surface)",
              opacity: it.status === "discarded" ? 0.5 : 1,
            }}>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-badge-ai-bg)", color: "var(--color-badge-ai-text)" }}>{it.content_type}</span>
                {/* AC-C4-3: non-removable AI label */}
                <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)" }}>✦ AI-generated</span>
                {it.schema_markup && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-success)" }}>schema.org ✓</span>}
                {it.status === "approved" && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-success)" }}>✓ APPROVED</span>}
              </div>
              {it.title && <div style={{ fontWeight: 700, marginBottom: "var(--space-1)" }}>{it.title}</div>}
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-family)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0", lineHeight: 1.5, maxHeight: "160px", overflow: "auto" }}>{it.body}</pre>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button onClick={() => setStatus(it.id, "approved")} style={miniBtn(true)}>Approve</button>
                <button onClick={() => setStatus(it.id, "discarded")} style={miniBtn(false)}>Discard</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// GEO Content Plan (C3) — generate + accept/reject recommendations + calendar
// ---------------------------------------------------------------------------

interface PlanTask {
  id: string; vector: "brand" | "performance" | "ai"; gap: string; action: string;
  effort: "low" | "medium" | "high"; impact: "low" | "medium" | "high"; status: string;
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

  const vColor = (v: string) => v === "ai" ? "var(--color-primary)" : v === "performance" ? "#7c3aed" : "#0FB488";
  const badge = (label: string, kind: "effort" | "impact") => (
    <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-muted)" }}>
      {kind}: {label}
    </span>
  );

  return (
    <section style={{
      marginTop: "var(--space-8)", backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <h2 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: 0 }}>GEO Content Plan</h2>
        <button onClick={generate} disabled={busy || !auditId} style={{
          height: "40px", padding: "0 var(--space-4)", backgroundColor: "var(--color-primary)", color: "#fff",
          border: "none", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)",
          cursor: busy || !auditId ? "not-allowed" : "pointer", opacity: busy || !auditId ? 0.6 : 1,
        }}>
          {busy ? "Generating…" : hasPlan ? "Regenerate plan" : "Generate plan"}
        </button>
      </div>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        Prioritized actions from your audit gaps. <strong>AI-assisted drafts</strong> — accept the ones you&rsquo;ll act on.
        OrganicPosts can execute the accepted plan for you.
      </p>

      {tasks.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          {auditId ? "No plan yet — click Generate plan." : "Run an audit first, then generate a plan."}
        </p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {tasks.map((t) => (
              <li key={t.id} style={{
                padding: "var(--space-4)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                borderLeft: `4px solid ${vColor(t.vector)}`,
                opacity: t.status === "rejected" ? 0.5 : 1,
                backgroundColor: t.status === "accepted" ? "rgba(15,180,136,0.06)" : "var(--color-surface)",
              }}>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-1)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", color: vColor(t.vector) }}>{t.vector}</span>
                  {badge(t.impact, "impact")}{badge(t.effort, "effort")}
                  {t.status === "accepted" && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-success)" }}>✓ ACCEPTED</span>}
                  {t.status === "rejected" && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-muted)" }}>REJECTED</span>}
                </div>
                <div style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", marginBottom: "var(--space-1)" }}>{t.gap}</div>
                <div style={{ fontSize: "var(--font-size-body-sm)", fontWeight: 600, color: "var(--color-text)", marginBottom: "var(--space-2)" }}>→ {t.action}</div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button onClick={() => setStatus(t.id, "accepted")} style={miniBtn(true)}>Accept</button>
                  <button onClick={() => setStatus(t.id, "rejected")} style={miniBtn(false)}>Reject</button>
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
                    <div style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "var(--space-1)" }}>Week {c.week} · {c.channel}</div>
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

function miniBtn(primary: boolean): React.CSSProperties {
  return {
    minHeight: "32px", padding: "0 var(--space-3)", fontSize: "var(--font-size-caption)", fontWeight: 700,
    borderRadius: "var(--radius-sm)", cursor: "pointer",
    border: primary ? "none" : "1px solid var(--color-border)",
    backgroundColor: primary ? "var(--color-success)" : "transparent",
    color: primary ? "#fff" : "var(--color-muted)",
  };
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
                      fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                      padding: "2px 6px", borderRadius: "var(--radius-sm)",
                      backgroundColor: isMeasured ? "rgba(15,180,136,0.12)" : "var(--color-surface-muted)",
                      color: isMeasured ? "var(--color-success)" : "var(--color-muted)",
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
        <p style={{ fontSize: "var(--font-size-caption)", color: "#d97706", margin: "0 0 var(--space-2) 0" }}>
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
                <span style={{ fontWeight: 700, color: v >= 0.5 ? "var(--color-success)" : "#d97706" }}>{pct}%</span>
              </div>
              <div style={{ height: "6px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-muted)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", backgroundColor: v >= 0.5 ? "var(--color-success)" : "#d97706" }} />
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
          {sentiment.negative > 0 && <div style={{ width: seg(sentiment.negative), backgroundColor: "#dc2626" }} title={`Negative: ${sentiment.negative}`} />}
        </div>
      )}
      {sentiment.analyzed && (
        <div style={{ display: "flex", gap: "var(--space-3)", fontSize: "var(--font-size-caption)", marginBottom: "var(--space-2)" }}>
          <span style={{ color: "var(--color-success)", fontWeight: 600 }}>● {sentiment.positive} positive</span>
          <span style={{ color: "var(--color-muted)", fontWeight: 600 }}>● {sentiment.neutral} neutral</span>
          <span style={{ color: "#dc2626", fontWeight: 600 }}>● {sentiment.negative} negative</span>
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
        <p style={{ fontSize: "var(--font-size-caption)", color: "#d97706", lineHeight: 1.5, margin: "0 0 var(--space-2) 0" }}>
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

function EvidenceTable({ evidence }: { evidence: Evidence[] }) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p style={{ fontSize: "var(--font-size-caption)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", margin: "0 0 var(--space-2) 0" }}>
        Evidence — every prompt we asked, per engine
      </p>
      <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-caption)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--color-surface-muted)", textAlign: "left" }}>
              <th style={thStyle}>Buyer prompt</th>
              <th style={thStyle}>Engine</th>
              <th style={thStyle}>Cited?</th>
              <th style={thStyle}>Position</th>
              <th style={thStyle}>Sources</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={tdStyle}>{e.prompt ?? "—"}</td>
                <td style={tdStyle}>{ENGINE_LABEL[e.engine] ?? e.engine}</td>
                <td style={tdStyle}>
                  <span style={{ color: e.cited ? "var(--color-success)" : "var(--color-muted)", fontWeight: 700 }}>
                    {e.cited ? "✓ cited" : "— no"}
                  </span>
                </td>
                <td style={tdStyle}>{e.position != null ? `#${e.position}` : "—"}</td>
                <td style={tdStyle}>
                  {e.sources.length > 0
                    ? e.sources.map((s, j) => <div key={j} style={{ color: "var(--color-primary)", wordBreak: "break-all" }}>{s}</div>)
                    : "—"}
                </td>
              </tr>
            ))}
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

function ScoreRing({ value }: { value: number | null }) {
  const display = value == null ? "—" : String(value);
  const color = value == null ? "var(--color-muted)" : value >= 67 ? "var(--color-success)" : value >= 34 ? "#d97706" : "var(--color-error)";
  const pct = value == null ? 0 : value;
  const r = 54, c = 2 * Math.PI * r;
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={`TrustIndex Score ${display} out of 100`}>
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-border)" strokeWidth="12" />
      <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} transform="rotate(-90 80 80)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="80" y="80" textAnchor="middle" dominantBaseline="central" fontSize="40" fontWeight="800" fill={color} fontFamily="var(--font-family)">{display}</text>
    </svg>
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
