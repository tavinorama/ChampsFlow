/**
 * PublicLandingChrome — shared header (site nav, home first) + footer
 * ("Built with Ozvor Pages" growth loop) for every public Ozvor Pages page
 * (issue #208, PR-6). Server component — no interactivity, no client hooks.
 */

import { safeHref } from "../../lib/safe-json-ld";
import { chromeLabels, type Locale } from "./i18n";
import { safeHexColor, onAccent } from "./color";

export interface PublicNavItem {
  slug: string;
  title: string;
  page_type: string;
}

interface PublicLandingChromeProps {
  siteSlug: string;
  businessName: string;
  nav: PublicNavItem[];
  /** The current page's slug ('' for home) — highlighted in the nav. */
  activeSlug: string;
  accentColor?: string;
  /** The client's business facts — footer is THEIR footer (NAP), not Ozvor's. */
  business?: Record<string, unknown>;
  /** Site language (from theme.lang). Drives chrome copy + subtree lang. */
  locale?: Locale;
  children: React.ReactNode;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function PublicLandingChrome({
  siteSlug,
  businessName,
  nav,
  activeSlug,
  accentColor: accentColorInput = "#0c7d54",
  business,
  locale = "en",
  children,
}: PublicLandingChromeProps) {
  // SECURITY (#259): the brand colour is tenant-controlled and gets interpolated
  // into an SSR <style> block (React doesn't escape <style> children). Clamp it
  // to a strict hex BEFORE any style sink — blocks CSS injection.
  const accentColor = safeHexColor(accentColorInput);
  const category = str(business?.["category"]);
  const address = str(business?.["address"]);
  const phone = str(business?.["phone"]);
  const websiteHref = safeHref(business?.["website"]); // http(s) only, else null
  const hours =
    typeof business?.["hours"] === "string" ? (business["hours"] as string).trim() : null;
  const ctaText = onAccent(accentColor);
  const t = chromeLabels(locale);
  const navLinks = nav.map((item) => ({
    href: item.slug ? `/l/${siteSlug}/${item.slug}` : `/l/${siteSlug}`,
    label: item.title || t.home,
    isActive: item.slug === activeSlug,
    key: item.slug || "home",
  }));
  // `lang` on this subtree marks the site's language for screen readers + search
  // engines, overriding the root <html lang="en"> (which we can't change per
  // route). Accessible mobile nav is a <details> disclosure — keyboard-operable
  // and no client JS (this stays a server component). CSS below swaps the inline
  // desktop nav for the disclosure under 720px.
  return (
    <div lang={locale} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#ffffff" }}>
      <style>{`
        .ozpc-desktop-nav { display: flex; align-items: center; flex: 1; gap: 0.75rem 1.25rem; }
        .ozpc-mobile-nav { display: none; margin-left: auto; }
        .ozpc-mobile-nav > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; min-height: 44px; padding: 0 0.85rem; border: 1px solid ${accentColor}44; border-radius: 10px; font-size: 0.9rem; font-weight: 600; color: #17211c; }
        .ozpc-mobile-nav > summary::-webkit-details-marker { display: none; }
        .ozpc-mobile-nav[open] > summary { border-color: ${accentColor}; }
        .ozpc-mobile-panel { position: absolute; left: 1rem; right: 1rem; margin-top: 0.6rem; background: #fff; border: 1px solid ${accentColor}33; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.12); padding: 0.5rem; display: grid; gap: 0.15rem; z-index: 60; }
        .ozpc-mobile-panel a { display: block; padding: 0.7rem 0.75rem; border-radius: 8px; text-decoration: none; font-size: 0.95rem; color: #3a473f; }
        .ozpc-mobile-panel a[aria-current="page"] { color: ${accentColor}; font-weight: 700; }
        @media (max-width: 719px) {
          .ozpc-desktop-nav { display: none; }
          .ozpc-mobile-nav { display: block; }
        }
      `}</style>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: `1px solid ${accentColor}22`,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "saturate(1.2) blur(8px)",
          WebkitBackdropFilter: "saturate(1.2) blur(8px)",
        }}
      >
        <nav
          aria-label="Site navigation"
          style={{
            maxWidth: "1080px",
            margin: "0 auto",
            padding: "0.85rem 1.5rem",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem 1.25rem",
          }}
        >
          <a
            href={`/l/${siteSlug}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.55rem",
              fontWeight: 800,
              color: "#17211c",
              textDecoration: "none",
              fontSize: "1.2rem",
              letterSpacing: "-0.01em",
            }}
          >
            <span aria-hidden="true" style={{ width: "11px", height: "11px", borderRadius: "50%", background: accentColor, flex: "none" }} />
            {businessName}
          </a>
          {/* Desktop nav (≥720px) — inline links + CTA */}
          <div className="ozpc-desktop-nav">
            {navLinks.length > 0 && (
              <ul style={{ display: "flex", flexWrap: "wrap", gap: "1.1rem", listStyle: "none", margin: 0, padding: 0, marginLeft: "0.5rem" }}>
                {navLinks.map((l) => (
                  <li key={l.key}>
                    <a
                      href={l.href}
                      aria-current={l.isActive ? "page" : undefined}
                      style={{ color: l.isActive ? accentColor : "#3a473f", fontWeight: l.isActive ? 700 : 500, textDecoration: "none", fontSize: "0.9rem" }}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <span style={{ flex: 1, minWidth: "1rem" }} />
            <a
              href={`/l/${siteSlug}#contact`}
              style={{ display: "inline-flex", alignItems: "center", minHeight: "40px", padding: "0.5rem 1.15rem", background: accentColor, color: ctaText, fontWeight: 700, fontSize: "0.9rem", borderRadius: "10px", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              {t.getInTouch}
            </a>
          </div>

          {/* Mobile menu (<720px) — accessible <details> disclosure: the summary
              is keyboard-focusable, Enter/Space toggles, [open] exposes state.
              No client JS, so this component stays server-rendered. */}
          <details className="ozpc-mobile-nav">
            <summary aria-label={t.menu}>
              <span aria-hidden="true">☰</span> {t.menu}
            </summary>
            <div className="ozpc-mobile-panel">
              {navLinks.map((l) => (
                <a key={l.key} href={l.href} aria-current={l.isActive ? "page" : undefined}>
                  {l.label}
                </a>
              ))}
              <a
                href={`/l/${siteSlug}#contact`}
                style={{ background: accentColor, color: ctaText, fontWeight: 700, textAlign: "center", marginTop: "0.25rem" }}
              >
                {t.getInTouch}
              </a>
            </div>
          </details>
        </nav>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      {/* The CLIENT's footer — their business, their NAP. Ozvor is only a small
          credit line at the very bottom. */}
      <footer style={{ borderTop: `1px solid ${accentColor}22`, background: `${accentColor}08` }}>
        <div
          style={{
            maxWidth: "1080px",
            margin: "0 auto",
            padding: "2.5rem 1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "2rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 800, fontSize: "1.1rem", color: "#17211c" }}>
              <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "50%", background: accentColor, flex: "none" }} />
              {businessName}
            </div>
            {category && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#5c6e65" }}>{category}</p>}
            {address && <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "#3a473f", lineHeight: 1.5 }}>{address}</p>}
            {phone && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
                <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} style={{ color: accentColor, textDecoration: "none" }}>{phone}</a>
              </p>
            )}
          </div>
          {hours && (
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6e65" }}>{t.hours}</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.88rem", color: "#3a473f", lineHeight: 1.7 }}>
                {hours.split(/\n|;|,\s(?=[A-Z])/).map((line, i) => <div key={i}>{line.trim()}</div>)}
              </div>
            </div>
          )}
          {nav.length > 0 && (
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6e65" }}>{t.pages}</div>
              <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                {navLinks.map((l) => (
                  <li key={l.key}>
                    <a href={l.href} style={{ color: "#3a473f", textDecoration: "none", fontSize: "0.9rem" }}>
                      {l.label}
                    </a>
                  </li>
                ))}
                {websiteHref && (
                  <li>
                    <a href={websiteHref} rel="noopener nofollow" style={{ color: accentColor, textDecoration: "none", fontSize: "0.9rem" }}>{t.website}</a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${accentColor}18` }}>
          <div
            style={{
              maxWidth: "1080px",
              margin: "0 auto",
              padding: "1rem 1.5rem",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "0.78rem",
              color: "#5c6e65",
            }}
          >
            <span>© {new Date().getFullYear()} {businessName}</span>
            <span>
              {t.madeWith}{" "}
              <a href="https://ozvor.com" rel="noopener" style={{ color: accentColor, textDecoration: "none", fontWeight: 600 }}>Ozvor</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
