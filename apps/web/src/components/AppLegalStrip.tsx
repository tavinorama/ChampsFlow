/**
 * AppLegalStrip — minimal legal line for authenticated app pages.
 *
 * Replaces the full marketing SiteFooter inside the app shell (the founder asked
 * to remove the footer *menu* from dashboard pages). We keep only the compliance
 * essentials — notably the CCPA/CPRA "Do Not Sell or Share" link, which must stay
 * reachable for California users — as an unobtrusive one-line strip.
 */

import Link from "next/link";

const linkStyle: React.CSSProperties = {
  color: "var(--color-muted)",
  textDecoration: "none",
  fontSize: "var(--font-size-caption)",
};

export function AppLegalStrip() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-border)",
        padding: "var(--space-4) var(--space-6)",
        display: "flex",
        gap: "var(--space-4)",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-muted)",
        fontFamily: "var(--font-family)",
      }}
    >
      <span style={{ fontSize: "var(--font-size-caption)" }}>© Ozvor</span>
      <Link href="/privacy-policy" style={linkStyle}>Privacy</Link>
      <Link href="/terms-of-service" style={linkStyle}>Terms</Link>
      <Link href="/account/data-privacy/do-not-sell" style={linkStyle}>Do Not Sell or Share My Personal Information</Link>
    </footer>
  );
}
