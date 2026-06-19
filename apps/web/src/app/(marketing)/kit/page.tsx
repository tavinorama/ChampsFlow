"use client";

/**
 * /kit — "The Get-Cited Kit" ($29 one-time) offer + checkout.
 * Steps 2–3 (DIAGNOSE + FIX) of the value ladder. POSTs to /api/kit/checkout,
 * then redirects to Stripe (or the dev-unlock delivery URL when Stripe is off).
 */

import { useState } from "react";

const STACK = [
  ["Full AI Visibility Audit", "All engines, all your buyer prompts, your TrustIndex Score + deep breakdown."],
  ["Your top 3 “get cited” fixes", "The 3 highest-impact actions, in plain language."],
  ["3 ready-to-publish drafts", "A blog post, a LinkedIn post, and an FAQ — written with schema.org, ready to post today."],
  ["The “where to publish” checklist", "Exactly where each piece goes so AI can find it."],
  ["Bonus: 30-day re-test voucher", "Run the test again and see your movement."],
];

export default function KitPage() {
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState<"US" | "EU">("US");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim() || !category.trim() || !email.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/kit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), domain: domain.trim(), category: category.trim(), region, email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
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
    <main style={{ maxWidth: "820px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-20)", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      <span style={{ display: "inline-block", fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)", marginBottom: "var(--space-2)" }}>
        One-time · $29 · no subscription
      </span>
      <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 var(--space-3) 0" }}>
        The Get-Cited Kit
      </h1>
      <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-6) 0" }}>
        You know you&rsquo;re invisible. This is the first step out: the full picture of <em>why</em>, plus
        3 pieces of content <strong>written for you</strong> and ready to publish today. No subscription, no GEO degree required.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "var(--space-6)", alignItems: "start" }}>
        {/* Value stack */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-3) 0" }}>What you get for $29</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {STACK.map(([title, desc]) => (
              <li key={title} style={{ display: "flex", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 800 }}>✓</span>
                <span>
                  <strong>{title}</strong>
                  <span style={{ display: "block", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>{desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", backgroundColor: "var(--color-surface-muted)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--color-text)" }}>Guarantee:</strong> if your 3 drafts aren&rsquo;t ready to publish in 10 minutes, we refund the $29. We guarantee the deliverable &mdash; never AI behavior.
          </div>
        </div>

        {/* Checkout form */}
        <form onSubmit={checkout} style={cardStyle}>
          <Field label="Your brand" required>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Acme CRM" required style={inputStyle} />
          </Field>
          <Field label="Website" hint="optional — sharpens the audit">
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" style={inputStyle} />
          </Field>
          <Field label="Category" required>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="CRM" required style={inputStyle} />
          </Field>
          <Field label="Data region">
            <select value={region} onChange={(e) => setRegion(e.target.value as "US" | "EU")} style={inputStyle}>
              <option value="US">US</option>
              <option value="EU">EU (GDPR routing)</option>
            </select>
          </Field>
          <Field label="Email" required hint="where we deliver your kit">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required style={inputStyle} />
          </Field>
          {error && <p style={{ color: "#dc2626", fontSize: "var(--font-size-body-sm)" }}>{error}</p>}
          <button type="submit" disabled={busy || !brand.trim() || !category.trim() || !email.trim()} style={primaryBtn(busy || !brand.trim() || !category.trim() || !email.trim())}>
            {busy ? "Starting checkout…" : "Get the Kit — $29"}
          </button>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", textAlign: "center", margin: 0 }}>
            Secure checkout. One-time payment.
          </p>
        </form>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-card)",
  display: "flex", flexDirection: "column", gap: "var(--space-3)",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: "44px", padding: "0 var(--space-3)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)",
  fontSize: "var(--font-size-body-sm)", boxSizing: "border-box",
};
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: "48px", padding: "0 var(--space-5)", backgroundColor: "var(--color-primary)", color: "#fff",
    border: "none", borderRadius: "var(--radius-md)", fontWeight: 800, fontSize: "var(--font-size-body)",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  };
}
function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: "var(--font-size-body-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
        {label}{required && <span style={{ color: "#dc2626" }}> *</span>}
        {hint && <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}
