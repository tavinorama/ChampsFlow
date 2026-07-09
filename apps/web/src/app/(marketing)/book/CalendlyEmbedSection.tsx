/**
 * CalendlyEmbedSection — Client component for the inline Calendly embed.
 *
 * Split from the server page because:
 *  - It uses useEffect to lazy-load the Calendly widget script.
 *  - The script is appended only once, only on the client, only after mount.
 *  - This keeps the /book page body server-rendered and accessible without JS.
 *
 * The Calendly inline-widget requires:
 *  1. A <div class="calendly-inline-widget"> with data-url set.
 *  2. The Calendly widget.js script loaded after the div exists.
 *
 * We use a script tag approach (not the Calendly React package which adds
 * ~50 KB + peer dependencies beyond our threshold). The plain script is
 * ~30 KB gzipped and loaded lazily.
 *
 * Accessibility: the Calendly embed renders in an iframe with a title
 * provided by Calendly itself. The outer container has an aria-label for
 * context. Min-height ensures the embed is usable on all screen sizes.
 */

"use client";

import { useEffect } from "react";

const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";
const SCRIPT_ID = "calendly-widget-script";

interface CalendlyEmbedSectionProps {
  calendlyUrl: string;
}

export function CalendlyEmbedSection({ calendlyUrl }: CalendlyEmbedSectionProps) {
  useEffect(() => {
    // Guard: do not double-load the script
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = CALENDLY_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Do not remove on unmount — Calendly script re-initialises if reloaded.
      // Leaving it attached is the correct pattern for SPA navigation.
    };
  }, []);

  return (
    <section
      aria-labelledby="book-embed-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        padding: "var(--space-12) var(--space-4) var(--space-20)",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h2
          id="book-embed-heading"
          style={{
            fontSize: "var(--font-size-h2)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            marginBottom: "var(--space-2)",
            textAlign: "center",
          }}
        >
          Pick a time that works for you
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            fontFamily: "var(--font-family)",
            textAlign: "center",
            marginBottom: "var(--space-8)",
          }}
        >
          All times are in your local timezone. Video call details sent by email.
        </p>

        {/* Calendly inline widget container */}
        {/* The Calendly script looks for this class and data-url to render the embed. */}
        <div
          className="calendly-inline-widget"
          data-url={calendlyUrl}
          aria-label="Calendly booking widget — select a date and time to book your GEO strategy call"
          style={{
            width: "100%",
            minWidth: "320px",
            /* The full booking flow (calendar → time slots → details form) is
               tall; 700px clipped it. Generous min-height shows it in full even
               before Calendly's auto-resize script fires; no fixed height, so it
               can still grow if the widget reports a taller size. */
            minHeight: "1100px",
          }}
        />
      </div>
    </section>
  );
}
