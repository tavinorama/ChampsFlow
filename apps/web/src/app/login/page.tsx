"use client";

/**
 * /login — passwordless magic-link sign in + optional social OAuth (TrustIndex AI)
 *
 * Uses Supabase Auth OTP (email magic link). No passwords are handled by this
 * app at any point. On success Supabase emails a link; clicking it returns the
 * user to the destination in ?next= (default /dashboard).
 *
 * Supports a conversion funnel:
 *   /login?plan=growth&next=checkout
 *   → after magic-link click → /account/billing?plan=growth&autocheckout=1
 *
 * Social OAuth (Google, Microsoft) is feature-flagged via NEXT_PUBLIC_AUTH_GOOGLE
 * and NEXT_PUBLIC_AUTH_MICROSOFT. Both use the same buildRedirectTarget helper so
 * the checkout funnel works for all three auth methods.
 *
 * If Supabase is not configured (local/demo build), shows a clear notice
 * instead of throwing.
 */

import { useState, useEffect } from "react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase-browser";
import { Logo } from "../../components/brand/Logo";

// ── Feature flags (baked at Next.js build time) ─────────────────────────────
function isEnvEnabled(val: string | undefined): boolean {
  return val === "true" || val === "1";
}
const showGoogle = isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_GOOGLE);
const showMicrosoft = isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_MICROSOFT);
const showOAuth = showGoogle || showMicrosoft;

// ── Redirect target helper ───────────────────────────────────────────────────
/**
 * Computes the post-login path. Used by both magic-link and OAuth flows so the
 * checkout funnel (?plan=growth&next=checkout) is preserved for every auth method.
 */
function buildRedirectTarget(plan: string | null, nextParam: string | null): string {
  if (nextParam === "checkout" && plan) {
    return `/account/billing?plan=${plan}&autocheckout=1`;
  }
  if (nextParam && nextParam.startsWith("/")) {
    return nextParam;
  }
  return "/dashboard";
}

// ── Provider logo SVGs ───────────────────────────────────────────────────────
// Brand colors are intentionally hardcoded — these are provider identity marks,
// not UI surface colors. All UI surface colors must use CSS tokens.
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable={false}>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable={false}>
    <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022"/>
    <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00"/>
    <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF"/>
    <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900"/>
  </svg>
);

// ── Divider ──────────────────────────────────────────────────────────────────
const Divider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-4) 0" }}>
    <div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} />
    <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)", whiteSpace: "nowrap" }}>
      or continue with email
    </span>
    <div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} />
  </div>
);

// ── Page component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [nextParam, setNextParam] = useState<string | null>(null);

  // OAuth state
  const [oauthLoading, setOAuthLoading] = useState<"google" | "azure" | null>(null);
  const [oauthError, setOAuthError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("plan");
      const n = params.get("next");
      if (p === "growth" || p === "agency") setPlan(p);
      if (n) setNextParam(n);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setMessage("");
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${buildRedirectTarget(plan, nextParam)}`
          : undefined;
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleOAuth(provider: "google" | "azure") {
    setOAuthError("");
    setOAuthLoading(provider);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${buildRedirectTarget(plan, nextParam)}`
          : undefined;
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          ...(provider === "azure"
            ? { queryParams: { prompt: "select_account" } }
            : {}),
        },
      });
      if (error) {
        setOAuthLoading(null);
        if (
          error.message?.toLowerCase().includes("provider") ||
          error.message?.toLowerCase().includes("not enabled") ||
          error.message?.toLowerCase().includes("disabled")
        ) {
          setOAuthError("This sign-in method isn't enabled yet. Use the email link below.");
        } else {
          setOAuthError(
            `Couldn't start ${provider === "google" ? "Google" : "Microsoft"} sign-in. Try the email link below.`
          );
        }
      }
      // On success, Supabase redirects the browser — no further action needed.
    } catch {
      setOAuthLoading(null);
      setOAuthError(
        `Couldn't start ${provider === "google" ? "Google" : "Microsoft"} sign-in. Try the email link below.`
      );
    }
  }

  const oauthBtnStyle: React.CSSProperties = {
    width: "100%",
    height: "var(--min-button-height)",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    fontSize: "var(--font-size-body)",
    fontWeight: 500,
    cursor: oauthLoading !== null ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-3)",
    marginBottom: "var(--space-3)",
  };

  return (
    <>
    <style>{`
      .oauth-btn:focus-visible {
        outline: var(--focus-outline-width) solid var(--color-focus-outline);
        outline-offset: var(--focus-outline-offset);
      }
      .oauth-btn:hover:not(:disabled) {
        background-color: var(--color-surface-muted) !important;
      }
    `}</style>
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "var(--space-6)", fontFamily: "var(--font-family)", color: "var(--color-text)",
      backgroundColor: "var(--color-surface-muted)",
    }}>
      <div style={{
        width: "100%", maxWidth: "400px", backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)",
        padding: "var(--space-8)", boxShadow: "var(--shadow-card)",
      }}>
        <a href="/" style={{ textDecoration: "none", display: "inline-block" }} aria-label="TrustIndex AI — home">
          <Logo markSize={28} wordSize="1.0625rem" />
        </a>
        <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-4) 0 var(--space-2) 0" }}>
          Sign in or create your account
        </h1>
        {plan ? (
          <>
            <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-3) 0", lineHeight: 1.6 }}>
              Enter your email &mdash; we&rsquo;ll send a magic link, then take you straight to secure Stripe checkout. About 20 seconds.
            </p>
            <div style={{
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: "var(--color-badge-ai-bg)",
              border: "1px solid var(--color-highlight-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-badge-ai-text)",
              fontWeight: 600,
              marginBottom: "var(--space-4)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}>
              <span aria-hidden="true" style={{ fontSize: "0.9rem" }}>✓</span>
              <span>
                <span style={{ textTransform: "capitalize" }}>{plan}</span>{" "}
                plan &mdash; ${plan === "growth" ? "99" : "249"}/mo &middot; 30-day money-back guarantee
              </span>
            </div>
          </>
        ) : (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-4) 0" }}>
            We&rsquo;ll email you a secure sign-in link. No password needed.
          </p>
        )}

        {!configured ? (
          <div role="note" style={{
            padding: "var(--space-4)", backgroundColor: "var(--color-badge-ai-bg)",
            border: "1px solid var(--color-highlight-border)", borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body-sm)", color: "var(--color-badge-ai-text)", lineHeight: 1.6,
          }}>
            <p style={{ margin: "0 0 var(--space-4) 0" }}>
              Live email sign-in needs a Supabase project (set
              <code style={{ margin: "0 4px" }}>NEXT_PUBLIC_SUPABASE_URL</code> +
              <code style={{ marginLeft: 4 }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>).
              For now, explore the full product in demo mode:
            </p>
            <a href="/dashboard" style={{
              display: "block", textAlign: "center", textDecoration: "none",
              height: "var(--min-button-height)", lineHeight: "var(--min-button-height)",
              backgroundColor: "var(--color-primary)", color: "#fff",
              borderRadius: "var(--radius-md)", fontWeight: 700, fontFamily: "var(--font-family)",
            }}>
              Continue in demo mode →
            </a>
          </div>
        ) : status === "sent" ? (
          <div role="status" aria-live="polite" style={{
            padding: "var(--space-5)", backgroundColor: "var(--color-success-surface)",
            border: "1px solid var(--color-success)", borderRadius: "var(--radius-md)",
            textAlign: "center",
          }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--color-success)" }}>Check your email.</p>
            <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
              We sent a sign-in link to {email}. Open it on this device to continue.
            </p>
          </div>
        ) : (
          <>
            {/* OAuth section — only when Supabase is configured AND at least one provider flag is set */}
            {showOAuth && (
              <div>
                {showGoogle && (
                  <button
                    type="button"
                    className="oauth-btn"
                    aria-label="Continue with Google"
                    aria-busy={oauthLoading === "google"}
                    disabled={oauthLoading !== null}
                    style={oauthBtnStyle}
                    onClick={() => handleOAuth("google")}
                  >
                    <GoogleIcon />
                    {oauthLoading === "google" ? "Signing in…" : "Continue with Google"}
                  </button>
                )}
                {showMicrosoft && (
                  <button
                    type="button"
                    className="oauth-btn"
                    aria-label="Continue with Microsoft"
                    aria-busy={oauthLoading === "azure"}
                    disabled={oauthLoading !== null}
                    style={oauthBtnStyle}
                    onClick={() => handleOAuth("azure")}
                  >
                    <MicrosoftIcon />
                    {oauthLoading === "azure" ? "Signing in…" : "Continue with Microsoft"}
                  </button>
                )}
                {oauthError && (
                  <p role="alert" style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-error)", fontSize: "var(--font-size-caption)" }}>
                    {oauthError}
                  </p>
                )}
                <Divider />
              </div>
            )}

            {/* Email magic-link form — unchanged */}
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="login-email" style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                Email address
              </label>
              <input
                id="login-email" type="email" name="email" autoComplete="email" required
                placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending"}
                style={{
                  width: "100%", boxSizing: "border-box", height: "48px", padding: "0 var(--space-4)",
                  fontSize: "var(--font-size-body)", fontFamily: "var(--font-family)", color: "var(--color-text)",
                  backgroundColor: "var(--color-surface-muted)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)", outline: "none", marginBottom: "var(--space-4)",
                }}
              />
              {status === "error" && (
                <p role="alert" style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-error)", fontSize: "var(--font-size-caption)" }}>
                  {message || "Could not send the link. Please try again."}
                </p>
              )}
              <button type="submit" disabled={status === "sending" || !email.trim()} style={{
                width: "100%", height: "var(--min-button-height)",
                backgroundColor: status === "sending" || !email.trim() ? "var(--color-muted)" : "var(--color-primary)",
                color: "#fff", border: "none", borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body)", fontWeight: 600, fontFamily: "var(--font-family)",
                cursor: status === "sending" || !email.trim() ? "not-allowed" : "pointer",
              }}>
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
    </>
  );
}
