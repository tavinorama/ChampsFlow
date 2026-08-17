"use client";

/**
 * AiAuditTab — the AI Audit Stack inside dashboard-v3 (D2, 2026-08-17).
 *
 * The same 4-step questionnaire as /ai-audit (business + focus, engines,
 * pains, tools) with NO email step: the tenant is signed in. Answers go to
 * POST /api/ai-audit/tenant/assess and the server's access rule decides what
 * comes back:
 *   prime (OrganicPosts won) → the FULL report, unlocked
 *   paid  (growth/agency)    → teaser + $49 with 15% off (coupon env; when the
 *                              env is missing the price is full and we say so)
 *   free                     → teaser + full-price $49 checkout
 * Locked view: blurred skeleton + lock + "Unlock with OrganicPosts" (goes to
 * the Prime tab) + the $49 button (POST /tenant/checkout → Stripe).
 *
 * The last questionnaire per tenant is the audit_log row the route writes;
 * GET /tenant/access returns it as `last`, and the tab re-runs it on open so
 * the result survives a reload without a new table (see routes/ai-audit.ts).
 *
 * Copy: English, no em-dash, short sentences, first-person CTAs. Every number
 * comes from the API; the estimates note prints when the catalog says so.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/supabase-browser";
import { COPY, ENGINE_CARDS, groupPains, painLabel, type BusinessEngine } from "../(marketing)/ai-audit/ai-audit-copy";
import { chipStyle } from "../(marketing)/ai-audit/ai-audit-styles";
import { V3 } from "./v3-styles";

// ---------------------------------------------------------------------------
// Wire types (subset of the API payloads)
// ---------------------------------------------------------------------------

interface Meta {
  engines: BusinessEngine[];
  pains: string[];
  categories: string[];
  niches: string[];
  catalog: { source: string; estimatesUnverified: boolean };
}

interface Access { kind: "prime" | "paid" | "free"; unlocked: boolean; discountPct: number; priceUsd: number; reason: string }
interface Offer { priceUsd: number; discountPct: number; finalPriceUsd: number; couponApplied: boolean; couponMissing: boolean; checkoutPath: string | null }
interface Answers { businessType: string; primaryFocus: string; pains: string[]; engines: BusinessEngine[]; toolsInUse: string[] }

interface AccessPayload {
  access: Access;
  offer: Offer;
  tier: string;
  order: { orderToken: string; deliveredAt: string | null } | null;
  last: { answers: Answers; at: string; access: string | null } | null;
}

interface ToolLite { id: string; name: string; url: string; oneLiner: string; monthlyCostUsd: number; setupEffort: string; impact: string; hoursSavedWeekly: number; category: string }
interface Scored { tool: ToolLite; matchedPains: string[]; quadrant: string; overBudget: boolean }
interface FullReport {
  businessType: string; primaryFocus: string; painSummary: string; outcomeSummary: string; hoursReclaimedWeekly: number;
  matrix: Record<string, Scored[]>; quickWins: Scored[]; recommendedSolutions: Scored[];
  fourDayPlan: Array<{ day: number; tool: ToolLite; action: string }>; whatComesAfter: Scored[];
  financialImpact: { weeklyTimeReturnedHours: number; choresRemoved: number; monthlyNetRoiUsd: number; totalMonthlyToolCostUsd: number; hourlyRateUsd: number };
  topPick: Scored | null; topPickReason: string; empty: boolean;
}
interface Teaser { totalMatched: number; withheldCount: number; painSummary: string; matrixCounts: Record<string, number>; hoursReclaimedWeekly: number; empty: boolean }

interface AssessPayload {
  access: Access; offer: Offer; unlocked: boolean;
  entry?: { pick: Scored | null; reason: string; totalMatched: number; withheldCount: number; empty: boolean };
  report?: FullReport; teaser?: Teaser;
  order?: { orderToken: string } | null;
  catalog: { source: string; estimatesUnverified: boolean };
}

const TOTAL_STEPS = 4;
const fmt = (n: number) => n.toLocaleString("en-US");
const usd = (n: number) => `$${Number.isInteger(n) ? fmt(n) : n.toFixed(2)}`;

function toolsFromRaw(raw: string): string[] {
  return raw.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function AiAuditTab({ onGoPrime }: { onGoPrime: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [access, setAccess] = useState<AccessPayload | null>(null);

  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState("");
  const [primaryFocus, setPrimaryFocus] = useState("");
  const [engines, setEngines] = useState<BusinessEngine[]>([]);
  const [pains, setPains] = useState<string[]>([]);
  const [toolsRaw, setToolsRaw] = useState("");
  const [stepError, setStepError] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssessPayload | null>(null);
  const [apiError, setApiError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch("/api/ai-audit/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("meta"))))
      .then((d: Meta) => { if (alive) setMeta(d); })
      .catch(() => { if (alive) setMetaError(true); });
    apiFetch("/api/ai-audit/tenant/access")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AccessPayload | null) => { if (alive && d) setAccess(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const runAssess = useCallback(async (answers: Answers) => {
    setBusy(true);
    setApiError("");
    try {
      const r = await apiFetch("/api/ai-audit/tenant/assess", { method: "POST", body: JSON.stringify(answers) });
      const d = (await r.json().catch(() => null)) as (AssessPayload & { message?: string }) | null;
      if (!r.ok || !d) { setApiError(d?.message || COPY.apiError); return; }
      setResult(d);
    } catch {
      setApiError(COPY.networkError);
    } finally {
      setBusy(false);
    }
  }, []);

  // Re-run the tenant's last questionnaire on open (persisted in audit_log).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!access || restored) return;
    setRestored(true);
    const last = access.last;
    if (!last) return;
    setBusinessType(last.answers.businessType);
    setPrimaryFocus(last.answers.primaryFocus);
    setEngines(last.answers.engines ?? []);
    setPains(last.answers.pains ?? []);
    setToolsRaw((last.answers.toolsInUse ?? []).join(", "));
    void runAssess(last.answers);
  }, [access, restored, runAssess]);

  const painGroups = useMemo(() => (meta ? groupPains(meta.pains) : []), [meta]);
  const answers = (): Answers => ({ businessType: businessType.trim().slice(0, 120), primaryFocus: primaryFocus.trim().slice(0, 120), pains, engines, toolsInUse: toolsFromRaw(toolsRaw) });

  function toggle<T>(list: T[], item: T): T[] { return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]; }
  function goNext() {
    setStepError("");
    if (step === 0 && !businessType.trim()) { setStepError(COPY.steps.needBusiness); return; }
    if (step === 2 && pains.length === 0) { setStepError(COPY.steps.needPains); return; }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }
  function submit() {
    setStepError("");
    if (!businessType.trim()) { setStepError(COPY.steps.needBusiness); setStep(0); return; }
    if (pains.length === 0) { setStepError(COPY.steps.needPains); setStep(2); return; }
    void runAssess(answers());
  }

  async function checkout() {
    if (checkingOut) return;
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const r = await apiFetch("/api/ai-audit/tenant/checkout", { method: "POST", body: JSON.stringify(answers()) });
      const d = (await r.json().catch(() => ({}))) as { url?: string; message?: string; code?: string };
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setCheckoutError(d.code === "AI_AUDIT_ORDERS_NOT_READY" ? COPY.notReady : d.message || COPY.apiError);
    } catch {
      setCheckoutError(COPY.networkError);
    } finally {
      setCheckingOut(false);
    }
  }

  const frame = result?.access ?? access?.access ?? null;
  const offer = result?.offer ?? access?.offer ?? null;

  return (
    <>
      <AccessStrip access={frame} offer={offer} onGoPrime={onGoPrime} />

      {result ? (
        <ResultView
          result={result}
          onRestart={() => { setResult(null); setStep(0); }}
          onCheckout={() => void checkout()}
          checkingOut={checkingOut}
          checkoutError={checkoutError}
          onGoPrime={onGoPrime}
        />
      ) : busy ? (
        <div style={{ ...V3.card, padding: "var(--space-6)" }} role="status" aria-live="polite">
          <p style={{ margin: 0, fontWeight: 700 }}>{COPY.loading}</p>
        </div>
      ) : metaError ? (
        <div style={{ ...V3.card, padding: "var(--space-6)" }} role="alert">
          <p style={{ margin: 0, fontWeight: 700 }}>{COPY.errorTitle}</p>
          <p style={{ margin: "6px 0 0", color: "var(--color-muted)", fontSize: "0.88rem" }}>{COPY.apiError}</p>
        </div>
      ) : !meta ? (
        <div style={V3.muted}>Loading the questionnaire…</div>
      ) : (
        <div style={{ ...V3.card, padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }} id="ai-audit-tenant-form">
          <p aria-live="polite" style={{ margin: 0, fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
            Step {step + 1} of {TOTAL_STEPS}
          </p>

          {step === 0 && (
            <>
              <StepHeading title={COPY.steps.businessTitle} hint={COPY.steps.businessHint} />
              <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder={COPY.steps.businessPlaceholder} aria-label={COPY.steps.businessTitle} style={V3.input} />
              {meta.niches.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {meta.niches.slice(0, 8).map((n) => (
                    <button key={n} type="button" onClick={() => setBusinessType(n)} aria-pressed={businessType === n} style={chipStyle(businessType === n)}>{n}</button>
                  ))}
                </div>
              )}
              <StepHeading title={COPY.steps.focusTitle} hint={COPY.steps.focusHint} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {meta.categories.map((cat) => (
                  <button key={cat} type="button" onClick={() => setPrimaryFocus((cur) => (cur === cat ? "" : cat))} aria-pressed={primaryFocus === cat} style={chipStyle(primaryFocus === cat)}>{cat}</button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <StepHeading title={COPY.steps.enginesTitle} hint={COPY.steps.enginesHint} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
                {ENGINE_CARDS.map((card) => {
                  const on = engines.includes(card.id);
                  return (
                    <button key={card.id} type="button" onClick={() => setEngines((cur) => toggle(cur, card.id))} aria-pressed={on}
                      style={{ textAlign: "left", border: on ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", background: on ? "rgba(39,201,138,0.10)" : "var(--color-surface-muted)", cursor: "pointer", font: "inherit", display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontWeight: 800, color: on ? "var(--color-primary)" : "var(--color-text)" }}>{card.title}</span>
                      <span style={{ fontSize: "0.84rem", color: "var(--color-muted)", lineHeight: 1.5 }}>{card.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <StepHeading title={COPY.steps.painsTitle} hint={COPY.steps.painsHint} />
              {painGroups.map(({ group, pains: slugs }) => (
                <div key={group}>
                  <p style={{ margin: "0 0 var(--space-2)", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>{group}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    {slugs.map((slug) => {
                      const on = pains.includes(slug);
                      return <button key={slug} type="button" onClick={() => setPains((cur) => toggle(cur, slug))} aria-pressed={on} style={chipStyle(on)}>{painLabel(slug)}</button>;
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <StepHeading title={COPY.steps.toolsTitle} hint={COPY.steps.toolsHint} />
              <input value={toolsRaw} onChange={(e) => setToolsRaw(e.target.value)} placeholder={COPY.steps.toolsPlaceholder} aria-label={COPY.steps.toolsTitle} autoComplete="off" style={V3.input} />
              <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--color-muted)", lineHeight: 1.6 }}>
                {frame?.unlocked
                  ? "Your plan includes the full report. I get the ranked stack, the plan and the ROI."
                  : "You will see how many tools matched. The full stack unlocks with OrganicPosts or the $49 audit."}
              </p>
            </>
          )}

          {stepError && <p role="alert" style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-error)" }}>{stepError}</p>}
          {apiError && <p role="alert" style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-error)" }}>{apiError}</p>}

          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setStepError(""); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0} style={{ ...V3.btnGhost, visibility: step === 0 ? "hidden" : "visible" }}>{COPY.steps.back}</button>
            {step < TOTAL_STEPS - 1
              ? <button type="button" onClick={goNext} style={V3.btnPri}>{COPY.steps.next}</button>
              : <button type="button" onClick={submit} style={V3.btnPri}>{frame?.unlocked ? "Build my AI stack" : "Show my match"}</button>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--color-muted)", lineHeight: 1.6 }}>{hint}</p>
    </div>
  );
}

/** The one-line frame at the top: what this tenant gets and why. */
function AccessStrip({ access, offer, onGoPrime }: { access: Access | null; offer: Offer | null; onGoPrime: () => void }) {
  if (!access || !offer) return null;
  const tone = access.kind === "prime"
    ? { bg: "var(--color-badge-status-active-bg)", fg: "var(--color-badge-status-active-text)" }
    : { bg: "var(--color-surface-muted)", fg: "var(--color-text)" };
  const label = access.kind === "prime" ? "Included in OrganicPosts" : access.kind === "paid" ? (offer.couponApplied ? `${offer.discountPct}% off for subscribers` : "Subscriber") : "Free plan";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "var(--space-4)", fontSize: "0.86rem" }} data-testid={`aiaudit-access-${access.kind}`}>
      <span style={{ ...V3.pill, background: tone.bg, color: tone.fg }}>{label}</span>
      <span style={{ color: "var(--color-muted)" }}>
        {access.kind === "prime"
          ? "The full 9-section report is yours. Run it as often as you like."
          : access.kind === "paid" && offer.couponMissing
            ? `Subscribers get ${access.discountPct}% off. The discount code is not set up yet, so the price is ${usd(offer.priceUsd)} today.`
            : access.kind === "paid"
              ? `Your price: ${usd(offer.finalPriceUsd)} instead of ${usd(offer.priceUsd)}.`
              : `The full audit is ${usd(offer.priceUsd)}, one time. OrganicPosts includes it.`}
      </span>
      {access.kind !== "prime" && (
        <button type="button" onClick={onGoPrime} style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary)", fontWeight: 700, cursor: "pointer", font: "inherit", fontSize: "0.86rem" }}>
          See OrganicPosts →
        </button>
      )}
    </div>
  );
}

function ResultView({ result, onRestart, onCheckout, checkingOut, checkoutError, onGoPrime }: {
  result: AssessPayload; onRestart: () => void; onCheckout: () => void; checkingOut: boolean; checkoutError: string; onGoPrime: () => void;
}) {
  return (
    <>
      {result.unlocked && result.report
        ? <FullReportView report={result.report} estimates={result.catalog.estimatesUnverified} />
        : <LockedView result={result} onCheckout={onCheckout} checkingOut={checkingOut} checkoutError={checkoutError} onGoPrime={onGoPrime} />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
        <button type="button" onClick={onRestart} style={V3.btnGhost}>{COPY.result.restart}</button>
      </div>
      <p style={V3.note}>Every match comes from your answers and our catalog. When we cannot verify a number, we say so.</p>
    </>
  );
}

// ---- Full (prime) --------------------------------------------------------

function ToolRow({ s, first, showPains }: { s: Scored; first: boolean; showPains?: boolean }) {
  return (
    <div style={{ ...V3.actRow, gridTemplateColumns: "1fr auto", borderTop: first ? "none" : "1px solid var(--color-border)" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.96rem" }}>
          <a href={s.tool.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{s.tool.name}</a>
          <span style={{ ...V3.imp, marginLeft: 8, background: "var(--color-surface-muted)", color: "var(--color-muted)" }}>{s.tool.category}</span>
          {s.overBudget && <span style={{ ...V3.imp, marginLeft: 6, background: "var(--color-badge-status-warn-bg)", color: "var(--color-badge-status-warn-text)" }}>over budget</span>}
        </div>
        <div style={V3.actWhy}>{s.tool.oneLiner}</div>
        {showPains && s.matchedPains.length > 0 && (
          <div style={{ ...V3.actWhy, fontSize: "0.78rem" }}>Answers: {s.matchedPains.map(painLabel).join(", ")}</div>
        )}
      </div>
      <div style={{ textAlign: "right", fontSize: "0.82rem", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        <div><b style={{ color: "var(--color-text)" }}>{s.tool.monthlyCostUsd === 0 ? "Free tier" : `${usd(s.tool.monthlyCostUsd)}/mo`}</b></div>
        <div>{fmt(s.tool.hoursSavedWeekly)} h/week · setup {s.tool.setupEffort}</div>
      </div>
    </div>
  );
}

function FullReportView({ report, estimates }: { report: FullReport; estimates: boolean }) {
  const fi = report.financialImpact;
  if (report.empty) {
    return (
      <div style={{ ...V3.card, padding: "var(--space-6)" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 800 }}>{COPY.result.emptyTitle}</h2>
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{COPY.result.emptyBody}</p>
      </div>
    );
  }
  return (
    <div data-testid="aiaudit-full-report">
      <div style={{ ...V3.card, padding: "var(--space-6)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
        <Kpi label="Time back each week" value={`${fmt(fi.weeklyTimeReturnedHours)} h`} />
        <Kpi label="Chores removed" value={fmt(fi.choresRemoved)} />
        <Kpi label="Net return per month" value={usd(Math.round(fi.monthlyNetRoiUsd))} sub={`at ${usd(fi.hourlyRateUsd)}/h, minus ${usd(fi.totalMonthlyToolCostUsd)} of tools`} />
        <Kpi label="Quick wins" value={fmt(report.quickWins.length)} sub={`${fmt(report.hoursReclaimedWeekly)} h/week from these`} />
      </div>
      <p style={{ ...V3.note, marginTop: "var(--space-3)" }}>{report.painSummary} {report.outcomeSummary}</p>

      {report.topPick && (
        <>
          <div style={V3.secH}>Start here <span style={V3.secN}>· the single best pick</span></div>
          <div style={V3.card}><ToolRow s={report.topPick} first showPains /></div>
          <p style={{ ...V3.note, marginTop: 8 }}>{report.topPickReason}</p>
        </>
      )}

      <div style={V3.secH}>Your recommended stack <span style={V3.secN}>· up to 6, ranked</span></div>
      <div style={V3.card}>{report.recommendedSolutions.map((s, i) => <ToolRow key={s.tool.id} s={s} first={i === 0} showPains />)}</div>

      {report.fourDayPlan.length > 0 && (
        <>
          <div style={V3.secH}>Your 4-day plan <span style={V3.secN}>· one quick win a day</span></div>
          <div style={V3.card}>
            {report.fourDayPlan.map((p, i) => (
              <div key={`${p.day}-${p.tool.id}`} style={{ ...V3.actRow, gridTemplateColumns: "auto 1fr", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <span style={{ ...V3.imp, background: "var(--color-primary)", color: "#fff" }}>Day {p.day}</span>
                <div><b>{p.tool.name}</b><div style={V3.actWhy}>{p.action}</div></div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={V3.secH}>Impact vs effort <span style={V3.secN}>· where every match landed</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-3)" }}>
        {(["quick-win", "major-project", "fill-in", "ignore"] as const).map((q) => (
          <div key={q} style={{ ...V3.card, padding: "var(--space-4)" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>{q.replace("-", " ")}</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{fmt(report.matrix[q]?.length ?? 0)}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{(report.matrix[q] ?? []).slice(0, 3).map((s) => s.tool.name).join(", ")}</div>
          </div>
        ))}
      </div>

      {report.whatComesAfter.length > 0 && (
        <>
          <div style={V3.secH}>What comes after <span style={V3.secN}>· bigger projects, worth it later</span></div>
          <div style={V3.card}>{report.whatComesAfter.map((s, i) => <ToolRow key={s.tool.id} s={s} first={i === 0} />)}</div>
        </>
      )}
      {estimates && <p style={V3.note}>{COPY.result.estimatesNote}</p>}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>{label}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.76rem", color: "var(--color-muted)" }}>{sub}</div>}
    </div>
  );
}

// ---- Locked (paid / free) -------------------------------------------------

function LockedView({ result, onCheckout, checkingOut, checkoutError, onGoPrime }: {
  result: AssessPayload; onCheckout: () => void; checkingOut: boolean; checkoutError: string; onGoPrime: () => void;
}) {
  const t = result.teaser;
  const offer = result.offer;
  const price = offer.couponApplied ? `${usd(offer.finalPriceUsd)} (${offer.discountPct}% off)` : usd(offer.priceUsd);
  return (
    <div data-testid="aiaudit-locked">
      {t && (
        <div style={{ ...V3.card, padding: "var(--space-6)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
          <Kpi label={COPY.result.pictureMatched} value={fmt(t.totalMatched)} />
          <Kpi label={COPY.result.pictureQuickWins} value={fmt(t.matrixCounts["quick-win"] ?? 0)} />
          <Kpi label={COPY.result.pictureHours} value={`${fmt(t.hoursReclaimedWeekly)} h`} />
        </div>
      )}
      {t && <p style={{ ...V3.note, marginTop: "var(--space-3)" }}>{t.painSummary}</p>}

      <div style={{ position: "relative", marginTop: "var(--space-4)" }}>
        {/* Blurred skeleton: real structure, no real names. Nothing here is data. */}
        <div aria-hidden="true" style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", opacity: 0.6 }}>
          <div style={V3.secH}>Your recommended stack</div>
          <div style={V3.card}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ ...V3.actRow, gridTemplateColumns: "1fr auto", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                <div><div style={{ height: 14, width: `${40 + i * 12}%`, background: "var(--color-border)", borderRadius: 6 }} /><div style={{ height: 10, width: "70%", background: "var(--color-border)", borderRadius: 6, marginTop: 8 }} /></div>
                <div style={{ height: 14, width: 60, background: "var(--color-border)", borderRadius: 6 }} />
              </div>
            ))}
          </div>
          <div style={V3.secH}>Your 4-day plan</div>
          <div style={{ ...V3.card, height: 120 }} />
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)" }}>
          <div style={{ ...V3.card, padding: "var(--space-6)", maxWidth: 440, textAlign: "center", boxShadow: "var(--shadow-modal, var(--shadow-card))" }}>
            <div aria-hidden="true" style={{ fontSize: "1.6rem" }}>🔒</div>
            <h3 style={{ margin: "6px 0 4px", fontSize: "1.05rem", fontWeight: 800 }}>The ranked stack, the plan and the ROI are locked</h3>
            <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-muted)", fontSize: "0.86rem", lineHeight: 1.6 }}>
              {t && t.withheldCount > 0 ? `${fmt(t.totalMatched)} tools matched. The full audit ranks all of them and builds your plan.` : "The full audit ranks every match and builds your plan."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={onGoPrime} style={V3.btnPri}>Unlock with OrganicPosts</button>
              <button type="button" onClick={onCheckout} disabled={checkingOut} style={{ ...V3.btnGhost, cursor: checkingOut ? "wait" : "pointer" }}>
                {checkingOut ? "Opening checkout…" : `Get my full audit for ${price}`}
              </button>
            </div>
            {offer.couponMissing && <p style={{ margin: "8px 0 0", fontSize: "0.76rem", color: "var(--color-muted)" }}>Your subscriber discount is not set up yet. Full price applies today.</p>}
            {checkoutError && <p role="alert" style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--color-error)" }}>{checkoutError}</p>}
            {result.order && <p style={{ margin: "8px 0 0", fontSize: "0.78rem" }}><a href={`/ai-audit/${result.order.orderToken}`} style={{ color: "var(--color-primary)", fontWeight: 700 }}>Open my paid result →</a></p>}
          </div>
        </div>
      </div>
    </div>
  );
}
