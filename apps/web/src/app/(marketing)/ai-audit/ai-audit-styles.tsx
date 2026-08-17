/**
 * ai-audit-styles.tsx — the inline style helpers shared by the /ai-audit
 * questionnaire (AiAuditClient) and the delivered result (AiAuditResult).
 * Mirrors the /test client conventions (inline + CSS vars).
 */

import type React from "react";

export const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  padding: "0 var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body-sm)",
  boxSizing: "border-box",
  fontFamily: "var(--font-family)",
};

export function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontFamily: "var(--font-family)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  };
}

export function ghostBtn(): React.CSSProperties {
  return {
    height: "48px",
    padding: "0 var(--space-5)",
    backgroundColor: "transparent",
    color: "var(--color-primary)",
    border: "1.5px solid var(--color-primary)",
    borderRadius: "var(--radius-md)",
    fontWeight: 700,
    fontSize: "var(--font-size-body-sm)",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-family)",
  };
}

export function chipStyle(selected: boolean): React.CSSProperties {
  return {
    border: selected ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
    borderRadius: "var(--radius-pill)",
    padding: "8px 14px",
    fontSize: "var(--font-size-body-sm)",
    fontWeight: 600,
    color: selected ? "var(--color-primary)" : "var(--color-text)",
    background: selected ? "rgba(39,201,138,0.10)" : "var(--color-surface-muted)",
    cursor: "pointer",
    fontFamily: "var(--font-family)",
    minHeight: "40px",
  };
}

export function sectionLabel(text: string) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: "var(--font-size-caption)",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--color-muted)",
      }}
    >
      {text}
    </p>
  );
}
