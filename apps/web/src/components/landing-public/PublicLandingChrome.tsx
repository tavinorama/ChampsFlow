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
  /** The client's business facts — footer is THEIR footer (NAP), not Ozvor's. */
  business?: Record<string, unknown>;
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
  accentColor = "#0c7d54",
  business,
  children,
}: PublicLandingChromeProps) {
  const category = str(business?.["category"]);
  const address = str(business?.["address"]);
  const phone = str(business?.["phone"]);
  const website = str(business?.["website"]);
  const hours =
    typeof business?.["hours"] === "string" ? (business["hours"] as string).trim() : null;
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
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6e65" }}>Hours</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.88rem", color: "#3a473f", lineHeight: 1.7 }}>
                {hours.split(/\n|;|,\s(?=[A-Z])/).map((line, i) => <div key={i}>{line.trim()}</div>)}
              </div>
            </div>
          )}
          {nav.length > 0 && (
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6e65" }}>Pages</div>
              <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                {nav.map((item) => (
                  <li key={item.slug || "home"}>
                    <a href={item.slug ? `/l/${siteSlug}/${item.slug}` : `/l/${siteSlug}`} style={{ color: "#3a473f", textDecoration: "none", fontSize: "0.9rem" }}>
                      {item.title || "Home"}
                    </a>
                  </li>
                ))}
                {website && (
                  <li>
                    <a href={website} rel="noopener" style={{ color: accentColor, textDecoration: "none", fontSize: "0.9rem" }}>Website</a>
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
              Made with{" "}
              <a href="https://ozvor.com" rel="noopener" style={{ color: accentColor, textDecoration: "none", fontWeight: 600 }}>Ozvor</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
