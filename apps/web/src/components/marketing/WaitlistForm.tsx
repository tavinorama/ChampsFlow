"use client";

/**
 * WaitlistForm — reusable waitlist signup form
 *
 * Two variants:
 *  - Default (compact=false): full form with name, team size, GDPR checkbox,
 *    CCPA notice — used in the bottom CTA / waitlist section.
 *  - Compact (compact=true): email + button in a single row, GDPR checkbox
 *    beneath in smaller text — used in the hero section.
 *
 * Compliance (hard rules — do NOT remove):
 *  - GDPR: unchecked opt-in checkbox. Pre-ticking is prohibited under GDPR.
 *    Consent is required to send marketing emails.
 *  - CCPA: informational notice always rendered (conservative default).
 *  - Privacy Policy link in consent text.
 *
 * Accessibility:
 *  - All inputs have associated <label> elements (visible or sr-only).
 *  - Errors linked via aria-describedby.
 *  - Success state announced via aria-live="polite".
 *  - Submit button shows "Submitting…" + aria-busy during request.
 */

import { useState, useId } from "react";
import {
  isValidEmail,
  buildPayload,
  type WaitlistPayload,
} from "./waitlist-helpers";

export { isValidEmail, buildPayload };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormState = "idle" | "submitting" | "success" | "error";
type TeamSize = "" | "just_me" | "2_10" | "11_50" | "51_plus";

interface WaitlistFormProps {
  /** If true, renders a compact row layout (email input + button side-by-side) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Shared success state
// ---------------------------------------------------------------------------

function SuccessState({ id }: { id: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      id={id}
      style={{
        padding: "var(--space-6)",
        backgroundColor: "#F0FDF4",
        border: "1px solid var(--color-success)",
        borderRadius: "var(--radius-lg)",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-h3)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-success)",
          fontFamily: "var(--font-family)",
        }}
      >
        Check your email to confirm.
      </p>
      <p
        style={{
          marginTop: "var(--space-2)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-family)",
        }}
      >
        We email you about Ozvor only. Unsubscribe in one click.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WaitlistForm({ compact = false }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [teamSize, setTeamSize] = useState<TeamSize>("");
  const [optedIn, setOptedIn] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const emailId = useId();
  const emailErrorId = useId();
  const nameId = useId();
  const teamSizeId = useId();
  const consentId = useId();
  const successId = useId();
  const globalErrorId = useId();

  function validateForm(): boolean {
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateForm()) return;

    setFormState("submitting");
    setErrorMessage("");

    try {
      const payload = buildPayload(email, name, teamSize, optedIn);
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          data.message ?? "Something went wrong. Please try again."
        );
      }

      setFormState("success");
    } catch (err) {
      setFormState("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  }

  if (formState === "success") return <SuccessState id={successId} />;

  const isSubmitting = formState === "submitting";

  // -------------------------------------------------------------------------
  // Compact variant — hero row layout
  // -------------------------------------------------------------------------

  if (compact) {
    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Join the waitlist"
      >
        {/* Global error */}
        {formState === "error" && (
          <div
            role="alert"
            id={globalErrorId}
            aria-live="assertive"
            style={{
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: "#FEF2F2",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--space-3)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              fontFamily: "var(--font-family)",
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Row: email + submit */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            marginBottom: "var(--space-3)",
          }}
        >
          {/* Visually hidden label — placeholder serves as visual cue */}
          <label
            htmlFor={emailId}
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              clip: "rect(0,0,0,0)",
            }}
          >
            Email address
          </label>

          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            aria-describedby={emailError ? emailErrorId : undefined}
            aria-invalid={emailError ? "true" : "false"}
            disabled={isSubmitting}
            style={{
              flex: 1,
              minWidth: 0,
              height: "48px",
              padding: "0 var(--space-4)",
              fontSize: "var(--font-size-body-sm)",
              fontFamily: "var(--font-family)",
              color: "var(--color-text)",
              backgroundColor: "var(--color-surface)",
              border: `1.5px solid ${emailError ? "var(--color-error)" : "var(--color-border)"}`,
              borderRadius: "var(--radius-md)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            style={{
              height: "48px",
              padding: "0 var(--space-5)",
              backgroundColor: isSubmitting
                ? "var(--color-muted)"
                : "var(--color-primary)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-semibold)",
              fontFamily: "var(--font-family)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "background-color 0.15s, opacity 0.15s",
            }}
          >
            {isSubmitting ? "…" : "Join waitlist"}
          </button>
        </div>

        {/* Email validation error */}
        {emailError && (
          <p
            id={emailErrorId}
            role="alert"
            style={{
              margin: "0 0 var(--space-3) 0",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              fontFamily: "var(--font-family)",
            }}
          >
            {emailError}
          </p>
        )}

        {/* GDPR consent — compact inline version (required by law) */}
        <label
          htmlFor={consentId}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
            cursor: "pointer",
          }}
        >
          <input
            id={consentId}
            type="checkbox"
            name="opted_in"
            checked={optedIn}
            onChange={(e) => setOptedIn(e.target.checked)}
            disabled={isSubmitting}
            style={{
              marginTop: "2px",
              width: "14px",
              height: "14px",
              flexShrink: 0,
              accentColor: "var(--color-primary)",
              cursor: "pointer",
            }}
          />
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--color-muted)",
              fontFamily: "var(--font-family)",
              lineHeight: 1.5,
            }}
          >
            I agree to receive product updates from Ozvor.{" "}
            <a
              href="/privacy-policy"
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
              }}
            >
              Privacy Policy
            </a>
          </span>
        </label>
      </form>
    );
  }

  // -------------------------------------------------------------------------
  // Full variant — bottom CTA
  // -------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Join the waitlist">
      {/* Global error announcement */}
      {formState === "error" && (
        <div
          role="alert"
          id={globalErrorId}
          aria-live="assertive"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "#FEF2F2",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-4)",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-error)",
            fontFamily: "var(--font-family)",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Email field */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label
          htmlFor={emailId}
          style={{
            display: "block",
            fontSize: "var(--font-size-h4)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
          }}
        >
          Email address{" "}
          <span aria-hidden="true" style={{ color: "var(--color-error)" }}>
            *
          </span>
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required="true"
          aria-describedby={emailError ? emailErrorId : undefined}
          aria-invalid={emailError ? "true" : "false"}
          disabled={isSubmitting}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: "48px",
            padding: "0 var(--space-4)",
            fontSize: "var(--font-size-body)",
            fontFamily: "var(--font-family)",
            color: "var(--color-text)",
            backgroundColor: "var(--color-surface-muted)",
            border: `1px solid ${emailError ? "var(--color-error)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-md)",
            outline: "none",
          }}
        />
        {emailError && (
          <p
            id={emailErrorId}
            role="alert"
            style={{
              marginTop: "var(--space-1)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              fontFamily: "var(--font-family)",
            }}
          >
            {emailError}
          </p>
        )}
      </div>

      {/* Name field (optional) */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label
          htmlFor={nameId}
          style={{
            display: "block",
            fontSize: "var(--font-size-h4)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
          }}
        >
          Your name{" "}
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontWeight: "var(--font-weight-normal)",
            }}
          >
            (optional)
          </span>
        </label>
        <input
          id={nameId}
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: "48px",
            padding: "0 var(--space-4)",
            fontSize: "var(--font-size-body)",
            fontFamily: "var(--font-family)",
            color: "var(--color-text)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            outline: "none",
          }}
        />
      </div>

      {/* Team size (optional) */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label
          htmlFor={teamSizeId}
          style={{
            display: "block",
            fontSize: "var(--font-size-h4)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
          }}
        >
          Team size{" "}
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-muted)",
              fontWeight: "var(--font-weight-normal)",
            }}
          >
            (optional)
          </span>
        </label>
        <select
          id={teamSizeId}
          name="team_size"
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value as TeamSize)}
          disabled={isSubmitting}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: "48px",
            padding: "0 var(--space-4)",
            fontSize: "var(--font-size-body)",
            fontFamily: "var(--font-family)",
            color: teamSize ? "var(--color-text)" : "var(--color-muted)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            outline: "none",
            appearance: "none",
          }}
        >
          <option value="">Select team size</option>
          <option value="just_me">Just me</option>
          <option value="2_10">2&ndash;10 people</option>
          <option value="11_50">11&ndash;50 people</option>
          <option value="51_plus">51+ people</option>
        </select>
      </div>

      {/* GDPR consent — unchecked by default (pre-ticking is prohibited) */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <label
          htmlFor={consentId}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            cursor: "pointer",
          }}
        >
          <input
            id={consentId}
            type="checkbox"
            name="opted_in"
            checked={optedIn}
            onChange={(e) => setOptedIn(e.target.checked)}
            disabled={isSubmitting}
            aria-describedby="consent-help"
            style={{
              marginTop: "3px",
              width: "16px",
              height: "16px",
              flexShrink: 0,
              accentColor: "var(--color-primary)",
              cursor: "pointer",
            }}
          />
          <span
            id="consent-help"
            style={{
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              lineHeight: "var(--line-height-body)",
            }}
          >
            I agree to receive product updates and launch news from Organic
            Posts. I can unsubscribe at any time.{" "}
            <a
              href="/privacy-policy"
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
              }}
            >
              Privacy Policy
            </a>
          </span>
        </label>
      </div>

      {/* CCPA notice */}
      <p
        style={{
          marginBottom: "var(--space-4)",
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-family)",
          lineHeight: "var(--line-height-caption)",
        }}
      >
        We collect your email to notify you of the product launch. We do not
        sell your data.{" "}
        <a
          href="/privacy-policy"
          style={{ color: "var(--color-primary)", textDecoration: "underline" }}
        >
          Privacy Policy
        </a>
      </p>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        style={{
          width: "100%",
          height: "var(--min-button-height)",
          backgroundColor: isSubmitting
            ? "var(--color-muted)"
            : "var(--color-primary)",
          color: "var(--color-surface)",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          fontFamily: "var(--font-family)",
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1,
          transition: "background-color 0.15s, opacity 0.15s",
        }}
      >
        {isSubmitting ? "Submitting…" : "Join the waitlist"}
      </button>

      {/* Reassurance */}
      <p
        style={{
          marginTop: "var(--space-3)",
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          textAlign: "center",
          fontFamily: "var(--font-family)",
        }}
      >
        We email you about Ozvor only. Unsubscribe in one click.
      </p>
    </form>
  );
}
