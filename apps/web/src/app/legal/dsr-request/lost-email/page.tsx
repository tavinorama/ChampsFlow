/**
 * /legal/dsr-request/lost-email — Lost-Email DSR Escalation Form
 *
 * CI-3/CI-4/CI-5: For users who cannot access their account email.
 * Linked from the callout box on /legal/dsr-request.
 *
 * Submits to POST /api/dsr/lost-email-escalation.
 * Manual verification by privacy team within 5 business days.
 *
 * Fields: account_id, contact_method, explanation
 *
 * Accessibility:
 *   - All inputs labelled, 44px tap targets
 *   - Errors via role="alert"
 *   - WCAG AA contrast
 *
 * UX ref: docs/04-ux.md Screen 07 lost-email callout, Gate 4→5 LOW condition
 */

"use client";

import { useState } from "react";
import Link from "next/link";

type FormState = "idle" | "submitting" | "success" | "error";

export default function LostEmailEscalationPage() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [explanation, setExplanation] = useState("");

  const [accountIdError, setAccountIdError] = useState<string | null>(null);
  const [contactMethodError, setContactMethodError] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;
    setAccountIdError(null);
    setContactMethodError(null);
    setExplanationError(null);

    if (!accountId.trim()) {
      setAccountIdError("Account ID is required.");
      valid = false;
    }

    if (!contactMethod.trim()) {
      setContactMethodError(
        "Please provide a way for us to reach you (e.g., an alternative email address)."
      );
      valid = false;
    }

    if (!explanation.trim() || explanation.trim().length < 10) {
      setExplanationError(
        "Please explain why you cannot access your account email (min 10 characters)."
      );
      valid = false;
    }

    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || formState === "submitting") return;

    setFormState("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/dsr/lost-email-escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId.trim(),
          contact_method: contactMethod.trim(),
          explanation: explanation.trim(),
        }),
      });

      if (res.status === 429) {
        setErrorMessage("Too many requests. Please wait an hour before trying again.");
        setFormState("error");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? "Failed to submit. Please try again.");
        setFormState("error");
        return;
      }

      setFormState("success");
    } catch {
      setErrorMessage("A network error occurred. Please try again.");
      setFormState("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    minHeight: "44px",
    padding: "0 12px",
    border: "1px solid #E5E7EB",
    borderRadius: "8px",
    fontSize: "16px",
    color: "#111827",
    backgroundColor: "#F9FAFB",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: 500,
    color: "#111827",
    marginBottom: "8px",
  };

  const errorTextStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "#DC2626",
    marginTop: "4px",
    marginBottom: 0,
  };

  if (formState === "success") {
    return (
      <main
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          padding: "48px 16px",
          fontFamily: "system-ui, sans-serif",
          color: "#111827",
        }}
      >
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #16A34A",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <h1
            style={{
              fontSize: "20px",
              fontWeight: "600",
              color: "#166534",
              marginTop: 0,
              marginBottom: "8px",
            }}
          >
            Escalation received
          </h1>
          <p style={{ fontSize: "15px", color: "#166534", margin: 0, lineHeight: "1.5" }}>
            Our privacy team will manually verify your identity within{" "}
            <strong>5 business days</strong> and contact you via the method you
            provided.
          </p>
        </div>

        <Link
          href="/legal/dsr-request"
          style={{
            display: "inline-block",
            marginTop: "24px",
            fontSize: "14px",
            color: "#2563EB",
            textDecoration: "underline",
          }}
        >
          ← Back to data request form
        </Link>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "48px 16px",
        fontFamily: "system-ui, sans-serif",
        color: "#111827",
      }}
    >
      <Link
        href="/legal/dsr-request"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "#6B7280",
          textDecoration: "none",
          fontSize: "14px",
          marginBottom: "24px",
        }}
      >
        <span aria-hidden="true">&larr;</span> Data request form
      </Link>

      <h1
        style={{
          fontSize: "24px",
          fontWeight: "700",
          marginTop: 0,
          marginBottom: "8px",
        }}
      >
        Lost Email Escalation
      </h1>

      <p
        style={{
          fontSize: "15px",
          color: "#374151",
          marginBottom: "24px",
          lineHeight: "1.5",
        }}
      >
        Use this form if you can no longer access the email address associated
        with your Ozvor account. Our privacy team will manually verify
        your identity within <strong>5 business days</strong>.
      </p>

      {/* Informational callout */}
      <div
        role="note"
        style={{
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "24px",
          fontSize: "14px",
          color: "#1E40AF",
          lineHeight: "1.5",
        }}
      >
        <strong>Tip:</strong> Your account ID can be found in any prior email
        from Ozvor (e.g., welcome email, billing receipts).
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Account ID */}
        <div style={{ marginBottom: "16px" }}>
          <label htmlFor="lost-account-id" style={labelStyle}>
            Account ID <span aria-hidden="true">*</span>
          </label>
          <input
            id="lost-account-id"
            type="text"
            autoComplete="off"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g., user_abc123 or your registered email"
            required
            aria-describedby={accountIdError ? "lost-account-id-error" : undefined}
            aria-invalid={accountIdError ? "true" : undefined}
            style={{
              ...inputStyle,
              borderColor: accountIdError ? "#DC2626" : "#E5E7EB",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #2563EB";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          />
          {accountIdError && (
            <p id="lost-account-id-error" role="alert" style={errorTextStyle}>
              {accountIdError}
            </p>
          )}
        </div>

        {/* Contact method */}
        <div style={{ marginBottom: "16px" }}>
          <label htmlFor="lost-contact-method" style={labelStyle}>
            How should we contact you? <span aria-hidden="true">*</span>
          </label>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 8px 0" }}>
            Provide an alternative email address or other secure contact method.
          </p>
          <input
            id="lost-contact-method"
            type="text"
            autoComplete="email"
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value)}
            placeholder="e.g., alternative@email.com"
            required
            aria-describedby={contactMethodError ? "lost-contact-error" : undefined}
            aria-invalid={contactMethodError ? "true" : undefined}
            style={{
              ...inputStyle,
              borderColor: contactMethodError ? "#DC2626" : "#E5E7EB",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #2563EB";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          />
          {contactMethodError && (
            <p id="lost-contact-error" role="alert" style={errorTextStyle}>
              {contactMethodError}
            </p>
          )}
        </div>

        {/* Explanation */}
        <div style={{ marginBottom: "24px" }}>
          <label htmlFor="lost-explanation" style={labelStyle}>
            Explain your situation <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="lost-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Briefly explain why you cannot access your account email…"
            rows={4}
            maxLength={2000}
            required
            aria-describedby={explanationError ? "lost-explanation-error" : "lost-explanation-hint"}
            aria-invalid={explanationError ? "true" : undefined}
            style={{
              display: "block",
              width: "100%",
              minHeight: "100px",
              padding: "8px 12px",
              border: `1px solid ${explanationError ? "#DC2626" : "#E5E7EB"}`,
              borderRadius: "8px",
              fontSize: "16px",
              color: "#111827",
              backgroundColor: "#F9FAFB",
              boxSizing: "border-box",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #2563EB";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          />
          <p
            id="lost-explanation-hint"
            style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px", marginBottom: 0 }}
          >
            {explanation.length} / 2000 characters
          </p>
          {explanationError && (
            <p id="lost-explanation-error" role="alert" style={errorTextStyle}>
              {explanationError}
            </p>
          )}
        </div>

        {/* Error banner */}
        {formState === "error" && errorMessage && (
          <div
            role="alert"
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #DC2626",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "16px",
              fontSize: "14px",
              color: "#DC2626",
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={formState === "submitting"}
          aria-busy={formState === "submitting"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minHeight: "48px",
            backgroundColor: formState === "submitting" ? "#9CA3AF" : "#2563EB",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "600",
            fontFamily: "inherit",
            cursor: formState === "submitting" ? "not-allowed" : "pointer",
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = "2px solid #2563EB";
            e.currentTarget.style.outlineOffset = "2px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = "none";
          }}
        >
          {formState === "submitting" ? "Submitting…" : "Submit Escalation"}
        </button>
      </form>
    </main>
  );
}
