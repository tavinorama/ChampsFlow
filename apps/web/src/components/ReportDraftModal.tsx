"use client";

/**
 * ReportDraftModal — A6/L-UX-2 "Report this draft" modal
 *
 * Opens when user clicks "Report this draft" ghost button on Screen 02.
 * Submits to POST /api/drafts/:id/report with category + optional detail.
 *
 * Accessibility:
 *  - Modal traps focus on open; returns focus to trigger element on close
 *  - ESC closes modal
 *  - Backdrop click closes modal
 *  - All interactive elements have visible labels
 *
 * docs/04-ux.md §3 C3 flow, §7 "How users contest outputs"
 */

import { useEffect, useRef, useState } from "react";

const REPORT_CATEGORIES = [
  { value: "harmful", label: "Harmful content" },
  { value: "inaccurate", label: "Inaccurate information" },
  { value: "off_brand", label: "Off-brand or inappropriate tone" },
  { value: "other", label: "Other" },
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

interface ReportDraftModalProps {
  draftId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportDraftModal({
  draftId,
  isOpen,
  onClose,
}: ReportDraftModalProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<ReportCategory | "">("");
  const [detail, setDetail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFocusableRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Store trigger element for focus return on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Move focus into modal
      setTimeout(() => firstFocusableRef.current?.focus(), 10);
    } else {
      // Return focus to trigger
      triggerRef.current?.focus();
      // Reset state on close
      setSelectedCategory("");
      setDetail("");
      setSubmitted(false);
      setError(null);
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const trapHandler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
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
    };

    document.addEventListener("keydown", trapHandler);
    return () => document.removeEventListener("keydown", trapHandler);
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategory) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/drafts/${draftId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          detail: detail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit report");
      }

      setSubmitted(true);
      // Auto-close after 2 seconds on success
      setTimeout(() => onClose(), 2000);
    } catch {
      setError("Could not submit report. Please try again.");
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
          zIndex: 50,
        }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 51,
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-modal)",
          padding: "var(--space-6)",
          width: "min(480px, calc(100vw - 32px))",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <h2
          id="report-modal-title"
          ref={firstFocusableRef}
          tabIndex={-1}
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginBottom: "var(--space-4)",
            outline: "none",
          }}
        >
          Report this draft
        </h2>

        {submitted ? (
          <p
            role="status"
            style={{
              color: "var(--color-success)",
              fontSize: "var(--font-size-body)",
            }}
          >
            Report received — thank you.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Category selection */}
            <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
              <legend
                style={{
                  fontSize: "var(--font-size-h4)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Category <span aria-hidden="true">*</span>
              </legend>
              {REPORT_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    minHeight: "var(--min-tap-target)",
                    cursor: "pointer",
                    fontSize: "var(--font-size-body)",
                    color: "var(--color-text)",
                  }}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    required
                    checked={selectedCategory === cat.value}
                    onChange={() =>
                      setSelectedCategory(cat.value as ReportCategory)
                    }
                    style={{ width: "18px", height: "18px", accentColor: "var(--color-primary)" }}
                  />
                  {cat.label}
                </label>
              ))}
            </fieldset>

            {/* Optional free text */}
            <div style={{ marginBottom: "var(--space-4)" }}>
              <label
                htmlFor="report-detail"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-h4)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Details (optional)
              </label>
              <textarea
                id="report-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Describe the issue…"
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  border: `1px solid var(--color-border)`,
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body)",
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-surface-muted)",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  color: "var(--color-error)",
                  fontSize: "var(--font-size-body-sm)",
                  marginBottom: "var(--space-3)",
                }}
              >
                {error}
              </p>
            )}

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  minHeight: "var(--min-button-height)",
                  padding: "0 var(--space-4)",
                  backgroundColor: "transparent",
                  color: "var(--color-text)",
                  border: `1px solid var(--color-border)`,
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedCategory || isSubmitting}
                style={{
                  minHeight: "var(--min-button-height)",
                  padding: "0 var(--space-4)",
                  backgroundColor:
                    !selectedCategory || isSubmitting
                      ? "var(--color-border)"
                      : "var(--color-primary)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body)",
                  cursor: !selectedCategory || isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                {isSubmitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
