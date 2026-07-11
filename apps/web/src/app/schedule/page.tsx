"use client";

/**
 * Screen: /schedule — Scheduled Posts List (C2 Scheduler)
 *
 * docs/04-ux.md refs:
 *   - Bottom nav "Schedule" tab → this page
 *   - List of scheduled jobs grouped by date
 *   - Status pill for each job
 *   - Cancel button on pending/queued future jobs
 *   - Empty state with CTA to /create
 *
 * Accessibility:
 *   - Status pills use role="status" + aria-label (not color alone)
 *   - Cancel confirmation uses role="dialog" + aria-modal
 *   - WCAG AA: minimum 4.5:1 contrast on all text and status elements
 *   - Keyboard navigable: all interactive elements reachable via Tab
 *
 * All times stored as UTC in DB; displayed in user's local timezone.
 * Conversion: new Date(utcString).toLocaleString() uses browser locale/TZ.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublishJob {
  id: string;
  draft_id: string;
  social_account_id: string;
  scheduled_at: string;       // UTC ISO string from API
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  published_at: string | null;
  error_message: string | null;
  platform_post_id: string | null;
  created_at: string;
  draft_body_preview: string | null;
  draft_platform: string | null;
  account_platform: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

type LoadState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#92400e", bg: "#fef3c7" },
  queued: { label: "Queued", color: "#1d4ed8", bg: "#dbeafe" },
  processing: { label: "Processing", color: "#6d28d9", bg: "#ede9fe" },
  done: { label: "Published", color: "#065f46", bg: "#d1fae5" },
  failed: { label: "Failed", color: "#b91c1c", bg: "#fee2e2" },
  cancelled: { label: "Cancelled", color: "#6b7280", bg: "#f3f4f6" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a UTC ISO string to local date string (e.g. "May 10, 2026") */
function formatDate(utcStr: string): string {
  return new Date(utcStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format a UTC ISO string to local time string (e.g. "9:00 AM") */
function formatTime(utcStr: string): string {
  return new Date(utcStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Group jobs by local date string */
function groupByDate(
  jobs: PublishJob[]
): { dateLabel: string; jobs: PublishJob[] }[] {
  const map = new Map<string, PublishJob[]>();
  for (const job of jobs) {
    const dateLabel = formatDate(job.scheduled_at);
    if (!map.has(dateLabel)) map.set(dateLabel, []);
    map.get(dateLabel)!.push(job);
  }
  return Array.from(map.entries()).map(([dateLabel, jobs]) => ({
    dateLabel,
    jobs,
  }));
}

function canCancel(job: PublishJob): boolean {
  return ["pending", "queued"].includes(job.status);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter] = useState("pending,queued,processing,done,failed,cancelled");

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadJobs = useCallback(
    async (page: number) => {
      setLoadState("loading");
      try {
        const params = new URLSearchParams({
          status: statusFilter,
          page: String(page),
          limit: "20",
        });
        const res = await apiFetch(`/api/schedules?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load schedules");
        const data = await res.json();
        setJobs(data.data?.jobs ?? []);
        setPagination(data.data?.pagination ?? null);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    loadJobs(currentPage);
  }, [loadJobs, currentPage]);

  async function handleCancel(jobId: string) {
    if (cancellingId) return;
    setCancellingId(jobId);
    setCancelError(null);

    try {
      const res = await apiFetch(`/api/schedules/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCancelError(
          data?.error?.message ?? "Failed to cancel schedule. Please try again."
        );
        return;
      }

      // Update local state: mark job as cancelled
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" } : j))
      );
      setConfirmCancelId(null);
      showToast("Schedule cancelled.", "success");
    } catch {
      setCancelError("Failed to cancel. Please check your connection.");
    } finally {
      setCancellingId(null);
    }
  }

  // ---- Render ----

  const groupedJobs = groupByDate(jobs);

  return (
    <div
      style={{
        // Sits INSIDE the app shell (which owns the top bar, background and
        // bottom-nav). No own 100dvh/muted panel — that double-painted a nested
        // screen. Just a plain column wrapper for the heading + content.
        fontFamily: "var(--font-family)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "fixed",
            top: "var(--space-4)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            backgroundColor:
              toast.type === "success" ? "var(--color-success)" : "var(--color-error)",
            color: "white",
            padding: "var(--space-3) var(--space-6)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-medium)",
            boxShadow: "var(--shadow-modal)",
            whiteSpace: "nowrap",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Page heading — a normal in-content title (the app shell already
          provides the top bar), aligned to the content column. "Calendar"
          matches the sidebar label. */}
      <header
        style={{
          width: "100%",
          maxWidth: "600px",
          margin: "0 auto",
          padding: "var(--space-8) var(--margin-page-mobile) 0",
        }}
      >
        <h1
          style={{
            fontSize: "var(--font-size-h1)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          Calendar
        </h1>
        <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
          Your content publishing schedule, grouped by date.
        </p>
      </header>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4) var(--margin-page-mobile)",
          paddingBottom: "calc(var(--bottom-nav-height) + var(--space-6))",
          maxWidth: "600px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {loadState === "loading" && (
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              textAlign: "center",
              color: "var(--color-muted)",
              padding: "var(--space-8)",
            }}
          >
            Loading scheduled posts…
          </div>
        )}

        {loadState === "error" && (
          <div
            role="alert"
            style={{
              textAlign: "center",
              color: "var(--color-error)",
              padding: "var(--space-8)",
            }}
          >
            Failed to load schedules.{" "}
            <button
              type="button"
              onClick={() => loadJobs(currentPage)}
              style={{
                color: "var(--color-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "inherit",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {loadState === "loaded" && jobs.length === 0 && (
          /* Empty state */
          <div
            style={{
              textAlign: "center",
              padding: "var(--space-10) var(--space-4)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-4)",
            }}
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p
              style={{
                fontSize: "var(--font-size-h4)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              No scheduled posts yet
            </p>
            <p
              style={{
                fontSize: "var(--font-size-body)",
                color: "var(--color-muted)",
                margin: 0,
              }}
            >
              Create and approve a post, then schedule it for publishing.
            </p>
            <a
              href="/create"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "var(--min-button-height)",
                paddingInline: "var(--space-6)",
                backgroundColor: "var(--color-primary)",
                color: "white",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                textDecoration: "none",
              }}
            >
              Create a post
            </a>
          </div>
        )}

        {loadState === "loaded" && jobs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {groupedJobs.map(({ dateLabel, jobs: dayJobs }) => (
              <section key={dateLabel} aria-labelledby={`date-${dateLabel.replace(/\s/g, "-")}`}>
                {/* Date group header */}
                <h2
                  id={`date-${dateLabel.replace(/\s/g, "-")}`}
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "var(--space-2)",
                    marginTop: 0,
                  }}
                >
                  {dateLabel}
                </h2>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  {dayJobs.map((job) => {
                    const statusCfg =
                      STATUS_CONFIG[job.status] ??
                      STATUS_CONFIG["pending"];
                    const platform =
                      job.account_platform ?? job.draft_platform;
                    return (
                      <article
                        key={job.id}
                        aria-label={`Scheduled post for ${platform ? PLATFORM_LABELS[platform] ?? platform : "unknown platform"} at ${formatTime(job.scheduled_at)}, status: ${statusCfg.label}`}
                        style={{
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-lg)",
                          padding: "var(--space-4)",
                        }}
                      >
                        {/* Top row: time + platform + status */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "var(--space-2)",
                            flexWrap: "wrap",
                            gap: "var(--space-2)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--space-2)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "var(--font-size-body-sm)",
                                fontWeight: "var(--font-weight-semibold)",
                                color: "var(--color-text)",
                              }}
                            >
                              {formatTime(job.scheduled_at)}
                            </span>
                            {platform && (
                              <span
                                style={{
                                  fontSize: "var(--font-size-caption)",
                                  color: "var(--color-muted)",
                                }}
                              >
                                {PLATFORM_LABELS[platform] ?? platform}
                              </span>
                            )}
                          </div>

                          {/* Status pill */}
                          <span
                            role="status"
                            aria-label={`Status: ${statusCfg.label}`}
                            style={{
                              display: "inline-block",
                              padding: "2px 10px",
                              borderRadius: "999px",
                              fontSize: "var(--font-size-caption)",
                              fontWeight: "var(--font-weight-medium)",
                              color: statusCfg.color,
                              backgroundColor: statusCfg.bg,
                              border: `1px solid ${statusCfg.color}22`,
                            }}
                          >
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Draft body preview */}
                        {job.draft_body_preview && (
                          <p
                            style={{
                              fontSize: "var(--font-size-body-sm)",
                              color: "var(--color-text)",
                              margin: "0 0 var(--space-3) 0",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {job.draft_body_preview}
                            {job.draft_body_preview.length >= 140 && "…"}
                          </p>
                        )}

                        {/* Failure error message */}
                        {job.status === "failed" && job.error_message && (
                          <p
                            style={{
                              fontSize: "var(--font-size-caption)",
                              color: "var(--color-error)",
                              margin: "0 0 var(--space-3) 0",
                              padding: "var(--space-2)",
                              backgroundColor: "#fee2e2",
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            {job.error_message}
                          </p>
                        )}

                        {/* Cancel button — only for cancellable jobs */}
                        {canCancel(job) && (
                          <div>
                            {cancelError && confirmCancelId === job.id && (
                              <p
                                role="alert"
                                style={{
                                  color: "var(--color-error)",
                                  fontSize: "var(--font-size-caption)",
                                  marginBottom: "var(--space-2)",
                                }}
                              >
                                {cancelError}
                              </p>
                            )}
                            {confirmCancelId !== job.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmCancelId(job.id);
                                  setCancelError(null);
                                }}
                                aria-label={`Cancel scheduled post for ${platform ? PLATFORM_LABELS[platform] ?? platform : "platform"} at ${formatTime(job.scheduled_at)}`}
                                style={{
                                  minHeight: "var(--min-tap-target)",
                                  paddingInline: "var(--space-3)",
                                  backgroundColor: "transparent",
                                  color: "var(--color-error)",
                                  border: "1px solid var(--color-error)",
                                  borderRadius: "var(--radius-md)",
                                  fontSize: "var(--font-size-body-sm)",
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            ) : (
                              /* Inline cancel confirmation */
                              <div
                                role="dialog"
                                aria-modal="false"
                                aria-label="Confirm cancellation"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "var(--space-2)",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "var(--font-size-body-sm)",
                                    color: "var(--color-text)",
                                  }}
                                >
                                  Cancel this schedule?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancel(job.id)}
                                  disabled={cancellingId === job.id}
                                  aria-busy={cancellingId === job.id}
                                  aria-label="Confirm cancellation"
                                  style={{
                                    minHeight: "var(--min-tap-target)",
                                    paddingInline: "var(--space-3)",
                                    backgroundColor: "var(--color-error)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "var(--font-size-body-sm)",
                                    fontWeight: "var(--font-weight-medium)",
                                    cursor:
                                      cancellingId === job.id
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  {cancellingId === job.id
                                    ? "Cancelling…"
                                    : "Yes, cancel"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmCancelId(null);
                                    setCancelError(null);
                                  }}
                                  style={{
                                    minHeight: "var(--min-tap-target)",
                                    paddingInline: "var(--space-3)",
                                    backgroundColor: "transparent",
                                    color: "var(--color-text)",
                                    border: "1px solid var(--color-border)",
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "var(--font-size-body-sm)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Keep
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <nav
                aria-label="Schedule pagination"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  paddingTop: "var(--space-4)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  style={{
                    minHeight: "var(--min-tap-target)",
                    paddingInline: "var(--space-3)",
                    backgroundColor: "var(--color-surface)",
                    color:
                      currentPage === 1
                        ? "var(--color-muted)"
                        : "var(--color-primary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-body-sm)",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>

                <span
                  aria-current="page"
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-text)",
                  }}
                >
                  Page {pagination.page} of {pagination.total_pages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) =>
                      Math.min(pagination.total_pages, p + 1)
                    )
                  }
                  disabled={currentPage === pagination.total_pages}
                  aria-label="Next page"
                  style={{
                    minHeight: "var(--min-tap-target)",
                    paddingInline: "var(--space-3)",
                    backgroundColor: "var(--color-surface)",
                    color:
                      currentPage === pagination.total_pages
                        ? "var(--color-muted)"
                        : "var(--color-primary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-body-sm)",
                    cursor:
                      currentPage === pagination.total_pages
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        )}
      </main>


      <style>{`
        button:focus-visible,
        a:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </div>
  );
}
