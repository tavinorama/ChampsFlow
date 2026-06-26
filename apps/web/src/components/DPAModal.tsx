"use client";

/**
 * DPAModal — CI-1 DPA Onboarding Gate
 *
 * docs/04-ux.md §6 CI-1 (EU variant) and §6 CI-1b (US variant).
 * COPY IS VERBATIM FROM docs/04-ux.md — DO NOT PARAPHRASE OR EDIT.
 *
 * Props:
 *   dpa_variant: 'EU' | 'US'  — which copy variant to show
 *   dpa_version: string        — current DPA version to acknowledge
 *   onAcknowledged: () => void — called after successful POST /api/dpa/acknowledge
 *   onExit: () => void         — called when user clicks "Not now — exit"
 *
 * Accessibility:
 *   - role="dialog", aria-modal="true", aria-labelledby="dpa-modal-title"
 *   - Focus trap: only two CTA buttons and two links are focusable
 *   - Tab cycles: agree button → exit button → DPA link → privacy link → agree button
 *   - Escape key: triggers "Not now — exit" path (never silent dismiss — arch §5 + UX §5)
 *   - WCAG AA contrast on all CTA buttons (primary blue on white = 4.81:1 > 4.5:1)
 *
 * Non-dismissable: no backdrop click handler, no X close button, no silent Escape.
 *
 * Layout: centered modal, max-width 480px, 24px padding, 12px radius,
 *         backdrop rgba(0,0,0,0.4). Two equal-weight 48px full-width CTA buttons.
 *         No pre-checked boxes.
 */

import { useEffect, useRef, useState, useId } from "react";

export interface DPAModalProps {
  dpa_variant: "EU" | "US";
  dpa_version: string;
  onAcknowledged: () => void;
  onExit: () => void;
}

export function DPAModal({
  dpa_variant,
  dpa_version,
  onAcknowledged,
  onExit,
}: DPAModalProps) {
  const titleId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus refs — focus lands on agree button on open; Tab cycles within modal
  const agreeButtonRef = useRef<HTMLButtonElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const dpaLinkRef = useRef<HTMLAnchorElement>(null);
  const privacyLinkRef = useRef<HTMLAnchorElement>(null);

  // Focus agree button on mount
  useEffect(() => {
    agreeButtonRef.current?.focus();
  }, []);

  // Focus trap + Escape handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // UX §5: DPA modal Escape triggers the "Not now, exit" path — never silent dismiss
        e.preventDefault();
        handleExit();
        return;
      }

      if (e.key !== "Tab") return;

      // Tab cycle order: agreeButton → exitButton → dpaLink → privacyLink → agreeButton
      const focusOrder = [
        agreeButtonRef.current,
        exitButtonRef.current,
        dpaLinkRef.current,
        privacyLinkRef.current,
      ].filter(Boolean) as HTMLElement[];

      const currentIndex = focusOrder.indexOf(document.activeElement as HTMLElement);

      if (e.shiftKey) {
        // Shift+Tab — cycle backward
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? focusOrder.length - 1 : currentIndex - 1;
        focusOrder[prevIndex]?.focus();
      } else {
        // Tab — cycle forward
        e.preventDefault();
        const nextIndex = currentIndex >= focusOrder.length - 1 ? 0 : currentIndex + 1;
        focusOrder[nextIndex]?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAgree() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/dpa/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dpa_version, variant: dpa_variant }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to record acknowledgment"
        );
      }

      onAcknowledged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
    }
  }

  function handleExit() {
    onExit();
  }

  return (
    <>
      {/* Backdrop — click blocked (non-dismissable modal) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 101,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "480px",
            width: "100%",
            boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          }}
        >
          {/* Title — h2, no X close button (non-dismissable) */}
          <h2
            id={titleId}
            style={{
              fontSize: "20px",
              fontWeight: 600,
              lineHeight: 1.3,
              color: "var(--color-text)",
              marginBottom: "16px",
              marginTop: 0,
            }}
          >
            Before you continue
          </h2>

          {/* Copy — VERBATIM from docs/04-ux.md §6 CI-1 (EU) or CI-1b (US) */}
          {dpa_variant === "EU" ? (
            <EUCopy />
          ) : (
            <USCopy />
          )}

          {/* Links — placed above CTAs per UX spec */}
          <div style={{ marginTop: "16px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <a
              ref={dpaLinkRef}
              href="/legal/dpa"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--color-primary)",
                fontSize: "14px",
                textDecoration: "underline",
              }}
            >
              {dpa_variant === "EU" ? "Read full DPA ↗" : "Read full Data Processing Terms ↗"}
            </a>
            <a
              ref={privacyLinkRef}
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--color-primary)",
                fontSize: "14px",
                textDecoration: "underline",
              }}
            >
              Read Privacy Policy ↗
            </a>
          </div>

          {/* Error state */}
          {error && (
            <p
              role="alert"
              style={{
                color: "var(--color-error)",
                fontSize: "14px",
                marginBottom: "12px",
                marginTop: 0,
              }}
            >
              {error}
            </p>
          )}

          {/* CTA buttons — equal weight, 48px full-width
              EU: "Acknowledge & Continue" / "Not now — exit to login"
              US: "I agree and continue" / "Not now — exit"
              Both are per UX §6 CI-1 and CI-1b VERBATIM */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Primary CTA — "Acknowledge & Continue" (EU) / "I agree and continue" (US) */}
            <button
              ref={agreeButtonRef}
              type="button"
              onClick={() => void handleAgree()}
              disabled={isSubmitting}
              style={{
                backgroundColor: "var(--color-primary)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                height: "48px",
                width: "100%",
                fontSize: "16px",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.7 : 1,
                outline: "none",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.outline = `${3}px solid var(--color-focus-outline)`)
              }
              onBlur={(e) => (e.currentTarget.style.outline = "none")}
            >
              {isSubmitting
                ? "Recording acknowledgment..."
                : dpa_variant === "EU"
                ? "Acknowledge & Continue"
                : "I agree and continue"}
            </button>

            {/* Ghost CTA — "Not now — exit to login" (EU) / "Not now — exit" (US) */}
            <button
              ref={exitButtonRef}
              type="button"
              onClick={handleExit}
              disabled={isSubmitting}
              style={{
                backgroundColor: "transparent",
                color: "var(--color-text)",
                border: `1px solid var(--color-border)`,
                borderRadius: "8px",
                height: "48px",
                width: "100%",
                fontSize: "16px",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.5 : 1,
                outline: "none",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.outline = `${3}px solid var(--color-focus-outline)`)
              }
              onBlur={(e) => (e.currentTarget.style.outline = "none")}
            >
              {dpa_variant === "EU" ? "Not now — exit to login" : "Not now — exit"}
            </button>
          </div>

          {/* Consequence text — caption style, muted, not error-styled
              VERBATIM: "Declining means your account will not be created." */}
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-muted)",
              marginTop: "12px",
              marginBottom: 0,
              textAlign: "center",
            }}
          >
            Declining means your account will not be created.
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// EU variant copy — VERBATIM from docs/04-ux.md §6 CI-1
// ---------------------------------------------------------------------------
function EUCopy() {
  return (
    <div>
      <p
        style={{
          fontSize: "16px",
          color: "var(--color-text)",
          lineHeight: 1.5,
          margin: "0 0 12px 0",
        }}
      >
        We process your data as a processor under GDPR Art. 28.
      </p>
      <ul
        style={{
          fontSize: "16px",
          color: "var(--color-text)",
          lineHeight: 1.5,
          paddingLeft: "20px",
          margin: "0",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <li>Post content used only to generate and schedule posts.</li>
        <li>OAuth tokens encrypted; never shared with third parties.</li>
        <li>
          AI inference via Anthropic — no training on your content per API terms.
        </li>
        <li>Request deletion any time: Account &gt; Data &amp; Privacy.</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// US variant copy — VERBATIM from docs/04-ux.md §6 CI-1b
// ---------------------------------------------------------------------------
function USCopy() {
  return (
    <div>
      <p
        style={{
          fontSize: "16px",
          color: "var(--color-text)",
          lineHeight: 1.5,
          margin: "0 0 12px 0",
        }}
      >
        When you upload content or connect a social account, Ozvor
        processes that information on your behalf under our Data Processing
        Terms. Please review the key points below before continuing.
      </p>
      <ul
        style={{
          fontSize: "16px",
          color: "var(--color-text)",
          lineHeight: 1.5,
          paddingLeft: "20px",
          margin: "0",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <li>
          Purpose limitation: we only use your content to draft and publish
          posts you approve.
        </li>
        <li>
          AI inference via Anthropic. Zero data retention by default — your
          content is not stored by Anthropic and is never used to train AI
          models.
        </li>
        <li>OAuth tokens encrypted at rest with field-level AES-256-GCM.</li>
        <li>Deletion path: Account &gt; Data &amp; Privacy &gt; Delete my data.</li>
      </ul>
    </div>
  );
}
