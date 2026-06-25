"use client";

/**
 * /login — passwordless magic-link sign in (TrustIndex AI)
 *
 * Uses Supabase Auth OTP (email magic link). No passwords are handled by this
 * app at any point. On success Supabase emails a link; clicking it returns the
 * user to the destination in ?next= (default /dashboard).
 *
 * Supports a conversion funnel:
 *   /login?plan=growth&next=checkout
 *   → after magic-link click → /account/billing?plan=growth&autocheckout=1
 *
 * If Supabase is not configured (local/demo build), shows a clear notice
 * instead of throwing.
 */

import { useState, useEffect } from "react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase-browser";
import { Logo } from "../../components/brand/Logo";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [nextParam, setNextParam] = useState<string | null>(null);

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
      // Build the post-login redirect URL.
      // If next=checkout (and plan is set), send the user to billing with
      // autocheckout=1 so the billing page auto-starts Stripe checkout.
      let redirectPath = "/dashboard";
      if (nextParam === "checkout" && plan) {
        redirectPath = `/account/billing?plan=${plan}&autocheckout=1`;
      } else if (nextParam && nextParam.startsWith("/")) {
        redirectPath = nextParam;
      }
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${redirectPath}`
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

  return (
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
          Sign in
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
            padding: "var(--space-5)", backgroundColor: "#F0FDF4",
            border: "1px solid var(--color-success)", borderRadius: "var(--radius-md)",
            textAlign: "center",
          }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--color-success)" }}>Check your email.</p>
            <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
              We sent a sign-in link to {email}. Open it on this device to continue.
            </p>
          </div>
        ) : (
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
        )}
      </div>
    </main>
  );
}
