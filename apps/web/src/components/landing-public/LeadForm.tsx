"use client";

/**
 * LeadForm — contact form rendered at the bottom of every public Ozvor
 * Pages page (issue #208, PR-6).
 *
 * Posts to the same-origin proxy route `/api/public/landing/[siteSlug]/lead`
 * (apps/web/src/app/api/public/landing/[siteSlug]/lead/route.ts), which
 * mirrors app/api/test/route.ts's client-IP-preserving forward to the Hono
 * API so the server-side rate limit (8/hour/IP) buckets by the real visitor.
 *
 * Compliance (hard rule — do NOT remove):
 *  - Consent checkbox is REQUIRED and unchecked by default (LGPD Art. 7(I) /
 *    GDPR Art. 6(1)(a) — pre-ticking consent is prohibited).
 *
 * Accessibility:
 *  - All inputs have associated <label> elements.
 *  - Errors linked via aria-describedby; success/error announced via
 *    role="status"/"alert" + aria-live.
 *  - Submit button shows "Sending…" + aria-busy during the request.
 */

import { useId, useState } from "react";
import { buildLeadPayload, isValidLeadEmail } from "./lead-form-helpers";

export { buildLeadPayload, isValidLeadEmail };

type FormState = "idle" | "submitting" | "success" | "error" | "rate_limited";

interface LeadFormProps {
  siteSlug: string;
  /** Accent color for the submit button (from the site's theme, if any). */
  accentColor?: string;
}

export function LeadForm({ siteSlug, accentColor = "#0c7d54" }: LeadFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [emailError, setEmailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const nameId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const phoneId = useId();
  const messageId = useId();
  const consentId = useId();
  const statusId = useId();

  function validate(): boolean {
    if (!isValidLeadEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError("");
    if (!consent) {
      setErrorMessage("Please agree to be contacted before submitting.");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    if (!validate()) {
      setFormState("error");
      return;
    }

    setFormState("submitting");

    try {
      const payload = buildLeadPayload(name, email, phone, message, consent);
      const response = await fetch(`/api/public/landing/${encodeURIComponent(siteSlug)}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        setFormState("rate_limited");
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Something went wrong. Please try again.");
      }

      setFormState("success");
    } catch (err) {
      setFormState("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const isSubmitting = formState === "submitting";

  if (formState === "success") {
    return (
      <section id="lead-form" style={{ maxWidth: "560px", margin: "0 auto", padding: "2.5rem 1.25rem" }}>
        <div
          role="status"
          aria-live="polite"
          id={statusId}
          style={{
            padding: "1.5rem",
            background: "#f0fdf4",
            border: "1px solid #16a34a",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: "#15803d" }}>Thanks — your message was sent.</p>
          <p style={{ marginTop: "0.5rem", margin: "0.5rem 0 0", color: "#3a473f", fontSize: "0.9rem" }}>
            We&rsquo;ll get back to you shortly.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="lead-form" style={{ maxWidth: "560px", margin: "0 auto", padding: "2.5rem 1.25rem" }}>
      <h2 style={{ fontSize: "1.375rem", fontWeight: 800, margin: "0 0 1rem 0" }}>Get in touch</h2>

      {formState === "rate_limited" && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            color: "#b91c1c",
          }}
        >
          Too many submissions right now. Please try again in a little while.
        </div>
      )}

      {formState === "error" && errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            color: "#b91c1c",
          }}
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-label="Contact form">
        <div style={{ marginBottom: "0.85rem" }}>
          <label htmlFor={nameId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Name
          </label>
          <input
            id={nameId}
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            style={inputStyle()}
          />
        </div>

        <div style={{ marginBottom: "0.85rem" }}>
          <label htmlFor={emailId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Email <span aria-hidden="true">*</span>
          </label>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            aria-invalid={emailError ? "true" : "false"}
            aria-describedby={emailError ? emailErrorId : undefined}
            disabled={isSubmitting}
            style={inputStyle(!!emailError)}
          />
          {emailError && (
            <p id={emailErrorId} role="alert" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#dc2626" }}>
              {emailError}
            </p>
          )}
        </div>

        <div style={{ marginBottom: "0.85rem" }}>
          <label htmlFor={phoneId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Phone
          </label>
          <input
            id={phoneId}
            type="tel"
            name="phone"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSubmitting}
            style={inputStyle()}
          />
        </div>

        <div style={{ marginBottom: "0.85rem" }}>
          <label htmlFor={messageId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Message
          </label>
          <textarea
            id={messageId}
            name="message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSubmitting}
            style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor={consentId} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer" }}>
            <input
              id={consentId}
              type="checkbox"
              name="consent"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-required="true"
              disabled={isSubmitting}
              style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0 }}
            />
            <span style={{ fontSize: "0.85rem", color: "#3a473f", lineHeight: 1.5 }}>
              I agree to be contacted about my request.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          style={{
            width: "100%",
            minHeight: "48px",
            background: isSubmitting ? "#9ca3af" : accentColor,
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Sending…" : "Send message"}
        </button>
      </form>
    </section>
  );
}

function inputStyle(hasError = false): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "44px",
    padding: "0.6rem 0.85rem",
    fontSize: "0.95rem",
    border: `1px solid ${hasError ? "#dc2626" : "#d5dfd9"}`,
    borderRadius: "8px",
    outline: "none",
  };
}
