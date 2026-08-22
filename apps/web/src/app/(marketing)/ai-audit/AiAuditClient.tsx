"use client";

/**
 * AiAuditClient — the interactive AI Audit Stack questionnaire + $49 checkout.
 *
 * Same pattern as InvisibilityTestClient (/test) + KitCheckoutForm (/kit):
 * page.tsx stays a server component (metadata + JSON-LD + hero); all state
 * lives here. The questionnaire is data-driven from GET /api/ai-audit/meta
 * (pains, categories, niches, engines) so catalog growth changes the form
 * with no deploy.
 *
 * Founder rules (2026-08-15): the product is PAID ($49) and EMAIL IS
 * MANDATORY before anything. Step 0 is the email (verified-email prefill +
 * one-click social sign-in, exactly like the free test), then the four
 * questionnaire steps, then "Get my AI stack for $49" → POST
 * /api/ai-audit/checkout → redirect (Stripe, or the dev-unlock delivery URL
 * outside production). The pick is never shown here; it lives on
 * /ai-audit/[token] after payment.
 *
 * The form draft persists in sessionStorage (lib/form-draft) so a social
 * sign-in redirect or a returning visitor never retypes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SocialAuthButtons } from "../../../components/auth/SocialAuthButtons";
import { useVerifiedEmail } from "../../../lib/use-verified-email";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "../../../lib/form-draft";
import { trackEvent } from "../../../lib/track";
import { readAttributionFromLocation } from "../../../lib/campaign-attribution";
import {
  COPY,
  ENGINE_CARDS,
  buildCheckoutPayload,
  canSubmit,
  groupPains,
  isValidEmail,
  painLabel,
  teaserLine,
  type BusinessEngine,
} from "./ai-audit-copy";
import { cardStyle, chipStyle, ghostBtn, inputStyle, primaryBtn } from "./ai-audit-styles";

const DRAFT_KEY = "ai-audit";

interface Meta {
  engines: BusinessEngine[];
  pains: string[];
  categories: string[];
  niches: string[];
  toolCount: number;
  offer?: { priceUsd: number };
  catalog: { source: string; estimatesUnverified: boolean };
}

interface Draft {
  email?: string;
  marketingConsent?: boolean;
  businessType?: string;
  primaryFocus?: string;
  engines?: BusinessEngine[];
  pains?: string[];
  toolsInUseRaw?: string;
  step?: number;
  testId?: string;
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-h3)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--color-text)" }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{hint}</p>
    </div>
  );
}

// Step 0 = email, then business/focus, engines, pains, tools (+ checkout).
const TOTAL_STEPS = 5;

export function AiAuditClient() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState(false);

  // Answers
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [businessType, setBusinessType] = useState("");
  const [primaryFocus, setPrimaryFocus] = useState("");
  const [engines, setEngines] = useState<BusinessEngine[]>([]);
  const [pains, setPains] = useState<string[]>([]);
  const [toolsInUseRaw, setToolsInUseRaw] = useState("");
  const [testId, setTestId] = useState("");
  const [stepError, setStepError] = useState("");
  const [restored, setRestored] = useState(false);

  // Machine state
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [teaser, setTeaser] = useState<{ totalMatched: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-audit/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("meta failed"))))
      .then((data: Meta) => {
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        if (!cancelled) setMetaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Campaign origin (?from= / utm_*) — captured once on mount so the $49
  // checkout POST can say which cold-outreach campaign sold. It rides in a ref
  // (survives the multi-step questionnaire) and the API re-sanitizes it.
  const attributionRef = useRef<Record<string, string> | null>(null);

  // Restore the draft (social sign-in redirect / returning visitor). URL
  // params (testId from the free test) win over the draft.
  useEffect(() => {
    attributionRef.current = readAttributionFromLocation();
    const p = new URLSearchParams(window.location.search);
    const t = p.get("testId");
    if (t) setTestId(t);
    const draft = loadFormDraft<Draft>(DRAFT_KEY);
    if (draft) {
      if (draft.email) setEmail(draft.email);
      if (draft.marketingConsent) setMarketingConsent(true);
      if (draft.businessType) setBusinessType(draft.businessType);
      if (draft.primaryFocus) setPrimaryFocus(draft.primaryFocus);
      if (Array.isArray(draft.engines)) setEngines(draft.engines);
      if (Array.isArray(draft.pains)) setPains(draft.pains);
      if (draft.toolsInUseRaw) setToolsInUseRaw(draft.toolsInUseRaw);
      if (draft.testId && !t) setTestId(draft.testId);
      if (typeof draft.step === "number" && draft.step > 0 && draft.step < TOTAL_STEPS) setStep(draft.step);
    }
    setRestored(true);
  }, []);

  // Persist the draft as the visitor types (cheap; sessionStorage).
  useEffect(() => {
    if (!restored) return;
    saveFormDraft(DRAFT_KEY, { email, marketingConsent, businessType, primaryFocus, engines, pains, toolsInUseRaw, step, testId });
  }, [restored, email, marketingConsent, businessType, primaryFocus, engines, pains, toolsInUseRaw, step, testId]);

  // Prefill the verified email (signed in, or once the OAuth exchange lands).
  useVerifiedEmail((e) => setEmail((prev) => prev || e));

  const painGroups = useMemo(() => (meta ? groupPains(meta.pains) : []), [meta]);

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function goNext() {
    setStepError("");
    if (step === 0 && !isValidEmail(email)) {
      setEmailTouched(true);
      setStepError(email.trim() ? COPY.steps.emailInvalid : COPY.steps.needEmail);
      return;
    }
    if (step === 1 && businessType.trim().length === 0) {
      setStepError(COPY.steps.needBusiness);
      return;
    }
    if (step === 3 && pains.length === 0) {
      setStepError(COPY.steps.needPains);
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }

  // On the last step, ask the API for the honest counts (no pick) so the
  // buyer sees "we matched N tools" next to the $49 button.
  useEffect(() => {
    if (step !== TOTAL_STEPS - 1 || pains.length === 0) return;
    let cancelled = false;
    fetch("/api/ai-audit/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildCheckoutPayload({ email, marketingConsent, businessType, primaryFocus, pains, engines, toolsInUseRaw })
      ),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { teaser?: { totalMatched: number } } | null) => {
        if (!cancelled && data?.teaser) setTeaser({ totalMatched: data.teaser.totalMatched });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function checkout() {
    setStepError("");
    if (!canSubmit({ email, businessType, pains })) {
      setStepError(!isValidEmail(email) ? COPY.steps.needEmail : pains.length === 0 ? COPY.steps.needPains : COPY.steps.needBusiness);
      return;
    }
    if (busy) return;
    setBusy(true);
    setApiError("");
    trackEvent("ai_audit_checkout_created", { has_test: Boolean(testId), pains: pains.length });
    try {
      const res = await fetch("/api/ai-audit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildCheckoutPayload({ email, marketingConsent, businessType, primaryFocus, pains, engines, toolsInUseRaw, testId }),
          // Compact campaign origin (?from= / utm_*) — the API sanitizes again
          // and stores it in the order's answers jsonb + the lead's result.
          ...(attributionRef.current ? { attribution: attributionRef.current } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; code?: string };
      if (res.ok && data.url) {
        clearFormDraft(DRAFT_KEY);
        window.location.href = data.url; // Stripe checkout OR dev-unlock delivery URL
        return;
      }
      setApiError(data.code === "AI_AUDIT_ORDERS_NOT_READY" ? COPY.notReady : data.message || COPY.apiError);
      setBusy(false);
    } catch {
      setApiError(COPY.networkError);
      setBusy(false);
    }
  }

  // ---- Busy (redirecting to checkout) ----
  if (busy) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, alignItems: "center", textAlign: "center", padding: "var(--space-10) var(--space-6)" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--font-size-body)", color: "var(--color-text)" }}>{COPY.steps.submitting}</p>
      </div>
    );
  }

  // ---- Error state ----
  if (apiError) {
    return (
      <div role="alert" style={{ ...cardStyle, borderColor: "#dc2626", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--color-text)" }}>{COPY.errorTitle}</p>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{apiError}</p>
        <button type="button" onClick={() => setApiError("")} style={{ ...primaryBtn(false), alignSelf: "flex-start" }}>
          {COPY.errorRetry}
        </button>
      </div>
    );
  }

  if (metaError) {
    return (
      <div role="alert" style={{ ...cardStyle, borderColor: "#dc2626" }}>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--color-text)" }}>{COPY.errorTitle}</p>
        <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{COPY.apiError}</p>
      </div>
    );
  }

  if (!meta) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, alignItems: "center", padding: "var(--space-8)" }}>
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>Loading the questionnaire.</p>
      </div>
    );
  }

  const nicheSuggestions = meta.niches.slice(0, 8);
  const showEmailError = emailTouched && email.trim().length > 0 && !isValidEmail(email);
  const submitDisabled = !canSubmit({ email, businessType, pains });

  return (
    <div style={cardStyle} id="ai-audit-form">
      <p aria-live="polite" style={{ margin: 0, fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
        Step {step + 1} of {TOTAL_STEPS}
      </p>

      {step === 0 && (
        <>
          <StepHeading title={COPY.steps.emailTitle} hint={COPY.steps.emailHint} />
          <SocialAuthButtons
            caption={COPY.steps.emailSocialCaption}
            onBeforeRedirect={() =>
              saveFormDraft(DRAFT_KEY, { email, marketingConsent, businessType, primaryFocus, engines, pains, toolsInUseRaw, step, testId })
            }
          />
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
              {COPY.steps.emailLabel} <span style={{ color: "#dc2626" }}>*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder={COPY.steps.emailPlaceholder}
              autoComplete="email"
              required
              aria-invalid={showEmailError || undefined}
              style={inputStyle}
            />
          </label>
          {showEmailError && (
            <p role="alert" style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-error)" }}>{COPY.steps.emailInvalid}</p>
          )}
          {/* Marketing opt-in (LGPD/GDPR affirmative consent). Unchecked by
              default; the result email sends regardless. */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              style={{ marginTop: "0.2rem", width: "16px", height: "16px", flexShrink: 0, accentColor: "var(--color-primary)" }}
            />
            <span>{COPY.steps.consentLabel}</span>
          </label>
        </>
      )}

      {step === 1 && (
        <>
          <StepHeading title={COPY.steps.businessTitle} hint={COPY.steps.businessHint} />
          <input
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder={COPY.steps.businessPlaceholder}
            aria-label={COPY.steps.businessTitle}
            autoComplete="organization-title"
            style={inputStyle}
          />
          {nicheSuggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {nicheSuggestions.map((n) => (
                <button key={n} type="button" onClick={() => setBusinessType(n)} aria-pressed={businessType === n} style={chipStyle(businessType === n)}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <StepHeading title={COPY.steps.focusTitle} hint={COPY.steps.focusHint} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {meta.categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setPrimaryFocus((cur) => (cur === cat ? "" : cat))}
                aria-pressed={primaryFocus === cat}
                style={chipStyle(primaryFocus === cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeading title={COPY.steps.enginesTitle} hint={COPY.steps.enginesHint} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
            {ENGINE_CARDS.map((card) => {
              const selected = engines.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setEngines((cur) => toggle(cur, card.id))}
                  aria-pressed={selected}
                  style={{
                    textAlign: "left",
                    border: selected ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    background: selected ? "rgba(39,201,138,0.10)" : "var(--color-surface-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-family)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1)",
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: "var(--font-size-body)", color: selected ? "var(--color-primary)" : "var(--color-text)" }}>{card.title}</span>
                  <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.5 }}>{card.subtitle}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeading title={COPY.steps.painsTitle} hint={COPY.steps.painsHint} />
          {painGroups.map(({ group, pains: slugs }) => (
            <div key={group}>
              <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
                {group}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {slugs.map((slug) => {
                  const selected = pains.includes(slug);
                  return (
                    <button key={slug} type="button" onClick={() => setPains((cur) => toggle(cur, slug))} aria-pressed={selected} style={chipStyle(selected)}>
                      {painLabel(slug)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 4 && (
        <>
          <StepHeading title={COPY.steps.toolsTitle} hint={COPY.steps.toolsHint} />
          <input
            value={toolsInUseRaw}
            onChange={(e) => setToolsInUseRaw(e.target.value)}
            placeholder={COPY.steps.toolsPlaceholder}
            aria-label={COPY.steps.toolsTitle}
            autoComplete="off"
            style={inputStyle}
          />
          <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", background: "var(--color-surface-muted)" }}>
            <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-body-sm)", fontWeight: 700, color: "var(--color-text)" }}>
              {teaser ? teaserLine(teaser.totalMatched) : COPY.hero.priceLine}
            </p>
            <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>{COPY.hero.limit}</p>
          </div>
        </>
      )}

      {stepError && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-error)", fontFamily: "var(--font-family)" }}>
          {stepError}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setStepError("");
            setStep((s) => Math.max(0, s - 1));
          }}
          disabled={step === 0}
          style={{ ...ghostBtn(), visibility: step === 0 ? "hidden" : "visible" }}
        >
          {COPY.steps.back}
        </button>
        {step < TOTAL_STEPS - 1 ? (
          <button type="button" onClick={goNext} style={primaryBtn(false)}>
            {COPY.steps.next}
          </button>
        ) : (
          <button type="button" onClick={checkout} disabled={submitDisabled} style={primaryBtn(submitDisabled)}>
            {COPY.steps.submit}
          </button>
        )}
      </div>
      {step === TOTAL_STEPS - 1 && (
        <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}>{COPY.steps.secure}</p>
      )}
    </div>
  );
}
