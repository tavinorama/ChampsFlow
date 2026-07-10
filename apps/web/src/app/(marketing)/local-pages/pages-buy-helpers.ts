/**
 * Pure helper functions for PagesBuyForm.tsx.
 * Extracted so they can be unit-tested without requiring a JSX/DOM
 * environment (same convention as components/marketing/waitlist-helpers.ts).
 *
 * Mirrors apps/api/src/routes/products.ts' EMAIL_RE exactly — the server is
 * the source of truth; this only avoids a round-trip for an obviously-bad
 * value before hitting the network.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the email typed into the $99 checkout form.
 * Returns an error message, or null when the email is acceptable.
 */
export function validatePagesBuyEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return null;
}
