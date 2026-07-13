/**
 * Funnel analytics — a single, consent-gated GA4 event helper.
 *
 * Consent is handled for free: `window.gtag` only exists AFTER Ga4Analytics
 * loads, and that loader only runs when the user opted in to analytics
 * (hasConsent('analytics')) and NEXT_PUBLIC_GA4_ID is set. So calling trackEvent
 * without consent is a silent no-op — no separate gate needed here. Analytics
 * must never throw into the app, hence the try/catch.
 *
 * Previously the only tracking was a private helper inside LandingV2; this makes
 * the same capability available to the /test, /kit and checkout surfaces so the
 * whole acquisition funnel is measurable.
 */

// window.gtag is declared globally by Ga4Analytics.tsx as (...args: unknown[]) =>
// void — we reuse that ambient type rather than redeclaring it (a second, more
// specific declaration would collide). gtag is undefined until the consent-gated
// loader runs, so the optional call is a silent no-op without consent.
type TrackParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params?: TrackParams): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params ?? {});
  } catch {
    // Analytics failures must never break the page.
  }
}
