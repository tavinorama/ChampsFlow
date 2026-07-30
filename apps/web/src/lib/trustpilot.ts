/**
 * Trustpilot rating — server-side read, for the footer badge.
 *
 * Why the API and not the public page: scraping
 * https://www.trustpilot.com/review/ozvor.com returns 403 to any server (tested
 * from Node with a normal user-agent, and separately from a fetch tool). Their
 * bot protection blocks it, so the public page is not a usable source. The
 * Business API is.
 *
 * Setup, once, by the founder:
 *   Trustpilot Business → Integrations → API keys → create a key
 *   Railway (web service) → TRUSTPILOT_API_KEY=<key>
 *
 * Until that variable exists this returns null and the badge shows its invite
 * instead of a rating. That is the honest default: a product sold on numbers
 * being real must never print a rating it could not read.
 */

/** Public Business Unit id for ozvor.com, from the founder's TrustBox config. */
const BUSINESS_UNIT_ID = "6a69cb1bcb33973622bca0e9";

/**
 * Six hours. A star rating does not move fast enough to justify a request per
 * visitor, and Trustpilot rate-limits keys.
 */
const REVALIDATE_SECONDS = 6 * 60 * 60;

export interface TrustpilotRating {
  /** e.g. 4.8 */
  stars: number;
  /** Total published reviews. */
  reviews: number;
}

/**
 * Below either of these the badge shows its invite and no number.
 *
 * One 5-star review is not social proof — a lone review reads as a favour from
 * a friend, and some readers trust it less than no rating at all. Five is the
 * point where an average starts meaning something, and 4.0 keeps us from
 * advertising a score we would not want quoted back at us.
 */
export const MIN_STARS = 4.0;
export const MIN_REVIEWS = 5;

/** True when the rating is real AND strong enough to show. */
export function isWorthShowing(r: TrustpilotRating | null): r is TrustpilotRating {
  return r !== null && r.reviews >= MIN_REVIEWS && r.stars >= MIN_STARS;
}

/**
 * Reads the current rating. Returns null on ANY failure — missing key, network
 * error, rate limit, unexpected shape — and never throws, because a footer must
 * not be able to break a page.
 */
export async function getTrustpilotRating(): Promise<TrustpilotRating | null> {
  const apiKey = process.env["TRUSTPILOT_API_KEY"];
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.trustpilot.com/v1/business-units/${BUSINESS_UNIT_ID}?apikey=${encodeURIComponent(apiKey)}`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return null;

    const body: unknown = await res.json();
    const score = (body as { score?: { trustScore?: unknown } }).score?.trustScore;
    const total = (body as { numberOfReviews?: { total?: unknown } }).numberOfReviews?.total;

    // Validate rather than trust: a shape change upstream must degrade to the
    // invite, not print NaN stars in the footer.
    if (typeof score !== "number" || typeof total !== "number") return null;
    if (!Number.isFinite(score) || score < 0 || score > 5) return null;
    if (!Number.isFinite(total) || total < 0) return null;

    return { stars: score, reviews: Math.round(total) };
  } catch {
    return null;
  }
}
