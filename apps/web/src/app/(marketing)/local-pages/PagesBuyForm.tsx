"use client";

/**
 * PagesBuyForm — the $99-one-time checkout widget on /local-pages.
 *
 * Extracted from page.tsx so page.tsx can stay a server component (metadata +
 * JSON-LD). Mirrors KitCheckoutForm's checkout call: same-origin POST via the
 * Next.js rewrite (apps/web/next.config.* — /api/:path* -> API), no separate
 * proxy route needed.
 *
 * POST /api/pages/checkout { email } -> { url } (Stripe Checkout) or:
 *   - 503 when Stripe/STRIPE_PRICE_ID_PAGES isn't configured yet (production's
 *     current state until the founder flips it on) — shown as an honest
 *     "opens soon" fallback with a Growth alternative, not a broken button.
 *   - 400 with { message } for validation errors (surfaced inline).
 */

import { useState } from "react";
import Link from "next/link";
import { useVerifiedEmail } from "../../../lib/use-verified-email";
import { validatePagesBuyEmail } from "./pages-buy-helpers";

export { validatePagesBuyEmail };

type Status = "idle" | "submitting" | "unavailable";

export function PagesBuyForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  useVerifiedEmail((e) => setEmail((prev) => prev || e));

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validatePagesBuyEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (status === "submitting") return;
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/pages/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}) as { url?: string; message?: string });
      if (res.ok && data.url) {
        window.location.href = data.url; // Stripe Checkout
        return;
      }
      if (res.status === 503) {
        setStatus("unavailable");
        return;
      }
      setError(data.message ?? "Checkout is not available right now.");
      setStatus("idle");
    } catch {
      setError("Network error. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "unavailable") {
    return (
      <div style={cardStyle} role="status">
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
          Checkout opens soon
        </h2>
        <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
          Standalone $99 checkout for Ozvor Pages is being finalized. In the meantime, the site builder is included
          free with the Growth plan. Sign up and it unlocks immediately.
        </p>
        <Link href="/pricing" style={linkBtnStyle} aria-label="See the Growth plan — Ozvor Pages included">
          See the Growth plan &rarr;
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={checkout} aria-label="Buy Ozvor Pages" style={cardStyle}>
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>
        Get your site &mdash; $99 one-time
      </h2>
      <label htmlFor="pages-buy-email" style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
        Email
        <span style={{ color: "var(--color-error)" }}> *</span>
        <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> &mdash; where we send your builder access</span>
      </label>
      <input
        id="pages-buy-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        style={inputStyle}
      />
      {error && (
        <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--font-size-body-sm)", margin: "var(--space-2) 0 0 0" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        aria-busy={status === "submitting"}
        style={primaryBtn(status === "submitting")}
      >
        {status === "submitting" ? "Starting checkout…" : "Get your site — $99"}
      </button>
      <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center", margin: "var(--space-2) 0 0 0" }}>
        Secure checkout. One-time payment.
      </p>
    </form>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
  maxWidth: "480px",
  margin: "0 auto",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "48px",
  padding: "0 var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  boxSizing: "border-box",
};

const linkBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  boxSizing: "border-box",
  minHeight: "var(--min-button-height)",
  padding: "0 var(--space-5)",
  backgroundColor: "var(--color-primary)",
  color: "#06140e",
  borderRadius: "var(--radius-md)",
  fontWeight: 800,
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  textDecoration: "none",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: "var(--min-button-height)",
    marginTop: "var(--space-4)",
    padding: "0 var(--space-5)",
    backgroundColor: disabled ? "var(--color-muted)" : "var(--color-primary)",
    color: "#06140e",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body)",
    fontFamily: "var(--font-family)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
