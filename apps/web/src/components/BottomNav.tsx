/**
 * BottomNav — persistent bottom navigation bar
 *
 * Tabs: Dashboard / Brands / [Portfolio — agency only] / Account
 * 375px mobile-first; 56px height; bottom-safe-area aware.
 * Keyboard navigable: Tab moves between items; Enter/Space activates.
 * Active tab indicated by color AND text label (never color alone).
 *
 * UX ref: docs/04-ux.md §4 Screen 04 bottom nav, §8 Accessibility
 * Design: --color-primary (active), --color-muted (inactive)
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiFetch } from "../lib/supabase-browser";

// ---------------------------------------------------------------------------
// Nav icons — GEO-product appropriate
// ---------------------------------------------------------------------------

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

/** Target/crosshair icon — represents brand visibility tracking */
function BrandsIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function PortfolioIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function AccountIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BottomNav() {
  const pathname = usePathname();
  const [isAgency, setIsAgency] = useState(false);

  useEffect(() => {
    apiFetch("/api/billing/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { plan?: string } | null) => {
        if (data?.plan === "agency") setIsAgency(true);
      })
      .catch(() => {});
  }, []);

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  const baseItems: { label: string; href: string; ariaLabel: string; icon: (active: boolean) => React.ReactNode }[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      ariaLabel: "Dashboard — your brands and Ozvor AI Visibility scores",
      icon: (active) => <DashboardIcon active={active} />,
    },
    {
      label: "Brands",
      href: "/brands",
      ariaLabel: "Brands — manage your tracked brands and competitors",
      icon: (active) => <BrandsIcon active={active} />,
    },
  ];

  const agencyItem: { label: string; href: string; ariaLabel: string; icon: (active: boolean) => React.ReactNode } = {
    label: "Portfolio",
    href: "/agency",
    ariaLabel: "Agency portfolio — all client brands",
    icon: (active) => <PortfolioIcon active={active} />,
  };

  const accountItem: { label: string; href: string; ariaLabel: string; icon: (active: boolean) => React.ReactNode } = {
    label: "Account",
    href: "/account",
    ariaLabel: "Account — manage your profile and subscription",
    icon: (active) => <AccountIcon active={active} />,
  };

  const navItems = isAgency
    ? [...baseItems, agencyItem, accountItem]
    : [...baseItems, accountItem];

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "var(--bottom-nav-height)",
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "stretch",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        zIndex: 100,
      }}
    >
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.ariaLabel}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-1)",
              color: active ? "var(--color-primary)" : "var(--color-muted)",
              textDecoration: "none",
              fontSize: "var(--font-size-caption)",
              fontWeight: active ? "var(--font-weight-medium)" : "var(--font-weight-normal)",
              fontFamily: "var(--font-family)",
              minHeight: "var(--min-tap-target)",
              outline: "none",
              /* Focus visible via :focus-visible in global CSS */
            }}
            className="bottom-nav-item"
          >
            {item.icon(active)}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
