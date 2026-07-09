/**
 * /account — Settings hub.
 *
 * The sidebar "Settings" item and the BottomNav "Account" tab both land here.
 * This is the settings "submenu": every account section grouped and styled to
 * match the main sidebar aesthetic (mono uppercase group labels + icon tiles),
 * so Settings reads as one coherent section rather than a flat list of links.
 *
 * Reflects the Batch C consolidation: "AI engines, keys & connections" is the
 * primary connection surface (provider keys + one-click publishing-platform
 * linking live there now); "/account/connections" is demoted to "Advanced
 * connections" for the deeper flows (Facebook Page selection, Google
 * Analytics / Search Console attribution).
 *
 * Static server component — links only, no client state.
 */

import Link from "next/link";
import { AccountEmailBadge } from "../../components/AccountEmailBadge";

interface Item {
  href: string;
  title: string;
  desc: string;
  icon: string;
}
interface Group {
  label: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    label: "Plan",
    items: [
      { href: "/account/billing", title: "Billing & plan", desc: "Your subscription, invoices and plan limits.", icon: "$" },
    ],
  },
  {
    label: "Engines & connections",
    items: [
      {
        href: "/account/integrations",
        title: "AI engines, keys & connections",
        desc: "Your AI provider keys (BYOK) plus one-click LinkedIn, Instagram & Facebook linking.",
        icon: "◈",
      },
      {
        href: "/account/connections",
        title: "Advanced connections",
        desc: "Facebook Page selection and Google Analytics / Search Console attribution.",
        icon: "◇",
      },
      {
        href: "/account/api-keys",
        title: "API keys",
        desc: "Create keys to pull your scores into your own tools.",
        icon: "⌘",
      },
    ],
  },
  {
    label: "Data & privacy",
    items: [
      { href: "/account/data-privacy", title: "Data & privacy", desc: "Export, delete, and control how your data is used.", icon: "⛨" },
      { href: "/account/legal", title: "Legal", desc: "Terms, privacy policy, DPA and sub-processors.", icon: "§" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/account/system-status", title: "System status", desc: "Live status of the engines powering your audits.", icon: "◉" },
    ],
  },
];

const groupLabelStyle: React.CSSProperties = {
  margin: "0 var(--space-2) var(--space-2)",
  color: "var(--color-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.66rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const iconTileStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "34px",
  height: "34px",
  flexShrink: 0,
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  background: "var(--color-bg)",
  color: "var(--color-accent-ink)",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
};

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
        Settings
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6, margin: "0 0 var(--space-6) 0" }}>
        Manage your subscription, connections, data and developer access.
      </p>

      <AccountEmailBadge />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", marginTop: "var(--space-6)" }}>
        {GROUPS.map((group) => (
          <section key={group.label} aria-labelledby={`acct-${group.label}`}>
            <div id={`acct-${group.label}`} style={groupLabelStyle}>
              {group.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {group.items.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  style={{
                    display: "flex",
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
                  <span aria-hidden="true" style={iconTileStyle}>{s.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.title}</div>
                    <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.4 }}>{s.desc}</div>
                  </div>
                  <span aria-hidden="true" style={{ color: "var(--color-muted)", flexShrink: 0 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
