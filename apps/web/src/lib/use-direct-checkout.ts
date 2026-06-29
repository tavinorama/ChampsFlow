"use client";

/**
 * useDirectCheckout — triggers a Stripe checkout session directly from the browser.
 *
 * POSTs to /api/checkout/direct with { plan, interval, email? }.
 * On success, redirects window.location.href to the Stripe Checkout URL.
 * Returns { loading, error, startCheckout } to the caller.
 *
 * Design rule: loading stays true after a successful redirect (browser
 * navigates away). Only set loading=false on error.
 */

import { useState } from "react";

export type CheckoutPlan = "growth" | "agency";
export type CheckoutInterval = "month" | "year";

interface DirectCheckoutResponse {
  url?: string;
  message?: string;
  error?: string;
}

/**
 * Pure fetch helper — exported for unit testing only.
 * Does not catch network errors; callers must handle them.
 */
export async function fetchCheckoutUrl(
  plan: CheckoutPlan,
  interval: CheckoutInterval,
  email?: string
): Promise<{ url: string } | { error: string }> {
  const res = await fetch("/api/checkout/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, interval, ...(email ? { email } : {}) }),
  });
  const data = (await res.json()) as DirectCheckoutResponse;
  if (!res.ok || !data.url) {
    return { error: data.message ?? "Checkout is temporarily unavailable. Please try again." };
  }
  return { url: data.url };
}

export function useDirectCheckout() {
  // Track WHICH plan is checking out (not a shared boolean) so clicking one
  // plan's button doesn't light up every other plan's button on the page.
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(
    plan: CheckoutPlan,
    interval: CheckoutInterval = "year",
    email?: string
  ) {
    // Guard against a double-click firing two checkout sessions.
    if (loadingPlan !== null) return;
    setLoadingPlan(plan);
    setError(null);
    try {
      const result = await fetchCheckoutUrl(plan, interval, email);
      if ("error" in result) {
        setError(result.error);
        setLoadingPlan(null);
        return;
      }
      // Redirect to Stripe — keep loadingPlan set (browser navigates away)
      window.location.href = result.url;
    } catch {
      setError("Checkout is temporarily unavailable. Please try again.");
      setLoadingPlan(null);
    }
  }

  // `loading` (boolean) is kept for single-button consumers (sticky bar, etc.);
  // multi-plan surfaces should use `loadingPlan === <plan>` per button.
  return { loadingPlan, loading: loadingPlan !== null, error, startCheckout };
}
