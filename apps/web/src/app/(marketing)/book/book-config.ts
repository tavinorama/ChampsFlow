/**
 * book-config.ts — how /book behaves when the calendar is not configured.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * /book is the CTA on the Design Partner Pack the founder hands to a prospect
 * (canal B, 2026-09-11). A pack that ends in "Booking coming soon" has wasted
 * the conversation: the reader wanted to reply and found a page apologising.
 *
 * `NEXT_PUBLIC_CALENDLY_URL` is set per environment, so the page must be
 * correct in BOTH states, and the unset state must still give the visitor a
 * working way to reach a person. That is the rule this module encodes:
 *
 *   calendar        the env is set and usable -> render the Calendly embed
 *   email-fallback  it is not -> say so plainly and give a real mailto
 *
 * There is no third state, and in particular there is no state where the page
 * shows a button that does nothing.
 *
 * Pure module (no JSX, no DOM, no next/*) so the colocated test can exercise it
 * under the node runner — the convention for web logic in this repo.
 */

/** The general/sales inbox. Same address the support page lists for sales. */
export const BOOK_CONTACT_EMAIL = "hello@ozvor.com";

export type BookMode = "calendar" | "email-fallback";

/**
 * A usable Calendly URL is an absolute https:// URL. Anything else — unset, a
 * placeholder left in an env file, a relative path, an http:// URL — is treated
 * as not configured. Better to show the honest fallback than to embed a widget
 * that will not load.
 */
export function isUsableCalendlyUrl(raw: string | undefined | null): boolean {
  const v = String(raw ?? "").trim();
  if (!v.startsWith("https://")) return false;
  // Guard against a placeholder that was committed rather than replaced.
  if (/PASTE|YOUR_|EXAMPLE|CHANGEME|TODO/i.test(v)) return false;
  try {
    return new URL(v).hostname.length > 0;
  } catch {
    return false;
  }
}

export function resolveBookMode(calendlyUrl: string | undefined | null): BookMode {
  return isUsableCalendlyUrl(calendlyUrl) ? "calendar" : "email-fallback";
}

/**
 * The fallback copy. It names what is wrong, in one short sentence, and hands
 * over a real address. House standard: sentences of 12 words or fewer, and a
 * first-person CTA.
 */
export const BOOK_FALLBACK_COPY = {
  heading: "The calendar is not connected yet",
  body:
    "I book these by email while the calendar is being set up. Write me and I will send you two times this week.",
  mailtoLabel: `Email me at ${BOOK_CONTACT_EMAIL}`,
  subject: "Book a 20-minute GEO strategy call",
  secondary: "Or run the free AI Visibility Test first. It takes 60 seconds.",
} as const;

/** The mailto the fallback renders. Always a working link, never a dead button. */
export function bookFallbackMailto(
  subject: string = BOOK_FALLBACK_COPY.subject
): string {
  return `mailto:${BOOK_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
