/**
 * LegalPage — shared shell for public legal/policy documents
 * (Terms of Service, Privacy Policy, DPA). Consistent typography, a back link,
 * the standard site Footer, and a "last updated" line. Public (no auth).
 *
 * Content is grounded in docs/compliance/{ropa,regulatory-map,dpia}.md.
 * These are operator-authored policies; founder should have counsel review
 * before paid EU/BR launch (see docs/GO-LIVE-RUNBOOK.md Phase 6).
 */

import Link from "next/link";
import { Footer } from "../Footer";
import { Logo } from "../brand/Logo";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--color-bg)" }}>
      <header style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto", padding: "var(--space-4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }} aria-label="TrustIndex AI — home">
            <Logo markSize={26} wordSize="1rem" />
          </Link>
          <Link href="/" style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
            ← Back to site
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: "820px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-16)", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
        <h1 style={{ fontSize: "clamp(1.875rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 var(--space-2) 0" }}>{title}</h1>
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", margin: "0 0 var(--space-5) 0" }}>Last updated: {updated}</p>
        <p style={{ fontSize: "var(--font-size-body)", color: "var(--color-muted)", lineHeight: 1.7, margin: "0 0 var(--space-8) 0", textAlign: "justify", textJustify: "inter-word", hyphens: "auto" }}>{intro}</p>
        <div className="legal-body" style={{ fontSize: "var(--font-size-body-sm)", lineHeight: 1.75, color: "var(--color-text)", textAlign: "justify", textJustify: "inter-word", hyphens: "auto" }}>
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}

/** Section heading + body wrapper for legal docs. */
export function LegalSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2) 0", color: "var(--color-text)" }}>
        {n}. {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>{children}</div>
    </section>
  );
}
