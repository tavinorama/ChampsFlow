"use client";

/**
 * SocialConnectPanel — one-click publishing-platform linking, embedded on the
 * "AI engines, keys & connections" hub (/account/integrations).
 *
 * Lets the customer connect LinkedIn / Instagram / Facebook right where they
 * manage their AI engines — no bounce to a separate page to *start* the OAuth.
 * This is the growth surface: the more channels a customer links, the stickier
 * the account and the more "approved fix → publish" value Ozvor can deliver.
 *
 * It reuses the shipped <PlatformTile> (connect + disconnect + confirm dialog)
 * and mirrors the exact OAuth-initiation flow from /account/connections
 * (POST connect → popup → poll for close → reload). The advanced flows that
 * need more room — Facebook Page selection and the Google Analytics / Search
 * Console attribution connectors — stay on the full /account/connections page,
 * linked at the bottom. Keeping that page as the source of truth for the deep
 * flow means this panel never has to duplicate the fragile callback machinery.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PlatformTile } from "./PlatformTile";

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

const PLATFORMS: Platform[] = ["linkedin", "instagram", "facebook"];

// Mirrors /account/connections: cookie-authenticated, same relative API paths.
async function fetchAccounts(): Promise<ConnectedAccount[]> {
  const response = await fetch("/api/social-accounts", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load connected accounts");
  const body = (await response.json()) as { data?: { accounts?: ConnectedAccount[] } };
  return body.data?.accounts ?? [];
}

async function initiateOAuth(
  platform: Platform,
  popupRef: React.MutableRefObject<Window | null>
): Promise<void> {
  const response = await fetch(`/api/social-accounts/connect/${platform}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Failed to initiate ${platform} OAuth`);
  }
  const data = (await response.json()) as { data?: { authorizationUrl?: string } };
  const authorizationUrl = data.data?.authorizationUrl;
  if (!authorizationUrl) throw new Error("No authorization URL returned");

  const popup = window.open(
    authorizationUrl,
    `oauth_${platform}`,
    "width=600,height=700,scrollbars=yes,resizable=yes"
  );
  if (!popup) {
    // Popup blocked — full-page redirect fallback (returns to /account/connections).
    window.location.href = authorizationUrl;
    return;
  }
  popupRef.current = popup;
}

async function disconnectAccount(accountId: string): Promise<void> {
  const response = await fetch(`/api/social-accounts/${accountId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to disconnect account");
  }
}

export function SocialConnectPanel() {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const popupRef = useRef<Window | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const accounts = await fetchAccounts();
      setFetchState({ status: "ok", accounts });
    } catch (err) {
      setFetchState({ status: "error", message: (err as Error).message ?? "Failed to load accounts" });
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // When the OAuth popup closes, refresh connected accounts so the tile flips
  // to "Connected" without a manual reload.
  useEffect(() => {
    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        void loadAccounts();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [loadAccounts]);

  async function handleConnect(platform: Platform) {
    // Errors surface inline in PlatformTile (it catches + shows "Connection failed").
    await initiateOAuth(platform, popupRef);
  }

  async function handleDisconnect(accountId: string, _platform: Platform) {
    await disconnectAccount(accountId);
    await loadAccounts();
  }

  function getAccount(platform: Platform): ConnectedAccount | null {
    if (fetchState.status !== "ok") return null;
    return fetchState.accounts.find((a) => a.platform === platform && a.revokedAt === null) ?? null;
  }

  const connectedCount =
    fetchState.status === "ok" ? fetchState.accounts.filter((a) => a.revokedAt === null).length : 0;

  return (
    <section aria-labelledby="connect-platforms-heading" style={{ marginBottom: "var(--space-8)" }}>
      <h2
        id="connect-platforms-heading"
        style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}
      >
        Connect your publishing platforms
      </h2>
      <p
        style={{
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          margin: "0 0 var(--space-4) 0",
        }}
      >
        Link the channels where your brand should show up. Once connected, Ozvor turns
        approved fixes into ready-to-publish drafts — one place to manage every platform.
        We store encrypted tokens, never your password.
        {connectedCount > 0 && (
          <>
            {" "}
            <strong style={{ color: "var(--color-success)" }}>
              {connectedCount} connected.
            </strong>
          </>
        )}
      </p>

      {fetchState.status === "error" && (
        <p
          role="alert"
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-error)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          Could not load your connections. Refresh the page to try again.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {PLATFORMS.map((p) => (
          <PlatformTile
            key={p}
            platform={p}
            account={getAccount(p)}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      <p
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          margin: "var(--space-3) 0 0 0",
        }}
      >
        Need Facebook Page selection, or Google Analytics / Search Console attribution?{" "}
        <a href="/account/connections" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
          Open advanced connections →
        </a>
      </p>
    </section>
  );
}
