/**
 * grounding-sources.ts — the AI-tool directories the AI Audit Stack RESEARCHES
 * AGAINST, and the legal terms on which each one may be used.
 *
 * WHY THIS EXISTS. The founder pointed us at Corey Ganim's "$1,000/hour Solo AI
 * business" video (youtu.be/dhbcVxYhWaQ): a $999 AI Tools Assessment where the
 * client-call transcript is fed to an LLM (Claude) that recommends real,
 * existing tools — grounded in two directories so it does not hallucinate. That
 * is almost exactly this product. The two directories the video names are here
 * (There's An AI For That, Futurepedia), plus the real alternatives with a
 * cleaner legal path (Product Hunt, Toolify, G2).
 *
 * WHY IT IS A LEGAL GATE, NOT JUST A LIST. The video's method is to use these
 * directories as REFERENCE to steer the LLM — NOT to scrape them. That matters:
 * There's An AI For That's ToS explicitly forbids extracting its data "by any
 * automated OR manual means" and asserts EU Database Directive 96/9/EC rights,
 * and Ozvor has an EU footprint (founder in Lisbon). So `automatedIngestAllowed`
 * is the hard gate: any future catalog-builder MUST read it before ingesting a
 * source. Reference-only sources are consulted by a human analyst / used to
 * ground the LLM's niche→tool reasoning; they are NEVER scraped into ai_tool.
 * The only sources safe for automated ingestion are those with an official,
 * permissioned API. This keeps the product on the right side of both the ToS and
 * the honesty rule (audits must be real or fail honestly).
 *
 * This module is PURE data + typing, like agent-graphs.ts — no I/O, no clock.
 */

/** How Ozvor is permitted to use a source. */
export type GroundingUse =
  /** Human analyst / LLM grounding reference only — never ingested. */
  | "reference"
  /** May seed the curated catalog (analyst-in-the-loop), terms permitting. */
  | "catalog-seed"
  /** Has an official permissioned API — safe for automated live lookup. */
  | "live-api";

/** One AI-tool directory the audit researches against, with its usage terms. */
export interface GroundingSource {
  id: string;
  name: string;
  url: string;
  /** One line: what the directory is. */
  oneLiner: string;
  /** Named in the source video (Corey Ganim's $1k AI audit) as a grounding directory. */
  citedInVideo: boolean;
  /** True only when the source offers an official, permissioned public API. */
  hasOfficialApi: boolean;
  /**
   * THE LEGAL GATE. True only when the source's terms permit automated
   * ingestion of its data into our product. False for scrape-forbidding /
   * database-right-asserting directories — those are reference-only. A catalog
   * builder must ingest ONLY sources where this is true.
   */
  automatedIngestAllowed: boolean;
  /** How we may use it (derived from the terms above). */
  useAs: GroundingUse;
  /** The terms reality in one line. Internal — never shown to clients. */
  legalNote: string;
}

/**
 * The registry. Order = research priority for a human analyst: the two the
 * video cites first, then the safe-API alternatives, then paid/partner.
 */
export const GROUNDING_SOURCES: GroundingSource[] = [
  {
    id: "theresanaiforthat",
    name: "There's An AI For That",
    url: "https://theresanaiforthat.com",
    oneLiner: "The largest task-to-AI directory; search any use-case, ranked by popularity.",
    citedInVideo: true,
    hasOfficialApi: false,
    automatedIngestAllowed: false,
    useAs: "reference",
    legalNote:
      "ToS forbids scraping/harvesting by automated OR manual means and asserts EU Database Directive 96/9/EC rights. Reference-only for an EU-footprint company. Licensing deal required to ingest.",
  },
  {
    id: "futurepedia",
    name: "Futurepedia",
    url: "https://futurepedia.io",
    oneLiner: "Well-known categorized AI-tool directory with use-cases, pricing and ratings.",
    citedInVideo: true,
    hasOfficialApi: false,
    automatedIngestAllowed: false,
    useAs: "reference",
    legalNote:
      "No official API; no clear public commercial-data license found. Scrape-only and legally gray — absence of permission is not permission. Reference-only until confirmed with them.",
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com",
    oneLiner: "Launch platform; the cleanest signal on new/emerging tools and their traction.",
    citedInVideo: false,
    hasOfficialApi: true,
    automatedIngestAllowed: true,
    useAs: "live-api",
    legalNote:
      "Official GraphQL API with published terms and a free tier — the safest permissioned live-lookup/seed source. Filter by topic/category (not AI-specific).",
  },
  {
    id: "toolify",
    name: "Toolify.ai",
    url: "https://www.toolify.ai",
    oneLiner: "Largest by raw count (~30k tools, 450+ categories) with built-in ranking signals.",
    citedInVideo: false,
    hasOfficialApi: false,
    automatedIngestAllowed: false,
    useAs: "catalog-seed",
    legalNote:
      "Big and well-ranked, but only third-party (unofficial) access exists and no confirmed commercial license. Seed candidate ONLY via a licensing/API deal — not by scraping.",
  },
  {
    id: "g2",
    name: "G2",
    url: "https://www.g2.com",
    oneLiner: "Software review platform; best for verified reviews and social-proof signals.",
    citedInVideo: false,
    hasOfficialApi: true,
    automatedIngestAllowed: false,
    useAs: "reference",
    legalNote:
      "Has APIs but gated behind paid/partner agreements; protective of review data. Reference/enrichment only, unless a paid data partnership is signed.",
  },
];

/** Client-safe view: the directories the full audit consults, no legal notes. */
export interface PublicGroundingSource {
  name: string;
  url: string;
  oneLiner: string;
  citedInVideo: boolean;
}

/**
 * The directories the FULL audit + catalog curation research against, safe to
 * name to a client (naming a public directory is not using its data). Legal
 * notes and the ingest gate stay internal. This is product metadata, not a
 * claim on the low-ticket self-serve result (the pure engine does not consult
 * them live) — the caller decides where to surface it.
 */
export function clientSafeGroundingSources(): PublicGroundingSource[] {
  return GROUNDING_SOURCES.map((s) => ({
    name: s.name,
    url: s.url,
    oneLiner: s.oneLiner,
    citedInVideo: s.citedInVideo,
  }));
}

/** Sources a catalog builder may ingest automatically — the ONLY safe set. */
export function ingestibleSources(): GroundingSource[] {
  return GROUNDING_SOURCES.filter((s) => s.automatedIngestAllowed);
}
