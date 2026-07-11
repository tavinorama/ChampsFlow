"use client";

/**
 * ProductsMenu — "Products ▾" dropdown, first item in the public navbar.
 *
 * The navbar (`(marketing)/layout.tsx`) is a Server Component, so
 * interactivity (open/close, click-outside, Escape) lives in this client
 * leaf — same pattern as FreeTestCta / ThemeToggle.
 *
 * Pattern choice: a disclosure ("Products ▾" button + a plain list of
 * <Link>s), NOT an ARIA menu widget — so the trigger deliberately does NOT
 * declare `aria-haspopup="menu"` (that would promise role="menu"/"menuitem"
 * + arrow-key semantics we don't implement — a WCAG 4.1.2 mismatch, per
 * Hermes review on PR #235). The contract is: `aria-expanded` + an
 * `aria-controls` pointing at the panel's stable id; the panel is a
 * semantic <ul> of real links users reach with Tab. The pure helpers
 * `triggerAria()` / `shouldCloseOnKey()` encode this contract and are
 * unit-tested in ProductsMenu.aria.test.ts.
 *
 * Desktop-first: reuses `.mk-navlink-hide-sm` so the trigger hides at the
 * same breakpoint the other center-nav links do (no separate mobile
 * treatment invented here).
 *
 * GA4: every item click fires window.gtag?.("event", "nav_product_click",
 * {item}) — optional-chained, never assumed present (#117 consent-gated).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { PRODUCTS_PANEL_ID, shouldCloseOnKey, triggerAria } from "./products-menu-aria";


interface ProductsMenuItem {
  slug: string;
  label: string;
  blurb?: string;
  href: string;
  /** OrganicPosts only — the brand's one legitimate gold accent. */
  gold?: boolean;
}

const ITEMS: readonly ProductsMenuItem[] = [
  { slug: "free-test", label: "Free AI test", blurb: "Your score in 60 seconds.", href: "/test" },
  { slug: "kit", label: "Get-Cited Kit — $29", blurb: "Audit + 3 fixes, ready to publish.", href: "/kit" },
  { slug: "pages", label: "Ozvor Pages", blurb: "A 5-page site AI can quote.", href: "/local-pages" },
  {
    slug: "organicposts",
    label: "OrganicPosts by Ozvor",
    blurb: "We do everything for you.",
    href: "/organicposts",
    gold: true,
  },
  { slug: "pricing", label: "Plans & pricing", href: "/pricing" },
];

export function ProductsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes + returns focus to the trigger; a click outside the
  // trigger/panel closes without moving focus.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (shouldCloseOnKey(e.key)) {
        close();
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        className="mk-navlink mk-navlink-hide-sm"
        {...triggerAria(open)}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--color-muted)",
          background: "none",
          border: "none",
          fontFamily: "var(--font-family)",
          padding: "0.4rem 0.55rem",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
        }}
      >
        Products
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M1.5 3 L5 6.5 L8.5 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={PRODUCTS_PANEL_ID}
          aria-label="Products"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            listStyle: "none",
            margin: 0,
            minWidth: "280px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-modal)",
            padding: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            zIndex: 150,
          }}
        >
          {ITEMS.map((item) => (
            <li key={item.slug}>
              <Link
                href={item.href}
                onClick={() => {
                  window.gtag?.("event", "nav_product_click", { item: item.slug });
                  close();
                }}
                className="mk-products-item"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  padding: "0.55rem 0.65rem",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  color: "var(--color-text)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", fontWeight: 700 }}>
                  {item.gold && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--color-gold)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {item.label}
                </span>
                {item.blurb && (
                  <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{item.blurb}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
