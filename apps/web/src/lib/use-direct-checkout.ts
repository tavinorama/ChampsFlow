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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(
    plan: CheckoutPlan,
    interval: CheckoutInterval = "year",
    email?: string
  ) {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCheckoutUrl(plan, interval, email);
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      // Redirect to Stripe — keep loading=true (browser navigates away)
      window.location.href = result.url;
    } catch {
      setError("Checkout is temporarily unavailable. Please try again.");
      setLoading(false);
    }
  }

  return { loading, error, startCheckout };
}
