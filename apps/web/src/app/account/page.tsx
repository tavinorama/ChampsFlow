/**
 * /account — account hub.
 *
 * The BottomNav "Account" tab points here; previously there was no page at this
 * path (the tab 404'd). This is a plain index of every account section, each a
 * tappable card with a one-line description. Static links only — no client state.
 */

import Link from "next/link";

interface Section {
  href: string;
  title: string;
  desc: string;
}

const SECTIONS: Section[] = [
  { href: "/account/billing", title: "Billing & plan", desc: "Your subscription, invoices and plan limits." },
  { href: "/account/integrations", title: "AI engines & keys", desc: "Connect your own AI provider keys, or use Ozvor's." },
  { href: "/account/api-keys", title: "API keys", desc: "Create keys to pull your scores into your own tools." },
  { href: "/account/connections", title: "Connections", desc: "Publishing channels connected via secure OAuth." },
  { href: "/account/data-privacy", title: "Data & privacy", desc: "Export, delete, and control how your data is used." },
  { href: "/account/legal", title: "Legal", desc: "Terms, privacy policy, DPA and sub-processors." },
  { href: "/account/system-status", title: "System status", desc: "Live status of the engines powering your audits." },
];

export default function AccountHubPage() {
  return (
    <main
      style={{
        maxWidth: "780px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 var(--space-2) 0" }}>
        Account
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, margin: "0 0 var(--space-6) 0" }}>
        Manage your subscription, connections, data and developer access.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              backgroundColor: "var(--color-surface)",
              textDecoration: "none",
              color: "var(--color-text)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{s.title}</div>
              <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>{s.desc}</div>
            </div>
            <span aria-hidden="true" style={{ color: "var(--color-muted)", flexShrink: 0 }}>→</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
