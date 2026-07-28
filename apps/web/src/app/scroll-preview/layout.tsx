/**
 * /scroll-preview — DESIGN PROTOTYPE ONLY (not linked from anywhere).
 *
 * Cinematic scroll-scrubbed home concept for Ozvor. The camera flies
 * through 4 scenes of the product journey with no cuts.
 *
 * - noindex: this is a prototype route, never meant for search engines.
 * - The route falls into the root layout's "other-public" chrome bucket
 *   (footer + CA banner + cookie UI). This prototype is a full-viewport
 *   film, so we hide that chrome HERE ONLY via route-scoped CSS. The
 *   real phase-2 integration will live in the (marketing) group instead.
 */

export const metadata = {
  title: "Scroll home prototype",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ScrollPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Route-scoped chrome suppression — prototype only. */}
      <style>{`
        .mk-footer,
        .ti-cookie-banner,
        div[aria-label="California privacy rights notice"] {
          display: none !important;
        }
        html, body { background: #0a0f0d !important; }
      `}</style>
      {children}
    </>
  );
}
