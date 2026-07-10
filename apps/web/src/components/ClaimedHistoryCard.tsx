"use client";

/**
 * ClaimedHistoryCard — the tenant's recovered pre-account history (#218).
 *
 * Identity continuity (#166) links a visitor's free tests (lead_capture) and
 * Kit purchases (kit_order) to their account by verified email — but nothing
 * ever DISPLAYED those links, so a claimed test/Kit was invisible (founder
 * hit this with the otterly purchase). This card is the read side:
 * GET /api/account/claimed-history → compact list with deep links.
 *
 * Renders NOTHING while loading, on error, or when there is no history —
 * zero visual noise for the common case.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/supabase-browser";

interface ClaimedTest {
  id: string;
  brand: string;
  created_at: string;
  verdict: string | null;
}

interface ClaimedKit {
  id: string;
  brand: string;
  status: string;
  order_token: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  padding: "var(--space-3) 0",
  borderTop: "1px solid var(--color-border)",
  fontSize: "var(--font-size-body-sm)",
};

export function ClaimedHistoryCard() {
  const [tests, setTests] = useState<ClaimedTest[]>([]);
  const [kits, setKits] = useState<ClaimedKit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/account/claimed-history");
        if (!res.ok) return;
        const data = (await res.json()) as { tests?: ClaimedTest[]; kits?: ClaimedKit[] };
        if (cancelled) return;
        setTests(data.tests ?? []);
        setKits(data.kits ?? []);
      } catch {
        /* silent — the card simply doesn't render */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || (tests.length === 0 && kits.length === 0)) return null;

  return (
    <section
      aria-labelledby="claimed-history-heading"
      style={{
        marginTop: "var(--space-8)",
        padding: "var(--space-5) var(--space-6)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-accent-ink)",
          marginBottom: "var(--space-1)",
        }}
      >
        Linked to your email
      </div>
      <h2 id="claimed-history-heading" style={{ margin: 0, fontSize: "var(--font-size-h4)", color: "var(--color-text)" }}>
        Your tests &amp; purchases
      </h2>
      <p style={{ margin: "var(--space-1) 0 var(--space-3)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
        Free tests and Kits made with this email before or outside the app — recovered automatically.
      </p>

      {kits.map((k) => (
        <div key={k.id} style={rowStyle}>
          <span style={{ color: "var(--color-text)" }}>
            <strong>Get-Cited Kit</strong> — {k.brand} · {fmtDate(k.created_at)}
          </span>
          <a
            href={`/kit/${k.order_token}`}
            style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none", minHeight: "var(--min-tap-target, 44px)", display: "inline-flex", alignItems: "center" }}
          >
            Open your Kit →
          </a>
        </div>
      ))}

      {tests.map((t) => (
        <div key={t.id} style={rowStyle}>
          <span style={{ color: "var(--color-text)" }}>
            <strong>AI Invisibility Test</strong> — {t.brand} · {fmtDate(t.created_at)}
            {t.verdict ? <span style={{ color: "var(--color-muted)" }}> · {t.verdict}</span> : null}
          </span>
          <a
            href={`/test?brand=${encodeURIComponent(t.brand)}`}
            style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none", minHeight: "var(--min-tap-target, 44px)", display: "inline-flex", alignItems: "center" }}
          >
            Re-run test →
          </a>
        </div>
      ))}
    </section>
  );
}
