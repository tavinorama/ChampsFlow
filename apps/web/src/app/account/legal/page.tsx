"use client";

/**
 * Account > Legal — /account/legal
 *
 * CI-1 persistent DPA link in account settings (architecture §5 + UX §2 IA).
 * Shows:
 *   - "View Data Processing Agreement" link (opens current DPA — placeholder /legal/dpa)
 *   - "Privacy Policy" link
 *   - "Terms of Service" link
 *   - DPA Acknowledgment History: expandable section with user's full ack history
 *     from GET /api/dpa/history
 *
 * The DPA history section satisfies:
 *   - UX §2 IA: Account > Legal lists DPA link
 *   - CI-1 AC: "The full DPA document is always accessible from account settings > Legal"
 *   - PRD CI-1 AC: "DPA link persists in account settings"
 *
 * WCAG AA: all interactive elements keyboard accessible, aria-expanded on details.
 */

import { useState, useEffect } from "react";

interface AckRecord {
  id: string;
  dpa_version: string;
  variant: string;
  country_code: string | null;
  acknowledged_at: string;
}

export default function AccountLegalPage() {
  const [history, setHistory] = useState<AckRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const res = await fetch("/api/dpa/history", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load acknowledgment history");
      const data = (await res.json()) as { history: AckRecord[] };
      setHistory(data.history);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Failed to load history"
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleToggleHistory() {
    if (!historyExpanded && history.length === 0) {
      void loadHistory();
    }
    setHistoryExpanded((prev) => !prev);
  }

  return (
    <div
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "24px 16px 80px 16px", // 80px bottom for bottom nav
      }}
    >
      <h1
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "var(--color-text)",
          marginBottom: "24px",
          marginTop: 0,
        }}
      >
        Legal
      </h1>

      {/* Legal links */}
      <section
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          overflow: "hidden",
          marginBottom: "24px",
        }}
      >
        <LegalLinkRow
          href="/legal/dpa"
          label="Data Processing Agreement"
          external
        />
        <LegalLinkRow
          href="/privacy-policy"
          label="Privacy Policy"
          external
        />
        <LegalLinkRow
          href="/terms-of-service"
          label="Terms of Service"
          external
          isLast
        />
      </section>

      {/* DPA Acknowledgment History */}
      <section
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {/* Toggle header */}
        <button
          type="button"
          aria-expanded={historyExpanded}
          onClick={handleToggleHistory}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text)",
            fontSize: "16px",
            fontWeight: 600,
            textAlign: "left",
            outline: "none",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.outline = `3px solid var(--color-focus-outline)`)
          }
          onBlur={(e) => (e.currentTarget.style.outline = "none")}
        >
          <span>DPA Acknowledgment History</span>
          <span
            aria-hidden="true"
            style={{
              transform: historyExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              display: "inline-block",
              fontSize: "12px",
              color: "var(--color-muted)",
            }}
          >
            ▼
          </span>
        </button>

        {historyExpanded && (
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              padding: "16px",
            }}
          >
            {historyLoading && (
              <p
                style={{
                  color: "var(--color-muted)",
                  fontSize: "14px",
                  margin: 0,
                }}
              >
                Loading history...
              </p>
            )}

            {historyError && (
              <p
                role="alert"
                style={{
                  color: "var(--color-error)",
                  fontSize: "14px",
                  margin: 0,
                }}
              >
                {historyError}
              </p>
            )}

            {!historyLoading && !historyError && history.length === 0 && (
              <p
                style={{
                  color: "var(--color-muted)",
                  fontSize: "14px",
                  margin: 0,
                }}
              >
                No acknowledgment records found.
              </p>
            )}

            {!historyLoading && history.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {history.map((record) => (
                  <li
                    key={record.id}
                    style={{
                      backgroundColor: "var(--color-surface-muted)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            margin: "0 0 4px 0",
                          }}
                        >
                          DPA version {record.dpa_version}
                        </p>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--color-muted)",
                            margin: 0,
                          }}
                        >
                          Variant: {record.variant}
                          {record.country_code
                            ? ` · Country: ${record.country_code}`
                            : ""}
                        </p>
                      </div>
                      <time
                        dateTime={record.acknowledged_at}
                        style={{
                          fontSize: "12px",
                          color: "var(--color-muted)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {new Date(record.acknowledged_at).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper component — legal link row
// ---------------------------------------------------------------------------
function LegalLinkRow({
  href,
  label,
  external = false,
  isLast = false,
}: {
  href: string;
  label: string;
  external?: boolean;
  isLast?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px",
        borderBottom: isLast ? "none" : "1px solid var(--color-border)",
        color: "var(--color-text)",
        textDecoration: "none",
        fontSize: "16px",
        outline: "none",
      }}
      onFocus={(e) =>
        (e.currentTarget.style.outline = `3px solid var(--color-focus-outline)`)
      }
      onBlur={(e) => (e.currentTarget.style.outline = "none")}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        style={{ color: "var(--color-muted)", fontSize: "14px" }}
      >
        {external ? "↗" : "›"}
      </span>
    </a>
  );
}
