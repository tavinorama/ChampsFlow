/**
 * _claims.ts — P0-05. The competitive claim registry for /vs/[competitor].
 *
 * READ THIS BEFORE EDITING.
 *
 * Every entry below is currently `stale`, and that is not an oversight — it is
 * the accurate state. The claims on these pages came from
 * docs/departments/sales/battlecards.md, which records no source URL, no check
 * date and no owner for any of them. Nobody in this change opened a competitor's
 * pricing page, so nothing here has been verified against an official source.
 *
 * The rule the audit set, and the rule this file follows: **do not invent facts
 * about competitors.** Where a claim could not be confirmed against the
 * competitor's own published material, it is marked stale rather than dressed
 * up with a plausible date. Stale claims are not rendered, and a competitor with
 * any unpublishable claim has their comparison page frozen (see
 * packages/shared/src/competitive-claims.ts).
 *
 * TO UNFREEZE A PAGE — per competitor, by a named human:
 *   1. Open the competitor's own pricing / product page (not a review site).
 *   2. Correct the claim text to what it actually says today.
 *   3. Set sourceUrl to that page, checkedAt to today, nextReviewAt to a date
 *      you will honour (90 days is the working default), owner to your name,
 *      and confidence honestly.
 *   4. If the evidence is second-hand, the claim's `type` is `inference`, not
 *      `fact` — an inference that reads like a fact is the most dangerous thing
 *      on a comparison page.
 *   5. Where we lose, say so. A comparison that quietly drops the losing rows is
 *      the dishonesty this registry exists to prevent.
 */

import type { CompetitiveClaim } from "@organic-posts/shared";

/**
 * The four the audit named explicitly (§13) as needing re-verification before
 * their pages may be served: Ahrefs, Semrush, Otterly and Profound. Peec AI and
 * AthenaHQ are registered on the same terms — their claims are no better
 * sourced, so exempting them would just mean an unaudited page stays up.
 */
export const COMPETITIVE_CLAIMS: CompetitiveClaim[] = [
  // ── Profound ────────────────────────────────────────────────────────────
  {
    id: "profound-entry-price",
    competitor: "profound",
    claim: "Entry tier is $99/mo (ChatGPT only, 50 prompts).",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Pricing taken from the battlecards with no source URL or date. Not verified against Profound's published pricing.",
  },
  {
    id: "profound-functional-tier",
    competitor: "profound",
    claim: "Real functionality starts at the $399/mo Growth tier; Starter is a teaser.",
    // Fact-shaped, but it is our reading of third-party reviews, not something
    // Profound publishes. Typing it honestly is half the fix.
    type: "inference",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Attributed to 'independent reviews' with no citation. Needs a named, linkable review or removal.",
  },
  {
    id: "profound-no-content-generation",
    competitor: "profound",
    claim: "No content generation, no evidence-backed action plan, no done-for-you arm.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "An absence claim — the hardest kind to keep true, and the easiest to be overtaken by a competitor's release.",
  },

  // ── Ahrefs Brand Radar ──────────────────────────────────────────────────
  {
    id: "ahrefs-brand-radar-pricing",
    competitor: "ahrefs-brand-radar",
    claim: "Pricing and packaging of Brand Radar as stated on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Named by the audit (§13) as requiring re-verification. Ahrefs repackages frequently; unsourced pricing here is a liability.",
  },
  {
    id: "ahrefs-brand-radar-capability",
    competitor: "ahrefs-brand-radar",
    claim: "Capability gaps attributed to Brand Radar on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Not verified against Ahrefs' own product documentation.",
  },

  // ── Semrush AI Toolkit ──────────────────────────────────────────────────
  {
    id: "semrush-ai-pricing",
    competitor: "semrush-ai",
    claim: "Pricing and packaging of the Semrush AI Toolkit as stated on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Named by the audit (§13) as requiring re-verification. Semrush sells the AI Toolkit as an add-on; the tier it attaches to matters and is not recorded.",
  },
  {
    id: "semrush-ai-capability",
    competitor: "semrush-ai",
    claim: "Capability gaps attributed to the Semrush AI Toolkit on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Not verified against Semrush's own product documentation.",
  },

  // ── Otterly.AI ──────────────────────────────────────────────────────────
  {
    id: "otterly-pricing",
    competitor: "otterly",
    claim: "Pricing and plan limits of Otterly.AI as stated on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Named by the audit (§13) as requiring re-verification.",
  },
  {
    id: "otterly-capability",
    competitor: "otterly",
    claim: "Capability gaps attributed to Otterly.AI on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Not verified against Otterly's own product documentation.",
  },

  // ── Peec AI ─────────────────────────────────────────────────────────────
  {
    id: "peec-pricing",
    competitor: "peec",
    claim: "Pricing and plan limits of Peec AI as stated on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "Not named by the audit, but sourced from the same undated battlecards. Same standard applies.",
  },

  // ── AthenaHQ ────────────────────────────────────────────────────────────
  {
    id: "athenahq-capability",
    competitor: "athenahq",
    claim: "Capability comparison against AthenaHQ as stated on the comparison page.",
    type: "fact",
    sourceUrl: null,
    checkedAt: null,
    nextReviewAt: null,
    owner: "unassigned",
    confidence: "low",
    status: "stale",
    note: "The audit calls AthenaHQ the closest product to the intended Ozvor vision (§13). Claims about the competitor we most resemble are the ones least safe to leave unsourced.",
  },
];
