"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export function StickyBuyBar() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("stickyBarDismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem("stickyBarDismissed", "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className="mk-sticky-bar"
      role="complementary"
      aria-label="Quick purchase options"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: 0 }}>
        <Link
          href="/login?plan=growth&next=checkout&interval=year"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "44px",
            padding: "0 var(--space-4)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            borderRadius: "var(--radius-md)",
            fontSize: "0.875rem",
            fontWeight: 700,
            fontFamily: "var(--font-family)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          Start Growth · from $69/mo
        </Link>
        <Link
          href="/test"
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-primary)",
            textDecoration: "none",
            fontFamily: "var(--font-family)",
            whiteSpace: "nowrap",
          }}
        >
          Free test
        </Link>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss buy bar"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-muted)",
          fontSize: "1.25rem",
          lineHeight: 1,
          padding: "var(--space-2)",
          minWidth: "44px",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: "var(--font-family)",
        }}
      >
        ×
      </button>
    </div>
  );
}
