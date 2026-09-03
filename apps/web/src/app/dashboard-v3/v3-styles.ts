/**
 * v3-styles — the subset of dashboard-v3's inline style map that the tab
 * files outside page.tsx need (AI Audit tab, OrganicPosts Prime tab, credits
 * widgets). page.tsx cannot export its `S` (Next restricts page exports), so
 * the shared tokens live here and page.tsx keeps its own copy for now. Same
 * tokens.css variables, so light/dark come for free.
 */

import type React from "react";

export const V3: Record<string, React.CSSProperties> = {
  card: { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" },
  secH: { display: "flex", alignItems: "center", gap: "var(--space-2)", margin: "var(--space-6) 2px var(--space-3)", fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.01em" },
  secN: { color: "var(--color-muted)", fontWeight: 500, fontSize: "0.85rem" },
  note: { margin: "var(--space-5) 2px 0", color: "var(--color-muted)", fontSize: "0.8rem", lineHeight: 1.6 },
  muted: { color: "var(--color-muted)", fontSize: "0.9rem", padding: "var(--space-3) 2px" },
  pill: { display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "var(--radius-pill)", fontSize: "0.76rem", fontWeight: 700 },
  btnPri: { background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", padding: "9px 16px", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none", border: "none", cursor: "pointer" },
  btnGhost: { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "7px 13px", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", textDecoration: "none" },
  actRow: { padding: "13px 18px", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: "var(--space-3)", alignItems: "center" },
  actWhy: { color: "var(--color-muted)", fontSize: "0.84rem", marginTop: "2px", lineHeight: 1.5 },
  imp: { padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" },
  input: { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", borderRadius: "var(--radius-md)", padding: "9px 12px", font: "inherit", fontSize: "0.9rem", fontWeight: 400 },
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "var(--space-3)" },
};
