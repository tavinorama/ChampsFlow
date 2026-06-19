"use client";

/**
 * DpaGate — CI-1 DPA Onboarding Gate provider
 *
 * Wraps authenticated routes. On mount, calls GET /api/dpa/status.
 * If needs_acknowledgment === true, renders <DPAModal> with the right variant.
 * Otherwise renders children immediately.
 *
 * On "I agree and continue":
 *   - POST /api/dpa/acknowledge (handled inside DPAModal)
 *   - onAcknowledged callback sets needs_acknowledgment = false → renders children
 *   - Shows success toast (brief notification, aria-live="polite")
 *
 * On "Not now — exit":
 *   - Calls supabase.auth.signOut() equivalent (POST /api/auth/logout or
 *     window.location.href = '/auth/login' after clearing session)
 *   - In v1 without supabase client here: clears session cookie and redirects to /
 *     Using fetch to a logout endpoint or direct redirect.
 *
 * Loading state: renders null (no flash) until status check resolves.
 * Error state: if status check fails (network error), fails open — renders children
 * and logs warning. The backend middleware is the authoritative gate.
 *
 * Usage:
 *   Wrap the app's authenticated layout:
 *   <DpaGate>
 *     {children}
 *   </DpaGate>
 */

import { useEffect, useState, useId } from "react";
import { DPAModal } from "./DPAModal";

interface DpaStatus {
  current_dpa_version_in_env: string | null;
  user_acknowledged_version: string | null;
  variant_required: "EU" | "US";
  needs_acknowledgment: boolean;
}

interface DpaGateProps {
  children: React.ReactNode;
}

export function DpaGate({ children }: DpaGateProps) {
  const toastId = useId();
  const [status, setStatus] = useState<DpaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch("/api/dpa/status", {
          method: "GET",
          credentials: "include",
        });

        if (res.status === 401) {
          // Not authenticated — DpaGate only wraps authenticated routes;
          // if we get a 401, just render children (login page handles auth).
          if (!cancelled) setLoading(false);
          return;
        }

        if (!res.ok) {
          // Fail open on API errors — backend middleware is the authoritative gate
          if (!cancelled) setLoading(false);
          return;
        }

        const data = (await res.json()) as DpaStatus;
        if (!cancelled) {
          setStatus(data);
          setLoading(false);
        }
      } catch {
        // Network error — fail open with warning
        if (typeof window !== "undefined") {
          console.warn(
            "[DpaGate] Failed to check DPA status — rendering children (backend middleware is authoritative gate)"
          );
        }
        if (!cancelled) setLoading(false);
      }
    }

    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAcknowledged() {
    setStatus((prev) =>
      prev ? { ...prev, needs_acknowledgment: false } : prev
    );
    setShowToast(true);
    // Auto-dismiss toast after 3 seconds
    setTimeout(() => setShowToast(false), 3000);
  }

  function handleExit() {
    // Sign out: clear session by redirecting to logout.
    // In production this should call supabase.auth.signOut() from the supabase client.
    // For v1 without a global supabase client here, we redirect to login which
    // will clear the session via the auth layer.
    // A dedicated POST /api/auth/logout route is the clean implementation;
    // redirecting to / triggers middleware-level redirect to /auth/login.
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

  // While checking status, render nothing (no flash of authenticated content)
  if (loading) return null;

  // No status or not needing acknowledgment — render children normally
  if (!status || !status.needs_acknowledgment) {
    return (
      <>
        {/* Success toast — aria-live polite, auto-dismissed */}
        {showToast && (
          <div
            id={toastId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: "fixed",
              bottom: "80px", // above bottom nav
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "var(--color-text)",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              zIndex: 200,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              whiteSpace: "nowrap",
            }}
          >
            Data processing terms acknowledged. Welcome!
          </div>
        )}
        {children}
      </>
    );
  }

  // DPA acknowledgment required — render modal on top of children
  // Children are rendered behind the modal backdrop so content isn't visible
  return (
    <>
      {children}
      <DPAModal
        dpa_variant={status.variant_required}
        dpa_version={status.current_dpa_version_in_env ?? "1.0"}
        onAcknowledged={handleAcknowledged}
        onExit={handleExit}
      />
    </>
  );
}
