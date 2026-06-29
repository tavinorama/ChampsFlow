"use client";

/**
 * /kit/[token] — Get-Cited Kit delivery page.
 * On load: if delivered, show it; else verify payment (Stripe session_id or
 * dev_unlock) via POST /api/kit/:token/deliver, build it, and render.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "../../../../components/brand/Logo";
import { UpsellLadder } from "../../../../components/UpsellLadder";

interface Fix { vector: string; gap: string; action: string; effort: string; impact: string; priority: number }
interface Draft { contentType: string; title: string; body: string; schemaMarkup: string | null; generatedBy: string }
interface FromTest { status: string; brandEngineCount: number; competitorEngineCount: number; totalEngines: number; verdict: string }
interface Deliverable {
  brand: string;
  generatedAt?: string;
  live: boolean;
  fromTest?: FromTest | null;
  score: { brand: number; performance: number; ai: number; overall: number };
  topFixes: Fix[];
  drafts: Draft[];
  publishChecklist: string[];
  meta: { probesTotal: number; probesCited: number; enginesUsed: string[] };
}

export default function KitDeliveryPage() {
  const params = useParams();
  const search = useSearchParams();
  const token = String(params?.token ?? "");
  const [state, setState] = useState<"loading" | "ready" | "unpaid" | "error">("loading");
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null);

  const load = useCallback(async () => {
    try {
      // 1. Already delivered?
      const statusRes = await fetch(`/api/kit/${token}`);
      if (statusRes.ok) {
        const s = await statusRes.json();
        if (s.status === "delivered" && s.deliverable) {
          setDeliverable(s.deliverable);
          setState("ready");
          return;
        }
      }
      // 2. Try to deliver (verify payment via session_id or dev_unlock).
      const qs = new URLSearchParams();
      const sessionId = search.get("session_id");
      if (sessionId) qs.set("session_id", sessionId);
      if (search.get("dev_unlock") === "1") qs.set("dev_unlock", "1");
      const res = await fetch(`/api/kit/${token}/deliver?${qs.toString()}`, { method: "POST" });
      if (res.ok) {
        setDeliverable((await res.json()).deliverable);
        setState("ready");
      } else if (res.status === 402) {
        setState("unpaid");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, [token, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main style={{ maxWidth: "820px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-20)", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      {state === "loading" && <p style={{ color: "var(--color-muted)" }}>Building your kit — running the audit and writing your drafts…</p>}
      {state === "unpaid" && (
        <div style={card}>
          <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800 }}>Payment not verified yet</h1>
          <p style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>If you just paid, refresh in a moment. Otherwise, <a href="/kit" style={{ color: "var(--color-primary)", fontWeight: 700 }}>complete checkout</a>.</p>
        </div>
      )}
      {state === "error" && (
        <div style={card}>
          <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800 }}>Something went wrong</h1>
          <p style={{ color: "var(--color-muted)" }}>We couldn&rsquo;t generate your kit. Please contact support — your purchase is safe.</p>
        </div>
      )}
      {state === "ready" && deliverable && <KitView d={deliverable} />}
    </main>
  );
}

function KitView({ d }: { d: Deliverable }) {
  const generatedLabel = d.generatedAt
    ? new Date(d.generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <>
      {/* Branded report header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-6)", paddingBottom: "var(--space-5)", borderBottom: "1px solid var(--color-border)" }}>
        <Logo markSize={30} wordSize="1.0625rem" />
        <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-success)" }}>
          ✓ Get-Cited Kit{generatedLabel ? ` · ${generatedLabel}` : ""}
        </span>
      </header>

      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 var(--space-3) 0" }}>
        Your Get-Cited Kit for {d.brand}
      </h1>

      {/* Part 1 — the audit (continuity with the free test) */}
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
        Part 1 — Your complete AI Visibility Audit
      </h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-5) 0" }}>
        {d.fromTest
          ? `Your free test showed how ${d.brand} appeared for one buyer question across ${d.fromTest.totalEngines} AI engines. This is the complete audit it was a preview of — every buyer prompt, every engine, your full Ozvor AI Visibility Score, and exactly where you’re losing citations.`
          : "Your free test asked one buyer question across the AI engines. This is the full version: every high-intent buyer prompt in your category, across every engine, scored on all three Ozvor AI Visibility vectors — Brand, Performance, and AI."}
      </p>

      {/* Score */}
      <div style={card}>
        <h3 style={h2}>Your Ozvor AI Visibility Score</h3>
        <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontSize: "3rem", fontWeight: 800, color: "var(--color-primary)" }}>{d.score.overall}<span style={{ fontSize: "1rem", color: "var(--color-muted)" }}>/100</span></div>
          <div style={{ display: "flex", gap: "var(--space-4)", fontSize: "var(--font-size-body-sm)" }}>
            <span>AI <strong>{d.score.ai}</strong></span>
            <span>Performance <strong>{d.score.performance}</strong></span>
            <span>Brand <strong>{d.score.brand}</strong></span>
          </div>
        </div>
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "var(--space-2) 0 0 0" }}>
          Based on {d.meta.probesTotal} AI probes across {d.meta.enginesUsed.length} engines{!d.live ? " · demo data" : ""}.
        </p>
      </div>

      {/* Top fixes */}
      <div style={card}>
        <h3 style={h2}>Your top 3 fixes</h3>
        <ol style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {d.topFixes.map((f, i) => (
            <li key={i}>
              <strong>{f.action}</strong>
              <span style={{ display: "block", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>{f.gap} · {f.impact} impact / {f.effort} effort</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Drafts */}
      <div style={card}>
        <h3 style={h2}>Your ready-to-publish drafts</h3>
        {d.drafts.map((draft, i) => (
          <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <span style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-badge-ai-bg)", color: "var(--color-badge-ai-text)" }}>{draft.contentType}</span>
              {draft.schemaMarkup && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-success)" }}>schema.org ✓</span>}
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-muted)" }}>✦ AI-generated draft</span>
            </div>
            {draft.title && <div style={{ fontWeight: 700, marginBottom: "var(--space-1)" }}>{draft.title}</div>}
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-family)", fontSize: "var(--font-size-caption)", color: "var(--color-text)", margin: 0, lineHeight: 1.55, maxHeight: "240px", overflow: "auto" }}>{draft.body}</pre>
          </div>
        ))}
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>
          Replace any <code>[PLACEHOLDER]</code> with your real facts before publishing — we never invent numbers.
        </p>
      </div>

      {/* Checklist */}
      <div style={card}>
        <h3 style={h2}>Where to publish</h3>
        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {d.publishChecklist.map((c, i) => <li key={i} style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>{c}</li>)}
        </ul>
      </div>

      {/* Part 2 — the GEO guide */}
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "var(--space-8) 0 var(--space-2) 0" }}>
        Part 2 — Understanding GEO Search
      </h2>
      <div style={{ ...card, borderLeft: "4px solid var(--color-primary)" }}>
        <p style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.7, margin: "0 0 var(--space-3) 0" }}>
          Your plain-English guide to <strong>how AI search actually works</strong> and how engines decide who to cite —
          the <em>why</em> behind every fix above. Read it once, then act on Part 1.
        </p>
        <Link href="/resources/what-is-geo-search" target="_blank" style={{ display: "inline-flex", alignItems: "center", height: "44px", padding: "0 var(--space-5)", backgroundColor: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>
          Open your GEO guide →
        </Link>
        <span style={{ display: "block", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "var(--space-2)" }}>
          Opens in a new tab · downloadable as PDF.
        </span>
      </div>

      {/* Upsell ladder — Growth is the natural next step after the Kit */}
      <UpsellLadder
        heading="You found the gaps. Keep them closed."
        primary={{
          title: "Growth Plan",
          why: "Your Kit is a one-time snapshot. But AI answers move every week — new competitors get cited, and content you publish today can lift your score in 30 days or quietly slip back. Growth re-runs your full audit weekly, alerts you the moment your score or citation share moves, and delivers fresh content briefs. The Kit was the first brick — Growth is the wall.",
          price: "$99/mo",
          plan: "growth", interval: "year",
          accent: "emerald",
          ctaAriaLabel: "Start weekly monitoring with the Growth Plan — $99 per month",
        }}
        secondary={[
          {
            title: "Agency Plan",
            why: "Same weekly monitoring across up to 25 brands, with white-label reports and a client approval workflow.",
            price: "$249/mo",
            plan: "agency", interval: "year",
            accent: "ghost",
            ctaAriaLabel: "Start the Agency Plan — $249 per month",
          },
          {
            title: "OrganicPosts",
            why: "Rather have a team run the whole GEO project for you? Managed done-for-you engagement.",
            price: "Custom",
            href: "/organicposts",
            accent: "ghost",
            ctaAriaLabel: "Learn about OrganicPosts done-for-you managed engagement",
          },
        ]}
        marginTop="var(--space-8)"
      />
      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6, margin: "var(--space-3) 0 0 0" }}>
        Founder annual: Growth $831/yr (~$69/mo), Agency $2,091/yr (~$174/mo) — 30% off, first 100 founders, annual
        only. Cancel anytime. No guaranteed citations — we track the movement and tell you what changed.
      </p>

      {/* Branded footer */}
      <footer style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Logo markSize={22} wordSize="0.9rem" />
        <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          AI Search Trust Intelligence · Your free test, completed → weekly monitoring on Growth & Agency.
        </span>
      </footer>
    </>
  );
}

const card: React.CSSProperties = {
  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
  marginBottom: "var(--space-5)",
};
const h2: React.CSSProperties = { fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" };
