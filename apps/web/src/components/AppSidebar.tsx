"use client";

/**
 * AppSidebar — persistent left navigation for authenticated Ozvor app pages.
 *
 * RankLayer-inspired product chrome: the dashboard should feel like an operating
 * system, not a collection of loose pages. Desktop/tablet users get a fixed
 * vertical command menu; mobile keeps the existing BottomNav patterns.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase-browser";
import { LogoMark, Wordmark } from "./brand/Logo";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", description: "Score, trend, next actions", icon: "⌘" },
      { href: "/brands", label: "Brands", description: "Tracked brands and audits", icon: "◎" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/brands", label: "Competitors", description: "Who AI recommends instead", icon: "◇" },
      { href: "/brands", label: "Citation sources", description: "Reddit, LinkedIn, G2 and more", icon: "↗" },
      { href: "/test", label: "AI visibility test", description: "Run or relaunch an audit", icon: "✦" },
    ],
  },
  {
    label: "Execution",
    items: [
      { href: "/drafts", label: "Fix queue", description: "Recommended fixes and drafts", icon: "✓", badge: "New" },
      { href: "/schedule", label: "Calendar", description: "Draft, approve, publish, measure", icon: "□" },
    ],
  },
  {
    label: "Studio",
    items: [
      { href: "/marketing", label: "Marketing", description: "Campaigns from your audit data", icon: "◈", badge: "Soon" },
      { href: "/landing-pages", label: "Landing pages", description: "GEO pages AI can cite", icon: "▦", badge: "Soon" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/account/billing", label: "Billing", description: "Plan and invoices", icon: "$" },
      { href: "/account", label: "Settings", description: "Team, privacy, connections", icon: "⚙" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      getSupabase()
        .auth.getUser()
        .then(({ data }) => setEmail(data.user?.email ?? null))
        .catch(() => setEmail(null));
    } catch {
      // Local previews and static review environments may not have Supabase env
      // vars. Navigation chrome should still render instead of crashing the app.
      setEmail(null);
    }
  }, []);

  return (
    <aside className="app-sidebar" aria-label="Product navigation">
      <div className="app-sidebar__brand">
        <Link href="/dashboard" aria-label="Ozvor dashboard" className="app-sidebar__logo">
          <LogoMark size={30} />
          <Wordmark size="1.05rem" />
        </Link>
        <div className="app-sidebar__status">
          <span aria-hidden="true" />
          AI trust command center
        </div>
      </div>

      <nav className="app-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <section key={group.label} className="app-sidebar__group" aria-labelledby={`nav-${group.label}`}>
            <div id={`nav-${group.label}`} className="app-sidebar__group-label">
              {group.label}
            </div>
            <div className="app-sidebar__items">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={`${group.label}-${item.label}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`app-sidebar__item${active ? " app-sidebar__item--active" : ""}`}
                  >
                    <span className="app-sidebar__icon" aria-hidden="true">{item.icon}</span>
                    <span className="app-sidebar__copy">
                      <span className="app-sidebar__label-row">
                        <span>{item.label}</span>
                        {item.badge && <span className="app-sidebar__badge">{item.badge}</span>}
                      </span>
                      <span className="app-sidebar__desc">{item.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__brief-label">This week</div>
        <div className="app-sidebar__brief-title">Audit → Fix → Approve → Measure</div>
        <p>Turn every AI visibility gap into a draft, calendar item, or managed OrganicPosts handoff.</p>
        {email && <div className="app-sidebar__email">{email}</div>}
      </div>
    </aside>
  );
}
