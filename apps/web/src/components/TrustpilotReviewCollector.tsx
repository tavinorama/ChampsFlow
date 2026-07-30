"use client";

/**
 * Trustpilot TrustBox — Review Collector, in the marketing footer.
 *
 * Four things make a third-party widget non-trivial here, and each has bitten
 * this codebase before:
 *
 * 1. THE CSP. The app runs nonce + 'strict-dynamic' (see middleware.ts). A
 *    pasted <script src> in markup has no nonce and is blocked — silently, the
 *    way /play was dead in production while working locally. The pattern that
 *    works is the one Ga4Analytics already uses: create the element from
 *    JavaScript that is itself already trusted, which 'strict-dynamic' permits.
 *    widget.trustpilot.com is also named in script-src and frame-src as the
 *    host-allowlist fallback for browsers that ignore strict-dynamic.
 *
 * 2. CONSENT. The TrustBox is a third party that sets its own cookies, so it is
 *    gated on marketing consent exactly like GA4 is gated on analytics. A
 *    visitor who declines sees nothing rather than a broken frame.
 *
 * 3. THEME. The widget draws itself inside a cross-origin iframe, so no CSS of
 *    ours can reach it — the ONLY lever is Trustpilot's own `data-theme`. This
 *    component mirrors the site's theme into it and re-renders the box when the
 *    visitor flips the toggle, so a dark page never shows a white slab. The
 *    site's own convention is inverted from Trustpilot's: dark is the default
 *    and carries NO attribute, while light sets data-theme="light" on <html>
 *    (see marketing/ThemeToggle). The toggle dispatches no event, so the only
 *    reliable signal is observing that attribute.
 *
 * 4. RE-RENDERING. Trustpilot's bootstrap scans the DOM once on load. Any later
 *    change — a client-side navigation, or a theme flip — needs
 *    loadFromElement(el, true) or the box keeps its first appearance.
 */

import { useEffect, useRef, useState } from "react";
import { hasConsent } from "../lib/cookieConsent";

const CONSENT_CHANGED_EVENT = "ti:consent-changed";
const BOOTSTRAP_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

/** Review Collector template + the ozvor.com business unit. */
const TEMPLATE_ID = "56278e9abfbbba0bdcd568bc";
const BUSINESSUNIT_ID = "6a69cb1bcb33973622bca0e9";
const TOKEN = "14341d21-1859-44f8-9ed2-d5326ace3ec0";

declare global {
  interface Window {
    Trustpilot?: { loadFromElement?: (el: HTMLElement, force?: boolean) => void };
  }
}

/** Appended once per page, even if the component remounts. */
let bootstrapRequested = false;

/** The site is dark unless <html data-theme="light"> says otherwise. */
function readSiteTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function TrustpilotReviewCollector() {
  const [allowed, setAllowed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const boxRef = useRef<HTMLDivElement>(null);

  // Consent and theme are both read in effects, never during render: the server
  // has neither localStorage nor a resolved theme, and reading either while
  // rendering would hydrate mismatched.
  useEffect(() => {
    const syncConsent = () => setAllowed(hasConsent("marketing"));
    syncConsent();
    window.addEventListener(CONSENT_CHANGED_EVENT, syncConsent);

    setTheme(readSiteTheme());
    // ThemeToggle mutates <html data-theme> and fires no event, so watch the
    // attribute itself. This also catches a theme restored from localStorage
    // after our first paint.
    const observer = new MutationObserver(() => setTheme(readSiteTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, syncConsent);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;

    if (!bootstrapRequested) {
      bootstrapRequested = true;
      const script = document.createElement("script");
      script.async = true;
      script.src = BOOTSTRAP_SRC;
      document.head.appendChild(script);
    }

    // Runs on mount AND on every theme change: React has already written the
    // new data-theme onto the div, and this makes Trustpilot read it again.
    const el = boxRef.current;
    if (el && window.Trustpilot?.loadFromElement) {
      window.Trustpilot.loadFromElement(el, true);
    }
  }, [allowed, theme]);

  // Nothing at all until consent: an empty bordered box reads as broken.
  if (!allowed) return null;

  return (
    <div
      ref={boxRef}
      className="trustpilot-widget"
      data-locale="en-US"
      data-template-id={TEMPLATE_ID}
      data-businessunit-id={BUSINESSUNIT_ID}
      data-token={TOKEN}
      data-theme={theme}
      data-style-height="44px"
      data-style-width="100%"
      // The Review Collector template IGNORES data-theme — proven by the iframe
      // URL Trustpilot builds, which carries only templateId and
      // businessunitId. Its card is always white, and being a cross-origin
      // iframe there is no CSS of ours that can reach inside it.
      //
      // So instead of fighting the white, make it deliberate: a rounded chip,
      // clipped to the container. overflow:hidden with a radius turns the raw
      // square slab into a badge that reads as designed on a dark footer, which
      // is how Trustpilot badges normally sit on dark sites. Width is trimmed to
      // the content so white does not trail off to the right of the wordmark.
      style={{
        width: "222px",
        maxWidth: "100%",
        height: "44px",
        lineHeight: 0,
        borderRadius: "8px",
        overflow: "hidden",
        // A hairline in the site's own border token keeps the chip from
        // floating: it belongs to the footer, not on top of it.
        boxShadow: "0 0 0 1px var(--color-border)",
        flex: "none",
      }}
    >
      {/* Trustpilot replaces this link with the widget. Until it does, and for
          anyone the script never reaches, the link itself is the fallback. */}
      <a
        href="https://www.trustpilot.com/review/ozvor.com"
        target="_blank"
        rel="noopener"
        className="mk-footer-link"
      >
        Review us on Trustpilot
      </a>
    </div>
  );
}
