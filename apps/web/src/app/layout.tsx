/**
 * Root layout — Ozvor (Next.js App Router)
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
import { SITE_URL, SITE_NAME } from "../lib/site";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import "../styles/tokens.css";
import { DpaGate } from "../components/DpaGate";
import { AppTopBar } from "../components/AppTopBar";
import { SiteFooter } from "../components/SiteFooter";
import { CaliforniaBanner } from "../components/CaliforniaBanner";
import { CookieConsent } from "../components/CookieConsent";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-schibsted",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Know if AI trusts your brand`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "AI Search Trust Intelligence for SMBs. Ozvor audits how your brand appears across AI search, benchmarks competitors, finds trust gaps, and builds the GEO content plan you need to get cited organically.",
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Know if AI trusts your brand`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ozvor",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

/**
 * Chrome routing. Three categories:
 *
 * 1. MARKETING — the (marketing) route group. The marketing layout already
 *    provides navbar + footer, so the root renders ONLY children (no AppTopBar,
 *    no second footer). "/" is the landing page.
 * 2. AUTHED APP — the logged-in product. Gets AppTopBar (Back + theme + logout),
 *    the DPA gate, the footer, and bottom-nav clearance. The Back button lives
 *    ONLY here (not on the landing or any free/public page).
 * 3. OTHER PUBLIC — legal pages, login, shared report (/r/...). Public, so no
 *    DPA gate and NO Back button — but they still get the footer.
 */
const MARKETING_PREFIXES = [
  "/blog",
  "/resources",
  "/book",
  "/how-it-works",
  "/how-we-measure",
  "/kit",
  "/learn",
  "/organicposts",
  "/pricing",
  "/results",
  "/test",
];

const AUTHED_APP_PREFIXES = [
  "/dashboard",
  "/brands",
  "/account",
  "/admin",
  "/create",
  "/drafts",
  "/schedule",
];

function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAuthedAppPath(pathname: string): boolean {
  return AUTHED_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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
  const isAuthedApp = isAuthedAppPath(pathname);

  return (
    <html lang="en" className={`${schibsted.variable} ${jetbrainsMono.variable}`}>
      {/* Anti-FOUC: dark is the default (no attribute). Only set data-theme
          when stored value is "light". Runs before first paint. */}
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('op-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: "var(--font-family)",
          backgroundColor: "transparent",
          color: "var(--color-text)",
        }}
      >
        {/* Global atmosphere — fixed behind all content */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -2,
            background: "var(--color-bg)",
            pointerEvents: "none",
          }}
        >
          {/* Three radial-gradient auroras */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: [
              "radial-gradient(ellipse 60% 50% at 15% 25%, rgba(39,201,138,0.18) 0%, transparent 70%)",
              "radial-gradient(ellipse 50% 60% at 85% 35%, rgba(12,125,84,0.12) 0%, transparent 65%)",
              "radial-gradient(ellipse 55% 40% at 50% 90%, rgba(230,169,63,0.07) 0%, transparent 70%)",
            ].join(", "),
            pointerEvents: "none",
          }} />
          {/* atmosphere.png — fixed, very slow drift, reduced-motion safe */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/atmosphere.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: "var(--atmo-op)",
            mixBlendMode: "var(--atmo-blend)" as React.CSSProperties["mixBlendMode"],
            animation: "atmo-drift 90s ease-in-out infinite alternate",
            pointerEvents: "none",
          }} />
        </div>
        {/* Keyframes for atmosphere drift — respects prefers-reduced-motion */}
        <style>{`
          @keyframes atmo-drift {
            from { transform: scale(1) translate(0, 0); }
            to   { transform: scale(1.04) translate(1%, 0.5%); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes atmo-drift { from, to { transform: none; } }
          }
        `}</style>
        {isMarketing ? (
          // 1. Marketing routes: (marketing)/layout.tsx owns all chrome
          // (skip link, navbar, main, footer). Root adds nothing — otherwise
          // the footer would be duplicated and a Back button would appear on
          // free pages.
          children
        ) : isAuthedApp ? (
          // 2. Authenticated app routes: full chrome incl. the Back button.
          <>
            <CaliforniaBanner country={country} />
            <AppTopBar />
            <DpaGate>{children}</DpaGate>
            <SiteFooter />
            {/* Clear the fixed mobile BottomNav so it never covers the footer. */}
            <div
              aria-hidden="true"
              style={{ height: "calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))" }}
            />
          </>
        ) : (
          // 3. Other public routes (legal, login, shared report): footer only —
          // no Back button (it's a free/public page), no DPA gate.
          <>
            <CaliforniaBanner country={country} />
            {children}
            <SiteFooter />
          </>
        )}
        {/* Cookie consent banner — global, on every route (marketing + app).
            Self-gates on first visit + listens for the footer "Cookie
            preferences" re-open trigger. */}
        <CookieConsent />
      </body>
    </html>
  );
}
