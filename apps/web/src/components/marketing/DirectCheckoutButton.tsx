"use client";

/**
 * DirectCheckoutButton — a client component CTA that triggers direct Stripe
 * checkout via POST /api/checkout/direct.
 *
 * Used in server-component pages (blog posts) where we cannot use hooks
 * directly. Drop this in place of any <Link href="/login?plan=..."> for
 * Growth/Agency plan CTAs.
 *
 * Matches the visual style of the blog CTA outlined buttons.
 */

import { useDirectCheckout, type CheckoutPlan, type CheckoutInterval } from "../../lib/use-direct-checkout";

interface DirectCheckoutButtonProps {
  plan: CheckoutPlan;
  interval?: CheckoutInterval;
  label: string;
  /** Inline style override — merged on top of defaults. */
  style?: React.CSSProperties;
  className?: string;
}

export function DirectCheckoutButton({
  plan,
  interval = "year",
  label,
  style: styleProp,
  className,
}: DirectCheckoutButtonProps) {
  const { loading, error, startCheckout } = useDirectCheckout();

  const defaultStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "52px",
    padding: "0 var(--space-6)",
    backgroundColor: "transparent",
    color: "var(--color-primary)",
    border: "1.5px solid var(--color-primary)",
    borderRadius: "var(--radius-md)",
    fontSize: "1rem",
    fontWeight: 700,
    fontFamily: "var(--font-family)",
    textDecoration: "none",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? "Opening Stripe checkout..." : label}
        onClick={() => startCheckout(plan, interval)}
        style={{ ...defaultStyle, ...styleProp }}
        className={className}
      >
        {loading ? "Opening checkout…" : label}
      </button>
      {error && (
        <p
          role="alert"
          style={{
            margin: "var(--space-2) 0 0 0",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-error)",
            fontFamily: "var(--font-family)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
