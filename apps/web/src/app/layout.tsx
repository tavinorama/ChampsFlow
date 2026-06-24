/**
 * Root layout — TrustIndex AI (Next.js App Router)
 *
 * Provides the single <html> + <body> for the whole app.
 *
 * Chrome rendering is CONDITIONAL on the request pathname:
 *   - Marketing pages (landing, /blog, /resources): minimal chrome —
 *     the (marketing) route group provides its own navbar + main + footer.
 *     We skip the authenticated DpaGate, the auth Footer, and the
 *     CaliforniaBanner (those are app-only).
 *   - Authenticated app pages: full chrome (DpaGate, Footer, CaliforniaBanner).
 *
 * Pathname is read from the x-pathname header set by middleware.ts.
 *
 * CI-1 (DPA) and CI-2 (Do Not Sell footer + California banner) remain
 * enforced on every authenticated route. Marketing public pages don't
 * need them — the (marketing)/layout.tsx adds its own marketing footer
 * with the same legal links surfaced from the public-pages perspective.
 *
 * Imports design tokens CSS (applied globally).
 */

import { headers } from "next/headers";
import "../styles/tokens.css";
import { DpaGate } from "../components/DpaGate";
import { Footer } from "../components/Footer";
import { CaliforniaBanner } from "../components/CaliforniaBanner";

export const metadata = {
  metadataBase: new URL("https://trustindexai.com"),
  title: {
    default: "TrustIndex AI — Know if AI trusts your brand",
    template: "%s — TrustIndex AI",
  },
  description:
    "AI Search Trust Intelligence for SMBs. TrustIndex AI audits how your brand appears across AI search, benchmarks competitors, finds trust gaps, and builds the GEO content plan you need to get cited organically.",
  openGraph: {
    siteName: "TrustIndex AI",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "TrustIndex AI — Know if AI trusts your brand",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@trustindexai",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

/**
 * Marketing route prefixes — when the pathname starts with any of these,
 * we render minimal chrome and let the (marketing)/layout.tsx own the
 * full presentation. Otherwise we render the authenticated chrome.
 *
 * NOTE: "/" exact match is also marketing (landing page).
 */
const MARKETING_PREFIXES = [
  "/blog",
  "/resources",
];

function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const country = headersList.get("cf-ipcountry") ?? null;
  const pathname = headersList.get("x-pathname") ?? "";
  const nonce = headersList.get("x-nonce") ?? undefined;
  const isMarketing = isMarketingPath(pathname);

  // Body background differs: marketing = pure surface (white), app = surface-muted.
  const bodyBackground = isMarketing
    ? "var(--color-surface)"
    : "var(--color-surface-muted)";

  return (
    <html lang="en">
      {/* Anti-FOUC: reads localStorage before first paint so data-theme is
          already set when CSS evaluates. Inline script — no external file. */}
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('op-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            'Geist Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          backgroundColor: bodyBackground,
          color: "var(--color-text)",
        }}
      >
        {isMarketing ? (
          // Marketing routes: (marketing)/layout.tsx provides all chrome
          // (skip link, navbar, main, marketing footer).
          children
        ) : (
          // Authenticated app routes: full chrome.
          <>
            <CaliforniaBanner country={country} />
            <DpaGate>{children}</DpaGate>
            <Footer />
          </>
        )}
      </body>
    </html>
  );
}
