"use client";

/**
 * SocialAuthButtons — reusable "Continue with {provider}" row.
 *
 * Same OAuth wiring as /login (Supabase signInWithOAuth), extracted so the
 * funnel surfaces (free test, Kit checkout) can offer social sign-in too. The
 * founder's intent: a verified Google/GitHub/LinkedIn identity links the whole
 * funnel (free test → Kit → account) and removes typing friction.
 *
 * Providers are feature-flagged by NEXT_PUBLIC_AUTH_* (referenced directly so
 * Next inlines them at build). Renders nothing if Supabase isn't configured or
 * no provider is enabled — the email path always remains available.
 */

import { useState } from "react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase-browser";

type OAuthProvider = "google" | "azure" | "github" | "linkedin_oidc";

function isEnvEnabled(val: string | undefined): boolean {
  return val === "true" || val === "1";
}

// ── Provider identity marks (brand colors intentionally hardcoded) ────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable={false}>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" />
  </svg>
);
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable={false}>
    <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022" />
    <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00" />
    <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF" />
    <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" />
  </svg>
);
const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable={false}>
    <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);
const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable={false}>
    <path fill="#0A66C2" d="M22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0ZM7.12 20.45H3.56V9h3.56v11.45ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28Z" />
  </svg>
);

const PROVIDERS: Array<{ id: OAuthProvider; label: string; enabled: boolean; icon: React.ReactNode }> = [
  { id: "google", label: "Google", enabled: isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_GOOGLE), icon: <GoogleIcon /> },
  { id: "azure", label: "Microsoft", enabled: isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_MICROSOFT), icon: <MicrosoftIcon /> },
  { id: "github", label: "GitHub", enabled: isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_GITHUB), icon: <GitHubIcon /> },
  { id: "linkedin_oidc", label: "LinkedIn", enabled: isEnvEnabled(process.env.NEXT_PUBLIC_AUTH_LINKEDIN), icon: <LinkedInIcon /> },
];

export interface SocialAuthButtonsProps {
  /** Where to return after OAuth. Defaults to the current path+query. */
  redirectPath?: string;
  /** Caption above the buttons. */
  caption?: string;
  /** Divider text shown below the buttons (before the email field). */
  dividerLabel?: string;
  /** Called right before the redirect — persist any in-progress form draft here. */
  onBeforeRedirect?: () => void;
}

export function SocialAuthButtons({
  redirectPath,
  caption = "Continue with a verified account — we'll remember you next time:",
  dividerLabel = "or continue with email",
  onBeforeRedirect,
}: SocialAuthButtonsProps) {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");

  const enabled = PROVIDERS.filter((p) => p.enabled);
  if (!isSupabaseConfigured() || enabled.length === 0) return null;

  async function handleOAuth(provider: OAuthProvider) {
    setError("");
    setLoading(provider);
    try {
      onBeforeRedirect?.();
      const target =
        redirectPath ?? window.location.pathname + window.location.search;
      const redirectTo = `${window.location.origin}${target}`;
      const { error: err } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          ...(provider === "azure" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (err) {
        setLoading(null);
        setError(err.message);
      }
      // On success the browser redirects; no further state needed.
    } catch (e) {
      setLoading(null);
      setError(e instanceof Error ? e.message : "Sign-in failed. Try email instead.");
    }
  }

  return (
    <div>
      {caption && (
        <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
          {caption}
        </p>
      )}
      <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: enabled.length > 1 ? "1fr 1fr" : "1fr" }}>
        {enabled.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleOAuth(p.id)}
            disabled={loading !== null}
            aria-label={`Continue with ${p.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              height: "44px",
              padding: "0 var(--space-3)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontWeight: 600,
              fontSize: "var(--font-size-body-sm)",
              cursor: loading !== null ? "wait" : "pointer",
              opacity: loading !== null && loading !== p.id ? 0.6 : 1,
            }}
          >
            {p.icon}
            <span>{loading === p.id ? "Redirecting…" : p.label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-caption)", color: "#dc2626" }}>
          {error}
        </p>
      )}
      {dividerLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-4) 0" }}>
          <div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} />
          <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)", whiteSpace: "nowrap" }}>
            {dividerLabel}
          </span>
          <div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} />
        </div>
      )}
    </div>
  );
}
