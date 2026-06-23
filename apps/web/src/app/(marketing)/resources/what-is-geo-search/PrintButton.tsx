"use client";

/**
 * PrintButton — "Download PDF" for the GEO guide (Part 2 of the Kit).
 * Uses the browser's print pipeline (Save as PDF). The page's @media print CSS
 * hides the site chrome and this button so the output is a clean branded doc.
 */

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="noprint"
      style={{
        height: "44px",
        padding: "0 var(--space-5)",
        backgroundColor: "var(--color-primary)",
        color: "#fff",
        border: "none",
        borderRadius: "var(--radius-md)",
        fontWeight: 700,
        fontSize: "var(--font-size-body-sm)",
        cursor: "pointer",
        fontFamily: "var(--font-family)",
      }}
    >
      ↓ Download as PDF
    </button>
  );
}
