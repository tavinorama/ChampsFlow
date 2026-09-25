/**
 * serp-market.ts — C09 / P08 (Codex 19/09, confirmed 21/09 and 23/09).
 *
 * The Google AI Overview probe (DataForSEO SERP) used to send `language_code:
 * "en"` for every brand and pick the location from the TENANT's region only
 * (EU → United Kingdom, US → United States). A Brazilian clinic audited by a
 * Lisbon tenant was asked in English, in London, and the report labelled the
 * answer "Google AI Overviews" as if Google had been asked where the clinic's
 * customers are. This module makes the market an explicit, recorded input:
 * one function, one table, one basis string that travels with the audit.
 *
 * Nothing here guesses. Without a brand market the request is what it was
 * (region default) and the record says "region_default" out loud.
 */

export type ProbeRegion = "EU" | "US";

export interface SerpMarket {
  /** ISO 3166-1 alpha-2 of the searched country. */
  country: string;
  /** DataForSEO/Google language_code (ISO 639-1). */
  language_code: string;
  /** DataForSEO location_code for the country. */
  location_code: number;
  /** Where the choice came from — recorded in provider_breakdown.serp_market. */
  basis: "brand_market" | "brand_locale" | "region_default" | "unknown_market_region_default";
  /** Human line for reports: "United States · en". */
  label: string;
}

/** Google/DataForSEO country location codes + the default language per country. */
const MARKETS: Record<string, { location_code: number; language: string; name: string }> = {
  US: { location_code: 2840, language: "en", name: "United States" },
  GB: { location_code: 2826, language: "en", name: "United Kingdom" },
  IE: { location_code: 2372, language: "en", name: "Ireland" },
  CA: { location_code: 2124, language: "en", name: "Canada" },
  AU: { location_code: 2036, language: "en", name: "Australia" },
  BR: { location_code: 2076, language: "pt", name: "Brazil" },
  PT: { location_code: 2620, language: "pt", name: "Portugal" },
  ES: { location_code: 2724, language: "es", name: "Spain" },
  MX: { location_code: 2484, language: "es", name: "Mexico" },
  DE: { location_code: 2276, language: "de", name: "Germany" },
  AT: { location_code: 2040, language: "de", name: "Austria" },
  FR: { location_code: 2250, language: "fr", name: "France" },
  IT: { location_code: 2380, language: "it", name: "Italy" },
  NL: { location_code: 2528, language: "nl", name: "Netherlands" },
};

const ALIASES: Record<string, string> = { UK: "GB", USA: "US", EUA: "US", BRASIL: "BR", BRAZIL: "BR", PORTUGAL: "PT" };

const REGION_DEFAULT: Record<ProbeRegion, string> = { EU: "GB", US: "US" };

function countryOf(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const c = ALIASES[s] ?? s;
  return c in MARKETS ? c : null;
}

/** "pt-BR" → { language: "pt", country: "BR" }; "pt" → language only. */
function parseLocale(raw: string | null | undefined): { language: string | null; country: string | null } {
  const s = (raw ?? "").trim();
  if (!s) return { language: null, country: null };
  const m = /^([a-zA-Z]{2})(?:[-_]([a-zA-Z]{2}))?$/.exec(s);
  if (!m) return { language: null, country: null };
  return { language: m[1]!.toLowerCase(), country: countryOf(m[2]) };
}

function build(country: string, language: string | null, basis: SerpMarket["basis"]): SerpMarket {
  const row = MARKETS[country]!;
  const lang = language ?? row.language;
  return { country, language_code: lang, location_code: row.location_code, basis, label: `${row.name} · ${lang}` };
}

/**
 * Decide the market of a SERP request. Priority: brand market (country) →
 * brand locale (pt-BR) → region default. A market we do not know keeps the
 * region default and says so in `basis`.
 */
export function serpMarketFor(input: { region: ProbeRegion; market?: string | null; locale?: string | null }): SerpMarket {
  const loc = parseLocale(input.locale);
  const fromMarket = countryOf(input.market);
  if (fromMarket) return build(fromMarket, loc.language, "brand_market");
  if (loc.country) return build(loc.country, loc.language, "brand_locale");
  const fallback = REGION_DEFAULT[input.region] ?? "US";
  const unknown = Boolean((input.market ?? "").trim() || (input.locale ?? "").trim());
  return build(fallback, null, unknown ? "unknown_market_region_default" : "region_default");
}

/** One line for reports and breakdowns. Never claims a market that was not sent. */
export function describeSerpMarket(m: SerpMarket): string {
  const why =
    m.basis === "brand_market" ? "brand market" :
    m.basis === "brand_locale" ? "brand locale" :
    m.basis === "region_default" ? "no brand market set; tenant region default" :
    "brand market not recognised; tenant region default";
  return `Google AI Overviews probed in ${m.label} (${why})`;
}
