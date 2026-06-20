"use client";

/**
 * /kit/[token] — Get-Cited Kit delivery page.
 * On load: if delivered, show it; else verify payment (Stripe session_id or
 * dev_unlock) via POST /api/kit/:token/deliver, build it, and render.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Fix { vector: string; gap: string; action: string; effort: string; impact: string; priority: number }
interface Draft { contentType: string; title: string; body: string; schemaMarkup: string | null; generatedBy: string }
interface Deliverable {
  brand: string;
  live: boolean;
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
  return (
    <>
      <span style={{ display: "inline-block", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-success)", marginBottom: "var(--space-2)" }}>
        ✓ Your Get-Cited Kit for {d.brand}
      </span>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 var(--space-5) 0" }}>
        Here&rsquo;s your first step to getting cited
      </h1>

      {/* Score */}
      <div style={card}>
        <h2 style={h2}>1 · Your TrustIndex Score</h2>
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
        <h2 style={h2}>2 · Your top 3 fixes</h2>
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
        <h2 style={h2}>3 · Your ready-to-publish drafts</h2>
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
        <h2 style={h2}>4 · Where to publish</h2>
        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {d.publishChecklist.map((c, i) => <li key={i} style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>{c}</li>)}
        </ul>
      </div>

      {/* Upsell to subscription */}
      <div style={{ ...card, backgroundColor: "var(--color-surface-muted)" }}>
        <p style={{ fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>Want to know if it&rsquo;s working?</p>
        <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-3) 0" }}>
          Publish these, then track your score every week as AI re-indexes. <strong>Growth</strong> re-runs your audit
          automatically and alerts you when your score moves.
        </p>
        <a href="/#pricing" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>See Growth plan →</a>
      </div>
    </>
  );
}

const card: React.CSSProperties = {
  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
  marginBottom: "var(--space-5)",
};
const h2: React.CSSProperties = { fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" };
