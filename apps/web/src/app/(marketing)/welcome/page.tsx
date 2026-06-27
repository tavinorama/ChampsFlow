/**
 * /welcome — post-payment confirmation page.
 *
 * Server component wrapper: exports metadata + wraps the client WelcomePage
 * in a Suspense boundary (required because WelcomePage uses useSearchParams).
 *
 * No data fetching here — the client component handles auth + display.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomePage } from "./WelcomePage";

export const metadata: Metadata = {
  title: "Payment received — Ozvor",
  description: "Your Ozvor subscription is active. Sign in to access your account.",
  robots: { index: false, follow: false },
};

function WelcomeFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-family)",
        color: "var(--color-muted)",
      }}
    >
      Loading…
    </div>
  );
}

export default function WelcomePageRoute() {
  return (
    <Suspense fallback={<WelcomeFallback />}>
      <WelcomePage />
    </Suspense>
  );
}
