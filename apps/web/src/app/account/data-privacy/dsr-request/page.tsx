/**
 * /account/data-privacy/dsr-request — Authenticated DSR Intake Form
 *
 * CI-3/CI-4/CI-5: Data Subject Request intake for authenticated users.
 * Pre-fills email from user session (attempts to read via /api/dpa/status).
 *
 * Flow:
 *   1. User selects request type (radio: 5 options)
 *   2. Confirms/edits email, optional name
 *   3. Submit → POST /api/dsr/intake → receives verification_token + request_id
 *   4. OTP entry form shown → POST /api/dsr/verify → confirmed state
 *
 * Accessibility:
 *   - All radios labelled, 44px tap targets
 *   - OTP input: autocomplete="one-time-code", inputmode="numeric", pattern="[0-9]*"
 *   - Error messages announced via role="alert"
 *   - Focus management: focus moves to OTP input after intake success
 *   - WCAG AA contrast on all interactive elements
 *
 * UX ref: docs/04-ux.md Screen 07, §5 CI-3
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BottomNav } from "../../../../components/BottomNav";

type DsrRequestType =
  | "access"
  | "correction"
  | "restriction"
  | "erasure"
  | "portability";

const REQUEST_TYPE_OPTIONS: { value: DsrRequestType; label: string }[] = [
  { value: "access", label: "Request my data (Access)" },
  { value: "correction", label: "Correct my data" },
  { value: "restriction", label: "Restrict processing of my data" },
  { value: "erasure", label: "Delete my account and data" },
  { value: "portability", label: "Download my data (Portability)" },
];

type PageStep = "form" | "otp" | "confirmed";

interface IntakeResult {
  request_id: string;
  verification_token: string;
  status: string;
}

export default function AuthDsrRequestPage() {
  const [step, setStep] = useState<PageStep>("form");

  // Form state
  const [requestType, setRequestType] = useState<DsrRequestType>("access");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // OTP step
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [otp, setOtp] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill email for authenticated users
  useEffect(() => {
    void (async () => {
      try {
        // Try to get user email from a profile endpoint if available
        // For v1, the DPA status response doesn't include email; skip silently.
        const res = await fetch("/api/dpa/status", { credentials: "include" });
        if (!res.ok) return;
        // Email not available from this endpoint; user must type it.
      } catch {
        // Not critical — user can type email
      }
    })();
  }, []);

  // Focus OTP input when step changes to 'otp'
  useEffect(() => {
    if (step === "otp" && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  function validateForm(): boolean {
    setEmailError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("A valid email address is required.");
      return false;
    }
    return true;
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    if (formSubmitting) return;

    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/dsr/intake", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          request_type: requestType,
        }),
      });

      if (res.status === 429) {
        setFormError(
          "Too many requests. Please wait an hour before submitting again."
        );
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFormError(data.error ?? "Failed to submit request. Please try again.");
        return;
      }

      const data = (await res.json()) as IntakeResult;
      setIntakeResult(data);
      setStep("otp");
    } catch {
      setFormError("A network error occurred. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || !/^\d{6}$/.test(otp.trim())) {
      setOtpError("Please enter the 6-digit code from your email.");
      return;
    }
    if (otpSubmitting || !intakeResult) return;

    setOtpSubmitting(true);
    setOtpError(null);

    try {
      const res = await fetch("/api/dsr/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: intakeResult.request_id,
          otp: otp.trim(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string;
          code?: string;
          attempts_remaining?: number;
        };

        if (typeof data.attempts_remaining === "number") {
          setAttemptsRemaining(data.attempts_remaining);
        }

        if (data.code === "OTP_INVALIDATED") {
          setOtpError(
            "Too many incorrect attempts. Please submit a new request."
          );
          return;
        }

        if (data.code === "OTP_EXPIRED") {
          setOtpError("Your code has expired. Please submit a new request.");
          return;
        }

        setOtpError(data.error ?? "Invalid code. Please try again.");
        return;
      }

      setStep("confirmed");
    } catch {
      setOtpError("A network error occurred. Please try again.");
    } finally {
      setOtpSubmitting(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-4) 80px var(--space-4)",
      }}
    >
      {/* Back nav */}
      <Link
        href="/account/data-privacy"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "var(--color-muted)",
          textDecoration: "none",
          fontSize: "var(--font-size-body-sm)",
          marginBottom: "var(--space-6)",
        }}
      >
        <span aria-hidden="true">&larr;</span> Data &amp; Privacy
      </Link>

      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-text)",
          marginTop: 0,
          marginBottom: "var(--space-6)",
        }}
      >
        Data Subject Request
      </h1>

      {/* ------------------------------------------------------------------ */}
      {/* Step 1: Form                                                         */}
      {/* ------------------------------------------------------------------ */}
      {step === "form" && (
        <form onSubmit={(e) => void handleFormSubmit(e)} noValidate>
          {/* Request type */}
          <fieldset
            style={{
              border: "none",
              padding: 0,
              margin: "0 0 var(--space-6) 0",
            }}
          >
            <legend
              style={{
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                marginBottom: "var(--space-3)",
                display: "block",
                width: "100%",
              }}
            >
              Request type <span aria-hidden="true">*</span>
            </legend>

            {REQUEST_TYPE_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  minHeight: "44px",
                  padding: "var(--space-2) 0",
                  cursor: "pointer",
                  fontSize: "var(--font-size-body)",
                  color: "var(--color-text)",
                }}
              >
                <input
                  type="radio"
                  name="request_type"
                  value={value}
                  checked={requestType === value}
                  onChange={() => setRequestType(value)}
                  style={{
                    width: "18px",
                    height: "18px",
                    accentColor: "var(--color-primary)",
                    flexShrink: 0,
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>

          {/* Email */}
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              htmlFor="dsr-email"
              style={{
                display: "block",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                marginBottom: "var(--space-2)",
              }}
            >
              Your email <span aria-hidden="true">*</span>
            </label>
            <input
              id="dsr-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              aria-describedby={emailError ? "dsr-email-error" : undefined}
              aria-invalid={emailError ? "true" : undefined}
              style={{
                display: "block",
                width: "100%",
                minHeight: "44px",
                padding: "0 var(--space-3)",
                border: `1px solid ${emailError ? "var(--color-error)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body)",
                color: "var(--color-text)",
                backgroundColor: "var(--color-surface-muted)",
                boxSizing: "border-box",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            />
            {emailError && (
              <p
                id="dsr-email-error"
                role="alert"
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-error)",
                  marginTop: "var(--space-1)",
                  marginBottom: 0,
                }}
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Name (optional) */}
          <div style={{ marginBottom: "var(--space-6)" }}>
            <label
              htmlFor="dsr-name"
              style={{
                display: "block",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                marginBottom: "var(--space-2)",
              }}
            >
              Your name{" "}
              <span
                style={{ color: "var(--color-muted)", fontWeight: "var(--font-weight-normal)" }}
              >
                (optional)
              </span>
            </label>
            <input
              id="dsr-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              style={{
                display: "block",
                width: "100%",
                minHeight: "44px",
                padding: "0 var(--space-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body)",
                color: "var(--color-text)",
                backgroundColor: "var(--color-surface-muted)",
                boxSizing: "border-box",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            />
          </div>

          {/* Form-level error */}
          {formError && (
            <div
              role="alert"
              style={{
                backgroundColor: "#FEF2F2",
                border: "1px solid var(--color-error)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                marginBottom: "var(--space-4)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-error)",
              }}
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={formSubmitting}
            aria-busy={formSubmitting}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              minHeight: "48px",
              backgroundColor: formSubmitting
                ? "var(--color-muted)"
                : "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-semibold)",
              fontFamily: "var(--font-family)",
              cursor: formSubmitting ? "not-allowed" : "pointer",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
              e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            {formSubmitting ? "Submitting…" : "Submit Request"}
          </button>
        </form>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2: OTP entry                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === "otp" && (
        <form onSubmit={(e) => void handleOtpSubmit(e)} noValidate>
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-6)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body)",
                color: "var(--color-text)",
                marginTop: 0,
                marginBottom: "var(--space-2)",
              }}
            >
              We sent a 6-digit verification code to{" "}
              <strong>{email}</strong>.
            </p>
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                margin: 0,
              }}
            >
              The code expires in 10 minutes. Check your spam folder if you
              don&apos;t see it.
            </p>
          </div>

          <div style={{ marginBottom: "var(--space-6)" }}>
            <label
              htmlFor="dsr-otp"
              style={{
                display: "block",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                marginBottom: "var(--space-2)",
              }}
            >
              Verification code
            </label>
            <input
              id="dsr-otp"
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              aria-describedby={otpError ? "dsr-otp-error" : "dsr-otp-hint"}
              aria-invalid={otpError ? "true" : undefined}
              style={{
                display: "block",
                width: "100%",
                minHeight: "56px",
                padding: "0 var(--space-3)",
                border: `2px solid ${otpError ? "var(--color-error)" : "var(--color-primary)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: "24px",
                letterSpacing: "8px",
                textAlign: "center",
                color: "var(--color-text)",
                backgroundColor: "var(--color-surface-muted)",
                boxSizing: "border-box",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            />
            <p
              id="dsr-otp-hint"
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                marginTop: "var(--space-1)",
                marginBottom: 0,
              }}
            >
              Enter the 6-digit code from your email
              {attemptsRemaining !== null &&
                ` — ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining`}
            </p>
            {otpError && (
              <p
                id="dsr-otp-error"
                role="alert"
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-error)",
                  marginTop: "var(--space-1)",
                  marginBottom: 0,
                }}
              >
                {otpError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={otpSubmitting || otp.length !== 6}
            aria-busy={otpSubmitting}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              minHeight: "48px",
              backgroundColor:
                otpSubmitting || otp.length !== 6
                  ? "var(--color-muted)"
                  : "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-semibold)",
              fontFamily: "var(--font-family)",
              cursor:
                otpSubmitting || otp.length !== 6 ? "not-allowed" : "pointer",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
              e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            {otpSubmitting ? "Verifying…" : "Verify Code"}
          </button>
        </form>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3: Confirmed                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === "confirmed" && (
        <div>
          <div
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: "#F0FDF4",
              border: "1px solid #16A34A",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-6)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                color: "#166534",
                marginTop: 0,
                marginBottom: "var(--space-2)",
              }}
            >
              Request verified
            </p>
            <p
              style={{
                fontSize: "var(--font-size-body-sm)",
                color: "#166534",
                margin: 0,
              }}
            >
              Your {REQUEST_TYPE_OPTIONS.find((o) => o.value === requestType)?.label.toLowerCase()} request
              has been received and verified. We will respond within 30&nbsp;days (GDPR)&nbsp;/
              45&nbsp;days (CCPA). A confirmation email has been sent.
            </p>
          </div>

          <Link
            href="/account/data-privacy"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              minHeight: "48px",
              backgroundColor: "transparent",
              border: "2px solid var(--color-primary)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-primary)",
              textDecoration: "none",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            Back to Data &amp; Privacy
          </Link>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
