/**
 * /legal/dsr-request — Public DSR Intake Form (unauthenticated accessible)
 *
 * CI-3/CI-4/CI-5: Public-facing Data Subject Request form.
 * Accessible without login — for ex-users who can no longer log in.
 * No email pre-fill (no session context).
 *
 * Includes lost-email escalation callout box per docs/04-ux.md Screen 07
 * and Gate 4→5 LOW condition (lost-email DSR edge case).
 *
 * Flow:
 *   1. Select request type, enter email, optional details
 *   2. Submit → POST /api/dsr/intake
 *   3. OTP entry → POST /api/dsr/verify
 *   4. Confirmation
 *
 * Accessibility:
 *   - Radios labelled with legend, 44px tap targets
 *   - OTP: autocomplete="one-time-code", inputmode="numeric"
 *   - Errors via role="alert"
 *   - Focus moves to OTP input on step transition
 *   - WCAG AA contrast
 *
 * UX ref: docs/04-ux.md Screen 07
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type DsrRequestType =
  | "access"
  | "correction"
  | "restriction"
  | "erasure"
  | "portability";

const REQUEST_TYPE_OPTIONS: { value: DsrRequestType; label: string }[] = [
  { value: "access", label: "Access my data" },
  { value: "correction", label: "Correct my data" },
  { value: "restriction", label: "Restrict processing" },
  { value: "erasure", label: "Delete my account and data" },
  { value: "portability", label: "Download my data (Portability)" },
];

type PageStep = "form" | "otp" | "confirmed";

interface IntakeResult {
  request_id: string;
  verification_token: string;
  status: string;
}

export default function PublicDsrRequestPage() {
  const [step, setStep] = useState<PageStep>("form");

  // Form
  const [requestType, setRequestType] = useState<DsrRequestType>("access");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // OTP
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [otp, setOtp] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

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
    if (!validateForm() || formSubmitting) return;

    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/dsr/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          request_type: requestType,
          ...(details.trim() ? { lost_email_explanation: details.trim() } : {}),
        }),
      });

      if (res.status === 429) {
        setFormError("Too many requests. Please wait an hour before trying again.");
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
            "Too many incorrect attempts — your code has been invalidated. Please submit a new request."
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
    <main
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "var(--space-8, 48px) var(--space-4, 16px) var(--space-8, 48px)",
        fontFamily: "var(--font-family, system-ui, sans-serif)",
        color: "var(--color-text, #111827)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-h1, 24px)",
          fontWeight: "var(--font-weight-bold, 700)",
          marginTop: 0,
          marginBottom: "var(--space-6, 24px)",
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
            style={{ border: "none", padding: 0, margin: "0 0 24px 0" }}
          >
            <legend
              style={{
                fontSize: "var(--font-size-body, 16px)",
                fontWeight: "600",
                color: "var(--color-text, #111827)",
                marginBottom: "12px",
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
                  gap: "12px",
                  minHeight: "44px",
                  padding: "4px 0",
                  cursor: "pointer",
                  fontSize: "16px",
                  color: "var(--color-text, #111827)",
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
                    accentColor: "var(--color-primary, #2563EB)",
                    flexShrink: 0,
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>

          {/* Email */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="pub-dsr-email"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "var(--color-text, #111827)",
                marginBottom: "8px",
              }}
            >
              Your email <span aria-hidden="true">*</span>
            </label>
            <input
              id="pub-dsr-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              aria-describedby={emailError ? "pub-dsr-email-error" : undefined}
              aria-invalid={emailError ? "true" : undefined}
              style={{
                display: "block",
                width: "100%",
                minHeight: "44px",
                padding: "0 12px",
                border: `1px solid ${emailError ? "#DC2626" : "#E5E7EB"}`,
                borderRadius: "8px",
                fontSize: "16px",
                color: "#111827",
                backgroundColor: "#F9FAFB",
                boxSizing: "border-box",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2563EB";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            />
            {emailError && (
              <p
                id="pub-dsr-email-error"
                role="alert"
                style={{
                  fontSize: "14px",
                  color: "#DC2626",
                  marginTop: "4px",
                  marginBottom: 0,
                }}
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Details (optional) */}
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="pub-dsr-details"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              Details{" "}
              <span style={{ color: "#6B7280", fontWeight: "400" }}>
                (optional)
              </span>
            </label>
            <textarea
              id="pub-dsr-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what you need…"
              rows={3}
              maxLength={2000}
              style={{
                display: "block",
                width: "100%",
                minHeight: "80px",
                padding: "8px 12px",
                border: "1px solid #E5E7EB",
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
          </div>

          {/* Lost-email escalation callout (Gate 4→5 LOW condition) */}
          <div
            role="note"
            aria-label="Lost email escalation"
            style={{
              backgroundColor: "#FFF7ED",
              border: "1px solid #FED7AA",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#9A3412",
                marginTop: 0,
                marginBottom: "8px",
              }}
            >
              Lost access to your account email?
            </p>
            <p
              style={{
                fontSize: "14px",
                color: "#7C2D12",
                margin: "0 0 8px 0",
                lineHeight: "1.5",
              }}
            >
              If you no longer have access to your account email, contact{" "}
              <a
                href="mailto:privacy@ozvor.com"
                style={{ color: "#2563EB", fontWeight: "500" }}
              >
                privacy@ozvor.com
              </a>{" "}
              with your account ID. We verify identity manually within 5 business days.
            </p>
            <Link
              href="/legal/dsr-request/lost-email"
              style={{
                fontSize: "14px",
                color: "#2563EB",
                fontWeight: "500",
                textDecoration: "underline",
              }}
            >
              Use the lost-email escalation form →
            </Link>
          </div>

          {/* Form-level error */}
          {formError && (
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
              backgroundColor: formSubmitting ? "#9CA3AF" : "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              fontFamily: "inherit",
              cursor: formSubmitting ? "not-allowed" : "pointer",
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
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
            }}
          >
            <p style={{ fontSize: "16px", color: "#111827", marginTop: 0, marginBottom: "8px" }}>
              We sent a 6-digit verification code to <strong>{email}</strong>.
            </p>
            <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
              The code expires in 10 minutes. Check your spam folder if you
              don&apos;t see it.
            </p>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="pub-dsr-otp"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              Verification code
            </label>
            <input
              id="pub-dsr-otp"
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
              aria-describedby={otpError ? "pub-dsr-otp-error" : "pub-dsr-otp-hint"}
              aria-invalid={otpError ? "true" : undefined}
              style={{
                display: "block",
                width: "100%",
                minHeight: "56px",
                padding: "0 12px",
                border: `2px solid ${otpError ? "#DC2626" : "#2563EB"}`,
                borderRadius: "8px",
                fontSize: "24px",
                letterSpacing: "8px",
                textAlign: "center",
                color: "#111827",
                backgroundColor: "#F9FAFB",
                boxSizing: "border-box",
                outline: "none",
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
              id="pub-dsr-otp-hint"
              style={{ fontSize: "14px", color: "#6B7280", marginTop: "4px", marginBottom: 0 }}
            >
              Enter the 6-digit code from your email
              {attemptsRemaining !== null &&
                ` — ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining`}
            </p>
            {otpError && (
              <p
                id="pub-dsr-otp-error"
                role="alert"
                style={{ fontSize: "14px", color: "#DC2626", marginTop: "4px", marginBottom: 0 }}
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
                otpSubmitting || otp.length !== 6 ? "#9CA3AF" : "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              fontFamily: "inherit",
              cursor: otpSubmitting || otp.length !== 6 ? "not-allowed" : "pointer",
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
            {otpSubmitting ? "Verifying…" : "Verify Code"}
          </button>
        </form>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3: Confirmed                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === "confirmed" && (
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
          <p
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#166534",
              marginTop: 0,
              marginBottom: "8px",
            }}
          >
            Request verified
          </p>
          <p style={{ fontSize: "15px", color: "#166534", margin: 0, lineHeight: "1.5" }}>
            Your data request has been received and verified. We will respond
            within 30&nbsp;days (GDPR) / 45&nbsp;days (CCPA). A confirmation
            email has been sent to <strong>{email}</strong>.
          </p>
        </div>
      )}
    </main>
  );
}
