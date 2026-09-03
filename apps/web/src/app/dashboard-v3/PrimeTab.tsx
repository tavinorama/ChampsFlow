"use client";

/**
 * PrimeTab — the "OrganicPosts" tab in dashboard-v3 (D3, 2026-08-17).
 *
 * What Prime includes, an unlock/progress panel built from REAL tenant data
 * (GET /api/prime/status), blurred locked previews of what opens with the
 * engagement, and one primary CTA: "Book my call" → /book prefilled with the
 * signed-in email + brand. Nudges (≤1 per session, dismissible, stored
 * client-side + audit_log) are decided by the shared pure rule
 * (@organic-posts/shared prime-nudges) from the same facts.
 *
 * Nothing here invents a number: every line reads the status payload and
 * says "not yet" when a fact is missing.
 */

import { useCallback, useEffect, useState } from "react";
import { pickNudge, type Nudge, type NudgeKind } from "@organic-posts/shared";
import { apiFetch } from "../../lib/supabase-browser";
import { V3 } from "./v3-styles";

interface PrimeStatus {
  organicPosts: { status: "none" | "requested" | "contacted" | "won" | "lost"; sku: string | null; since: string | null };
  brandId: string | null;
  firstAuditDone: boolean;
  competitorsAdded: number;
  actionCardsDone: number;
  visibility: number | null;
  weeklyChange: number | null;
  credits: { balance: number; granted: number } | null;
  tier: string;
}

const DISMISS_KEY = "ozvor.prime.nudge.dismissed";
const SESSION_KEY = "ozvor.prime.nudge.shown";

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[]; } catch { return []; }
}
function writeDismissed(kinds: string[]) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(kinds)); } catch { /* ignore */ }
}
function sessionShown(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}
function markSessionShown() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
}

export function bookHref(email: string | null, brand: string | null, from: string): string {
  const q = new URLSearchParams();
  if (email) q.set("email", email);
  if (brand) q.set("brand", brand);
  q.set("from", from);
  return `/book?${q.toString()}`;
}

/** Fetch the facts once per brand. Shared by the tab and the nudge host. */
export function usePrimeStatus(brandId: string | null): { status: PrimeStatus | null; loading: boolean; reload: () => void } {
  const [status, setStatus] = useState<PrimeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/api/prime/status${brandId ? `?brand=${encodeURIComponent(brandId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PrimeStatus | null) => { if (alive) setStatus(d); })
      .catch(() => { if (alive) setStatus(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [brandId, tick]);
  return { status, loading, reload: () => setTick((t) => t + 1) };
}

// ---------------------------------------------------------------------------
// Nudge host (rendered by the shell, above the tab content, on every tab)
// ---------------------------------------------------------------------------

export function PrimeNudge({ status, email, brandName, onGoPrime }: { status: PrimeStatus | null; email: string | null; brandName: string | null; onGoPrime: () => void }) {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  useEffect(() => {
    if (!status) return;
    const n = pickNudge(
      { visibility: status.visibility, weeklyChange: status.weeklyChange, creditsBalance: status.credits?.balance ?? null, hasOrganicPosts: status.organicPosts.status === "won" },
      { dismissed: readDismissed(), shownThisSession: sessionShown() }
    );
    if (!n) return;
    setNudge(n);
    markSessionShown();
    void apiFetch("/api/prime/nudge", { method: "POST", body: JSON.stringify({ kind: n.kind, action: "shown", brandId: status.brandId }) }).catch(() => {});
  }, [status]);

  const log = useCallback((kind: NudgeKind, action: "dismissed" | "clicked") => {
    void apiFetch("/api/prime/nudge", { method: "POST", body: JSON.stringify({ kind, action, brandId: status?.brandId ?? null }) }).catch(() => {});
  }, [status]);

  if (!nudge) return null;
  return (
    <div role="status" data-testid={`prime-nudge-${nudge.kind}`}
      style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-badge-ai-bg, var(--color-surface-muted))", border: "1px solid var(--color-border)", marginBottom: "var(--space-4)", fontSize: "0.86rem" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>{nudge.title}</b> <span style={{ color: "var(--color-muted)" }}>{nudge.body}</span>
      </div>
      <a href={bookHref(email, brandName, `nudge_${nudge.kind}`)} onClick={() => log(nudge.kind, "clicked")} style={{ ...V3.btnPri, padding: "7px 12px", fontSize: "0.8rem" }}>{nudge.cta}</a>
      <button type="button" onClick={onGoPrime} style={{ ...V3.btnGhost, padding: "6px 10px", fontSize: "0.78rem" }}>What is OrganicPosts?</button>
      <button type="button" aria-label="Dismiss" onClick={() => { writeDismissed([...new Set([...readDismissed(), nudge.kind])]); log(nudge.kind, "dismissed"); setNudge(null); }}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)", font: "inherit", fontSize: "1rem", padding: "0 4px" }}>×</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

const INCLUDES: Array<{ title: string; text: string }> = [
  { title: "We do the work", text: "Our team writes, publishes and fixes. You approve. Nothing posts without you." },
  { title: "Weekly audits, no credit math", text: "Every week we run the audits and read the results for you." },
  { title: "Full analytics", text: "Every engine, every prompt, every competitor, over time." },
  { title: "Full AI Audit Stack", text: "The ranked tool stack, the 4-day plan and the ROI. Included." },
  { title: "Chat with a real person, with an SLA", text: "Ask anything about your visibility. We answer within one business day." },
  { title: "Honest reporting", text: "When a number moves, we tell you why. We never invent a score." },
];

export function PrimeTab({ brandId, brandName, email, onGoTab }: {
  brandId: string | null; brandName: string | null; email: string | null;
  onGoTab: (tab: "overview" | "competitors" | "donext" | "billing" | "aiaudit") => void;
}) {
  const { status, loading } = usePrimeStatus(brandId);
  const won = status?.organicPosts.status === "won";
  const requested = status?.organicPosts.status === "requested" || status?.organicPosts.status === "contacted";
  const href = bookHref(email, brandName, "prime_tab");

  return (
    <>
      <div style={{ ...V3.card, padding: "var(--space-6)", display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "var(--space-6)", alignItems: "center" }} data-testid={`prime-hero-${status?.organicPosts.status ?? "loading"}`}>
        <div>
          <span style={{ ...V3.pill, background: "var(--color-badge-ai-bg, var(--color-surface-muted))", color: "var(--color-accent-ink, var(--color-primary))" }}>OrganicPosts by Ozvor</span>
          <h2 style={{ margin: "10px 0 6px", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {won ? "You are on OrganicPosts. We do the work." : "We do the work. You get named by AI."}
          </h2>
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.92rem", lineHeight: 1.6, maxWidth: "52ch" }}>
            {won
              ? "Your team is on it. Everything below is unlocked. Ask us anything in chat."
              : requested
                ? "We got your request. A real person will reach out. Want to pick a time now?"
                : "A done-for-you plan for brands that want results, not homework. Weekly audits, content, fixes and a person you can talk to."}
          </p>
          {!won && (
            <div style={{ display: "flex", gap: 8, marginTop: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
              <a href={href} style={V3.btnPri} data-testid="prime-book-cta">Book my call</a>
              <a href="/organicposts" style={V3.btnGhost}>See the plan</a>
              <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>20 minutes. No pitch deck.</span>
            </div>
          )}
        </div>
        <ProgressPanel status={status} loading={loading} onGoTab={onGoTab} />
      </div>

      <div style={V3.secH}>What Prime includes</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
        {INCLUDES.map((i) => (
          <div key={i.title} style={{ ...V3.card, padding: "var(--space-4)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.94rem" }}>{won ? "✓ " : ""}{i.title}</div>
            <div style={{ ...V3.actWhy }}>{i.text}</div>
          </div>
        ))}
      </div>

      {!won && (
        <>
          <div style={V3.secH}>What opens with OrganicPosts <span style={V3.secN}>· previews, blurred until you join</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
            <LockedPreview title="Full analytics" hint="Every engine and prompt, over time." onCta={() => onGoTab("overview")} ctaLabel="See my score" />
            <LockedPreview title="Full AI Audit Stack" hint="Ranked stack, 4-day plan, ROI." onCta={() => onGoTab("aiaudit")} ctaLabel="Run the free check" />
            <LockedPreview title="Chat with SLA" hint="A real person, one business day." />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-5)" }}>
            <a href={href} style={{ ...V3.btnPri, padding: "12px 22px", fontSize: "0.95rem" }}>Book my call</a>
          </div>
        </>
      )}

      <p style={V3.note}>
        OrganicPosts is a paid engagement, priced on the call. Everything on this tab reads your real workspace data. When something is not measured yet, it says so.
      </p>
    </>
  );
}

function ProgressPanel({ status, loading, onGoTab }: { status: PrimeStatus | null; loading: boolean; onGoTab: (t: "overview" | "competitors" | "donext" | "billing" | "aiaudit") => void }) {
  if (loading && !status) return <div style={V3.muted}>Reading your workspace…</div>;
  if (!status) return <div style={V3.muted}>I could not read your workspace right now.</div>;
  const needHelp = status.visibility != null && status.visibility < 40;
  const rows: Array<{ label: string; done: boolean; detail: string; go?: () => void }> = [
    { label: "First audit", done: status.firstAuditDone, detail: status.firstAuditDone ? (status.visibility != null ? `Visibility ${Math.round(status.visibility)} of 100` : "done") : "not yet", go: () => onGoTab("overview") },
    { label: "Competitors added", done: status.competitorsAdded > 0, detail: status.competitorsAdded > 0 ? `${status.competitorsAdded} tracked` : "none yet", go: () => onGoTab("competitors") },
    { label: "3 action cards done", done: status.actionCardsDone >= 3, detail: `${Math.min(status.actionCardsDone, 3)} of 3`, go: () => onGoTab("donext") },
  ];
  const doneCount = rows.filter((r) => r.done).length;
  return (
    <div style={{ background: "var(--color-surface-muted)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }} data-testid="prime-progress">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>Your progress</div>
        <div style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{doneCount} of {rows.length}</div>
      </div>
      {rows.map((r) => (
        <button key={r.label} type="button" onClick={r.go} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "8px 0", cursor: "pointer", font: "inherit", color: "var(--color-text)", textAlign: "left", borderTop: "1px solid var(--color-border)" }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, background: r.done ? "var(--color-primary)" : "transparent", border: r.done ? "none" : "2px solid var(--color-border)", color: "#fff", fontSize: "0.72rem", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{r.done ? "✓" : ""}</span>
          <span style={{ flex: 1, fontSize: "0.88rem", fontWeight: 600 }}>{r.label}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{r.detail}</span>
        </button>
      ))}
      {needHelp && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)", fontSize: "0.82rem" }}>
          Visibility under 40. You need help here. That is what OrganicPosts is for.
        </div>
      )}
      {status.credits && status.credits.balance <= 0 && (
        <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--color-muted)" }}>
          0 credits left this month. <button type="button" onClick={() => onGoTab("billing")} style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary)", fontWeight: 700, cursor: "pointer", font: "inherit", fontSize: "0.78rem" }}>Top up</button>
        </div>
      )}
    </div>
  );
}

function LockedPreview({ title, hint, onCta, ctaLabel }: { title: string; hint: string; onCta?: () => void; ctaLabel?: string }) {
  return (
    <div style={{ ...V3.card, padding: "var(--space-4)", position: "relative", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ filter: "blur(5px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>
        <div style={{ height: 12, width: "60%", background: "var(--color-border)", borderRadius: 6 }} />
        <div style={{ height: 40, marginTop: 10, background: "var(--color-border)", borderRadius: 6 }} />
        <div style={{ height: 10, marginTop: 8, width: "80%", background: "var(--color-border)", borderRadius: 6 }} />
        <div style={{ height: 10, marginTop: 6, width: "50%", background: "var(--color-border)", borderRadius: 6 }} />
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 12 }}>
        <div aria-hidden="true">🔒</div>
        <div style={{ fontWeight: 800, fontSize: "0.92rem", marginTop: 4 }}>{title}</div>
        <div style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{hint}</div>
        {onCta && ctaLabel && <button type="button" onClick={onCta} style={{ ...V3.btnGhost, marginTop: 8, padding: "5px 10px", fontSize: "0.76rem" }}>{ctaLabel}</button>}
      </div>
    </div>
  );
}
