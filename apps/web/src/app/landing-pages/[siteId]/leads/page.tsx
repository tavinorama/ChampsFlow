"use client";

/**
 * /landing-pages/[siteId]/leads — Ozvor Pages tenant leads screen (issue #208, PR-8).
 *
 * Read-only view of end-customer form submissions captured on this site's
 * published pages (public capture route is PR-6). GET /api/landing/sites/:id/leads
 * (requireAuth, site-ownership checked server-side, RLS-scoped) returns the
 * newest 200 leads. No CSV export in this pass (kept tight per scope).
 *
 * PII (name/email/phone/message) renders in-app only — never logged, never
 * sent anywhere else from this page.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ensureProvisioned } from "../../../../lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  created_at: string;
}

type LoadState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingSiteLeadsPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const loadLeads = useCallback(async (): Promise<Lead[] | null> => {
    const res = await apiFetch(`/api/landing/sites/${siteId}/leads`);
    if (!res.ok) return null;
    const data = (await res.json()) as { leads: Lead[] };
    return data.leads ?? [];
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        await ensureProvisioned();
        const data = await loadLeads();
        if (cancelled) return;
        if (data === null) {
          setLoadError("Site not found.");
          setLoadState("error");
          return;
        }
        setLeads(data);
        setLoadState("loaded");
      } catch {
        if (!cancelled) {
          setLoadError("Could not load leads. Check your connection.");
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLeads]);

  if (loadState === "loading") {
    return (
      <main style={pageStyle}>
        <p aria-live="polite" style={{ color: "var(--color-muted)" }}>Loading&hellip;</p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main style={pageStyle}>
        <p role="alert" style={{ color: "var(--color-error)" }}>{loadError ?? "Could not load leads."}</p>
        <a href={`/landing-pages/${siteId}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>
          &larr; Back to site
        </a>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <a
        href={`/landing-pages/${siteId}`}
        style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}
      >
        &larr; Back to site
      </a>

      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "var(--space-3) 0 var(--space-2) 0" }}>
        Leads
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: "var(--line-height-body)", margin: "0 0 var(--space-6) 0" }}>
        Form submissions from this site&rsquo;s published pages, newest first (last 200).
      </p>

      {leads.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8) var(--space-6)",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", fontWeight: 600, color: "var(--color-text)" }}>
            No leads yet
          </p>
          <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
            Share your site&rsquo;s link so visitors can find and contact you.
          </p>
        </div>
      ) : (
        <ul
          aria-label="Leads"
          style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
        >
          {leads.map((lead) => (
            <li
              key={lead.id}
              style={{
                padding: "var(--space-4)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
                <div style={{ fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
                  {lead.name || "Anonymous"}
                </div>
                <time
                  dateTime={lead.created_at}
                  style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {formatDateTime(lead.created_at)}
                </time>
              </div>
              <div style={{ marginTop: "var(--space-1)", display: "flex", flexWrap: "wrap", gap: "var(--space-3)", fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
                {lead.email && (
                  <a href={`mailto:${lead.email}`} style={{ color: "var(--color-accent-ink)", textDecoration: "none" }}>
                    {lead.email}
                  </a>
                )}
                {lead.phone && <span>{lead.phone}</span>}
                {!lead.consent && (
                  <span style={{ color: "var(--color-badge-status-warn-text)" }}>No marketing consent</span>
                )}
              </div>
              {lead.message && (
                <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--font-size-body-sm)", color: "var(--color-text)", lineHeight: "var(--line-height-body)" }}>
                  {truncate(lead.message, 240)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <style>{`
        a:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  maxWidth: "820px",
  margin: "0 auto",
  padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
};
