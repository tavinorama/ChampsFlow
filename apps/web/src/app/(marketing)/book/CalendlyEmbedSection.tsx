/**
 * CalendlyEmbedSection — Client component for the inline Calendly embed.
 *
 * Split from the server page because it lazy-loads the Calendly widget script
 * on the client after mount, keeping the /book page body server-rendered.
 *
 * "Show the whole calendar, no internal scroll":
 *   A fixed container height is the wrong tool — Calendly's booking flow changes
 *   height as the user moves calendar → time slots → details form, and on mobile
 *   it stacks much taller. A too-short container makes Calendly render its OWN
 *   scrollbar inside the iframe (the exact thing we don't want); a too-tall one
 *   leaves dead space.
 *   Fix: Calendly's iframe posts its content height to the parent window as it
 *   navigates (`calendly.page_height`). We listen for that and size the container
 *   to fit EXACTLY — so the whole calendar is always visible and never scrolls
 *   internally. A generous responsive min-height is the floor for the brief
 *   moment before the first height message arrives (and if it never does).
 *
 * Accessibility: the Calendly embed renders in an iframe titled by Calendly. The
 * outer container has an aria-label for context.
 */

"use client";

import { useEffect, useState } from "react";

const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";
const SCRIPT_ID = "calendly-widget-script";

interface CalendlyEmbedSectionProps {
  calendlyUrl: string;
}

export function CalendlyEmbedSection({ calendlyUrl }: CalendlyEmbedSectionProps) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    // Guard: do not double-load the script.
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = CALENDLY_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
    // Do not remove on unmount — Calendly re-initialises if reloaded; leaving it
    // attached is the correct pattern for SPA navigation.
  }, []);

  // Size the container to Calendly's reported content height → no inner scroll.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (typeof e.origin === "string" && !e.origin.includes("calendly.com")) return;
      const data = e.data as { event?: string; payload?: { height?: string | number } } | null;
      if (data && data.event === "calendly.page_height" && data.payload?.height != null) {
        const h = parseInt(String(data.payload.height), 10);
        if (!Number.isNaN(h) && h > 0) setHeight(h);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
      {/* Responsive floor for the moment before the first height message. Mobile
          stacks the flow much taller than desktop's side-by-side layout. */}
      <style>{`
        .ozvor-calendly { min-height: 760px; }
        @media (max-width: 767px) { .ozvor-calendly { min-height: 1180px; } }
      `}</style>
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

        {/* Calendly inline widget — widget.js renders the iframe from data-url.
            When a `calendly.page_height` message arrives we set an exact height;
            until then the .ozvor-calendly min-height floor keeps it scroll-free. */}
        <div
          className="calendly-inline-widget ozvor-calendly"
          data-url={calendlyUrl}
          aria-label="Calendly booking widget — select a date and time to book your GEO strategy call"
          style={{
            width: "100%",
            minWidth: "320px",
            height: height ? `${height}px` : undefined,
          }}
        />
      </div>
    </section>
  );
}
