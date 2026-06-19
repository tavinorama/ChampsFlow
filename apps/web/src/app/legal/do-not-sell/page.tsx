/**
 * /legal/do-not-sell — Public CCPA Do Not Sell or Share opt-out form
 *
 * CI-2 spec: Public form (works WITHOUT login). CCPA requires no account.
 * Cal. Civ. Code § 1798.135(a) mandates this form be accessible to all visitors.
 *
 * Fields:
 *   - Email (required)
 *   - Name (optional)
 *   - Request type (default: "Do Not Sell or Share My Personal Information")
 *   - Confirmation checkbox (required)
 *   - Submit button
 *
 * On submit:
 *   - POST /api/ccpa/do-not-sell
 *   - On 200: show confirmation message
 *   - On 429: show rate limit message
 *   - On error: show error message with retry
 *
 * Accessibility (WCAG 2.2 AA):
 *   - All form inputs have associated <label>
 *   - Error messages linked via aria-describedby
 *   - Focus management: first error receives focus on validation failure
 *   - keyboard navigable submit
 *
 * UX ref: docs/04-ux.md §6 CI-2
 */

"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Footer } from "../../../components/Footer";

type FormState = "idle" | "submitting" | "success" | "error" | "rate_limited";

export default function DoNotSellPage() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function validate(): boolean {
    let valid = true;

    setEmailError("");
    setConfirmError("");

    if (!email.trim() || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    }

    if (!confirmed) {
      setConfirmError("You must check this box to submit your request.");
      valid = false;
    }

    if (!valid) {
      // Focus first error
      if (!email.trim() || !email.includes("@")) {
        emailRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
    }

    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setFormState("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/ccpa/do-not-sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || undefined,
          request_type: "do_not_sell",
        }),
      });

      if (res.status === 429) {
        setFormState("rate_limited");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Submission failed");
      }

      setFormState("success");
    } catch (err) {
      setFormState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again."
      );
    }
  }

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  if (formState === "success") {
    return (
      <div style={PAGE_CONTAINER_STYLE}>
        <div style={CARD_STYLE}>
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: "48px", display: "block", marginBottom: "16px" }}
            >
              ✓
            </span>
            <h1 style={H1_STYLE}>Request received</h1>
            <p style={BODY_STYLE}>
              We have received your request to opt out of the sale and sharing
              of your personal information. A confirmation email has been sent
              to <strong>{email}</strong>.
            </p>
            <p style={{ ...BODY_STYLE, color: "var(--color-muted)" }}>
              We will process your request within 45 days as required by
              California law. For questions, contact{" "}
              <a
                href="mailto:privacy@trustindexai.com"
                style={{ color: "var(--color-primary)" }}
              >
                privacy@trustindexai.com
              </a>
              .
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Rate limited state
  // -------------------------------------------------------------------------

  if (formState === "rate_limited") {
    return (
      <div style={PAGE_CONTAINER_STYLE}>
        <div style={CARD_STYLE}>
          <div role="alert" style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center" }}>
            <h1 style={H1_STYLE}>Too many requests</h1>
            <p style={BODY_STYLE}>
              You have submitted too many requests from this device. Please
              wait an hour and try again, or contact us directly at{" "}
              <a
                href="mailto:privacy@trustindexai.com"
                style={{ color: "var(--color-primary)" }}
              >
                privacy@trustindexai.com
              </a>
              .
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Form state (idle, submitting, error)
  // -------------------------------------------------------------------------

  return (
    <div style={PAGE_CONTAINER_STYLE}>
      <div style={CARD_STYLE}>
        {/* Back link */}
        <Link
          href="/privacy-policy"
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
          <span aria-hidden="true">&larr;</span>
          Privacy Policy
        </Link>

        <h1 style={H1_STYLE}>
          Do Not Sell or Share My Personal Information
        </h1>

        <p style={BODY_STYLE}>
          California residents have the right under the CCPA/CPRA to opt out
          of the sale and sharing of their personal information. Submit this
          form to exercise that right. You do not need an account.
        </p>

        <p style={{ ...BODY_STYLE, color: "var(--color-muted)" }}>
          Required fields are marked with an asterisk (*).
        </p>

        {/* Global error message */}
        {formState === "error" && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
              marginBottom: "var(--space-4)",
            }}
          >
            <p style={{ color: "var(--color-error)", margin: 0, fontSize: "var(--font-size-body-sm)" }}>
              {errorMessage || "An error occurred. Please try again."}
            </p>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          {/* Email */}
          <div style={FIELD_STYLE}>
            <label htmlFor="email" style={LABEL_STYLE}>
              Email address *
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              aria-describedby={emailError ? "email-error" : undefined}
              aria-invalid={!!emailError}
              required
              style={{
                ...INPUT_STYLE,
                borderColor: emailError ? "var(--color-error)" : "var(--color-border)",
              }}
            />
            {emailError && (
              <p
                id="email-error"
                role="alert"
                style={FIELD_ERROR_STYLE}
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Name (optional) */}
          <div style={FIELD_STYLE}>
            <label htmlFor="name" style={LABEL_STYLE}>
              Full name (optional)
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={INPUT_STYLE}
            />
          </div>

          {/* Request type (informational — locked to do_not_sell for this form) */}
          <div
            style={{
              ...FIELD_STYLE,
              backgroundColor: "var(--color-surface-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
            }}
          >
            <p
              style={{
                margin: "0 0 4px 0",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
              }}
            >
              Request type
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
              }}
            >
              Do Not Sell or Share My Personal Information
            </p>
          </div>

          {/* Confirmation checkbox */}
          <div style={{ ...FIELD_STYLE, marginTop: "var(--space-5)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
              <input
                ref={confirmRef}
                id="confirmed"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  if (confirmError) setConfirmError("");
                }}
                aria-describedby={confirmError ? "confirm-error" : undefined}
                aria-invalid={!!confirmError}
                required
                style={{
                  width: "20px",
                  height: "20px",
                  marginTop: "2px",
                  flexShrink: 0,
                  accentColor: "var(--color-primary)",
                  cursor: "pointer",
                }}
              />
              <label
                htmlFor="confirmed"
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                  lineHeight: "var(--line-height-body)",
                  cursor: "pointer",
                }}
              >
                I confirm that I am a California resident exercising my right
                to opt out of the sale and sharing of my personal information
                under the CCPA/CPRA.
              </label>
            </div>
            {confirmError && (
              <p
                id="confirm-error"
                role="alert"
                style={{ ...FIELD_ERROR_STYLE, marginTop: "var(--space-2)" }}
              >
                {confirmError}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={formState === "submitting"}
            aria-disabled={formState === "submitting"}
            style={{
              width: "100%",
              minHeight: "var(--min-button-height)",
              backgroundColor:
                formState === "submitting"
                  ? "var(--color-muted)"
                  : "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              fontFamily: "var(--font-family)",
              cursor: formState === "submitting" ? "not-allowed" : "pointer",
              marginTop: "var(--space-6)",
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
            {formState === "submitting" ? "Submitting…" : "Submit opt-out request"}
          </button>
        </form>

        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            marginTop: "var(--space-4)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          For other privacy requests (access, deletion, correction, portability),
          visit our{" "}
          <Link href="/privacy/dsr" style={{ color: "var(--color-primary)" }}>
            Data Subject Request form
          </Link>
          . Questions? Email{" "}
          <a
            href="mailto:privacy@trustindexai.com"
            style={{ color: "var(--color-primary)" }}
          >
            privacy@trustindexai.com
          </a>
          .
        </p>
      </div>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const PAGE_CONTAINER_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
};

const CARD_STYLE: React.CSSProperties = {
  flex: 1,
  maxWidth: "480px",
  width: "100%",
  margin: "0 auto",
  padding: "var(--space-6) var(--space-4)",
};

const H1_STYLE: React.CSSProperties = {
  fontSize: "var(--font-size-h1)",
  fontWeight: "var(--font-weight-bold)",
  color: "var(--color-text)",
  marginTop: 0,
  marginBottom: "var(--space-4)",
  lineHeight: "var(--line-height-h1)",
};

const BODY_STYLE: React.CSSProperties = {
  fontSize: "var(--font-size-body)",
  color: "var(--color-text)",
  lineHeight: "var(--line-height-body)",
  marginBottom: "var(--space-4)",
};

const FIELD_STYLE: React.CSSProperties = {
  marginBottom: "var(--space-4)",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "var(--font-size-body-sm)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--color-text)",
  marginBottom: "var(--space-2)",
};

const INPUT_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: "var(--min-tap-target)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3) var(--space-4)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
  backgroundColor: "var(--color-surface)",
  boxSizing: "border-box",
  outline: "none",
};

const FIELD_ERROR_STYLE: React.CSSProperties = {
  fontSize: "var(--font-size-caption)",
  color: "var(--color-error)",
  margin: "var(--space-1) 0 0 0",
};
