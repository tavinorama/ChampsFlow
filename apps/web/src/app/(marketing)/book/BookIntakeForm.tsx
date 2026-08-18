"use client";

/**
 * BookIntakeForm — the small pre-Calendly form on /book (D3, 2026-08-17).
 *
 * The gap it closes: a visitor could open the calendar and leave, and we never
 * knew they came. Now: email (required) + brand (optional) + an explicit
 * marketing opt-in → POST /api/book/intake (public, rate-limited like
 * /api/test) → lead_capture source='book_call' + identity claim + the
 * book_to_dfy nurture when consented. Then the calendar renders, prefilled.
 *
 * Skips itself for signed-in users (verified Supabase email): they go straight
 * to the calendar and the intake posts silently with their email. Also
 * prefills from ?email=&brand= (the dashboard's "Book my call" CTA).
 *
 * Copy: English, no em-dash, short sentences, first-person CTA.
 */

import { useEffect, useRef, useState } from "react";
import { useVerifiedEmail } from "../../../lib/use-verified-email";
import { trackEvent } from "../../../lib/track";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BookIntakeResult { email: string; brand: string }

async function postIntake(body: { email: string; brand: string; marketing_consent: boolean; from: string | null }): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch("/api/book/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return { ok: true };
    const d = (await r.json().catch(() => ({}))) as { message?: string };
    return { ok: false, message: d.message || "I could not save that. Please try again." };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}

export function BookIntakeForm({ onDone }: { onDone: (r: BookIntakeResult) => void }) {
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("");
  const [consent, setConsent] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const autoDone = useRef(false);

  // URL prefill (dashboard CTA): /book?email=&brand=&from=
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const e = p.get("email"); const b = p.get("brand"); const f = p.get("from");
      if (e) setEmail((prev) => prev || e);
      if (b) setBrand((prev) => prev || b);
      if (f) setFrom(f.slice(0, 60));
    } catch { /* ignore */ }
  }, []);

  // Signed-in users skip the form: post the intake with the verified email and
  // open the calendar. Consent stays false (nothing implied).
  useVerifiedEmail((verified) => {
    if (autoDone.current) return;
    autoDone.current = true;
    setEmail((prev) => prev || verified);
    void postIntake({ email: verified, brand: brand.trim(), marketing_consent: false, from: from ?? "signed_in" }).then(() => {
      trackEvent("book_intake", { signed_in: true });
      onDone({ email: verified, brand: brand.trim() });
    });
  });

  async function submit() {
    setTouched(true);
    setError("");
    const e = email.trim();
    if (!EMAIL_RE.test(e)) { setError("Please enter a valid email address."); return; }
    if (busy) return;
    setBusy(true);
    const r = await postIntake({ email: e, brand: brand.trim(), marketing_consent: consent, from });
    setBusy(false);
    if (!r.ok) { setError(r.message ?? "Please try again."); return; }
    trackEvent("book_intake", { signed_in: false, consent });
    onDone({ email: e, brand: brand.trim() });
  }

  const showEmailError = touched && email.trim().length > 0 && !EMAIL_RE.test(email);
  const input: React.CSSProperties = { width: "100%", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "11px 12px", font: "inherit", fontSize: "var(--font-size-body)" };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-family)" }} data-testid="book-intake-form">
      <div>
        <h3 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800, color: "var(--color-text)", letterSpacing: "-0.02em" }}>First, where do we send the call details?</h3>
        <p style={{ margin: "6px 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>Takes ten seconds. Then you pick a time.</p>
      </div>
      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: 4, color: "var(--color-text)" }}>Your email <span style={{ color: "#dc2626" }}>*</span></span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} placeholder="you@company.com" autoComplete="email" required aria-invalid={showEmailError || undefined} style={input}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
      </label>
      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: 4, color: "var(--color-text)" }}>Your brand <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span></span>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Acme Plumbing" autoComplete="organization" style={input} />
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.5, cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: "var(--color-primary)" }} />
        <span>Email me a few notes on getting named by AI before the call. No spam, unsubscribe anytime.</span>
      </label>
      {(showEmailError || error) && <p role="alert" style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-error)" }}>{error || "Please enter a valid email address."}</p>}
      <button type="button" onClick={() => void submit()} disabled={busy}
        style={{ background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", padding: "12px 18px", fontWeight: 700, fontSize: "var(--font-size-body)", cursor: busy ? "wait" : "pointer", font: "inherit" }}>
        {busy ? "One moment…" : "Show me the calendar"}
      </button>
      <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center" }}>We use your email to send the call details. Nothing else without your say.</p>
    </div>
  );
}
