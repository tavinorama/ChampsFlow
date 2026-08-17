"use client";

/**
 * CreditsWidgets — the visible credit state (D1, 2026-08-17).
 *
 * One hook (`useCredits`) reads GET /api/billing/credits once and derives the
 * level the same way everywhere:
 *   ok    → pill only
 *   low   → amber banner: under 20% of the monthly allowance
 *   empty → red banner: 0 credits, the audit CTA disables, one-click top-up
 *
 * `creditsLevelOf` mirrors packages/shared/src/credits.ts creditsState (the
 * API already returns `pct` and `can_run_audit`; the web only picks the
 * colour). The header pill and the /account/billing card share this file so
 * "running low" means the same thing on every screen.
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTA. Every
 * number is the API's derived value; nothing here restates an allowance.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/supabase-browser";

export interface CreditsInfo {
  plan: string;
  balance: number;
  granted: number;
  monthly_allowance?: number;
  pct?: number;
  cost_per_audit: number;
  can_run_audit: boolean;
  overage_pack: { credits: number; usd: number };
}

export type CreditsLevel = "ok" | "low" | "empty";
export const CREDITS_LOW_PCT = 20;

/** Pure: the colour band from the API numbers. Empty wins over low. */
export function creditsLevelOf(info: Pick<CreditsInfo, "balance" | "granted" | "pct">): CreditsLevel {
  if (!(info.balance > 0)) return "empty";
  const pct = typeof info.pct === "number" ? info.pct : info.granted > 0 ? Math.round((info.balance / info.granted) * 100) : 0;
  return pct < CREDITS_LOW_PCT ? "low" : "ok";
}

export interface CreditsHook {
  info: CreditsInfo | null;
  level: CreditsLevel | null;
  failed: boolean;
  buying: boolean;
  buyError: string | null;
  reload: () => void;
  buyPack: () => Promise<void>;
}

export function useCredits(): CreditsHook {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/billing/credits")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as CreditsInfo;
        if (alive) { setInfo(data); setFailed(false); }
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const buyPack = useCallback(async () => {
    if (buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const r = await apiFetch("/api/billing/credits/checkout", { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as { url?: string };
      if (!r.ok || !data.url) {
        setBuyError(r.status === 403 ? "Only the workspace owner can buy credits." : "I could not open checkout. Please try again.");
        setBuying(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBuyError("I could not open checkout. Check your connection.");
      setBuying(false);
    }
  }, [buying]);

  return { info, level: info ? creditsLevelOf(info) : null, failed, buying, buyError, reload, buyPack };
}

const fmt = (n: number) => n.toLocaleString("en-US");

const TONE: Record<CreditsLevel, { bg: string; fg: string; border: string }> = {
  ok: { bg: "var(--color-badge-connected-bg)", fg: "var(--color-success)", border: "transparent" },
  low: { bg: "var(--color-badge-status-warn-bg)", fg: "var(--color-badge-status-warn-text)", border: "var(--color-badge-status-warn-text)" },
  empty: { bg: "var(--color-badge-status-error-bg)", fg: "var(--color-badge-status-error-text)", border: "var(--color-badge-status-error-text)" },
};

/** Header pill: balance + "Buy 1,000 credits". Renders nothing until loaded. */
export function CreditsPill({ credits, onOpenBilling }: { credits: CreditsHook; onOpenBilling?: () => void }) {
  const { info, level, buying, buyPack } = credits;
  if (!info || !level) return null;
  const t = TONE[level];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} data-testid="credits-pill">
      <button
        type="button"
        onClick={onOpenBilling}
        title="Audit credits this month"
        aria-label={`${fmt(info.balance)} of ${fmt(info.granted)} credits left this month`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: "var(--radius-pill)", fontSize: "0.78rem", fontWeight: 700, background: t.bg, color: t.fg, border: "none", cursor: onOpenBilling ? "pointer" : "default", font: "inherit", fontVariantNumeric: "tabular-nums" }}
      >
        <span aria-hidden="true">●</span>
        {fmt(info.balance)} <span style={{ fontWeight: 500, opacity: 0.85 }}>/ {fmt(info.granted)} credits</span>
      </button>
      <button
        type="button"
        onClick={() => void buyPack()}
        disabled={buying}
        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "5px 10px", fontWeight: 600, fontSize: "0.76rem", cursor: buying ? "wait" : "pointer", font: "inherit" }}
      >
        {buying ? "Opening…" : `Buy ${fmt(info.overage_pack.credits)} credits`}
      </button>
    </div>
  );
}

/**
 * The banner under the header. Amber under 20%, red at 0. Quiet when ok.
 * `onUpgrade` (optional) adds the plan link for free-tier workspaces.
 */
export function CreditsBanner({ credits }: { credits: CreditsHook }) {
  const { info, level, buying, buyError, buyPack } = credits;
  if (!info || !level || level === "ok") return null;
  const t = TONE[level];
  const headline = level === "empty"
    ? "You are out of audit credits."
    : `You are running low: ${fmt(info.balance)} of ${fmt(info.granted)} credits left.`;
  const detail = level === "empty"
    ? `Audits pause until you top up. Your balance refills on the 1st.`
    : `Each audit uses ${fmt(info.cost_per_audit)} credits. Balance refills on the 1st.`;
  return (
    <div role={level === "empty" ? "alert" : "status"} data-testid={`credits-banner-${level}`}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", padding: "10px 14px", borderRadius: "var(--radius-md)", background: t.bg, color: t.fg, border: `1px solid ${t.border}`, marginBottom: "var(--space-4)", fontSize: "0.86rem" }}>
      <div>
        <b>{headline}</b> <span style={{ opacity: 0.9 }}>{detail}</span>
        {buyError && <div style={{ fontSize: "0.78rem", marginTop: 2 }}>{buyError}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void buyPack()} disabled={buying}
          style={{ background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", padding: "7px 12px", fontWeight: 700, fontSize: "0.8rem", border: "none", cursor: buying ? "wait" : "pointer", font: "inherit" }}>
          {buying ? "Opening…" : `Buy ${fmt(info.overage_pack.credits)} credits for $${info.overage_pack.usd}`}
        </button>
        {info.plan === "free" && (
          <a href="/pricing" style={{ color: "inherit", fontWeight: 700, fontSize: "0.8rem" }}>See plans</a>
        )}
      </div>
    </div>
  );
}

/**
 * The card on the Billing tab and /account/billing: balance of allowance,
 * cost per audit, the top-up button, and the same low/empty band.
 */
export function CreditsCard({ credits, sectionStyle, sectionNoteStyle, cardStyle, ghostBtnStyle }: {
  credits: CreditsHook;
  sectionStyle?: React.CSSProperties;
  sectionNoteStyle?: React.CSSProperties;
  cardStyle?: React.CSSProperties;
  ghostBtnStyle?: React.CSSProperties;
}) {
  const { info, level, failed, buying, buyError, buyPack } = credits;
  if (failed || !info || !level) return null;
  const t = TONE[level];
  const pct = typeof info.pct === "number" ? info.pct : 0;
  return (
    <>
      <div style={sectionStyle ?? { fontWeight: 800, margin: "24px 2px 12px", fontSize: "1.05rem" }}>
        Audit credits <span style={sectionNoteStyle ?? { color: "var(--color-muted)", fontWeight: 500, fontSize: "0.85rem" }}>· what your audits draw from each month</span>
      </div>
      <div style={cardStyle ?? { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "24px" }} data-testid="credits-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {fmt(info.balance)}
              <span style={{ color: "var(--color-muted)", fontSize: "0.9rem", fontWeight: 600 }}> of {fmt(info.granted)} this month</span>
            </div>
            <div style={{ color: "var(--color-muted)", fontSize: "0.86rem", marginTop: 4 }}>
              Each audit on your plan uses {fmt(info.cost_per_audit)} credits. Balance resets on the 1st.
            </div>
            <div aria-hidden="true" style={{ marginTop: 10, height: 8, width: 240, maxWidth: "100%", borderRadius: 99, background: "var(--color-border)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: level === "ok" ? "var(--color-primary)" : t.fg }} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button type="button" onClick={() => void buyPack()} disabled={buying}
              style={ghostBtnStyle ? { ...ghostBtnStyle, cursor: buying ? "wait" : "pointer" } : { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "7px 13px", fontWeight: 600, fontSize: "0.82rem", cursor: buying ? "wait" : "pointer", font: "inherit" }}>
              {buying ? "Opening checkout…" : `Buy ${fmt(info.overage_pack.credits)} credits for $${info.overage_pack.usd}`}
            </button>
            {buyError && <div style={{ color: "var(--color-error)", fontSize: "0.8rem", marginTop: 4 }}>{buyError}</div>}
          </div>
        </div>
        {level !== "ok" && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: t.bg, color: t.fg, fontSize: "0.86rem" }}>
            {level === "empty"
              ? "You have 0 credits. Audits pause until you top up or the 1st."
              : `Under ${CREDITS_LOW_PCT}% of your monthly allowance. Top up now or wait for the 1st.`}
            {info.plan === "free" && <> Growth gives you far more credits each month.</>}
          </div>
        )}
      </div>
    </>
  );
}
