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
import { AppSidebar } from "../components/AppSidebar";
import { BottomNav } from "../components/BottomNav";
import { SiteFooter } from "../components/SiteFooter";
import { AppLegalStrip } from "../components/AppLegalStrip";
import { CaliforniaBanner } from "../components/CaliforniaBanner";
import { CookieConsent } from "../components/CookieConsent";
import { Ga4Analytics } from "../components/Ga4Analytics";
import { isPublicLandingPath, isMarketingPath, isAuthedAppPath } from "../lib/chrome-routing";

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
    "Ozvor checks how AI search sees your brand. We test ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. Then we compare you to competitors and build your GEO content plan.",
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
 * Chrome routing (see ../lib/chrome-routing.ts). Four categories:
 *
 * 0. PUBLIC LANDING — /l/* customer sites. ZERO Ozvor chrome (no footer, no
 *    banner, no cookie manager, no GA4, no aurora). The page owns its chrome.
 * 1. MARKETING — the (marketing) route group. The marketing layout already
 *    provides navbar + footer, so the root renders ONLY children (no AppTopBar,
 *    no second footer). "/" is the landing page.
 * 2. AUTHED APP — the logged-in product. Gets AppTopBar (Back + theme + logout),
 *    the DPA gate, the footer, and bottom-nav clearance. The Back button lives
 *    ONLY here (not on the landing or any free/public page).
 * 3. OTHER PUBLIC — legal pages, login, shared report (/r/...). Public, so no
 *    DPA gate and NO Back button — but they still get the footer.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const country = headersList.get("cf-ipcountry") ?? null;
  const pathname = headersList.get("x-pathname") ?? "";
  const nonce = headersList.get("x-nonce") ?? undefined;
  const isPublicLanding = isPublicLandingPath(pathname);
  const isMarketing = isMarketingPath(pathname);
  const isAuthedApp = isAuthedAppPath(pathname);
  // Dashboard v3 (staging): a self-contained full-page shell that provides its
  // OWN sidebar + top bar. It is auth-protected by the middleware (routes.ts)
  // but must NOT inherit the app chrome (AppSidebar/AppTopBar) or it would
  // double-render. Render its children bare, like a public tenant site does.
  const isDashboardV3 = pathname === "/dashboard-v3" || pathname.startsWith("/dashboard-v3/");

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
        {/* Global atmosphere — fixed behind all content. Skipped on public
            tenant sites (/l/*): the client's site owns its own background. */}
        {!isPublicLanding && (
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
        )}
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
        {isDashboardV3 ? (
          // 0b. Dashboard v3 (staging): self-contained shell owns its own
          // sidebar + top bar. Render bare so the old AppSidebar/AppTopBar
          // don't double-render. Auth is enforced by the middleware.
          children
        ) : isPublicLanding ? (
          // 0. Public tenant sites (/l/*): render ONLY the page. No Ozvor
          // chrome of any kind — the page's own PublicLandingChrome provides
          // the client's header + footer with a minimal "Made with Ozvor"
          // credit. Cookie/GA4/California/atmosphere are all skipped below.
          children
        ) : isMarketing ? (
          // 1. Marketing routes: (marketing)/layout.tsx owns all chrome
          // (skip link, navbar, main, footer). Root adds nothing — otherwise
          // the footer would be duplicated and a Back button would appear on
          // free pages.
          children
        ) : isAuthedApp ? (
          // 2. Authenticated app routes: full chrome incl. the Back button.
          <>
            <CaliforniaBanner country={country} />
            <div className="app-shell">
              <AppSidebar />
              <div className="app-shell__content">
                <AppTopBar />
                <DpaGate>{children}</DpaGate>
                {/* App pages get a minimal legal strip, not the marketing footer
                    menu (removed per founder). CCPA Do-Not-Sell link retained. */}
                <AppLegalStrip />
                {/* Clear the fixed mobile BottomNav so it never covers the footer. */}
                <div
                  aria-hidden="true"
                  style={{ height: "calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))" }}
                />
              </div>
            </div>
            {/* Single mobile bottom nav for EVERY authed route — desktop-hidden
                via .app-bottom-nav (≥960px). Rendered once here so individual
                pages no longer self-render it (which duplicated the bar and, on
                the pre-shell pages, overlapped the legal strip). */}
            <BottomNav />
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
        {/* Cookie consent + GA4 — Ozvor's own compliance + analytics, on every
            Ozvor route (marketing + app). NOT on public tenant sites (/l/*):
            that's the client's website, not Ozvor's, so Ozvor must neither show
            its cookie banner there nor track the client's visitors. */}
        {!isPublicLanding && (
          <>
            {/* Self-gates on first visit + listens for the footer "Cookie
                preferences" re-open trigger. */}
            <CookieConsent />
            {/* HARD consent gate: renders nothing and loads nothing unless
                NEXT_PUBLIC_GA4_ID is set AND the user opted in to analytics. */}
            <Ga4Analytics />
          </>
        )}
      </body>
    </html>
  );
}
