/**
 * PlatformTile — OAuth connect/disconnect tile for C4
 *
 * Shows connection status for LinkedIn or Instagram.
 * Connected state: success color + handle + expiry + Disconnect button
 * Disconnected state: Connect button (primary outlined)
 *
 * WCAG AA requirements (docs/04-ux.md §8):
 *  - aria-label on Connect/Disconnect buttons (Screen 05 labels)
 *  - Color is never the sole state indicator (text "Connected" / "Not connected")
 *  - Minimum 44px tap targets
 *  - Focus: 3px outline, 2px offset on all interactive elements
 *
 * UX ref: docs/04-ux.md §4 Screen 05
 */

"use client";

import { useState, useEffect, useRef } from "react";

type Platform = "linkedin" | "instagram" | "facebook";

type ConnectedAccount = {
  id: string;
  platformUserId: string;
  connectedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

type PlatformTileProps = {
  platform: Platform;
  account: ConnectedAccount | null; // null = not connected
  onConnect: (platform: Platform) => Promise<void>;
  onDisconnect: (accountId: string, platform: Platform) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Platform metadata
// ---------------------------------------------------------------------------

const PLATFORM_META: Record<Platform, { label: string; scopeCaption: string; ariaConnect: string }> = {
  linkedin: {
    label: "LinkedIn",
    scopeCaption: "Scope: post on your behalf",
    ariaConnect: "Connect your LinkedIn account",
  },
  instagram: {
    label: "Instagram",
    scopeCaption: "Scope: publish to your account",
    ariaConnect: "Connect your Instagram account",
  },
  facebook: {
    label: "Facebook Page",
    scopeCaption: "Scope: publish to your Page",
    ariaConnect: "Connect your Facebook Page",
  },
};

// ---------------------------------------------------------------------------
// Platform icon (inline SVG — Lucide React subset, MIT)
// ---------------------------------------------------------------------------

function LinkedInIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="var(--color-primary)"
      aria-hidden="true"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-primary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon() {
  // Facebook brand icon — inline SVG (Lucide React does not include a Facebook icon
  // matching the Meta/Facebook brand; using a simplified letter-f variant that is
  // recognizable without licensing issues. Brand color applied via CSS var
  // --color-facebook-brand if defined in tokens, else falls back to --color-primary).
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="var(--color-facebook-brand, var(--color-primary))"
      aria-hidden="true"
      role="img"
    >
      {/* Simplified Facebook 'f' mark */}
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === "linkedin") return <LinkedInIcon />;
  if (platform === "facebook") return <FacebookIcon />;
  return <InstagramIcon />;
}

// ---------------------------------------------------------------------------
// Confirmation dialog for disconnect
// ---------------------------------------------------------------------------

type ConfirmDisconnectDialogProps = {
  platform: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDisconnectDialog({
  platform,
  onConfirm,
  onCancel,
}: ConfirmDisconnectDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap: move focus to dialog on mount; return to trigger on close
  useEffect(() => {
    // Move focus to the cancel button (first focusable element) on open
    cancelBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        zIndex: 200,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-modal)",
          padding: "var(--space-6)",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <h2
          id="disconnect-dialog-title"
          style={{
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginBottom: "var(--space-4)",
          }}
        >
          Disconnect {platform}?
        </h2>
        <p
          style={{
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-body)",
            color: "var(--color-muted)",
            marginBottom: "var(--space-6)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          This will cancel all scheduled posts for this account and remove the
          connection. You can reconnect at any time.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              minHeight: "var(--min-button-height)",
              padding: "var(--padding-component)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            Keep connected
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-label={`Confirm disconnect from ${platform}`}
            style={{
              flex: 1,
              minHeight: "var(--min-button-height)",
              padding: "var(--padding-component)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-error)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            Yes, disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformTile
// ---------------------------------------------------------------------------

export function PlatformTile({
  platform,
  account,
  onConnect,
  onDisconnect,
}: PlatformTileProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PLATFORM_META[platform];
  const isConnected = account !== null && account.revokedAt === null;

  function formatExpiry(iso: string | null): string {
    if (!iso) return "Does not expire";
    const date = new Date(iso);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      await onConnect(platform);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnectConfirmed() {
    if (!account) return;
    setShowConfirm(false);
    setIsDisconnecting(true);
    setError(null);
    try {
      await onDisconnect(account.id, platform);
    } catch {
      setError("Disconnect failed. Please try again.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  // Connected tile aria-label (Screen 05 spec)
  const tileAriaLabel = isConnected
    ? `${meta.label}, connected as ${account!.platformUserId}, expires ${formatExpiry(account!.expiresAt)}`
    : `${meta.label}, not connected`;

  return (
    <>
      {showConfirm && (
        <ConfirmDisconnectDialog
          platform={meta.label}
          onConfirm={handleDisconnectConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <article
        aria-label={tileAriaLabel}
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-4)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Platform header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <PlatformIcon platform={platform} />
          <span
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-h3)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Connection status */}
        {isConnected ? (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <p
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-success)",
                fontWeight: "var(--font-weight-medium)",
                marginBottom: "var(--space-1)",
              }}
            >
              {/* Color + text — never color alone (WCAG 1.4.1) */}
              &#10003; Connected: {account!.platformUserId}
            </p>
            <p
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              Expires: {formatExpiry(account!.expiresAt)}
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <p
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                marginBottom: "var(--space-1)",
              }}
            >
              Not connected
            </p>
            <p
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              {meta.scopeCaption}
            </p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p
            role="alert"
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              marginBottom: "var(--space-3)",
            }}
          >
            {error}
          </p>
        )}

        {/* Action button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {isConnected ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={isDisconnecting}
              aria-label={`Disconnect your ${meta.label} account`}
              style={{
                minHeight: "var(--min-tap-target)",
                padding: "var(--space-2) var(--space-4)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: isDisconnecting ? "var(--color-muted)" : "var(--color-error)",
                backgroundColor: "transparent",
                border: `1px solid ${isDisconnecting ? "var(--color-border)" : "var(--color-error)"}`,
                borderRadius: "var(--radius-md)",
                cursor: isDisconnecting ? "not-allowed" : "pointer",
                opacity: isDisconnecting ? 0.6 : 1,
              }}
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              aria-label={meta.ariaConnect}
              style={{
                minHeight: "var(--min-tap-target)",
                padding: "var(--space-2) var(--space-4)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: isConnecting ? "var(--color-muted)" : "var(--color-primary)",
                backgroundColor: "transparent",
                border: `1px solid ${isConnecting ? "var(--color-border)" : "var(--color-primary)"}`,
                borderRadius: "var(--radius-md)",
                cursor: isConnecting ? "not-allowed" : "pointer",
                opacity: isConnecting ? 0.6 : 1,
              }}
            >
              {isConnecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </article>
    </>
  );
}
