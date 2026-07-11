/**
 * PublicLandingChrome — shared header (site nav, home first) + footer
 * ("Built with Ozvor Pages" growth loop) for every public Ozvor Pages page
 * (issue #208, PR-6). Server component — no interactivity, no client hooks.
 */

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
  children: React.ReactNode;
}

export function PublicLandingChrome({
  siteSlug,
  businessName,
  nav,
  activeSlug,
  accentColor = "#0c7d54",
  children,
}: PublicLandingChromeProps) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#ffffff" }}>
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
          {nav.length > 0 && (
            <ul style={{ display: "flex", flexWrap: "wrap", gap: "1.1rem", listStyle: "none", margin: 0, padding: 0, marginLeft: "0.5rem" }}>
              {nav.map((item) => {
                const href = item.slug ? `/l/${siteSlug}/${item.slug}` : `/l/${siteSlug}`;
                const isActive = item.slug === activeSlug;
                return (
                  <li key={item.slug || "home"}>
                    <a
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      style={{
                        color: isActive ? accentColor : "#3a473f",
                        fontWeight: isActive ? 700 : 500,
                        textDecoration: "none",
                        fontSize: "0.9rem",
                      }}
                    >
                      {item.title || "Home"}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <span style={{ flex: 1, minWidth: "1rem" }} />
          <a
            href={`/l/${siteSlug}#contact`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "40px",
              padding: "0.5rem 1.15rem",
              background: accentColor,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.9rem",
              borderRadius: "10px",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Get in touch
          </a>
        </nav>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      <footer style={{ borderTop: "1px solid #d5dfd9", padding: "1.5rem 1.25rem", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#5c6e65" }}>
          Built with{" "}
          <a href="https://ozvor.com" style={{ color: accentColor, textDecoration: "none", fontWeight: 700 }}>
            Ozvor Pages
          </a>
        </p>
      </footer>
    </div>
  );
}
