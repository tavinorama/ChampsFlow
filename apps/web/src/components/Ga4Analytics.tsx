"use client";

/**
 * Ga4Analytics — consent-gated Google Analytics 4 loader (#117).
 *
 * HARD GATE (LGPD/GDPR/CCPA): gtag.js is loaded ONLY when BOTH hold:
 *   1. NEXT_PUBLIC_GA4_ID is configured (build-time env, Railway web service);
 *   2. hasConsent('analytics') — the user opted in via the CookieConsent
 *      banner (lib/cookieConsent.ts). No consent record / rejected / stale
 *      policy version ⇒ NOTHING loads, no cookies, no requests.
 *
 * Reactivity: listens for "ti:consent-changed" (dispatched by CookieConsent
 * on every save) so accepting the banner starts analytics immediately, and a
 * later opt-out revokes the Google consent signals without a reload.
 *
 * SPA navigation: GA4 Enhanced Measurement (on by default for the property)
 * tracks history-based page changes — no per-route wiring needed.
 *
 * Consent Mode v2: we only ever request the 'analytics' category from users,
 * so ad-related signals are ALWAYS denied.
 */

import { useEffect } from "react";
import { hasConsent } from "../lib/cookieConsent";

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
const CONSENT_CHANGED_EVENT = "ti:consent-changed";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Pure gate — exported for unit testing. */
export function shouldLoadGa4(id: string, analyticsConsent: boolean): boolean {
  return id.trim().length > 0 && analyticsConsent;
}

let loaded = false;

function loadGa4(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  // GA4 requires each dataLayer entry to be the raw `arguments` object — gtag.js
  // only treats arguments-objects as gtag commands. Pushing a spread array made
  // it ignore config/js/consent, so no page_view ever fired (Realtime stayed 0).
  // The `...args` signature is only for the call sites' types; we push the
  // actual `arguments` object as GA4's snippet requires.
  function gtag(...args: unknown[]): void {
    void args;
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  }
  window.gtag = gtag;

  // Consent Mode v2 — analytics only; every ad signal permanently denied.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted", // only reached AFTER the user's opt-in
  });
  gtag("js", new Date());
  gtag("config", GA4_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
  document.head.appendChild(script);
}

function revokeGa4(): void {
  // Opt-out after a prior load: flip the Google consent signal off. (Cookies
  // already set are governed by the revoked signal; a full purge happens
  // naturally at expiry. New hits stop immediately.)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("consent", "update", { analytics_storage: "denied" });
  }
}

export function Ga4Analytics() {
  useEffect(() => {
    const sync = () => {
      if (shouldLoadGa4(GA4_ID, hasConsent("analytics"))) {
        loadGa4();
        if (window.gtag) {
          window.gtag("consent", "update", { analytics_storage: "granted" });
        }
      } else if (loaded) {
        revokeGa4();
      }
    };
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  return null;
}
