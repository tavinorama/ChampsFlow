/**
 * entity-graph.ts — Ozvor · C7 cross-source entity consistency
 *
 * Closes the last BRAND baseline (entityCompleteness). AI engines resolve a
 * brand to a knowledge-graph ENTITY before they trust and cite it. A brand that
 * exists as a consistent entity across Wikidata / Wikipedia is far more likely
 * to be recognised and recommended than one that is only a website.
 *
 * This checks, using PUBLIC, key-free APIs:
 *   - Wikidata: does an entity exist for the brand? Does it carry the core
 *     properties AI grounds on — official website (P856), industry (P452),
 *     inception (P571), a description, and external IDs (Crunchbase P2087,
 *     LinkedIn P4264)?
 *   - Wikipedia: is there an article (sitelink)?
 *   - Consistency: does the Wikidata official website match the brand's domain?
 *
 * No keys, no PII. Wikidata/Wikipedia REST APIs are public. Never throws.
 *
 * Output is an entityCompleteness 0–1 that REPLACES the on-site-only estimate
 * for the BRAND vector when an entity is found, plus findings + the resolved
 * entity id for evidence.
 */

const TIMEOUT_MS = 10_000;
const UA = "OzvorBot/1.0 (+https://ozvor.com/bot)";

export interface EntityGraphResult {
  /** true if the live Wikidata/Wikipedia APIs were reached. */
  live: boolean;
  /** true if a Wikidata entity was resolved for the brand. */
  found: boolean;
  /** Resolved Wikidata QID (e.g. "Q795153"), or null. */
  wikidataId: string | null;
  /** Whether an English Wikipedia article exists. */
  hasWikipedia: boolean;
  /** Which core grounding properties are present. */
  properties: {
    officialWebsite: boolean;
    industry: boolean;
    inception: boolean;
    description: boolean;
    crunchbase: boolean;
    linkedin: boolean;
  };
  /** Wikidata official website matches the brand's own domain (when both known). */
  domainConsistent: boolean | null;
  /** 0–1 entity completeness (feeds BRAND vector). */
  entityCompleteness: number;
  findings: string[];
}

/**
 * Pick the entityCompleteness that feeds the BRAND vector.
 *
 * Trust the entity graph's own measure whenever it produced a usable signal —
 * it either resolved a Wikidata entity (`found`) or ran live and honestly found
 * none (`live`, returning its 0.3 "present-but-unverified" floor). Only fall back
 * to the on-site crawl estimate when the graph could NOT run at all (Wikidata
 * unreachable: `!found && !live`), so an infra blip never punishes the brand.
 *
 * Keying on `found` alone (the earlier bug) let a brand with NO Wikidata entity
 * but a well-marked-up site keep the on-site estimate (often 1.0) — inflating the
 * Brand score and contradicting the audit's own "AI can't resolve you as an
 * entity" finding. The `|| live` branch also keeps deterministic mock results
 * (live:false, found:true) on their synthetic value.
 */
export function pickEntityCompleteness(
  entity: Pick<EntityGraphResult, "found" | "live" | "entityCompleteness">,
  onSiteEstimate: number
): number {
  return entity.found || entity.live ? entity.entityCompleteness : onSiteEstimate;
}

function emptyResult(live: boolean, findings: string[]): EntityGraphResult {
  return {
    live,
    found: false,
    wikidataId: null,
    hasWikipedia: false,
    properties: { officialWebsite: false, industry: false, inception: false, description: false, crunchbase: false, linkedin: false },
    domainConsistent: null,
    entityCompleteness: 0.3, // present-but-unverified floor (honest: not zero, not a full measure)
    findings,
  };
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function hostFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  try {
    const u = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return domain.replace(/^www\./, "").toLowerCase();
  }
}

/**
 * Resolve a brand to a Wikidata entity and measure how completely it is
 * described. `domain` (optional) enables the official-website consistency check.
 * mockMode forces a deterministic, key-free synthetic result for demos/tests.
 */
export async function analyzeEntityGraph(
  brandName: string,
  domain: string | null,
  opts?: { mockMode?: boolean }
): Promise<EntityGraphResult> {
  if (opts?.mockMode) return mockEntityGraph(brandName, domain);

  const findings: string[] = [];

  // 1. Search Wikidata for the entity.
  const search = (await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&format=json&limit=1&type=item`
  )) as { search?: Array<{ id?: string }> } | null;

  if (!search) {
    findings.push("Could not reach Wikidata — entity completeness uses a neutral estimate.");
    return emptyResult(false, findings);
  }

  const qid = search.search?.[0]?.id ?? null;
  if (!qid) {
    findings.push(`No Wikidata entity found for "${brandName}". AI engines may not resolve you to a known entity — a high-value gap. Create/claim a Wikidata item and an authoritative profile.`);
    return emptyResult(true, findings);
  }

  // 2. Fetch the entity's claims + sitelinks + descriptions.
  const ent = (await getJson(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
  )) as { entities?: Record<string, WikidataEntity> } | null;

  const entity = ent?.entities?.[qid];
  if (!entity) {
    findings.push(`Wikidata entity ${qid} found but could not be loaded.`);
    return { ...emptyResult(true, findings), found: true, wikidataId: qid, entityCompleteness: 0.4 };
  }

  const claims = entity.claims ?? {};
  const properties = {
    officialWebsite: !!claims["P856"],
    industry: !!claims["P452"],
    inception: !!claims["P571"],
    description: !!entity.descriptions?.["en"]?.value,
    crunchbase: !!claims["P2087"],
    linkedin: !!claims["P4264"],
  };

  const hasWikipedia = !!entity.sitelinks?.["enwiki"];

  // 3. Official-website consistency vs the brand's own domain.
  let domainConsistent: boolean | null = null;
  const brandHost = hostFromDomain(domain);
  if (brandHost && properties.officialWebsite) {
    const wdUrl = firstStringValue(claims["P856"]);
    const wdHost = hostFromDomain(wdUrl);
    domainConsistent = wdHost ? wdHost === brandHost : null;
  }

  // 4. Score. Entity exists = strong base; each grounding property adds; a
  // matching official website and a Wikipedia article are the strongest signals.
  let score = 0.45; // entity exists
  if (properties.description) score += 0.08;
  if (properties.officialWebsite) score += 0.1;
  if (properties.industry) score += 0.07;
  if (properties.inception) score += 0.05;
  if (properties.crunchbase) score += 0.05;
  if (properties.linkedin) score += 0.05;
  if (hasWikipedia) score += 0.12;
  if (domainConsistent === true) score += 0.03;
  if (domainConsistent === false) score -= 0.1; // mismatch is actively harmful
  const entityCompleteness = Math.max(0, Math.min(1, score));

  findings.push(`Resolved to Wikidata entity ${qid}${hasWikipedia ? " (with an English Wikipedia article)" : " (no Wikipedia article yet — a gap)"}.`);
  const missing = Object.entries(properties).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) findings.push(`Entity is missing: ${missing.join(", ")}. Completing these strengthens AI entity recognition.`);
  if (domainConsistent === false) findings.push("⚠ The official website on Wikidata does not match your domain — fix this inconsistency; it confuses entity resolution.");

  return { live: true, found: true, wikidataId: qid, hasWikipedia, properties, domainConsistent, entityCompleteness, findings };
}

// ---- Wikidata response typing (minimal) ----
interface WikidataEntity {
  claims?: Record<string, unknown[]>;
  descriptions?: Record<string, { value?: string }>;
  sitelinks?: Record<string, unknown>;
}

function firstStringValue(claim: unknown[] | undefined): string | null {
  if (!claim || !claim[0]) return null;
  const snak = (claim[0] as { mainsnak?: { datavalue?: { value?: unknown } } }).mainsnak;
  const v = snak?.datavalue?.value;
  return typeof v === "string" ? v : null;
}

// ---- Deterministic mock (no network) for demos/tests ----
function mockEntityGraph(brandName: string, domain: string | null): EntityGraphResult {
  let h = 0;
  const str = brandName.toLowerCase();
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const found = h % 4 !== 0; // ~75% resolve to an entity
  if (!found) {
    return emptyResult(false, [`No Wikidata entity found for "${brandName}" (demo data). Creating one is a high-value gap.`]);
  }
  const properties = {
    officialWebsite: h % 2 === 0,
    industry: h % 3 !== 0,
    inception: h % 5 !== 0,
    description: true,
    crunchbase: h % 3 === 0,
    linkedin: h % 2 === 1,
  };
  const hasWikipedia = h % 3 === 0;
  const domainConsistent = domain ? h % 4 !== 1 : null;
  let score = 0.45;
  if (properties.description) score += 0.08;
  if (properties.officialWebsite) score += 0.1;
  if (properties.industry) score += 0.07;
  if (properties.inception) score += 0.05;
  if (properties.crunchbase) score += 0.05;
  if (properties.linkedin) score += 0.05;
  if (hasWikipedia) score += 0.12;
  if (domainConsistent === false) score -= 0.1;
  return {
    live: false,
    found: true,
    wikidataId: `Q${(h % 9000000) + 1000}`,
    hasWikipedia,
    properties,
    domainConsistent,
    entityCompleteness: Math.max(0, Math.min(1, score)),
    findings: [`Resolved to a Wikidata entity (demo data)${hasWikipedia ? " with a Wikipedia article" : " — no Wikipedia article yet"}.`],
  };
}
