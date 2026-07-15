/**
 * assets-manifest.ts — single source of truth for Ozvor's asset library.
 *
 * Feeds two surfaces:
 *   - /admin → Assets tab (founder browsing + download links)
 *   - GET /api/v1/operator/assets (Hermes: use, adapt, improve the assets)
 *
 * Each asset points to the LIVE artifact (publicPath on ozvor.com, when one
 * exists) and to its SOURCE in the repo (repoPath) — improving an asset means
 * editing the source and shipping it through the normal PR workflow, never
 * editing binaries in place.
 */

import { signedDownloadUrl, type GatedAssetId } from "./download-token";

export type AssetCategory = "client-deliverable" | "brand" | "content-gtm";

/**
 * How a customer receives this asset. Keeps the Assets tab honest about the
 * delivery wiring (Stripe webhook -> Resend email), which is the single source
 * of truth in apps/api/src/routes/billing.ts.
 */
export type DeliveryChannel =
  | "kit-email" // sendKitDeliveryEmail after the $29 Get-Cited Kit purchase
  | "bonus-email" // sendBonusDeliveryEmail on Growth/Agency subscription
  | "internal"; // ops/brand asset — not auto-sent to customers

export interface OzvorAsset {
  id: string;
  title: string;
  category: AssetCategory;
  format: "pdf" | "xlsx" | "zip" | "png" | "markdown" | "directory";
  description: string;
  /**
   * Path on ozvor.com — downloadable artifact (omit when repo-only). For GATED
   * assets this is NOT a static file: it is resolved at request time to a
   * signed, expiring /api/download URL (see resolveAssetDownloads). The raw
   * manifest leaves publicPath undefined for gated assets so no dead/public link
   * ever leaks.
   */
  publicPath?: string;
  /**
   * Gated asset id (customer-only). When set, the file is served only via a
   * signed token — never as a free public file. resolveAssetDownloads() mints
   * the signed publicPath for the admin/operator surfaces.
   */
  gated?: GatedAssetId;
  /** Source in the ChampsFlow repo — edit + regenerate via PR. */
  repoPath?: string;
  /** How the customer receives it (delivery wiring). */
  deliveredVia: DeliveryChannel;
  /** Human label of which purchase/plan triggers delivery. */
  deliveredOn: string;
}

export const OZVOR_ASSETS: OzvorAsset[] = [
  // ── Client deliverables (paid products + lead magnets) ────────────────────
  {
    id: "get-cited-kit",
    title: "The Get-Cited Kit",
    category: "client-deliverable",
    format: "pdf",
    description:
      "The $29 tripwire product: audit walkthrough, Ozvor AI Visibility Score, top-3 fixes, 3 ready-to-publish drafts, 30-day retest plan.",
    gated: "get-cited-kit",
    repoPath: "docs/marketing/lead-magnets/get-cited-kit.md",
    deliveredVia: "kit-email",
    deliveredOn: "Get-Cited Kit purchase ($29)",
  },
  {
    id: "whitepaper-understanding-geo",
    title: "Understanding GEO Search (whitepaper)",
    category: "client-deliverable",
    format: "pdf",
    description: "Research-grounded explainer of how AI answer engines choose who to cite. Kit Part 2 bonus and outreach attachment.",
    publicPath: "/downloads/Understanding-GEO-Search.pdf",
    repoPath: "docs/marketing/lead-magnets/whitepaper-understanding-geo.md",
    deliveredVia: "kit-email",
    deliveredOn: "Get-Cited Kit, Part 2 bonus",
  },
  {
    id: "geo-visibility-guide",
    title: "The GEO Visibility Guide",
    category: "client-deliverable",
    format: "pdf",
    description: "Action-first guide to getting cited by AI search. Opens with a 10-minute check. Growth/Agency welcome bonus.",
    gated: "geo-guide",
    repoPath: "docs/marketing/lead-magnets/geo-visibility-guide.md",
    deliveredVia: "bonus-email",
    deliveredOn: "Growth / Agency welcome",
  },
  {
    id: "citation-post-templates",
    title: "5 High-Citation Post Templates",
    category: "client-deliverable",
    format: "pdf",
    description: "Fill-in templates for the content formats LLMs cite most.",
    gated: "citation-templates",
    repoPath: "docs/marketing/lead-magnets/5-high-citation-post-templates.md",
    deliveredVia: "bonus-email",
    deliveredOn: "Growth / Agency welcome",
  },
  {
    id: "llm-citation-tracker",
    title: "LLM Citation Tracker (spreadsheet)",
    category: "client-deliverable",
    format: "xlsx",
    description: "Working spreadsheet for tracking citations across engines over time.",
    gated: "citation-tracker",
    repoPath: "scripts/build-deliverables.mjs",
    deliveredVia: "bonus-email",
    deliveredOn: "Growth / Agency welcome",
  },
  {
    id: "llm-citation-tracker-methodology",
    title: "LLM Citation Tracker: Methodology",
    category: "client-deliverable",
    format: "pdf",
    description: "Companion methodology for the tracker spreadsheet.",
    gated: "citation-tracker-methodology",
    repoPath: "docs/marketing/lead-magnets/llm-citation-tracker.md",
    deliveredVia: "bonus-email",
    deliveredOn: "Growth / Agency welcome",
  },

  // ── Brand kit ──────────────────────────────────────────────────────────────
  {
    id: "brand-kit",
    title: "Ozvor Brand Kit",
    category: "brand",
    format: "zip",
    description: "Logos, social banners and profile images, the entity-consistency pack for every channel signup.",
    publicPath: "/downloads/Ozvor-Brand-Kit.zip",
    repoPath: "scripts/gen-brand-kit.mjs",
    deliveredVia: "internal",
    deliveredOn: "Ops / channel setup",
  },
  {
    id: "logo",
    title: "Ozvor logo (PNG)",
    category: "brand",
    format: "png",
    description: "Primary logo mark.",
    publicPath: "/logo.png",
    repoPath: "apps/web/public/logo.png",
    deliveredVia: "internal",
    deliveredOn: "Ops / brand",
  },

  // ── GTM / content pack (repo-only — Hermes reads via GitHub Contents) ─────
  {
    id: "linkedin-launch-posts",
    title: "LinkedIn launch posts (3)",
    category: "content-gtm",
    format: "markdown",
    description: "Launch-week posts, including the honesty play built on Ozvor's real score.",
    repoPath: "docs/departments/marketing/linkedin-launch-posts.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / marketing",
  },
  {
    id: "social-launch-posts",
    title: "Social launch posts (X/IG/FB/Threads/Bluesky)",
    category: "content-gtm",
    format: "markdown",
    description: "The LinkedIn launch arc adapted to each network's native mechanics (not copy-paste).",
    repoPath: "docs/departments/marketing/social-launch-posts.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / marketing",
  },
  {
    id: "marketing-strategy",
    title: "Marketing strategy",
    category: "content-gtm",
    format: "markdown",
    description: "Positioning, channels and cadence.",
    repoPath: "docs/departments/marketing/strategy.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / marketing",
  },
  {
    id: "battlecards",
    title: "Competitor battlecards",
    category: "content-gtm",
    format: "markdown",
    description: "Profound, Peec, Otterly, AthenaHQ: objection handling and win angles.",
    repoPath: "docs/departments/sales/battlecards.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / sales",
  },
  {
    id: "first-week-playbook",
    title: "First-week sales playbook",
    category: "content-gtm",
    format: "markdown",
    description: "Day-by-day founder-led sales motions for launch week.",
    repoPath: "docs/departments/sales/first-week-playbook.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / sales",
  },
  {
    id: "icp-website-audit",
    title: "ICP definition + website audit",
    category: "content-gtm",
    format: "markdown",
    description: "Who we sell to and how the site maps to them.",
    repoPath: "docs/departments/sales/icp-website-audit.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / sales",
  },
  {
    id: "signal-shortlist",
    title: "Reddit signal shortlist (62 posts)",
    category: "content-gtm",
    format: "markdown",
    description: "Real Reddit threads for ToS-safe Tier-1 replies, with niche watering holes.",
    repoPath: "docs/departments/sales/signal-shortlist.md",
    deliveredVia: "internal",
    deliveredOn: "Ops / sales",
  },
  {
    id: "nurture-emails",
    title: "Nurture email sequences (source)",
    category: "content-gtm",
    format: "directory",
    description: "Free→Kit and Kit→DFY sequences the platform sends automatically.",
    repoPath: "packages/shared/src/emails",
    deliveredVia: "internal",
    deliveredOn: "Ops / lifecycle",
  },
  {
    id: "blog-posts",
    title: "GEO blog posts (10)",
    category: "content-gtm",
    format: "directory",
    description: "Published, sourced posts, the citation-bait content engine.",
    repoPath: "apps/web/src/app/(marketing)/blog",
    deliveredVia: "internal",
    deliveredOn: "Ops / content",
  },
];

/**
 * Resolve the manifest for the admin/operator surfaces: gated assets get a
 * freshly-signed, expiring /api/download URL as their publicPath so the founder
 * (and Hermes, via the operator API) can still fetch them — without ever
 * exposing a plain public URL. Public (non-gated) assets are returned unchanged.
 *
 * Runs server-side only (needs OAUTH_TOKEN_KEY). If signing fails for any asset,
 * that asset is returned without a publicPath rather than crashing the list.
 */
export function resolveAssetDownloads(origin = ""): OzvorAsset[] {
  return OZVOR_ASSETS.map((a) => {
    if (!a.gated) return a;
    try {
      return { ...a, publicPath: signedDownloadUrl(a.gated, origin) };
    } catch {
      return a;
    }
  });
}
