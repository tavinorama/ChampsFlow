"use client";

/**
 * CancelRetentionFlow — in-app cancellation with a COMPLIANT retention flow.
 *
 * Steps: (1) reason survey → (2) save-offer + "talk to us" → (3) confirm.
 *
 * Legal guardrails baked in (FTC click-to-cancel · EU dark-pattern ban · BR CDC):
 *   - Cancellation is reachable in a SHORT, fixed number of clicks — never more
 *     steps than sign-up took.
 *   - The reason survey is OPTIONAL (you can continue without answering).
 *   - The save-offer and "talk to us" are OFFERS, never gates: every step shows
 *     a working "Cancel anyway" / "Confirm cancellation" alongside "Keep my plan".
 *   - There is NO artificial delay/lag anywhere — no timer gating the cancel
 *     button, no forced wait. (A repo source-guard test enforces this.)
 *   - Cancels at period end: the customer keeps the access they already paid for.
 */

import React, { useState } from "react";
import { apiFetch } from "../lib/supabase-browser";

type Step = "survey" | "offer" | "confirm" | "done";

// Friendly reason → Stripe cancellation_details.feedback enum.
const REASONS: { value: string; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "missing_features", label: "Missing a feature I need" },
  { value: "unused", label: "I'm not using it enough" },
  { value: "switched_service", label: "Switched to another tool" },
  { value: "too_complex", label: "Too hard to use" },
  { value: "other", label: "Other" },
];

export function CancelRetentionFlow({
  plan,
  renewalLabel,
  onKeep,
  onCancelled,
}: {
  plan: string;
  renewalLabel: string | null;
  onKeep: () => void;
  onCancelled: (periodEndIso: string | null) => void;
}): React.ReactElement {
  const [step, setStep] = useState<Step>("survey");
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: reason || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(e.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { current_period_end: number | null };
      setStep("done");
      onCancelled(
        data.current_period_end ? new Date(data.current_period_end * 1000).toISOString() : null
      );
    } catch (err) {
      setError(
        "We couldn't cancel right now. Please try again, or email support@ozvor.com and we'll do it for you."
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-flow-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "done") onKeep();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* ---------- Step 1: reason survey (optional) ---------- */}
        {step === "survey" && (
          <>
            <h2 id="cancel-flow-title" style={titleStyle}>Before you go — what's driving this?</h2>
            <p style={mutedStyle}>Optional, but it genuinely helps us improve. Pick one:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {REASONS.map((r) => (
                <label key={r.value} style={radioRowStyle(reason === r.value)}>
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
            {reason === "other" && (
              <textarea
                aria-label="Tell us more"
                placeholder="Tell us more (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={500}
                style={textareaStyle}
              />
            )}
            <div style={rowStyle}>
              <button type="button" onClick={onKeep} style={ghostBtn}>Keep my plan</button>
              <button type="button" onClick={() => setStep("offer")} style={primaryBtn}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* ---------- Step 2: save-offer + talk to us (skippable) ---------- */}
        {step === "offer" && (
          <>
            <h2 id="cancel-flow-title" style={titleStyle}>Can we help before you cancel?</h2>
            <p style={mutedStyle}>
              A 15-minute call with us often fixes what's not working — and it's free.
              You can also keep your plan and pick this up later.
            </p>
            <a
              href="/book"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...primaryBtn, textAlign: "center", textDecoration: "none", display: "block" }}
            >
              Talk to us (book a call)
            </a>
            <div style={rowStyle}>
              <button type="button" onClick={onKeep} style={ghostBtn}>Keep my plan</button>
              <button type="button" onClick={() => setStep("confirm")} style={dangerBtn}>
                Cancel anyway
              </button>
            </div>
          </>
        )}

        {/* ---------- Step 3: confirm ---------- */}
        {step === "confirm" && (
          <>
            <h2 id="cancel-flow-title" style={titleStyle}>Confirm cancellation</h2>
            <p style={mutedStyle}>
              Your <strong style={{ textTransform: "capitalize" }}>{plan}</strong> plan will not
              renew.{renewalLabel ? ` You keep full access until ${renewalLabel}.` : ""} No further
              charges.
            </p>
            {error && <p role="alert" style={errorStyle}>{error}</p>}
            <div style={rowStyle}>
              <button type="button" onClick={onKeep} style={ghostBtn} disabled={submitting}>
                Keep my plan
              </button>
              <button type="button" onClick={() => void confirmCancel()} style={dangerBtn} disabled={submitting}>
                {submitting ? "Cancelling…" : "Confirm cancellation"}
              </button>
            </div>
          </>
        )}

        {/* ---------- Done ---------- */}
        {step === "done" && (
          <>
            <h2 id="cancel-flow-title" style={titleStyle}>Your plan is set to cancel</h2>
            <p style={mutedStyle}>
              {renewalLabel
                ? `You'll keep access until ${renewalLabel}, then move to the Free plan.`
                : "It won't renew. You'll move to the Free plan at period end."}{" "}
              Changed your mind? You can resubscribe anytime.
            </p>
            <div style={rowStyle}>
              <button type="button" onClick={() => onCancelled(null)} style={primaryBtn}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- styles (inline, matching the app's token system) ---
const titleStyle: React.CSSProperties = {
  fontSize: "var(--font-size-h3)", fontWeight: 700, color: "var(--color-text)", margin: 0,
};
const mutedStyle: React.CSSProperties = {
  fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", margin: 0, lineHeight: 1.6,
};
const errorStyle: React.CSSProperties = {
  fontSize: "var(--font-size-body-sm)", color: "var(--color-error)", margin: 0,
};
const rowStyle: React.CSSProperties = {
  display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)",
};
const baseBtn: React.CSSProperties = {
  flex: 1, minHeight: "44px", padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-md)", fontSize: "var(--font-size-body-sm)", fontWeight: 600,
  cursor: "pointer", border: "1px solid transparent",
};
const primaryBtn: React.CSSProperties = {
  ...baseBtn, backgroundColor: "var(--color-primary)", color: "#fff",
};
const ghostBtn: React.CSSProperties = {
  ...baseBtn, backgroundColor: "transparent", color: "var(--color-text)",
  border: "1px solid var(--color-border)",
};
const dangerBtn: React.CSSProperties = {
  ...baseBtn, backgroundColor: "transparent", color: "var(--color-error)",
  border: "1px solid var(--color-error)",
};
function radioRowStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: "var(--space-2)",
    padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)",
    border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
    fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", cursor: "pointer",
  };
}
const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)", fontSize: "var(--font-size-body-sm)",
  fontFamily: "var(--font-family)", resize: "vertical",
};
