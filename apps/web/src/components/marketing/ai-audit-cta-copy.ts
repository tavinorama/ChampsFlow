/**
 * Copy + canonical URL for the site-wide AI Audit Stack CTA (SPRINT-9).
 * Pure module (no JSX) so unit tests can import it directly.
 * House style: short sentences, first-person CTA, no em-dashes.
 */

export const AI_AUDIT_URL = "/ai-audit";

export const AI_AUDIT_CTA = {
  headline: "Curious how AI sees your brand right now?",
  subline:
    "Run the free 60-second test. Or get the AI tools you actually need, picked for you.",
  primaryLabel: "Run the free test",
  auditLabel: "Show me my AI stack, $49",
} as const;
