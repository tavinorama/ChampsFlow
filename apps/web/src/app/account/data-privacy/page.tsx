/**
 * /account/data-privacy — Account > Data & Privacy
 *
 * CI-2: CCPA Privacy Controls for authenticated users.
 * Screen 06 from docs/04-ux.md §3.
 *
 * Sections:
 *   1. Your Privacy Rights
 *      - "Do Not Sell or Share" button → /account/data-privacy/do-not-sell
 *      - "Limit Use of Sensitive Personal Information" toggle
 *        (calls GET + POST /api/ccpa/limit-sensitive-pi)
 *
 *   2. AI & Automation
 *      - "About the AI we use" link → /privacy-policy#ai
 *      - "Anthropic SB-942 disclosure ↗" external link
 *
 *   3. Data Subject Requests (stub section — CI-3/4/5 implement these)
 *      Access | Correct | Restrict | Delete | Portability buttons
 *
 * Toggle behavior:
 *   - Default OFF (no limitation). DB default is FALSE.
 *   - When ON: banner shown "Sensitive PI limited — analytics features disconnected"
 *   - Persists across page reloads (fetched from GET /api/ccpa/limit-sensitive-pi)
 *
 * Accessibility:
 *   - Toggle: role="switch" aria-checked
 *   - All buttons: 44px minimum tap target
 *   - Focus visible on all interactive elements
 *
 * UX ref: docs/04-ux.md Screen 06, §6 CI-2
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type LoadState = "loading" | "loaded" | "error";

export default function DataPrivacyPage() {
  const [toggleState, setToggleState] = useState<LoadState>("loading");
  const [limitSensitivePi, setLimitSensitivePi] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Load current toggle state
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ccpa/limit-sensitive-pi", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load settings");
        const data = (await res.json()) as { limit_sensitive_pi: boolean };
        setLimitSensitivePi(data.limit_sensitive_pi ?? false);
        setToggleState("loaded");
      } catch {
        setToggleState("error");
      }
    })();
  }, []);

  async function handleToggle() {
    if (toggleLoading) return;

    const newValue = !limitSensitivePi;
    setToggleLoading(true);
    setToggleError(null);

    try {
      const res = await fetch("/api/ccpa/limit-sensitive-pi", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newValue }),
      });

      if (res.status === 429) {
        setToggleError("Too many changes. Please wait an hour.");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update setting");
      }

      const data = (await res.json()) as { limit_sensitive_pi: boolean };
      setLimitSensitivePi(data.limit_sensitive_pi);
    } catch (err) {
      setToggleError(
        err instanceof Error ? err.message : "Failed to update setting. Try again."
      );
    } finally {
      setToggleLoading(false);
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
      {/* Header */}
      <Link
        href="/account"
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
        <span aria-hidden="true">&larr;</span> Account
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
        Data &amp; Privacy
      </h1>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Your Privacy Rights                                       */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="privacy-rights-heading"
        style={{ marginBottom: "var(--space-6)" }}
      >
        <h2
          id="privacy-rights-heading"
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginTop: 0,
            marginBottom: "var(--space-4)",
          }}
        >
          Your Privacy Rights
        </h2>

        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {/* Do Not Sell row */}
          <div
            style={{
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <p
              style={{
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                margin: "0 0 var(--space-1) 0",
              }}
            >
              Do Not Sell or Share My Personal Information
            </p>
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                margin: "0 0 var(--space-3) 0",
                lineHeight: "var(--line-height-body)",
              }}
            >
              California residents can opt out of the sale and sharing of their
              personal information.
            </p>
            <Link
              href="/account/data-privacy/do-not-sell"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "var(--min-tap-target)",
                padding: "0 var(--space-4)",
                backgroundColor: "transparent",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-primary)",
                textDecoration: "none",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                fontFamily: "var(--font-family)",
                outline: "none",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                (e.currentTarget as HTMLElement).style.outlineOffset = `var(--focus-outline-offset)`;
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.outline = "none";
              }}
            >
              Submit opt-out request
            </Link>
          </div>

          {/* Limit Sensitive PI toggle row */}
          <div style={{ padding: "var(--space-4)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: "var(--font-size-body)",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-1) 0",
                  }}
                >
                  Limit Use of Sensitive Personal Information
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    margin: 0,
                    lineHeight: "var(--line-height-body)",
                  }}
                >
                  When enabled, your connected account tokens are used only for
                  scheduling and publishing — no analytics enrichment or
                  third-party sharing.
                </p>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={limitSensitivePi}
                aria-label="Limit use of sensitive personal information"
                disabled={toggleState === "loading" || toggleLoading}
                onClick={() => void handleToggle()}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  width: "52px",
                  height: "28px",
                  borderRadius: "14px",
                  border: "none",
                  cursor:
                    toggleState === "loading" || toggleLoading
                      ? "not-allowed"
                      : "pointer",
                  backgroundColor: limitSensitivePi
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                  transition: "background-color 0.2s",
                  flexShrink: 0,
                  outline: "none",
                  padding: 0,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                  e.currentTarget.style.outlineOffset = `var(--focus-outline-offset)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = "none";
                }}
              >
                {/* Thumb */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                    left: limitSensitivePi ? "27px" : "3px",
                  }}
                />
                {/* Screen-reader label */}
                <span className="sr-only">
                  {limitSensitivePi ? "On" : "Off"}
                </span>
              </button>
            </div>

            {/* Toggle error */}
            {toggleError && (
              <p
                role="alert"
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-error)",
                  marginTop: "var(--space-2)",
                  marginBottom: 0,
                }}
              >
                {toggleError}
              </p>
            )}

            {/* Sensitive PI limited banner */}
            {limitSensitivePi && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: "var(--space-3)",
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-2) var(--space-3)",
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-badge-ai-text)",
                  lineHeight: "var(--line-height-body)",
                }}
              >
                Sensitive PI limited — analytics features disconnected.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: AI & Automation                                           */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="ai-automation-heading"
        style={{ marginBottom: "var(--space-6)" }}
      >
        <h2
          id="ai-automation-heading"
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginTop: 0,
            marginBottom: "var(--space-4)",
          }}
        >
          AI &amp; Automation
        </h2>

        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <LinkRow
            href="/privacy-policy#ai"
            label="About the AI we use"
          />
          <LinkRow
            href="https://www.anthropic.com/legal/aup"
            label="Anthropic SB-942 disclosure"
            external
            isLast
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Data Subject Requests (CI-3/CI-4/CI-5)                  */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="dsr-heading">
        <h2
          id="dsr-heading"
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginTop: 0,
            marginBottom: "var(--space-2)",
          }}
        >
          Data Subject Requests
        </h2>

        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            marginTop: 0,
            marginBottom: "var(--space-4)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          Exercise your GDPR and CCPA rights: access, correct, restrict,
          delete, or download your data.
        </p>

        {/* Primary CTA: Submit a Data Request */}
        <Link
          href="/account/data-privacy/dsr-request"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minHeight: "48px",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-4)",
            outline: "none",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLElement).style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
            (e.currentTarget as HTMLElement).style.outlineOffset = `var(--focus-outline-offset)`;
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLElement).style.outline = "none";
          }}
        >
          Submit a Data Request
        </Link>

        {/* Quick-access links per request type */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {[
            { label: "Request my data (Access)", type: "access" },
            { label: "Correct my data", type: "correction" },
            { label: "Restrict processing", type: "restriction" },
            { label: "Delete my account & data", type: "erasure" },
            { label: "Download my data (Portability)", type: "portability" },
          ].map(({ label, type }, idx, arr) => (
            <Link
              key={type}
              href={`/account/data-privacy/dsr-request?type=${type}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--space-4)",
                borderBottom:
                  idx < arr.length - 1
                    ? "1px solid var(--color-border)"
                    : "none",
                color: "var(--color-text)",
                textDecoration: "none",
                fontSize: "var(--font-size-body)",
                minHeight: "var(--min-tap-target)",
                outline: "none",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
                (e.currentTarget as HTMLElement).style.outlineOffset = `var(--focus-outline-offset)`;
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.outline = "none";
              }}
            >
              <span>{label}</span>
              <span aria-hidden="true" style={{ color: "var(--color-muted)" }}>
                ›
              </span>
            </Link>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            marginTop: "var(--space-3)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          Lost access to your account email?{" "}
          <Link
            href="/legal/dsr-request/lost-email"
            style={{ color: "var(--color-primary)" }}
          >
            Use the lost-email escalation form
          </Link>
          {" "}— manual verification within 5 business days.
        </p>
      </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkRow helper
// ---------------------------------------------------------------------------

function LinkRow({
  href,
  label,
  external = false,
  isLast = false,
}: {
  href: string;
  label: string;
  external?: boolean;
  isLast?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-4)",
        borderBottom: isLast ? "none" : "1px solid var(--color-border)",
        color: "var(--color-text)",
        textDecoration: "none",
        fontSize: "var(--font-size-body)",
        minHeight: "var(--min-tap-target)",
        outline: "none",
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.outline = `var(--focus-outline-width) solid var(--color-focus-outline)`;
        (e.currentTarget as HTMLElement).style.outlineOffset = `var(--focus-outline-offset)`;
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.outline = "none";
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ color: "var(--color-muted)" }}>
        {external ? "↗" : "›"}
      </span>
    </a>
  );
}
