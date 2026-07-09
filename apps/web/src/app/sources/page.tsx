"use client";

/**
 * /sources — Citation Sources.
 *
 * A grouped, insight-led view of the domains AI actually cited in the latest
 * audit (the real `topSources` from GET /api/audits/:id/breakdown — the same
 * data the brand page shows, presented more clearly and with derived insights).
 * 100% real data: source URLs are parsed from live AI answers; nothing invented.
 * If there's no completed audit yet, we say so honestly and point to the test.
 */

import { useEffect, useState, useCallback } from "react";
import { apiFetch, ensureProvisioned } from "../../lib/supabase-browser";

type SourceType = "You" | "UGC" | "Review" | "Social" | "Reference" | "News" | "Web";

interface TopSource {
  domain: string;
  label: string;
  type: SourceType;
  usedPct: number;
  avgCitations: number;
  isYou: boolean;
}

interface Brand {
  id: string;
  name: string;
  latest_score?: number | null;
}

// Order + human labels for the type groups (the buckets the API classifies into).
const GROUPS: { type: SourceType; label: string; blurb: string }[] = [
  { type: "You", label: "Your own site", blurb: "When AI cites you directly — the strongest signal." },
  { type: "UGC", label: "Community & UGC", blurb: "Reddit, Quora, Stack Exchange — where AI finds unfiltered opinion." },
  { type: "Review", label: "Reviews & marketplaces", blurb: "G2, Capterra, Trustpilot — high-intent buying signals." },
  { type: "Social", label: "Social", blurb: "LinkedIn, YouTube, X — authority and reach." },
  { type: "Reference", label: "Reference", blurb: "Wikipedia, Crunchbase, docs — the canonical facts AI trusts." },
  { type: "News", label: "News & media", blurb: "Press and industry publications." },
  { type: "Web", label: "Other web", blurb: "Blogs and other pages AI pulled from." },
];

const TYPE_COLOR: Record<SourceType, string> = {
  You: "var(--color-primary)",
  UGC: "#e6a93f",
  Review: "#5fdfa8",
  Social: "#7c9cff",
  Reference: "#a6b4ac",
  News: "#f0a35e",
  Web: "var(--color-muted)",
};

export default function SourcesPage() {
  const [state, setState] = useState<"loading" | "ready" | "no-audit" | "no-brand" | "error">("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [sources, setSources] = useState<TopSource[]>([]);

  const load = useCallback(async () => {
    try {
      await ensureProvisioned();
      const brandsRes = await apiFetch("/api/brands");
      if (!brandsRes.ok) { setState("error"); return; }
      const brands = ((await brandsRes.json()) as { brands?: Brand[] }).brands ?? [];
      if (brands.length === 0) { setState("no-brand"); return; }
      // Pick the brand with the most recent audit (has a latest_score).
      const chosen = brands.find((b) => b.latest_score != null) ?? brands[0];
      setBrand(chosen);

      const scoreRes = await apiFetch(`/api/brands/${chosen.id}/score`);
      const scoreData = scoreRes.ok ? ((await scoreRes.json()) as { latest?: { audit_id?: string } }) : null;
      const auditId = scoreData?.latest?.audit_id;
      if (!auditId) { setState("no-audit"); return; }

      const bdRes = await apiFetch(`/api/audits/${auditId}/breakdown`);
      if (!bdRes.ok) { setState("no-audit"); return; }
      const bd = (await bdRes.json()) as { topSources?: TopSource[] };
      const ts = (bd.topSources ?? []).filter((s) => s && typeof s.domain === "string");
      if (ts.length === 0) { setState("no-audit"); return; }
      setSources(ts);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height, 64px) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-ink)" }}>Intelligence</span>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "var(--space-2) 0 var(--space-2)" }}>
        Citation sources
      </h1>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        The domains AI actually cited when answering your buyer prompts{brand ? ` for ${brand.name}` : ""} — grouped by type, with the ones you should own. Every source is parsed from a real AI answer.
      </p>

      {state === "loading" && <p style={{ color: "var(--color-muted)", marginTop: "var(--space-8)" }}>Loading your citation sources…</p>}
      {state === "error" && <EmptyCard title="Couldn’t load your sources" body="Please refresh. If it persists, contact support." />}
      {state === "no-brand" && <EmptyCard title="Add a brand first" body="Add a brand and run an audit to see which sources AI cites." href="/brands" cta="Go to Brands →" />}
      {state === "no-audit" && <EmptyCard title="No completed audit yet" body="Run your first audit — we’ll show exactly which domains AI cites for your prompts." href="/test" cta="Run the free test →" />}

      {state === "ready" && <SourcesView sources={sources} />}
    </main>
  );
}

function SourcesView({ sources }: { sources: TopSource[] }) {
  const you = sources.filter((s) => s.isYou);
  const third = sources.filter((s) => !s.isYou);
  // Insight: which type dominates AI's citations (by summed usedPct).
  const byType = new Map<SourceType, number>();
  for (const s of third) byType.set(s.type, (byType.get(s.type) ?? 0) + s.usedPct);
  const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topTypeLabel = GROUPS.find((g) => g.type === topType)?.label ?? topType;
  const topSource = [...third].sort((a, b) => b.usedPct - a.usedPct)[0];

  return (
    <>
      {/* Insights */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)", margin: "var(--space-8) 0" }}>
        <Insight
          label="Sources AI cited"
          value={`${sources.length}`}
          note="distinct domains across your prompts"
        />
        <Insight
          label="You’re cited"
          value={you.length > 0 ? `${Math.max(...you.map((s) => s.usedPct))}%` : "0%"}
          note={you.length > 0 ? "of prompts cite your own site" : "AI never cited your own site — a gap to close"}
          warn={you.length === 0}
        />
        {topType && (
          <Insight
            label="AI leans on"
            value={topTypeLabel}
            note={`the source type it cites most for you${topSource ? ` — e.g. ${topSource.label}` : ""}`}
          />
        )}
      </section>

      {/* Groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {GROUPS.map((g) => {
          const rows = sources.filter((s) => s.type === g.type).sort((a, b) => b.usedPct - a.usedPct);
          if (rows.length === 0) return null;
          return (
            <section key={g.type} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: TYPE_COLOR[g.type], display: "inline-block" }} aria-hidden="true" />
                <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: 0 }}>{g.label}</h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-muted)" }}>{rows.length}</span>
              </div>
              <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-3)" }}>{g.blurb}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {rows.map((s) => (
                  <div key={s.domain} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>{s.label}</span>
                      {s.label !== s.domain && <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)", marginLeft: "var(--space-2)" }}>{s.domain}</span>}
                    </div>
                    {/* Real usage bar: % of probes citing this domain */}
                    <div style={{ flex: "1 1 160px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--color-surface-muted)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, s.usedPct)}%`, height: "100%", background: TYPE_COLOR[s.type] }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-text)", minWidth: 38, textAlign: "right" }}>{s.usedPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-6)", lineHeight: 1.6 }}>
        “%” = share of your audited prompts where AI cited that domain. Own the sources AI leans on and it starts citing you instead.
      </p>
    </>
  );
}

function Insight({ label, value, note, warn }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div style={{ background: "var(--color-surface)", border: `1px solid ${warn ? "rgba(240,88,78,0.35)" : "var(--color-border)"}`, borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)" }}>{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 800, color: warn ? "var(--color-error)" : "var(--color-text)", margin: "var(--space-1) 0" }}>{value}</div>
      <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

function EmptyCard({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div style={{ marginTop: "var(--space-8)", background: "var(--color-surface)", border: "1px dashed var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-8)", textAlign: "center" }}>
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2)" }}>{title}</h2>
      <p style={{ color: "var(--color-muted)", lineHeight: 1.6, margin: "0 auto", maxWidth: "440px" }}>{body}</p>
      {href && cta && (
        <a href={href} style={{ display: "inline-flex", marginTop: "var(--space-4)", height: "44px", alignItems: "center", padding: "0 var(--space-5)", background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>{cta}</a>
      )}
    </div>
  );
}
