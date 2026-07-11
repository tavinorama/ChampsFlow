"use client";

/**
 * WelcomePage — post-payment landing page shown after Stripe Checkout.
 *
 * The success_url from the checkout API is: /welcome?session_id={CHECKOUT_SESSION_ID}
 * We intentionally do NOT call the Stripe API from the client (no secret key
 * on the client). The session_id is read from the URL for context only.
 *
 * This page:
 *  1. Shows a reassuring payment-received confirmation
 *  2. Provides a magic-link sign-in form so the buyer can access their account
 *     with the email they used at checkout.
 *
 * Supabase auth pattern mirrors /login/page.tsx — signInWithOtp + emailRedirectTo.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "../../../lib/supabase-browser";
import { Logo } from "../../../components/brand/Logo";

// ── Inline style helpers ──────────────────────────────────────────────────────

const PAGE_STYLES: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "var(--color-bg)",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
  display: "flex",
  flexDirection: "column",
};

const CONTAINER: React.CSSProperties = {
  maxWidth: "520px",
  width: "100%",
  margin: "0 auto",
  padding: "0 var(--space-4)",
};

const CARD: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-xl)",
  padding: "var(--space-8)",
  boxShadow: "var(--shadow-card)",
};

function CheckIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      focusable={false}
      style={{ display: "block" }}
    >
      <circle cx="28" cy="28" r="28" fill="rgba(39,201,138,0.12)" />
      <circle cx="28" cy="28" r="20" fill="rgba(39,201,138,0.18)" />
      <path
        d="M18 28.5L24.5 35L38 21"
        stroke="#27c98a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Inner page component (reads searchParams) ─────────────────────────────────

export function WelcomePage() {
  const searchParams = useSearchParams();
  // session_id is present for display context; we don't call Stripe with it
  const _sessionId = searchParams.get("session_id");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setErrorMessage("");

    try {
      // Route the magic link through the server-side /auth/callback so the
      // code is exchanged for a session cookie before the browser ever hits
      // /dashboard — mirrors /login/page.tsx. Landing straight on /dashboard
      // with an unexchanged ?code= makes the middleware bounce to /login
      // before the session exists.
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`
          : undefined;

      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setStatus("error");
        setErrorMessage(error.message || "Could not send the link. Please try again.");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  }

  return (
    <div style={PAGE_STYLES}>
      {/* ── Nav bar ── */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border)",
          padding: "var(--space-4) var(--space-4)",
        }}
      >
        <div
          style={{
            maxWidth: "1120px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <a href="/" aria-label="Ozvor — home" style={{ textDecoration: "none", color: "var(--color-text)" }}>
            <Logo markSize={24} wordSize="1rem" />
          </a>
          <Link
            href="/pricing"
            style={{
              fontSize: "var(--font-size-body-sm)",
              fontWeight: 600,
              color: "var(--color-muted)",
              textDecoration: "none",
            }}
          >
            Pricing
          </Link>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        id="main-content"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-10) var(--space-4)",
          gap: "var(--space-6)",
        }}
      >
        <div style={CONTAINER}>
          {/* Success hero */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "var(--space-8)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "var(--space-5)",
              }}
            >
              <CheckIcon />
            </div>
            <h1
              style={{
                fontSize: "clamp(1.5rem, 4vw, 2rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                margin: "0 0 var(--space-3) 0",
                color: "var(--color-text)",
              }}
            >
              Payment received — you&rsquo;re in.
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.7,
                maxWidth: "42ch",
                marginInline: "auto",
              }}
            >
              Your subscription is active. Sign in with the email you used at checkout.
              That gets you into your account.
            </p>
          </div>

          {/* Sign-in card */}
          <div style={CARD}>
            <h2
              style={{
                margin: "0 0 var(--space-2) 0",
                fontSize: "var(--font-size-h2)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Access your account
            </h2>
            <p
              style={{
                margin: "0 0 var(--space-5) 0",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
              }}
            >
              Enter the email you used at checkout. We&rsquo;ll send you a magic sign-in link.
            </p>

            {!configured ? (
              <div
                role="note"
                style={{
                  padding: "var(--space-4)",
                  backgroundColor: "var(--color-badge-ai-bg)",
                  border: "1px solid var(--color-highlight-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-badge-ai-text)",
                  lineHeight: 1.6,
                }}
              >
                <p style={{ margin: "0 0 var(--space-3) 0" }}>
                  Auth is not configured in this environment.
                </p>
                <a
                  href="/dashboard"
                  style={{
                    display: "block",
                    textAlign: "center",
                    textDecoration: "none",
                    height: "var(--min-button-height)",
                    lineHeight: "var(--min-button-height)",
                    background: "linear-gradient(135deg,#27c98a,#0c7d54)",
                    color: "#06140e",
                    borderRadius: "var(--radius-md)",
                    fontWeight: 700,
                    fontFamily: "var(--font-family)",
                  }}
                >
                  Continue in demo mode →
                </a>
              </div>
            ) : status === "sent" ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  padding: "var(--space-5)",
                  backgroundColor: "var(--color-success-surface)",
                  border: "1px solid var(--color-success)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 700, color: "var(--color-success)" }}>
                  Check your inbox.
                </p>
                <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
                  We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <label
                  htmlFor="welcome-email"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 600,
                    marginBottom: "var(--space-2)",
                    color: "var(--color-text)",
                  }}
                >
                  Email address
                </label>
                <input
                  id="welcome-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "sending"}
                  aria-describedby={status === "error" ? "welcome-email-error" : undefined}
                  aria-invalid={status === "error" ? "true" : undefined}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    height: "48px",
                    padding: "0 var(--space-4)",
                    fontSize: "var(--font-size-body)",
                    fontFamily: "var(--font-family)",
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-surface-muted)",
                    border: status === "error"
                      ? "1.5px solid var(--color-error)"
                      : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    outline: "none",
                    marginBottom: "var(--space-4)",
                  }}
                />
                {status === "error" && (
                  <p
                    id="welcome-email-error"
                    role="alert"
                    style={{
                      margin: "calc(var(--space-4) * -1) 0 var(--space-4) 0",
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-error)",
                      fontFamily: "var(--font-family)",
                    }}
                  >
                    {errorMessage || "Could not send the link. Please try again."}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={status === "sending" || !email.trim()}
                  aria-busy={status === "sending"}
                  style={{
                    width: "100%",
                    height: "var(--min-button-height)",
                    background: status === "sending" || !email.trim()
                      ? "var(--color-muted)"
                      : "linear-gradient(135deg,#27c98a,#0c7d54)",
                    color: status === "sending" || !email.trim() ? "#fff" : "#06140e",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-body)",
                    fontWeight: 700,
                    fontFamily: "var(--font-family)",
                    cursor: status === "sending" || !email.trim() ? "not-allowed" : "pointer",
                    boxShadow: status === "sending" || !email.trim()
                      ? "none"
                      : "0 8px 24px rgba(39,201,138,0.28)",
                  }}
                >
                  {status === "sending" ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
            )}

            {/* Footer note */}
            <p
              style={{
                margin: "var(--space-5) 0 0 0",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                textAlign: "center",
              }}
            >
              Already have an account?{" "}
              <Link
                href="/login"
                style={{
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sign in →
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: "var(--space-6) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
          }}
        >
          Questions? Email{" "}
          <a
            href="mailto:support@ozvor.com"
            style={{ color: "var(--color-primary)", textDecoration: "none" }}
          >
            support@ozvor.com
          </a>
          {" · "}
          <Link
            href="/pricing"
            style={{ color: "var(--color-muted)", textDecoration: "none" }}
          >
            Back to pricing
          </Link>
        </p>
      </footer>
    </div>
  );
}
