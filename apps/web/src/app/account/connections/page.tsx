/**
 * Screen 05 — /account/connections (C4 OAuth Connect dashboard)
 *
 * Shows LinkedIn, Instagram, and Facebook platform tiles (C4-extension).
 * Handles:
 *  - OAuth popup flow with redirect fallback (popup blocker detection)
 *  - Connected state (platform name, profile handle, connected date, disconnect button)
 *  - Empty state (all platforms unconnected)
 *  - Loading state (skeleton tiles on initial fetch)
 *  - Error states (OAuth denied, connection failed)
 *  - Facebook multi-page selection: if URL param facebook_select_page is set,
 *    shows a Modal with a radio list of the user's Pages. Calls
 *    POST /api/social-accounts/:id/select-page to confirm selection.
 *
 * Popup flow:
 *  1. POST /api/social-accounts/connect/:platform → returns authorizationUrl
 *  2. window.open(authorizationUrl) → if null (popup blocked) → redirect fallback
 *  3. OAuth popup completes → callback writes to DB → postMessage back to parent
 *  4. Parent refreshes account list
 *
 * Facebook multi-page flow (added C4-extension):
 *  1. Callback redirects to ?facebook_select_page=<accountId>&pages=<base64url>
 *  2. Page component detects param, decodes page list (IDs + names only — no tokens)
 *  3. Shows PageSelectionModal with radio buttons
 *  4. On selection: POST /api/social-accounts/:id/select-page { pageId }
 *  5. On success: reload accounts, show connected toast
 *
 * DPA modal: NOT IN SCOPE for C4 (per dispatch instructions).
 *
 * WCAG AA: aria-labels on all interactive elements, keyboard navigable,
 * no color-only state indication.
 *
 * UX ref: docs/04-ux.md §4 Screen 05, §3 C4 flow
 * Design tokens: docs/04-ux.md §5
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PlatformTile } from "../../../components/PlatformTile";
import { BottomNav } from "../../../components/BottomNav";

// ---------------------------------------------------------------------------
// Attribution types
// ---------------------------------------------------------------------------

type GoogleConnectorKind = "ga4" | "gsc";

interface GoogleConnection {
  id: string;
  kind: GoogleConnectorKind;
  ga4PropertyId?: string | null;
  gscSiteUrl?: string | null;
  scope: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface BrandOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Platform = "linkedin" | "instagram" | "facebook";

type ConnectedAccount = {
  id: string;
  platform: Platform;
  platformUserId: string;
  connectedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

type FetchState =
  | { status: "loading" }
  | { status: "ok"; accounts: ConnectedAccount[] }
  | { status: "error"; message: string };

// Facebook page option (from URL param — IDs and names only, no tokens)
type FacebookPageOption = {
  id: string;
  name: string;
};

// Multi-page selection modal state
type PageSelectionState =
  | { status: "idle" }
  | { status: "selecting"; accountId: string; pages: FacebookPageOption[]; selectedPageId: string }
  | { status: "submitting"; accountId: string; pages: FacebookPageOption[]; selectedPageId: string }
  | { status: "error"; accountId: string; pages: FacebookPageOption[]; selectedPageId: string; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Call API to get the authorization URL, then attempt popup.
 * Falls back to redirect if window.open returns null (popup blocked).
 */
async function initiateOAuth(
  platform: Platform,
  popupRef: React.MutableRefObject<Window | null>
): Promise<void> {
  const response = await fetch(
    `/api/social-accounts/connect/${platform}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }
  );

  if (!response.ok) {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
    };
    throw new Error(
      body.error?.message ?? `Failed to initiate ${platform} OAuth`
    );
  }

  const data = (await response.json()) as {
    data?: { authorizationUrl?: string };
  };
  const authorizationUrl = data.data?.authorizationUrl;
  if (!authorizationUrl) throw new Error("No authorization URL returned");

  // Attempt popup
  const popup = window.open(
    authorizationUrl,
    `oauth_${platform}`,
    "width=600,height=700,scrollbars=yes,resizable=yes"
  );

  if (!popup) {
    // Popup blocked — redirect fallback (docs/04-ux.md §3 C4 flow)
    window.location.href = authorizationUrl;
    return;
  }

  // Store popup ref so parent can poll for close
  popupRef.current = popup;
}

async function fetchAccounts(): Promise<ConnectedAccount[]> {
  const response = await fetch("/api/social-accounts", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to load connected accounts");
  const body = (await response.json()) as {
    data?: { accounts?: ConnectedAccount[] };
  };
  return body.data?.accounts ?? [];
}

async function disconnectAccount(accountId: string): Promise<void> {
  const response = await fetch(`/api/social-accounts/${accountId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to disconnect account");
  }
}

async function selectPage(accountId: string, pageId: string): Promise<void> {
  const response = await fetch(`/api/social-accounts/${accountId}/select-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ pageId }),
  });
  if (!response.ok) {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to select Facebook Page");
  }
}

// ---------------------------------------------------------------------------
// Google Connector helpers
// ---------------------------------------------------------------------------

async function fetchGoogleStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/google/status", { credentials: "include" });
  if (!res.ok) return { configured: false };
  return (await res.json()) as { configured: boolean };
}

async function fetchBrands(): Promise<BrandOption[]> {
  const res = await fetch("/api/brands", { credentials: "include" });
  if (!res.ok) return [];
  const body = (await res.json()) as { brands?: BrandOption[] };
  return body.brands ?? [];
}

async function fetchGoogleConnections(brandId: string): Promise<GoogleConnection[]> {
  const res = await fetch(`/api/brands/${brandId}/google/connections`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as GoogleConnection[] | { data?: GoogleConnection[] };
  if (Array.isArray(body)) return body;
  return (body as { data?: GoogleConnection[] }).data ?? [];
}

async function disconnectGoogleConnection(
  brandId: string,
  connectionId: string
): Promise<void> {
  const res = await fetch(
    `/api/brands/${brandId}/google/connections/${connectionId}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to disconnect");
  }
}

async function patchGoogleConnection(
  brandId: string,
  connectionId: string,
  patch: { ga4PropertyId?: string; gscSiteUrl?: string }
): Promise<void> {
  const res = await fetch(
    `/api/brands/${brandId}/google/connections/${connectionId}/property`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to update");
  }
}

// ---------------------------------------------------------------------------
// GoogleConnectorTile — one tile per connector kind (ga4 / gsc)
// ---------------------------------------------------------------------------

type GoogleConnectorTileProps = {
  kind: GoogleConnectorKind;
  googleConfigured: boolean;
  selectedBrandId: string;
  connection: GoogleConnection | null;
  onConnect: (kind: GoogleConnectorKind) => void;
  onDisconnect: (connectionId: string) => void;
  onPropertyChange: (connectionId: string, field: "ga4PropertyId" | "gscSiteUrl", value: string) => void;
  onPropertyBlur: (connectionId: string, kind: GoogleConnectorKind, value: string) => void;
};

const CONNECTOR_META: Record<
  GoogleConnectorKind,
  { title: string; description: string; propertyLabel: string; propertyPlaceholder: string }
> = {
  ga4: {
    title: "Google Analytics 4",
    description:
      "See organic search sessions trend alongside your Ozvor AI Visibility Score.",
    propertyLabel: "GA4 Property ID",
    propertyPlaceholder: "properties/123456789",
  },
  gsc: {
    title: "Google Search Console",
    description:
      "See clicks and impressions from Google Search alongside your Visibility Score.",
    propertyLabel: "Site URL",
    propertyPlaceholder: "https://example.com/",
  },
};

function GoogleConnectorTile({
  kind,
  googleConfigured,
  selectedBrandId,
  connection,
  onConnect,
  onDisconnect,
  onPropertyChange,
  onPropertyBlur,
}: GoogleConnectorTileProps) {
  const meta = CONNECTOR_META[kind];
  const isConnected = connection !== null && connection.revokedAt === null;
  const propertyField = kind === "ga4" ? "ga4PropertyId" : "gscSiteUrl";
  const propertyValue = isConnected ? (connection?.[propertyField] ?? "") : "";

  const tileStyle: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-5)",
    boxShadow: "var(--shadow-card)",
  };

  return (
    <div style={tileStyle} role="region" aria-label={`${meta.title} connector`}>
      {/* Tile header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-h4)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              margin: "0 0 var(--space-1) 0",
            }}
          >
            {meta.title}
          </h3>
          <p
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-muted)",
              margin: 0,
              lineHeight: "var(--line-height-body)",
            }}
          >
            {meta.description}
          </p>
        </div>

        {/* Connection status badge */}
        {isConnected && (
          <span
            aria-label="Connected"
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--font-size-badge)",
              fontWeight: 700,
              fontFamily: "var(--font-family)",
              backgroundColor: "var(--color-badge-connected-bg, rgba(15,180,136,0.12))",
              color: "var(--color-badge-connected-text, #0fb488)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Connected
          </span>
        )}
      </div>

      {/* Not configured — warn, no connect button */}
      {!googleConfigured && (
        <div
          role="note"
          style={{
            backgroundColor: "var(--color-badge-status-warn-bg)",
            border: "1px solid var(--color-accent-amber)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-4)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-note-warn)",
              margin: 0,
              lineHeight: "var(--line-height-body)",
            }}
          >
            The founder has not configured Google OAuth credentials yet. Attribution data will
            appear once this is set up.
          </p>
        </div>
      )}

      {/* Configured + not connected — show connect button */}
      {googleConfigured && !isConnected && (
        <button
          type="button"
          onClick={() => onConnect(kind)}
          disabled={!selectedBrandId}
          aria-label={
            selectedBrandId
              ? `Connect ${meta.title} for selected brand`
              : `Select a brand first to connect ${meta.title}`
          }
          style={{
            minHeight: "var(--min-tap-target)",
            padding: "0 var(--space-5)",
            backgroundColor: selectedBrandId ? "var(--color-primary)" : "var(--color-border)",
            color: selectedBrandId ? "#fff" : "var(--color-muted)",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-medium)",
            cursor: selectedBrandId ? "pointer" : "not-allowed",
          }}
        >
          Connect
        </button>
      )}

      {/* Connected — property ID / site URL + disconnect */}
      {googleConfigured && isConnected && connection && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div>
            <label
              htmlFor={`${kind}-property-${connection.id}`}
              style={{
                display: "block",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-muted)",
                marginBottom: "var(--space-1)",
              }}
            >
              {meta.propertyLabel}
            </label>
            <input
              id={`${kind}-property-${connection.id}`}
              type="text"
              value={propertyValue}
              placeholder={meta.propertyPlaceholder}
              onChange={(e) => onPropertyChange(connection.id, propertyField as "ga4PropertyId" | "gscSiteUrl", e.target.value)}
              onBlur={(e) => onPropertyBlur(connection.id, kind, e.target.value)}
              aria-label={`${meta.propertyLabel} for ${meta.title}`}
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: "var(--min-tap-target)",
                padding: "0 var(--space-3)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-text)",
                backgroundColor: "var(--color-surface-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => onDisconnect(connection.id)}
            aria-label={`Disconnect ${meta.title}`}
            style={{
              alignSelf: "flex-start",
              minHeight: "var(--min-tap-target)",
              padding: "0 var(--space-4)",
              backgroundColor: "transparent",
              color: "var(--color-error)",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttributionSection — brand selector + two connector tiles
// ---------------------------------------------------------------------------

function AttributionSection({
  onToast,
}: {
  onToast: (message: string, kind: "success" | "error") => void;
}) {
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [connections, setConnections] = useState<GoogleConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState<Record<string, string>>({});
  const googlePopupRef = useRef<Window | null>(null);

  // Load google/status + brand list on mount.
  useEffect(() => {
    void (async () => {
      const [status, brandList] = await Promise.all([fetchGoogleStatus(), fetchBrands()]);
      setGoogleConfigured(status.configured);
      setBrands(brandList);
      if (brandList.length > 0 && !selectedBrandId) {
        setSelectedBrandId(brandList[0].id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load connections whenever selectedBrandId changes.
  const loadConnections = useCallback(async (brandId: string) => {
    if (!brandId) return;
    setLoadingConnections(true);
    try {
      const conns = await fetchGoogleConnections(brandId);
      setConnections(conns.filter((c) => c.revokedAt === null));
    } catch {
      /* non-blocking */
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBrandId) void loadConnections(selectedBrandId);
  }, [selectedBrandId, loadConnections]);

  // Poll popup close → refresh connections.
  useEffect(() => {
    const interval = setInterval(() => {
      if (googlePopupRef.current && googlePopupRef.current.closed) {
        googlePopupRef.current = null;
        if (selectedBrandId) void loadConnections(selectedBrandId);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [selectedBrandId, loadConnections]);

  function getConnection(kind: GoogleConnectorKind): GoogleConnection | null {
    return connections.find((c) => c.kind === kind && c.revokedAt === null) ?? null;
  }

  async function handleConnect(kind: GoogleConnectorKind) {
    if (!selectedBrandId) return;
    try {
      const res = await fetch(
        `/api/brands/${selectedBrandId}/google/connect/${kind}`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to initiate connection");
      }
      const data = (await res.json()) as { authorizationUrl?: string; configured?: boolean };
      if (data.configured === false) {
        onToast("Google OAuth not configured yet.", "error");
        return;
      }
      if (!data.authorizationUrl) {
        onToast("No authorization URL returned.", "error");
        return;
      }
      const popup = window.open(
        data.authorizationUrl,
        `google_oauth_${kind}`,
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );
      if (!popup) {
        window.location.href = data.authorizationUrl;
        return;
      }
      googlePopupRef.current = popup;
    } catch (err) {
      onToast((err as Error).message ?? "Failed to connect.", "error");
    }
  }

  async function handleDisconnect(connectionId: string) {
    if (!selectedBrandId) return;
    try {
      await disconnectGoogleConnection(selectedBrandId, connectionId);
      onToast("Disconnected successfully.", "success");
      await loadConnections(selectedBrandId);
    } catch (err) {
      onToast((err as Error).message ?? "Failed to disconnect.", "error");
    }
  }

  function handlePropertyChange(
    connectionId: string,
    field: "ga4PropertyId" | "gscSiteUrl",
    value: string
  ) {
    setPropertyDraft((prev) => ({ ...prev, [`${connectionId}-${field}`]: value }));
    // Update local connection list optimistically.
    setConnections((prev) =>
      prev.map((c) => (c.id === connectionId ? { ...c, [field]: value } : c))
    );
  }

  async function handlePropertyBlur(
    connectionId: string,
    kind: GoogleConnectorKind,
    value: string
  ) {
    if (!selectedBrandId) return;
    const draftKey = `${connectionId}-${kind === "ga4" ? "ga4PropertyId" : "gscSiteUrl"}`;
    const current = propertyDraft[draftKey];
    if (current === undefined) return; // Not changed.
    try {
      await patchGoogleConnection(
        selectedBrandId,
        connectionId,
        kind === "ga4" ? { ga4PropertyId: value } : { gscSiteUrl: value }
      );
      setPropertyDraft((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
    } catch (err) {
      onToast((err as Error).message ?? "Failed to save property ID.", "error");
    }
  }

  const KINDS: GoogleConnectorKind[] = ["ga4", "gsc"];

  return (
    <section aria-labelledby="attribution-sources-heading">
      <h2
        id="attribution-sources-heading"
        style={{
          fontFamily: "var(--font-family)",
          fontSize: "var(--font-size-h3)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-4) 0",
        }}
      >
        Attribution Data Sources
      </h2>

      {/* Brand selector */}
      {googleConfigured !== false && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          {brands.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--color-muted)",
                margin: 0,
              }}
            >
              Create a brand first to connect attribution data sources.
            </p>
          ) : (
            <div>
              <label
                htmlFor="google-brand-select"
                style={{
                  display: "block",
                  fontFamily: "var(--font-family)",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  color: "var(--color-text)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Connect to brand
              </label>
              <select
                id="google-brand-select"
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                aria-label="Select brand to connect attribution data sources"
                style={{
                  height: "var(--min-tap-target)",
                  padding: "0 var(--space-3)",
                  fontFamily: "var(--font-family)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-surface-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  minWidth: "200px",
                }}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Screen-reader live region for connection loading state */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {loadingConnections ? "Loading connections…" : ""}
      </div>

      {/* Connector tiles */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {KINDS.map((kind) => (
          <GoogleConnectorTile
            key={kind}
            kind={kind}
            googleConfigured={googleConfigured ?? false}
            selectedBrandId={selectedBrandId}
            connection={loadingConnections ? null : getConnection(kind)}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onPropertyChange={handlePropertyChange}
            onPropertyBlur={handlePropertyBlur}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Facebook Page Selection Modal
// Shown when user manages multiple Facebook Pages after OAuth.
// Uses radio list with keyboard navigation and focus trap.
// WCAG AA: aria-labelledby, role="dialog", aria-modal, keyboard navigable.
// ---------------------------------------------------------------------------

type PageSelectionModalProps = {
  pages: FacebookPageOption[];
  selectedPageId: string;
  onSelect: (pageId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  errorMessage?: string;
};

function PageSelectionModal({
  pages,
  selectedPageId,
  onSelect,
  onConfirm,
  onCancel,
  isSubmitting,
  errorMessage,
}: PageSelectionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  // Focus first radio on mount; trap focus within modal
  useEffect(() => {
    firstRadioRef.current?.focus();

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
          'button, input[type="radio"], [tabindex]:not([tabindex="-1"])'
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
      aria-labelledby="page-select-dialog-title"
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
          maxHeight: "80dvh",
          overflowY: "auto",
        }}
      >
        <h2
          id="page-select-dialog-title"
          style={{
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginBottom: "var(--space-2)",
          }}
        >
          Choose a Facebook Page
        </h2>
        <p
          style={{
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            marginBottom: "var(--space-4)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          You manage multiple Facebook Pages. Select the Page you want to connect
          for scheduling.
        </p>

        {/* Radio list */}
        <fieldset
          style={{
            border: "none",
            padding: 0,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          <legend
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text)",
              marginBottom: "var(--space-3)",
              display: "block",
            }}
          >
            Select a Page
          </legend>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
          >
            {pages.map((page, idx) => (
              <label
                key={page.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3)",
                  border: `1px solid ${
                    selectedPageId === page.id
                      ? "var(--color-primary)"
                      : "var(--color-border)"
                  }`,
                  borderRadius: "var(--radius-md)",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  backgroundColor:
                    selectedPageId === page.id
                      ? "var(--color-primary-subtle, var(--color-surface-muted))"
                      : "var(--color-surface)",
                  transition: "border-color 0.15s ease, background-color 0.15s ease",
                }}
              >
                <input
                  ref={idx === 0 ? firstRadioRef : undefined}
                  type="radio"
                  name="facebook-page"
                  value={page.id}
                  checked={selectedPageId === page.id}
                  onChange={() => onSelect(page.id)}
                  disabled={isSubmitting}
                  style={{ accentColor: "var(--color-primary)" }}
                  aria-label={`Select Facebook Page: ${page.name}`}
                />
                <span
                  style={{
                    fontFamily: "var(--font-family)",
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-text)",
                    fontWeight:
                      selectedPageId === page.id
                        ? "var(--font-weight-medium)"
                        : "var(--font-weight-regular, 400)",
                  }}
                >
                  {page.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Error message */}
        {errorMessage && (
          <p
            role="alert"
            style={{
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-error)",
              marginBottom: "var(--space-3)",
            }}
          >
            {errorMessage}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              flex: 1,
              minHeight: "var(--min-button-height)",
              padding: "var(--padding-component)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color: isSubmitting ? "var(--color-muted)" : "var(--color-text)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || !selectedPageId}
            aria-label={
              isSubmitting
                ? "Connecting selected Facebook Page"
                : "Connect selected Facebook Page"
            }
            style={{
              flex: 1,
              minHeight: "var(--min-button-height)",
              padding: "var(--padding-component)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color:
                isSubmitting || !selectedPageId
                  ? "var(--color-muted)"
                  : "white",
              backgroundColor:
                isSubmitting || !selectedPageId
                  ? "var(--color-border)"
                  : "var(--color-primary)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor:
                isSubmitting || !selectedPageId ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Connecting…" : "Connect this Page"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(
    null
  );
  const [pageSelection, setPageSelection] = useState<PageSelectionState>({ status: "idle" });
  const popupRef = useRef<Window | null>(null);

  // -------------------------------------------------------------------------
  // Load accounts on mount
  // -------------------------------------------------------------------------
  const loadAccounts = useCallback(async () => {
    setFetchState({ status: "loading" });
    try {
      const accounts = await fetchAccounts();
      setFetchState({ status: "ok", accounts });
    } catch (err) {
      setFetchState({
        status: "error",
        message: (err as Error).message ?? "Failed to load accounts",
      });
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // -------------------------------------------------------------------------
  // Handle OAuth popup close detection
  // Poll every 500ms; when popup closes, reload accounts
  // -------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        void loadAccounts();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [loadAccounts]);

  // -------------------------------------------------------------------------
  // Handle URL search params from redirect callback
  // (success=linkedin, error=oauth_denied, facebook_select_page=<id>, etc.)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const facebookSelectPage = params.get("facebook_select_page");
    const pagesEncoded = params.get("pages");

    if (facebookSelectPage && pagesEncoded) {
      // Multi-page Facebook flow: decode page list and show selection modal
      try {
        // Decode base64url (backend encodes with Buffer.toString("base64url")).
        // base64url replaces '+' with '-' and '/' with '_'; atob() needs standard base64.
        const base64Standard = pagesEncoded
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const pagesJson = atob(base64Standard);
        const pages = JSON.parse(pagesJson) as FacebookPageOption[];
        if (pages.length > 0) {
          setPageSelection({
            status: "selecting",
            accountId: facebookSelectPage,
            pages,
            selectedPageId: pages[0].id, // Pre-select first page
          });
          // Clean URL (remove params without navigation)
          window.history.replaceState({}, "", window.location.pathname);
          void loadAccounts();
          return;
        }
      } catch {
        // Malformed pages param — fall through to error handling
      }
    }

    // Google OAuth callback params.
    const googleConnected = params.get("google_connected");
    const googleError = params.get("google_error");

    if (googleConnected) {
      const kindLabel =
        googleConnected === "ga4"
          ? "Google Analytics 4"
          : googleConnected === "gsc"
          ? "Google Search Console"
          : googleConnected;
      setToast({ message: `${kindLabel} connected.`, kind: "success" });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (googleError) {
      setToast({ message: `Google connection failed: ${googleError}`, kind: "error" });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (success) {
      const platform = success.charAt(0).toUpperCase() + success.slice(1);
      setToast({ message: `${platform} connected successfully.`, kind: "success" });
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      void loadAccounts();
    } else if (error === "oauth_denied") {
      setToast({
        message: "Connection cancelled. You can try again any time.",
        kind: "error",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      setToast({
        message: "Connection failed. Please try again.",
        kind: "error",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadAccounts]);

  // -------------------------------------------------------------------------
  // Toast auto-dismiss
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------
  async function handleConnect(platform: Platform) {
    try {
      await initiateOAuth(platform, popupRef);
    } catch (err) {
      setToast({
        message: (err as Error).message ?? "Failed to initiate connection.",
        kind: "error",
      });
    }
  }

  async function handleDisconnect(accountId: string, platform: Platform) {
    try {
      await disconnectAccount(accountId);
      const label = platform === "facebook" ? "Facebook Page" : platform.charAt(0).toUpperCase() + platform.slice(1);
      setToast({ message: `${label} disconnected.`, kind: "success" });
      await loadAccounts();
    } catch (err) {
      setToast({
        message: (err as Error).message ?? "Failed to disconnect account.",
        kind: "error",
      });
      throw err; // re-throw so PlatformTile can show inline error
    }
  }

  // -------------------------------------------------------------------------
  // Facebook page selection handlers
  // -------------------------------------------------------------------------
  function handlePageSelect(pageId: string) {
    setPageSelection((prev) => {
      if (prev.status === "selecting" || prev.status === "error") {
        return { ...prev, selectedPageId: pageId };
      }
      return prev;
    });
  }

  async function handlePageConfirm() {
    if (pageSelection.status !== "selecting" && pageSelection.status !== "error") return;

    const { accountId, pages, selectedPageId } = pageSelection;

    setPageSelection({ status: "submitting", accountId, pages, selectedPageId });

    try {
      await selectPage(accountId, selectedPageId);
      setPageSelection({ status: "idle" });
      setToast({ message: "Facebook Page connected successfully.", kind: "success" });
      await loadAccounts();
    } catch (err) {
      setPageSelection({
        status: "error",
        accountId,
        pages,
        selectedPageId,
        message: (err as Error).message ?? "Failed to select Facebook Page. Please try again.",
      });
    }
  }

  function handlePageCancel() {
    setPageSelection({ status: "idle" });
    // Note: the social_account row exists in DB with the auto-selected first page.
    // If user cancels page selection, the first page remains connected.
    // The user can disconnect it via the tile if needed.
    setToast({
      message: "Page selection cancelled. First page was auto-selected.",
      kind: "success",
    });
    void loadAccounts();
  }

  // -------------------------------------------------------------------------
  // Derive per-platform account (null if not connected)
  // -------------------------------------------------------------------------
  function getAccount(platform: Platform): ConnectedAccount | null {
    if (fetchState.status !== "ok") return null;
    return (
      fetchState.accounts.find(
        (a) => a.platform === platform && a.revokedAt === null
      ) ?? null
    );
  }

  const platforms: Platform[] = ["linkedin", "instagram", "facebook"];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--color-surface-muted)",
        paddingBottom: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))",
        fontFamily: "var(--font-family)",
      }}
    >
      {/* Facebook multi-page selection modal */}
      {pageSelection.status !== "idle" && (
        <PageSelectionModal
          pages={pageSelection.pages}
          selectedPageId={pageSelection.selectedPageId}
          onSelect={handlePageSelect}
          onConfirm={handlePageConfirm}
          onCancel={handlePageCancel}
          isSubmitting={pageSelection.status === "submitting"}
          errorMessage={
            pageSelection.status === "error" ? pageSelection.message : undefined
          }
        />
      )}
      {/* Page header */}
      <header
        style={{
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          padding: "0 var(--margin-page-mobile)",
          height: "48px",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <a
          href="/account"
          aria-label="Back to Account"
          style={{
            color: "var(--color-primary)",
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
            minHeight: "var(--min-tap-target)",
            display: "flex",
            alignItems: "center",
          }}
        >
          &#8592; Back
        </a>
        <h1
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          Connected Platforms
        </h1>
      </header>

      {/* Toast notification */}
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
            backgroundColor:
              toast.kind === "success" ? "var(--color-success)" : "var(--color-error)",
            color: "white",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body-sm)",
            fontFamily: "var(--font-family)",
            maxWidth: "calc(375px - var(--space-8))",
            textAlign: "center",
            zIndex: 300,
            boxShadow: "var(--shadow-card)",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Main content */}
      <main
        style={{
          padding: "var(--space-6) var(--margin-page-mobile)",
          maxWidth: "480px",
          margin: "0 auto",
        }}
      >
        {/* Loading state — skeleton tiles */}
        {fetchState.status === "loading" && (
          <div
            aria-label="Loading connected platforms"
            aria-busy="true"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
          >
            {platforms.map((p) => (
              <div
                key={p}
                style={{
                  height: "140px",
                  backgroundColor: "var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {fetchState.status === "error" && (
          <div
            role="alert"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
            }}
          >
            <p
              style={{
                color: "var(--color-error)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                marginBottom: "var(--space-4)",
              }}
            >
              {fetchState.message}
            </p>
            <button
              type="button"
              onClick={() => void loadAccounts()}
              style={{
                minHeight: "var(--min-tap-target)",
                padding: "var(--space-2) var(--space-4)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-primary)",
                backgroundColor: "transparent",
                border: "1px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Platform tiles */}
        {fetchState.status === "ok" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
          >
            {/* Empty state */}
            {fetchState.accounts.filter((a) => a.revokedAt === null).length === 0 && (
              <p
                style={{
                  fontFamily: "var(--font-family)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-muted)",
                  marginBottom: "var(--space-4)",
                  textAlign: "center",
                }}
              >
                Connect LinkedIn, Instagram, or Facebook to start scheduling.
              </p>
            )}

            {platforms.map((platform) => (
              <PlatformTile
                key={platform}
                platform={platform}
                account={getAccount(platform)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}

        {/* Divider */}
        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--color-border)",
            margin: "var(--space-8) 0",
          }}
          aria-hidden="true"
        />

        {/* Attribution Data Sources section */}
        <AttributionSection
          onToast={(message, kind) => setToast({ message, kind })}
        />
      </main>

      <BottomNav />

      {/* Skeleton pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .bottom-nav-item:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
          border-radius: var(--radius-sm);
        }
        button:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
        a:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </div>
  );
}
