"use client";

/**
 * /competitors — Competitors head-to-head + evolution.
 *
 * 100% real data:
 *  - Head-to-head from the latest audit breakdown: how often AI cited each
 *    competitor (mentions) and where they displaced you (displacement =
 *    prompts where AI cited them and not you) vs your own citation count.
 *  - Evolution: your Ozvor AI Visibility Score over time, from the real
 *    per-audit score history (weekly re-audits accumulate this).
 * Nothing invented; competitor position/sentiment + per-engine split come later
 * (Batch D) and are called out honestly rather than faked.
 */

import { useEffect, useState, useCallback } from "react";
import { apiFetch, ensureProvisioned } from "../../lib/supabase-browser";

interface Brand { id: string; name: string; latest_score?: number | null }
interface Competitor { name: string; mentions: number; displacement: number }
interface Evidence { cited: boolean }
interface TrendPoint { recorded_at: string; score_overall: number | null }

export default function CompetitorsPage() {
  const [state, setState] = useState<"loading" | "ready" | "no-brand" | "no-audit" | "error">("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [brandCited, setBrandCited] = useState(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  const load = useCallback(async () => {
    try {
      await ensureProvisioned();
      const brandsRes = await apiFetch("/api/brands");
      if (!brandsRes.ok) { setState("error"); return; }
      const brands = ((await brandsRes.json()) as { brands?: Brand[] }).brands ?? [];
      if (brands.length === 0) { setState("no-brand"); return; }
      const chosen = brands.find((b) => b.latest_score != null) ?? brands[0];
      setBrand(chosen);

      const scoreRes = await apiFetch(`/api/brands/${chosen.id}/score`);
      const scoreData = scoreRes.ok ? ((await scoreRes.json()) as { latest?: { audit_id?: string }; trend?: TrendPoint[] }) : null;
      const auditId = scoreData?.latest?.audit_id;
      // Chronological (API returns DESC).
      setTrend([...(scoreData?.trend ?? [])].reverse().filter((t) => t.score_overall != null));
      if (!auditId) { setState("no-audit"); return; }

      const bdRes = await apiFetch(`/api/audits/${auditId}/breakdown`);
      if (!bdRes.ok) { setState("no-audit"); return; }
      const bd = (await bdRes.json()) as { competitors?: Competitor[]; evidence?: Evidence[] };
      const comps = (bd.competitors ?? []).filter((c) => c && typeof c.name === "string");
      setCompetitors(comps.sort((a, b) => b.mentions - a.mentions));
      setBrandCited((bd.evidence ?? []).filter((e) => e && e.cited).length);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height, 64px) + var(--space-16))", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-ink)" }}>Intelligence</span>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "var(--space-2) 0 var(--space-2)" }}>Competitors</h1>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "640px", margin: 0 }}>
        Who AI recommends instead of you{brand ? ` for ${brand.name}` : ""}, how often, and where they displace you — plus how your own AI-visibility has moved over time.
      </p>

      {state === "loading" && <p style={{ color: "var(--color-muted)", marginTop: "var(--space-8)" }}>Loading your head-to-head…</p>}
      {state === "error" && <Empty title="Couldn’t load competitors" body="Please refresh. If it persists, contact support." />}
      {state === "no-brand" && <Empty title="Add a brand first" body="Add a brand and its competitors, then run an audit to see the head-to-head." href="/brands" cta="Go to Brands →" />}
      {state === "no-audit" && <Empty title="No completed audit yet" body="Run your first audit — we’ll show exactly who AI names instead of you." href="/test" cta="Run the free test →" />}

      {state === "ready" && (
        <>
          <HeadToHead brandName={brand?.name ?? "You"} brandCited={brandCited} competitors={competitors} />
          {trend.length >= 2 && <Evolution trend={trend} />}
        </>
      )}
    </main>
  );
}

function HeadToHead({ brandName, brandCited, competitors }: { brandName: string; brandCited: number; competitors: Competitor[] }) {
  const totalMentions = brandCited + competitors.reduce((s, c) => s + (c.mentions || 0), 0);
  const share = totalMentions > 0 ? Math.round((brandCited / totalMentions) * 100) : 0;
  const topDisplacer = [...competitors].sort((a, b) => b.displacement - a.displacement)[0];
  const maxMentions = Math.max(brandCited, ...competitors.map((c) => c.mentions || 0), 1);

  if (competitors.length === 0) {
    return <Empty title="No competitor data in the latest audit" body="Add competitors to your brand and re-run the audit to benchmark head-to-head." href="/brands" cta="Add competitors →" />;
  }

  return (
    <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)", margin: "var(--space-8) 0" }}>
        <Insight label="Your share of voice" value={`${share}%`} note="of AI citations across you + your competitors" warn={share < 34} />
        {topDisplacer && topDisplacer.displacement > 0 && (
          <Insight label="Biggest threat" value={topDisplacer.name} note={`AI cited them, not you, in ${topDisplacer.displacement} prompt${topDisplacer.displacement === 1 ? "" : "s"}`} warn />
        )}
        <Insight label="Competitors tracked" value={`${competitors.length}`} note="benchmarked in your latest audit" />
      </section>

      <section style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)" }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-4)" }}>Head-to-head — who AI cites</h2>
        <Row name={`${brandName} (you)`} value={brandCited} max={maxMentions} color="var(--color-primary)" isYou />
        {competitors.map((c) => (
          <Row key={c.name} name={c.name} value={c.mentions || 0} max={maxMentions} color="var(--color-muted)"
               tag={c.displacement > 0 ? `displaced you in ${c.displacement}` : undefined} />
        ))}
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          Bars = number of audited prompts where AI cited each brand. “Displaced you” = prompts where AI cited them and not you — your fastest wins.
        </p>
      </section>
    </>
  );
}

function Row({ name, value, max, color, isYou, tag }: { name: string; value: number; max: number; color: string; isYou?: boolean; tag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0" }}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <span style={{ fontWeight: isYou ? 800 : 700, fontSize: "var(--font-size-body-sm)", color: isYou ? "var(--color-primary)" : "var(--color-text)" }}>{name}</span>
        {tag && <span style={{ color: "var(--color-error)", fontSize: "var(--font-size-caption)", marginLeft: "var(--space-2)" }}>⚠ {tag}</span>}
      </div>
      <div style={{ flex: "2 1 260px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <div style={{ flex: 1, height: 10, borderRadius: 999, background: "var(--color-surface-muted)", overflow: "hidden" }}>
          <div style={{ width: `${Math.round((value / max) * 100)}%`, height: "100%", background: color }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", minWidth: 28, textAlign: "right" }}>{value}</span>
      </div>
    </div>
  );
}

function Evolution({ trend }: { trend: TrendPoint[] }) {
  const W = 640, H = 160, PAD = 24;
  const vals = trend.map((t) => t.score_overall ?? 0);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 100);
  const x = (i: number) => PAD + (i / Math.max(1, trend.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / Math.max(1, max - min)) * (H - PAD * 2);
  const pts = trend.map((t, i) => `${x(i)},${y(t.score_overall ?? 0)}`).join(" ");
  const first = vals[0], last = vals[vals.length - 1];
  const delta = last - first;

  return (
    <section style={{ marginTop: "var(--space-6)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: 0 }}>Your AI Visibility Score over time</h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: delta >= 0 ? "var(--color-primary)" : "var(--color-error)" }}>
          {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta} since first audit
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Your AI Visibility Score over time" style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {trend.map((t, i) => (
          <circle key={i} cx={x(i)} cy={y(t.score_overall ?? 0)} r="3" fill="var(--color-primary)" />
        ))}
      </svg>
      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-2)", lineHeight: 1.6 }}>
        Each point is a real re-audit. Per-competitor trend lines + a per-engine “why they’re cited, not you” view are coming next.
      </p>
    </section>
  );
}

function Insight({ label, value, note, warn }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div style={{ background: "var(--color-surface)", border: `1px solid ${warn ? "rgba(240,88,78,0.35)" : "var(--color-border)"}`, borderRadius: "var(--radius-lg)", padding: "var(--space-5)", boxShadow: "var(--shadow-card)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)" }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: warn ? "var(--color-error)" : "var(--color-text)", margin: "var(--space-1) 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
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
