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

export type AssetCategory = "client-deliverable" | "brand" | "content-gtm";

export interface OzvorAsset {
  id: string;
  title: string;
  category: AssetCategory;
  format: "pdf" | "xlsx" | "zip" | "png" | "markdown" | "directory";
  description: string;
  /** Path on ozvor.com — downloadable artifact (omit when repo-only). */
  publicPath?: string;
  /** Source in the ChampsFlow repo — edit + regenerate via PR. */
  repoPath?: string;
}

export const OZVOR_ASSETS: OzvorAsset[] = [
  // ── Client deliverables (paid products + lead magnets) ────────────────────
  {
    id: "get-cited-kit",
    title: "The Get-Cited Kit",
    category: "client-deliverable",
    format: "pdf",
    description:
      "The $29 tripwire product (22p): full audit walkthrough, Ozvor AI Visibility Score, top-3 fixes, 3 draft posts, 30-day retest plan.",
    publicPath: "/downloads/The-Get-Cited-Kit.pdf",
    repoPath: "docs/examples/sample-get-cited-kit.md",
  },
  {
    id: "whitepaper-understanding-geo",
    title: "Understanding GEO Search (whitepaper)",
    category: "client-deliverable",
    format: "pdf",
    description: "18p research-grounded whitepaper — Kit bonus and outreach attachment.",
    publicPath: "/downloads/Understanding-GEO-Search.pdf",
    repoPath: "docs/marketing/lead-magnets/whitepaper-understanding-geo.md",
  },
  {
    id: "geo-visibility-guide",
    title: "The GEO Visibility Guide",
    category: "client-deliverable",
    format: "pdf",
    description: "30p practical guide to getting cited by AI search — premium lead magnet.",
    publicPath: "/downloads/The-GEO-Visibility-Guide.pdf",
    repoPath: "docs/marketing/lead-magnets/geo-visibility-guide.md",
  },
  {
    id: "citation-post-templates",
    title: "5 High-Citation Post Templates",
    category: "client-deliverable",
    format: "pdf",
    description: "Fill-in templates for the content formats LLMs cite most.",
    publicPath: "/downloads/5-High-Citation-Post-Templates.pdf",
    repoPath: "docs/marketing/lead-magnets/5-high-citation-post-templates.md",
  },
  {
    id: "llm-citation-tracker",
    title: "LLM Citation Tracker (spreadsheet)",
    category: "client-deliverable",
    format: "xlsx",
    description: "Working spreadsheet for tracking citations across engines over time.",
    publicPath: "/downloads/LLM-Citation-Tracker.xlsx",
    repoPath: "scripts/build-deliverables.mjs",
  },
  {
    id: "llm-citation-tracker-methodology",
    title: "LLM Citation Tracker — Methodology",
    category: "client-deliverable",
    format: "pdf",
    description: "Companion methodology for the tracker spreadsheet.",
    publicPath: "/downloads/LLM-Citation-Tracker-Methodology.pdf",
    repoPath: "docs/marketing/lead-magnets/llm-citation-tracker.md",
  },

  // ── Brand kit ──────────────────────────────────────────────────────────────
  {
    id: "brand-kit",
    title: "Ozvor Brand Kit",
    category: "brand",
    format: "zip",
    description: "Logos, social banners and profile images — the entity-consistency pack for every channel signup.",
    publicPath: "/downloads/Ozvor-Brand-Kit.zip",
    repoPath: "scripts/gen-brand-kit.mjs",
  },
  {
    id: "logo",
    title: "Ozvor logo (PNG)",
    category: "brand",
    format: "png",
    description: "Primary logo mark.",
    publicPath: "/logo.png",
  },

  // ── GTM / content pack (repo-only — Hermes reads via GitHub Contents) ─────
  {
    id: "linkedin-launch-posts",
    title: "LinkedIn launch posts (3)",
    category: "content-gtm",
    format: "markdown",
    description: "Launch-week posts, including the honesty play built on Ozvor's real score.",
    repoPath: "docs/departments/marketing/linkedin-launch-posts.md",
  },
  {
    id: "marketing-strategy",
    title: "Marketing strategy",
    category: "content-gtm",
    format: "markdown",
    description: "Positioning, channels and cadence.",
    repoPath: "docs/departments/marketing/strategy.md",
  },
  {
    id: "battlecards",
    title: "Competitor battlecards",
    category: "content-gtm",
    format: "markdown",
    description: "Profound, Peec, Otterly, AthenaHQ — objection handling and win angles.",
    repoPath: "docs/departments/sales/battlecards.md",
  },
  {
    id: "first-week-playbook",
    title: "First-week sales playbook",
    category: "content-gtm",
    format: "markdown",
    description: "Day-by-day founder-led sales motions for launch week.",
    repoPath: "docs/departments/sales/first-week-playbook.md",
  },
  {
    id: "icp-website-audit",
    title: "ICP definition + website audit",
    category: "content-gtm",
    format: "markdown",
    description: "Who we sell to and how the site maps to them.",
    repoPath: "docs/departments/sales/icp-website-audit.md",
  },
  {
    id: "signal-shortlist",
    title: "Reddit signal shortlist (62 posts)",
    category: "content-gtm",
    format: "markdown",
    description: "Real Reddit threads for ToS-safe Tier-1 replies, with niche watering holes.",
    repoPath: "docs/departments/sales/signal-shortlist.md",
  },
  {
    id: "nurture-emails",
    title: "Nurture email sequences (source)",
    category: "content-gtm",
    format: "directory",
    description: "Free→Kit and Kit→DFY sequences the platform sends automatically.",
    repoPath: "packages/shared/src/emails",
  },
  {
    id: "blog-posts",
    title: "GEO blog posts (10)",
    category: "content-gtm",
    format: "directory",
    description: "Published, sourced posts — the citation-bait content engine.",
    repoPath: "apps/web/src/app/(marketing)/blog",
  },
];
