/**
 * AiAuditCta — site-wide call-to-action for the $49 AI Audit Stack.
 *
 * Renders the shared SoftCTA band with two peer offers:
 *   primary  → free AI Invisibility Test (/test)
 *   outlined → AI Audit Stack, $49 (/ai-audit)
 *
 * Copy is fixed here so every public page speaks with one voice
 * (house style: short sentences, first-person CTA, no em-dashes).
 * Pages may override headline/subline or add a secondary text link.
 *
 * Pure RSC. Same tokens as SoftCTA, no new design.
 */

import { SoftCTA } from "./SoftCTA";
import { AI_AUDIT_CTA, AI_AUDIT_URL } from "./ai-audit-cta-copy";

export { AI_AUDIT_CTA, AI_AUDIT_URL };

export interface AiAuditCtaProps {
  headline?: string;
  subline?: string;
  /** Override the free-test primary (label + href). */
  primary?: { label: string; href: string };
  /** Optional text link (e.g. the $29 Kit or /pricing). */
  secondary?: { label: string; href: string };
}

export function AiAuditCta({
  headline = AI_AUDIT_CTA.headline,
  subline = AI_AUDIT_CTA.subline,
  primary = { label: AI_AUDIT_CTA.primaryLabel, href: "/test" },
  secondary,
}: AiAuditCtaProps) {
  return (
    <SoftCTA
      headline={headline}
      subline={subline}
      primary={primary}
      outlined={{ label: AI_AUDIT_CTA.auditLabel, href: AI_AUDIT_URL }}
      secondary={secondary}
    />
  );
}
