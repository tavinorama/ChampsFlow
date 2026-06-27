"use client";

/**
 * /r/[token] — Public shared report page
 *
 * NO authentication required. Uses plain fetch() — never apiFetch() —
 * because apiFetch() attaches a Supabase session token which would be
 * absent (or someone else's) on a public/shared link.
 *
 * Security: accent_hex is validated against /^#[0-9a-fA-F]{3,8}$/ before
 * being used in any style. This prevents CSS injection via a crafted
 * white-label accent value.
 *
 * Accessibility: aria-live for loading states, semantic headings, no auth gate.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { TrustIndexScorecard } from "../../../components/TrustIndexScorecard";
import { SiteFooter } from "../../../components/SiteFooter";

// Regex used to validate the accent_hex before CSS injection.
// IMPORTANT: This exact check prevents CSS injection — do not weaken.
const HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;

interface ReportBranding {
  agency_name?: string | null;
  logo_url?: string | null;
  accent_hex?: string | null;
}

interface ReportBrand {
  id: string;
  name: string;
  domain?: string | null;
  category?: string | null;
}

interface ReportScores {
  overall: number | null;
  visibility: number | null;
  citation_readiness: number | null;
}

interface ReportData {
  no_audit?: boolean;
  brand: ReportBrand;
  branding: ReportBranding;
  scores: ReportScores;
  top_sources: string[];
  audit_date?: string | null;
}

type PageState = "loading" | "not_found" | "no_audit" | "success";

export default function PublicReportPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!token) {
      setPageState("not_found");
      return;
    }

    let cancelled = false;
    // Use plain fetch — this page is PUBLIC, no auth token.
    fetch(`/api/r/${token}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ReportData>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setPageState("not_found");
          return;
        }
        setReport(data);
        setPageState(data.no_audit ? "no_audit" : "success");
      })
      .catch(() => {
        if (!cancelled) setPageState("not_found");
      });

    return () => { cancelled = true; };
  }, [token]);

  if (pageState === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          fontFamily: "var(--font-family)",
          color: "var(--color-muted)",
        }}
        aria-live="polite"
        role="status"
      >
        Loading report…
      </div>
    );
  }

  if (pageState === "not_found" || !report) {
    return (
      <main
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-4) 0" }}>
          Report not found
        </h1>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body)" }}>
          This report link is no longer valid or has been removed.
        </p>
      </main>
    );
  }

  if (pageState === "no_audit") {
    return (
      <main
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "var(--space-12) var(--space-4)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-4) 0" }}>
          {report.brand.name}
        </h1>
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body)" }}>
          No audit has been run for this brand yet.
        </p>
      </main>
    );
  }

  // Validate accent_hex BEFORE using in any CSS to prevent CSS injection.
  // This is the security gate: only a well-formed hex passes to style prop.
  const safeAccentHex =
    report.branding.accent_hex && HEX_REGEX.test(report.branding.accent_hex)
      ? report.branding.accent_hex
      : null;

  const hasAgencyBranding = Boolean(report.branding.agency_name || report.branding.logo_url);

  const auditDateFormatted = report.audit_date
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
        new Date(report.audit_date)
      )
    : null;

  return (
    <>
      <main
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) var(--space-12)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        {/* Report card */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
            // Accent top border — only rendered when safeAccentHex passes validation
            borderTop: safeAccentHex ? `4px solid ${safeAccentHex}` : "1px solid var(--color-border)",
          }}
        >
          {/* Header / branding */}
          {hasAgencyBranding && (
            <div
              style={{
                padding: "var(--space-4) var(--space-6)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                flexWrap: "wrap",
              }}
            >
              {report.branding.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.branding.logo_url}
                  alt="Agency logo"
                  style={{ height: "40px", objectFit: "contain" }}
                />
              )}
              {report.branding.agency_name && (
                <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
                  Prepared by <strong style={{ color: "var(--color-text)" }}>{report.branding.agency_name}</strong>
                </span>
              )}
            </div>
          )}

          {!hasAgencyBranding && (
            <div
              style={{
                padding: "var(--space-4) var(--space-6)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)" }}>
                Powered by <strong style={{ color: "var(--color-text)" }}>Ozvor</strong>
              </span>
            </div>
          )}

          {/* Brand info */}
          <div style={{ padding: "var(--space-6) var(--space-6) 0" }}>
            <h1
              style={{
                fontSize: "var(--font-size-h1)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: "0 0 var(--space-2) 0",
              }}
            >
              {report.brand.name}
            </h1>
            <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-6) 0" }}>
              {[report.brand.category, report.brand.domain].filter(Boolean).join(" · ")}
            </p>
          </div>

          {/* Scorecard */}
          <div style={{ padding: "0 var(--space-6) var(--space-6)" }}>
            <TrustIndexScorecard
              overall={report.scores.overall}
              threeScores={{
                visibility: report.scores.visibility,
                citationReadiness: report.scores.citation_readiness,
                executionProgress: null,
              }}
              brandName={report.brand.name}
            />
          </div>

          {/* Top sources */}
          {report.top_sources && report.top_sources.length > 0 && (
            <section
              style={{
                padding: "var(--space-5) var(--space-6)",
                borderTop: "1px solid var(--color-border)",
              }}
              aria-labelledby="top-sources-heading"
            >
              <h2
                id="top-sources-heading"
                style={{
                  fontSize: "var(--font-size-h4)",
                  fontWeight: 700,
                  margin: "0 0 var(--space-3) 0",
                }}
              >
                Where AI finds information about this brand
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {report.top_sources.slice(0, 5).map((domain) => (
                  <span
                    key={domain}
                    style={{
                      display: "inline-block",
                      padding: "var(--space-1) var(--space-3)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-text)",
                      backgroundColor: "var(--color-surface-muted)",
                    }}
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Audit date */}
          {auditDateFormatted && (
            <div
              style={{
                padding: "var(--space-4) var(--space-6)",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                }}
              >
                Audit run: {auditDateFormatted}
              </p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
