"use client";

/**
 * Trustpilot TrustBox — Review Collector, under the landing form.
 *
 * Two things make a third-party widget non-trivial here, and both have bitten
 * this codebase before:
 *
 * 1. THE CSP. The app runs nonce + 'strict-dynamic' (see middleware.ts). A
 *    pasted <script src> in markup has no nonce and is blocked — silently, the
 *    way /play was dead in production while working locally. The pattern that
 *    does work is the one Ga4Analytics already uses: create the element from
 *    JavaScript that is itself already trusted, which 'strict-dynamic' permits.
 *    widget.trustpilot.com is also added to script-src and frame-src as the
 *    host-allowlist fallback for browsers that ignore strict-dynamic.
 *
 * 2. CONSENT. The TrustBox is a third party that sets its own cookies, so it is
 *    gated on marketing consent exactly like GA4 is gated on analytics. A
 *    visitor who declines sees nothing at all rather than a broken frame. That
 *    is a deliberate compliance choice, not caution for its own sake: this
 *    product is sold on being honest about data, and loading an unconsented
 *    tracker on the first page a stranger sees would contradict that.
 *
 * Trustpilot renders the widget INTO the div by reading its data-* attributes
 * once its bootstrap script loads. Ids come from the founder's TrustBox config
 * (Review Collector template, ozvor.com business unit).
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

export function TrustpilotReviewCollector() {
  const [allowed, setAllowed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Consent is read in an effect, never during render: the server has no
  // localStorage, and reading it during render would hydrate mismatched.
  useEffect(() => {
    const sync = () => setAllowed(hasConsent("marketing"));
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
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

    // The bootstrap only scans the DOM once. When it is already on the page —
    // a client-side navigation back to the landing — the div must be handed to
    // it explicitly or the widget stays an empty box.
    const el = boxRef.current;
    if (el && window.Trustpilot?.loadFromElement) {
      window.Trustpilot.loadFromElement(el, true);
    }
  }, [allowed]);

  // Nothing at all until consent: an empty bordered box reads as broken.
  if (!allowed) return null;

  return (
    <div
      ref={boxRef}
      className="trustpilot-widget"
      data-locale="en-US"
      data-template-id={TEMPLATE_ID}
      data-businessunit-id={BUSINESSUNIT_ID}
      data-style-height="52px"
      data-style-width="100%"
      data-token={TOKEN}
      style={{ marginTop: "var(--space-3, 12px)" }}
    >
      {/* Trustpilot replaces this link with the widget. Until it does, and for
          anyone the script never reaches, the link itself is the fallback. */}
      <a
        href="https://www.trustpilot.com/review/ozvor.com"
        target="_blank"
        rel="noopener"
      >
        Trustpilot
      </a>
    </div>
  );
}
