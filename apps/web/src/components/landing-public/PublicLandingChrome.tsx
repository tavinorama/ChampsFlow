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
      <header style={{ borderBottom: "1px solid #d5dfd9", padding: "1rem 1.25rem" }}>
        <nav
          aria-label="Site navigation"
          style={{
            maxWidth: "820px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <a href={`/l/${siteSlug}`} style={{ fontWeight: 800, color: "#17211c", textDecoration: "none", fontSize: "1.05rem" }}>
            {businessName}
          </a>
          {nav.length > 0 && (
            <ul style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", listStyle: "none", margin: 0, padding: 0 }}>
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
