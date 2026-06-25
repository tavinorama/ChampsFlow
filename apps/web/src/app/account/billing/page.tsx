/**
 * Screen — /account/billing (C6 Billing & Subscription)
 *
 * Sections:
 *   1. Current plan card (plan name, price, renewal date, status pill, "Manage in Stripe" button)
 *      - Only shown when user has an active paid subscription
 *   2. Usage card (drafts this month / posts this month / connected accounts with limits)
 *   3. Upgrade flow: 3 plan cards (Free / Starter / Pro) with feature lists + "Choose plan" CTA
 *      - "Choose plan" → POST /api/billing/checkout → redirect to Stripe Checkout
 *   4. Past invoices link → Stripe Customer Portal
 *   5. Cancel subscription → Stripe Customer Portal
 *   - Empty state: free-plan users see only the "Choose a plan" section
 *
 * Toast states:
 *   - ?checkout=success → success toast "Subscription activated!"
 *   - ?checkout=cancelled → info toast "Checkout cancelled — you were not charged"
 *
 * WCAG AA:
 *   - Keyboard nav: all interactive elements reachable via Tab
 *   - Screen reader labels on plan cards (via PlanCard's aria-labelledby + aria-describedby)
 *   - aria-live region for toast notifications
 *   - Status pill uses both color AND text to communicate state
 *   - Focus order: back button → current plan section → usage section → plan cards → portal button
 *   - Minimum 44px tap targets on all buttons
 *
 * UX ref: docs/04-ux.md §3 C6 Billing flow
 */

"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  PlanCard,
  type PlanTier,
  type BillingInterval,
} from "../../../components/PlanCard";
import { BottomNav } from "../../../components/BottomNav";
import { apiFetch } from "../../../lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingPlanResponse {
  plan: PlanTier;
  status: "active" | "past_due" | "canceled" | "incomplete" | "trialing";
  renewal_date: string | null;
  cancel_at_period_end: boolean;
  usage: {
    /** Number of active social accounts (legacy field still returned by API) */
    connected_accounts: number;
    /** Maximum brands allowed on this plan */
    max_brands: number;
    /** Maximum competitors tracked per brand */
    max_competitors: number;
    /** Number of prompts run per audit */
    prompts_per_audit: number;
    /** Whether the plan includes weekly monitoring (vs monthly) */
    weekly_monitoring: boolean;
  };
}

interface Toast {
  type: "success" | "error" | "info";
  message: string;
}

// ---------------------------------------------------------------------------
// Status pill helper
// ---------------------------------------------------------------------------

function StatusPill({
  status,
  cancelAtPeriodEnd,
}: {
  status: BillingPlanResponse["status"];
  cancelAtPeriodEnd: boolean;
}): React.ReactElement {
  const label = cancelAtPeriodEnd
    ? "Cancels at period end"
    : status === "active"
    ? "Active"
    : status === "trialing"
    ? "Trial"
    : status === "past_due"
    ? "Payment due"
    : status === "canceled"
    ? "Cancelled"
    : "Incomplete";

  const colors: Record<string, { bg: string; text: string }> = {
    Active: { bg: "var(--color-badge-status-active-bg)", text: "var(--color-badge-status-active-text)" },
    Trial: { bg: "var(--color-badge-status-info-bg)", text: "var(--color-badge-status-info-text)" },
    "Payment due": { bg: "var(--color-badge-status-warn-bg)", text: "var(--color-badge-status-warn-text)" },
    Cancelled: { bg: "var(--color-badge-status-error-bg)", text: "var(--color-badge-status-error-text)" },
    "Cancels at period end": { bg: "var(--color-badge-status-warn-bg)", text: "var(--color-badge-status-warn-text)" },
    Incomplete: { bg: "var(--color-badge-status-neutral-bg)", text: "var(--color-badge-status-neutral-text)" },
  };
  const style = colors[label] ?? colors["Incomplete"];

  return (
    <span
      role="status"
      aria-label={`Subscription status: ${label}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "var(--font-size-badge)",
        fontWeight: "var(--font-weight-semibold)",
        backgroundColor: style.bg,
        color: style.text,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Usage bar (progress bar for limited quotas)
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}): React.ReactElement {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isUnlimited = limit === null;
  const isNearLimit = !isUnlimited && pct >= 80;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-text)",
          }}
        >
          {label}
        </span>
        <span
          aria-label={
            isUnlimited
              ? `${used} used — unlimited`
              : `${used} of ${limit} used`
          }
          style={{
            fontSize: "var(--font-size-caption)",
            color: isNearLimit ? "var(--color-badge-status-warn-text)" : "var(--color-muted)",
            fontWeight: isNearLimit ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
          }}
        >
          {isUnlimited ? `${used} / unlimited` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit ?? 0}
          aria-valuenow={used}
          aria-label={`${label}: ${used} of ${limit} used`}
          style={{
            height: "6px",
            backgroundColor: "var(--color-border)",
            borderRadius: "3px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: isNearLimit ? "var(--color-accent-amber)" : "var(--color-primary)",
              borderRadius: "3px",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component (uses useSearchParams — must be inside Suspense boundary)
// ---------------------------------------------------------------------------

function BillingPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [billingData, setBillingData] = useState<BillingPlanResponse | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Monthly vs annual pricing view. Annual unlocks the founder 30% discount
  // (which the API applies only to annual checkouts).
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // -------------------------------------------------------------------------
  // Show toast from URL params (Stripe redirect result)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const checkoutResult = searchParams.get("checkout");
    if (checkoutResult === "success") {
      showToast("success", "Subscription activated! Welcome to your new plan.");
      // Remove query params from URL (replace, no history entry)
      router.replace("/account/billing", { scroll: false });
    } else if (checkoutResult === "cancelled") {
      showToast("info", "Checkout cancelled — you were not charged.");
      router.replace("/account/billing", { scroll: false });
    }
  }, [searchParams, router]);

  // -------------------------------------------------------------------------
  // Fetch billing plan on mount
  // -------------------------------------------------------------------------
  const fetchBillingPlan = useCallback(async (): Promise<void> => {
    setIsLoadingPlan(true);
    setFetchError(null);
    try {
      const res = await apiFetch("/api/billing/plan", {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? `HTTP ${res.status}`
        );
      }
      const data = (await res.json()) as BillingPlanResponse;
      setBillingData(data);
    } catch (err) {
      setFetchError(
        "Unable to load billing information. Please refresh the page."
      );
    } finally {
      setIsLoadingPlan(false);
    }
  }, []);

  useEffect(() => {
    void fetchBillingPlan();
  }, [fetchBillingPlan]);

  // -------------------------------------------------------------------------
  // Toast helper
  // -------------------------------------------------------------------------
  const showToast = useCallback(
    (type: Toast["type"], message: string): void => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ type, message });
      toastTimerRef.current = setTimeout(() => setToast(null), 5000);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Handle plan selection → Stripe Checkout
  // -------------------------------------------------------------------------
  const handleChoosePlan = useCallback(
    async (tier: PlanTier): Promise<void> => {
      if (isCheckingOut || isOpeningPortal) return;
      setIsCheckingOut(true);
      try {
        const res = await apiFetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: tier,
            interval: billingInterval,
            // Founder discount is annual-only; the API ignores founder on monthly.
            founder: billingInterval === "year",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { message?: string }).message ?? `HTTP ${res.status}`
          );
        }
        const { url } = (await res.json()) as { url: string };
        // Full-page redirect to Stripe Checkout (hosted by Stripe)
        window.location.href = url;
      } catch (err) {
        setIsCheckingOut(false);
        showToast(
          "error",
          "Unable to start checkout. Please try again or contact support."
        );
      }
    },
    [isCheckingOut, isOpeningPortal, billingInterval, showToast]
  );

  // -------------------------------------------------------------------------
  // Handle "Manage billing" or portal link → Stripe Billing Portal
  // -------------------------------------------------------------------------
  const handleOpenPortal = useCallback(async (): Promise<void> => {
    if (isCheckingOut || isOpeningPortal) return;
    setIsOpeningPortal(true);
    try {
      const res = await apiFetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? `HTTP ${res.status}`
        );
      }
      const { url } = (await res.json()) as { url: string };
      // Full-page redirect to Stripe Customer Portal
      window.location.href = url;
    } catch (err) {
      setIsOpeningPortal(false);
      const errMsg = (err as Error).message ?? "";
      if (errMsg.includes("NO_STRIPE_CUSTOMER") || errMsg.includes("no_subscription")) {
        showToast(
          "info",
          "No active subscription found. Please choose a plan below."
        );
      } else {
        showToast(
          "error",
          "Unable to open billing portal. Please try again or contact support."
        );
      }
    }
  }, [isCheckingOut, isOpeningPortal, showToast]);

  // -------------------------------------------------------------------------
  // Determine current plan
  // -------------------------------------------------------------------------
  const currentPlan: PlanTier = billingData?.plan ?? "free";
  const isPaidPlan = currentPlan !== "free";

  // -------------------------------------------------------------------------
  // Format renewal date
  // -------------------------------------------------------------------------
  const renewalLabel = billingData?.renewal_date
    ? new Date(billingData.renewal_date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <main
      aria-labelledby="billing-page-heading"
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--color-surface-muted)",
        paddingBottom: "calc(80px + 56px)", // 80px content padding + 56px BottomNav height
        fontFamily: "var(--font-family)",
      }}
    >
      {/* Page header */}
      <header
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          padding: "0 var(--space-4)",
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "var(--space-2)",
            display: "flex",
            alignItems: "center",
            color: "var(--color-primary)",
            fontSize: "var(--font-size-body-sm)",
            minHeight: "44px",
            outline: "none",
          }}
          onFocus={(e) => {
            (e.target as HTMLButtonElement).style.outline =
              "var(--focus-outline-width) solid var(--color-focus-outline)";
            (e.target as HTMLButtonElement).style.outlineOffset =
              "var(--focus-outline-offset)";
          }}
          onBlur={(e) => {
            (e.target as HTMLButtonElement).style.outline = "none";
          }}
        >
          {/* Left arrow (inline SVG) */}
          <svg
            aria-hidden="true"
            focusable="false"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{ marginRight: "var(--space-1)" }}
          >
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <h1
          id="billing-page-heading"
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: "0 auto",
            paddingRight: "44px", // balance the back button
          }}
        >
          Billing
        </h1>
      </header>

      {/* Toast notification */}
      <div
        role="alert"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          top: "var(--space-4)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          maxWidth: "90vw",
          width: "360px",
          pointerEvents: toast ? "auto" : "none",
        }}
      >
        {toast && (
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              backgroundColor:
                toast.type === "success"
                  ? "var(--color-badge-status-active-bg)"
                  : toast.type === "error"
                  ? "var(--color-badge-status-error-bg)"
                  : "var(--color-badge-status-info-bg)",
              color:
                toast.type === "success"
                  ? "var(--color-badge-status-active-text)"
                  : toast.type === "error"
                  ? "var(--color-badge-status-error-text)"
                  : "var(--color-badge-status-info-text)",
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-medium)",
              border:
                toast.type === "success"
                  ? "1px solid var(--color-success)"
                  : toast.type === "error"
                  ? "1px solid var(--color-error)"
                  : "1px solid var(--color-badge-status-info-text)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              textAlign: "center",
            }}
          >
            {toast.message}
          </div>
        )}
      </div>

      {/* Page content */}
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          padding: "var(--space-6) var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {/* Loading state */}
        {isLoadingPlan && (
          <div
            aria-busy="true"
            aria-label="Loading billing information"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "80px",
                  backgroundColor: "var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  animation: "pulse 1.5s ease-in-out infinite",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoadingPlan && fetchError && (
          <div
            role="alert"
            style={{
              padding: "var(--space-4)",
              backgroundColor: "var(--color-badge-status-error-bg)",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-badge-status-error-text)",
              fontSize: "var(--font-size-body-sm)",
            }}
          >
            {fetchError}
            <button
              type="button"
              onClick={() => void fetchBillingPlan()}
              style={{
                display: "block",
                marginTop: "var(--space-2)",
                color: "var(--color-badge-status-error-text)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-semibold)",
                padding: 0,
                textDecoration: "underline",
                minHeight: "44px",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Main content (loaded) */}
        {!isLoadingPlan && !fetchError && billingData && (
          <>
            {/* ----------------------------------------------------------------
                Section 1: Current plan card (only shown for paid plans)
                -------------------------------------------------------------- */}
            {isPaidPlan && (
              <section aria-labelledby="current-plan-heading">
                <h2
                  id="current-plan-heading"
                  style={{
                    fontSize: "var(--font-size-h4)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: "0 0 var(--space-3) 0",
                  }}
                >
                  Current Plan
                </h2>
                <div
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-4)",
                  }}
                >
                  {/* Plan name + status */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "var(--font-size-h3)",
                        fontWeight: "var(--font-weight-bold)",
                        color: "var(--color-text)",
                        margin: 0,
                        textTransform: "capitalize",
                      }}
                    >
                      {billingData.plan} Plan
                    </h3>
                    <StatusPill
                      status={billingData.status}
                      cancelAtPeriodEnd={billingData.cancel_at_period_end}
                    />
                  </div>

                  {/* Renewal / cancellation date */}
                  {renewalLabel && (
                    <p
                      style={{
                        fontSize: "var(--font-size-body-sm)",
                        color: "var(--color-muted)",
                        margin: 0,
                      }}
                    >
                      {billingData.cancel_at_period_end
                        ? `Access ends on ${renewalLabel}`
                        : billingData.status === "past_due"
                        ? `Payment overdue — next attempt on ${renewalLabel}`
                        : `Renews on ${renewalLabel}`}
                    </p>
                  )}

                  {/* Manage in Stripe button */}
                  <button
                    type="button"
                    onClick={() => void handleOpenPortal()}
                    disabled={isOpeningPortal}
                    aria-label="Manage billing in Stripe customer portal"
                    style={{
                      width: "100%",
                      minHeight: "44px",
                      padding: "var(--space-3) var(--space-4)",
                      backgroundColor: isOpeningPortal
                        ? "var(--color-primary-hover)"
                        : "var(--color-primary)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--font-size-body-sm)",
                      fontWeight: "var(--font-weight-semibold)",
                      cursor: isOpeningPortal ? "wait" : "pointer",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      (e.target as HTMLButtonElement).style.outline =
                        "var(--focus-outline-width) solid var(--color-focus-outline)";
                      (e.target as HTMLButtonElement).style.outlineOffset =
                        "var(--focus-outline-offset)";
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLButtonElement).style.outline = "none";
                    }}
                  >
                    {isOpeningPortal ? "Redirecting to billing…" : "Manage in Stripe"}
                  </button>
                </div>
              </section>
            )}

            {/* ----------------------------------------------------------------
                Section 2: Plan limits card (GEO metrics)
                -------------------------------------------------------------- */}
            <section aria-labelledby="usage-heading">
              <h2
                id="usage-heading"
                style={{
                  fontSize: "var(--font-size-h4)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 var(--space-3) 0",
                }}
              >
                Plan Limits
              </h2>
              <div
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--space-5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                }}
              >
                <UsageBar
                  label="Brands tracked"
                  used={1}
                  limit={billingData.usage.max_brands}
                />
                <UsageBar
                  label="Competitors per brand"
                  used={billingData.usage.max_competitors}
                  limit={billingData.usage.max_competitors}
                />
                <UsageBar
                  label="Prompts per audit"
                  used={billingData.usage.prompts_per_audit}
                  limit={billingData.usage.prompts_per_audit}
                />
                {/* Monitoring cadence — plain text row, no progress bar */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--font-size-body-sm)",
                        color: "var(--color-text)",
                      }}
                    >
                      Monitoring cadence
                    </span>
                    <span
                      aria-label={`Monitoring cadence: ${billingData.usage.weekly_monitoring ? "weekly" : "monthly"}`}
                      style={{
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-muted)",
                        fontWeight: "var(--font-weight-normal)",
                      }}
                    >
                      {billingData.usage.weekly_monitoring ? "Weekly" : "Monthly"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------------------------
                Section 3: Plan cards (upgrade / downgrade)
                -------------------------------------------------------------- */}
            <section aria-labelledby="plans-heading">
              <h2
                id="plans-heading"
                style={{
                  fontSize: "var(--font-size-h4)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 var(--space-3) 0",
                }}
              >
                {isPaidPlan ? "Change Plan" : "Choose a Plan"}
              </h2>

              {/* Free-plan empty state CTA banner */}
              {!isPaidPlan && (
                <div
                  style={{
                    backgroundColor: "var(--color-badge-status-info-bg)",
                    border: "1px solid var(--color-badge-status-info-text)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    marginBottom: "var(--space-4)",
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-badge-status-info-text)",
                  }}
                >
                  You are on the Free plan. Choose a paid plan to monitor more
                  competitors, run weekly AI-visibility audits, and get a GEO
                  content plan with ready-to-publish drafts.
                </div>
              )}

              {/* Monthly / Annual toggle — annual unlocks the founder 30% off */}
              <div
                role="group"
                aria-label="Billing interval"
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  gap: "var(--space-1)",
                  padding: "var(--space-1)",
                  marginBottom: "var(--space-4)",
                  backgroundColor: "var(--color-surface-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "999px",
                }}
              >
                {(
                  [
                    { value: "month", label: "Monthly" },
                    { value: "year", label: "Annual · save 30%" },
                  ] as { value: BillingInterval; label: string }[]
                ).map((opt) => {
                  const active = billingInterval === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBillingInterval(opt.value)}
                      aria-pressed={active}
                      style={{
                        minHeight: "36px",
                        padding: "var(--space-2) var(--space-4)",
                        border: "none",
                        borderRadius: "999px",
                        cursor: "pointer",
                        fontSize: "var(--font-size-body-sm)",
                        fontWeight: "var(--font-weight-semibold)",
                        backgroundColor: active
                          ? "var(--color-primary)"
                          : "transparent",
                        color: active ? "#ffffff" : "var(--color-muted)",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                }}
              >
                {(["free", "growth", "agency"] as PlanTier[]).map((tier) => (
                  <PlanCard
                    key={tier}
                    tier={tier}
                    interval={billingInterval}
                    isCurrent={currentPlan === tier}
                    isLoading={isCheckingOut}
                    onChoosePlan={(t) => void handleChoosePlan(t)}
                  />
                ))}
              </div>
            </section>

            {/* ----------------------------------------------------------------
                Section 4: Past invoices + cancel (via Stripe Portal)
                Only shown for paid plans
                -------------------------------------------------------------- */}
            {isPaidPlan && (
              <section aria-labelledby="billing-links-heading">
                <h2
                  id="billing-links-heading"
                  style={{
                    fontSize: "var(--font-size-h4)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: "0 0 var(--space-3) 0",
                  }}
                >
                  Billing Management
                </h2>
                <div
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                  }}
                >
                  {/* View past invoices */}
                  <button
                    type="button"
                    onClick={() => void handleOpenPortal()}
                    disabled={isOpeningPortal}
                    aria-label="View past invoices in Stripe customer portal"
                    style={{
                      width: "100%",
                      minHeight: "52px",
                      padding: "var(--space-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid var(--color-border)",
                      cursor: isOpeningPortal ? "wait" : "pointer",
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-text)",
                      textAlign: "left",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      (e.target as HTMLButtonElement).style.outline =
                        "var(--focus-outline-width) solid var(--color-focus-outline)";
                      (e.target as HTMLButtonElement).style.outlineOffset =
                        "var(--focus-outline-offset)";
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLButtonElement).style.outline = "none";
                    }}
                  >
                    <span>View past invoices</span>
                    {/* Chevron right */}
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M6 4l4 4-4 4"
                        stroke="var(--color-muted)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* Cancel subscription */}
                  <button
                    type="button"
                    onClick={() => void handleOpenPortal()}
                    disabled={isOpeningPortal}
                    aria-label="Cancel subscription — opens Stripe customer portal to manage cancellation"
                    style={{
                      width: "100%",
                      minHeight: "52px",
                      padding: "var(--space-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "none",
                      border: "none",
                      cursor: isOpeningPortal ? "wait" : "pointer",
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-error)",
                      textAlign: "left",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      (e.target as HTMLButtonElement).style.outline =
                        "var(--focus-outline-width) solid var(--color-focus-outline)";
                      (e.target as HTMLButtonElement).style.outlineOffset =
                        "var(--focus-outline-offset)";
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLButtonElement).style.outline = "none";
                    }}
                  >
                    <span>Cancel subscription</span>
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M6 4l4 4-4 4"
                        stroke="var(--color-error)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  Cancellation takes effect at the end of your current billing period.
                  Your data is retained for 30 days after cancellation.
                </p>
              </section>
            )}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <BottomNav />

      {/* Pulse animation for skeleton loading */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page export — wraps BillingPageInner in Suspense so useSearchParams
// does not cause a static generation bailout in Next.js 14 App Router.
// The fallback shows an accessible loading skeleton while hydrating.
// ---------------------------------------------------------------------------

export default function BillingPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <main
          aria-label="Loading billing page"
          aria-busy="true"
          style={{
            minHeight: "100dvh",
            backgroundColor: "var(--color-surface-muted)",
            fontFamily: "var(--font-family)",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              margin: "0 auto",
              padding: "var(--space-6) var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "80px",
                  backgroundColor: "var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  animation: "pulse 1.5s ease-in-out infinite",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        </main>
      }
    >
      <BillingPageInner />
    </Suspense>
  );
}
