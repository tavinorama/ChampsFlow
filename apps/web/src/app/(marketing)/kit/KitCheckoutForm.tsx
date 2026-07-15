"use client";

/**
 * KitCheckoutForm — client-side form for /kit.
 *
 * Extracted from page.tsx so page.tsx can be a server component
 * (enabling metadata + JSON-LD exports).
 */

import { useState, useEffect } from "react";
import { SocialAuthButtons } from "../../../components/auth/SocialAuthButtons";
import { useVerifiedEmail } from "../../../lib/use-verified-email";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "../../../lib/form-draft";
import { trackEvent } from "../../../lib/track";

const DRAFT_KEY = "kit";

// Two-column layout (value stack + form) collapses to one column below this
// breakpoint. Root cause of a mobile horizontal-overflow bug (#kit-overflow):
// CSS Grid tracks default to `minmax(auto, 1fr)`, and "auto" resolves to the
// content's min-content size — which, for a form with un-breakable single-word
// buttons (e.g. the "Microsoft" OAuth button) and labeled inputs, can exceed
// the fraction of viewport width available at 375px. The two tracks then
// refuse to shrink further and push the grid past the container's edge.
// Stacking to a single column below 760px removes the constraint entirely
// (each child gets the full container width, which always fits) instead of
// just papering over it with `minmax(0, 1fr)` squishing.
const KCF_CSS = `
  .kcf-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-6); align-items: start; }
  @media (max-width: 760px) { .kcf-grid { grid-template-columns: 1fr; } }
`;

const STACK: [string, string][] = [
  ["Part 1 — Full AI Visibility Audit", "Your free test, completed: all engines, all your buyer prompts, your Ozvor AI Visibility Score + deep breakdown."],
  ["Your top 3 “get cited” fixes", "The 3 highest-impact actions, in plain language."],
  ["3 structured drafts, built to finish fast", "A blog post and an FAQ with schema.org markup, plus a LinkedIn post, all ready to finish and publish."],
  ["The “where to publish” checklist", "Exactly where each piece goes so AI can find it."],
  ["Part 2 — Understanding GEO Search guide", "A plain-English guide to how AI search works and who AI cites — yours to keep, downloadable as PDF."],
  ["Bonus: 30-day re-test voucher", "Run the test again and see your movement."],
];

export function KitCheckoutForm() {
  const [testId, setTestId] = useState("");
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState<"US" | "EU">("US");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Prefill from the free test (Test → Kit continuity). Read client-side from
  // the URL — avoids useSearchParams' static-render/Suspense pitfalls on this
  // statically-optimizable marketing page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("testId");
    if (t) setTestId(t);
    const b = p.get("brand");
    if (b) setBrand(b);
    const c = p.get("category");
    if (c) setCategory(c);
    if (p.get("region") === "EU") setRegion("EU");

    // Restore a draft saved before an OAuth redirect (social sign-in mid-form),
    // so nothing the buyer typed is lost. URL params above win over the draft.
    const draft = loadFormDraft<{
      testId?: string; brand?: string; domain?: string; category?: string; region?: "US" | "EU"; email?: string;
    }>(DRAFT_KEY);
    if (draft) {
      if (draft.testId && !t) setTestId(draft.testId);
      if (draft.brand && !b) setBrand(draft.brand);
      if (draft.domain) setDomain(draft.domain);
      if (draft.category && !c) setCategory(draft.category);
      if (draft.region && p.get("region") !== "EU") setRegion(draft.region);
      if (draft.email) setEmail(draft.email);
    }
  }, []);

  // Prefill the verified email — immediately if signed in, and once the
  // post-OAuth code exchange completes (so social sign-in fills the box, and
  // #166 links this Kit to their account by that email).
  useVerifiedEmail((e) => setEmail((prev) => prev || e));

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim() || !category.trim() || !email.trim() || busy) return;
    setBusy(true);
    setError("");
    trackEvent("kit_checkout_created", { has_test: Boolean(testId) });
    try {
      const res = await fetch("/api/kit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          domain: domain.trim(),
          category: category.trim(),
          region,
          email: email.trim(),
          testId: testId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        clearFormDraft(DRAFT_KEY);
        window.location.href = data.url; // Stripe checkout OR dev-unlock delivery URL
      } else {
        setError(data.message ?? "Checkout is not available right now.");
        setBusy(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="kcf-grid">
      <style>{KCF_CSS}</style>
      {/* Value stack */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>
          What you get for $29
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {STACK.map(([title, desc]) => (
            <li key={title} style={{ display: "flex", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-success)", fontWeight: 800 }}>&#10003;</span>
              <span>
                <strong>{title}</strong>
                <span style={{ display: "block", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
                  {desc}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text)" }}>Guarantee:</strong> if your 3 drafts aren&rsquo;t ready to publish in 10
          minutes, we refund the $29. We guarantee the deliverable &mdash; never AI behavior.
        </div>
      </div>

      {/* Checkout form */}
      <form onSubmit={checkout} style={cardStyle}>
        <SocialAuthButtons
          caption="Sign in so your Kit is saved to your account — one click:"
          onBeforeRedirect={() =>
            saveFormDraft(DRAFT_KEY, { testId, brand, domain, category, region, email })
          }
        />
        <Field label="Your brand" required>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Acme CRM"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Website" hint="optional — sharpens the audit">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            style={inputStyle}
          />
        </Field>
        <Field label="Category" required>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="CRM"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Data region">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as "US" | "EU")}
            style={inputStyle}
          >
            <option value="US">US</option>
            <option value="EU">EU (GDPR routing)</option>
          </select>
        </Field>
        <Field label="Email" required hint="where we deliver your kit">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            required
            style={inputStyle}
          />
        </Field>
        {error && (
          <p style={{ color: "#dc2626", fontSize: "var(--font-size-body-sm)" }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={busy || !brand.trim() || !category.trim() || !email.trim()}
          style={primaryBtn(busy || !brand.trim() || !category.trim() || !email.trim())}
        >
          {busy ? "Starting checkout…" : "Get the Kit — $29"}
        </button>
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center", margin: 0 }}>
          Secure checkout. One-time payment.
        </p>
      </form>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  padding: "0 var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body-sm)",
  boxSizing: "border-box",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
        {hint && <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> &mdash; {hint}</span>}
      </span>
      {children}
    </label>
  );
}
