"use client";

/**
 * ScheduleModal — C2 Scheduler
 *
 * Opens when user clicks "Schedule" on an approved draft.
 * Allows user to pick:
 *   - Date (native HTML5 <input type="date">)
 *   - Time (<select> with 15-minute increments — accessible across all browsers)
 *   - Platform accounts (checkboxes — only connected, non-revoked accounts)
 *
 * On confirm: POST /api/drafts/:id/schedule → success toast → redirect /schedule
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus trap: Tab cycles within modal; Escape closes
 *   - All form fields have associated <label> elements
 *   - Error states use role="alert"
 *   - WCAG AA: minimum 4.5:1 contrast on all text
 *
 * docs/04-ux.md refs:
 *   - §4 Schedule picker: date + time + platform multi-select
 *   - §8 Keyboard navigation: focus trap in modals
 */

import { useState, useEffect, useRef, useId } from "react";
import { useRouter } from "next/navigation";

interface SocialAccount {
  id: string;
  platform: "linkedin" | "instagram" | "facebook";
  platformUserId: string;
  revokedAt: string | null;
  connectedAt: string;
}

interface ScheduleModalProps {
  draftId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Generate 15-minute increment time options for a <select>
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const value = `${hh}:${mm}`;
      // Display in 12-hour format for readability
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const label = `${hour12}:${mm} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

// Minimum date = today (user's local date)
function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Maximum date = today + 90 days
function getMaxDateString(): string {
  const max = new Date();
  max.setDate(max.getDate() + 90);
  const y = max.getFullYear();
  const m = String(max.getMonth() + 1).padStart(2, "0");
  const d = String(max.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Platform display names
const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
};

export function ScheduleModal({ draftId, isOpen, onClose }: ScheduleModalProps) {
  const router = useRouter();

  // Form state
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("09:00");
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // Accessibility
  const titleId = useId();
  const errorId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);

  // Initialize date to tomorrow (first available slot)
  useEffect(() => {
    if (isOpen && !selectedDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const d = String(tomorrow.getDate()).padStart(2, "0");
      setSelectedDate(`${y}-${m}-${d}`);
    }
  }, [isOpen, selectedDate]);

  // Load connected social accounts
  useEffect(() => {
    if (!isOpen) return;

    setIsLoadingAccounts(true);
    setAccountsError(null);

    fetch("/api/social-accounts")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load accounts");
        return res.json();
      })
      .then((data: { accounts?: SocialAccount[] }) => {
        const connected = (data.accounts ?? []).filter(
          (a) => a.revokedAt === null
        );
        setAccounts(connected);
      })
      .catch(() => {
        setAccountsError("Failed to load connected accounts. Please try again.");
      })
      .finally(() => {
        setIsLoadingAccounts(false);
      });
  }, [isOpen]);

  // Focus trap: when modal opens, focus the first focusable element
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        firstFocusableRef.current?.focus() ?? closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: Tab cycles within modal
      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    setError(null);

    // Client-side validation
    if (!selectedDate) {
      setError("Please select a date.");
      return;
    }
    if (selectedAccountIds.size === 0) {
      setError("Please select at least one platform account.");
      return;
    }

    // Combine date + time into ISO 8601 datetime (local time → UTC conversion)
    // The user picks in their local timezone; we send the UTC equivalent.
    const localDateTimeStr = `${selectedDate}T${selectedTime}:00`;
    const scheduledAt = new Date(localDateTimeStr);

    if (isNaN(scheduledAt.getTime())) {
      setError("Invalid date/time combination.");
      return;
    }

    const now = new Date();
    if (scheduledAt <= now) {
      setError("The scheduled time must be in the future.");
      return;
    }

    const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (scheduledAt > maxDate) {
      setError("The scheduled time must be within 90 days from now.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/drafts/${draftId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_at: scheduledAt.toISOString(),
          platform_account_ids: Array.from(selectedAccountIds),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          data?.error?.message ??
          (res.status === 429
            ? "Too many schedules created. Please wait before scheduling again."
            : res.status === 409
            ? "This draft is not in the correct state to be scheduled. Please approve it first."
            : "Scheduling failed. Please try again.");
        setError(message);
        return;
      }

      // Success — close modal and redirect to schedule list
      onClose();
      router.push("/schedule");
    } catch {
      setError("Scheduling failed. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-modal)",
          padding: "var(--space-6)",
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "calc(100dvh - 64px)",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-5)",
          }}
        >
          <h2
            id={titleId}
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              margin: 0,
            }}
          >
            Schedule Post
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close schedule modal"
            style={{
              minHeight: "var(--min-tap-target)",
              minWidth: "var(--min-tap-target)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--color-muted)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            id={errorId}
            role="alert"
            aria-live="assertive"
            style={{
              backgroundColor: "var(--color-error-surface, #fff5f5)",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              marginBottom: "var(--space-4)",
              color: "var(--color-error)",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            {error}
          </div>
        )}

        {/* Date picker */}
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label
            htmlFor="schedule-date"
            style={{
              display: "block",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text)",
              marginBottom: "var(--space-2)",
            }}
          >
            Date
          </label>
          <input
            ref={firstFocusableRef}
            id="schedule-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={getTodayDateString()}
            max={getMaxDateString()}
            required
            aria-required="true"
            style={{
              width: "100%",
              minHeight: "var(--min-tap-target)",
              padding: "0 var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              color: "var(--color-text)",
              backgroundColor: "var(--color-surface-muted)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Time picker */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label
            htmlFor="schedule-time"
            style={{
              display: "block",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text)",
              marginBottom: "var(--space-2)",
            }}
          >
            Time{" "}
            <span
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontWeight: "var(--font-weight-normal)",
              }}
            >
              (your local timezone)
            </span>
          </label>
          <select
            id="schedule-time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            required
            aria-required="true"
            style={{
              width: "100%",
              minHeight: "var(--min-tap-target)",
              padding: "0 var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              color: "var(--color-text)",
              backgroundColor: "var(--color-surface-muted)",
              boxSizing: "border-box",
            }}
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Platform account multi-select */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <fieldset
            style={{
              border: "none",
              padding: 0,
              margin: 0,
            }}
          >
            <legend
              style={{
                display: "block",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                marginBottom: "var(--space-2)",
              }}
            >
              Platform accounts
            </legend>

            {isLoadingAccounts ? (
              <div
                aria-live="polite"
                style={{
                  color: "var(--color-muted)",
                  fontSize: "var(--font-size-body-sm)",
                  padding: "var(--space-3) 0",
                }}
              >
                Loading connected accounts…
              </div>
            ) : accountsError ? (
              <div
                role="alert"
                style={{
                  color: "var(--color-error)",
                  fontSize: "var(--font-size-body-sm)",
                }}
              >
                {accountsError}
              </div>
            ) : accounts.length === 0 ? (
              <div
                style={{
                  color: "var(--color-muted)",
                  fontSize: "var(--font-size-body-sm)",
                  padding: "var(--space-3)",
                  border: "1px dashed var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}
              >
                No connected accounts.{" "}
                <a
                  href="/account/connections"
                  style={{
                    color: "var(--color-primary)",
                    textDecoration: "underline",
                  }}
                >
                  Connect a platform
                </a>{" "}
                first.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {accounts.map((account) => (
                  <label
                    key={account.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      padding: "var(--space-3)",
                      border: `1px solid ${
                        selectedAccountIds.has(account.id)
                          ? "var(--color-primary)"
                          : "var(--color-border)"
                      }`,
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      backgroundColor: selectedAccountIds.has(account.id)
                        ? "var(--color-primary-surface, #f0f7ff)"
                        : "var(--color-surface)",
                      minHeight: "var(--min-tap-target)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.has(account.id)}
                      onChange={() => toggleAccount(account.id)}
                      aria-label={`Schedule to ${PLATFORM_LABELS[account.platform] ?? account.platform} account`}
                      style={{
                        width: "18px",
                        height: "18px",
                        flexShrink: 0,
                        accentColor: "var(--color-primary)",
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "var(--font-size-body-sm)",
                        color: "var(--color-text)",
                        fontWeight: selectedAccountIds.has(account.id)
                          ? "var(--font-weight-medium)"
                          : "var(--font-weight-normal)",
                      }}
                    >
                      {PLATFORM_LABELS[account.platform] ?? account.platform}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-muted)",
                        marginLeft: "auto",
                      }}
                    >
                      {account.platformUserId}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              flex: 1,
              minHeight: "var(--min-button-height)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || accounts.length === 0 || selectedAccountIds.size === 0}
            aria-busy={isSubmitting}
            aria-disabled={
              isSubmitting || accounts.length === 0 || selectedAccountIds.size === 0
            }
            style={{
              flex: 2,
              minHeight: "var(--min-button-height)",
              backgroundColor:
                isSubmitting || selectedAccountIds.size === 0
                  ? "var(--color-border)"
                  : "var(--color-primary)",
              color:
                isSubmitting || selectedAccountIds.size === 0
                  ? "var(--color-muted)"
                  : "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-semibold)",
              cursor:
                isSubmitting || selectedAccountIds.size === 0
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
            }}
          >
            {isSubmitting ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Scheduling…
              </>
            ) : (
              "Confirm Schedule"
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        a:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </>
  );
}
