/**
 * google-places.ts — Google Maps link → real business facts (issue #208 PR-9)
 *
 * Founder-provisioned (2026-07-10): GOOGLE_PLACES_API_KEY (Railway api+worker,
 * server-only, API-restricted to "Places API (New)"). Design confirmed in
 * issue #217 comment 8. Console-side caps: 20/min details+search, 60/min
 * photos (unused this PR), $25 budget alert.
 *
 * ToS hard rules (issue #208 §3):
 *  - NO scraping of Google — official REST APIs only.
 *  - place_id is the ONLY Places-derived field storable indefinitely; every
 *    other fact merged into a site's `business` JSONB must be treated as
 *    cacheable <=30 days (the caller stamps `google_synced_at` and is
 *    responsible for the refresh-or-drop policy on read past that window —
 *    this module does not persist anything itself, it's a pure lookup).
 *  - Reviews / ratings / photo references ARE fetched for the SITE GENERATOR
 *    (founder-approved 2026-07-11) via resolvePlaceById(id, { rich:true }):
 *      · reviews are shown verbatim WITH author attribution + "Google" and are
 *        fetched FRESH at generation time (never cached long-term);
 *      · photo BYTES are never stored — only the opaque photo resource `name`
 *        is kept and streamed through our own key-bearing proxy at serve time,
 *        with the required author attribution.
 *    The narrow resolvePlace() PREFILL path stays reviews/photos-free so a
 *    "Fill from Google Maps" click never triggers the Enterprise-SKU billing.
 *  - Never fabricate a location — an unresolvable link is a typed error, not
 *    a best-guess.
 *
 * Two independent concerns:
 *  1. expandMapsLink() — a user-supplied maps.app.goo.gl/goo.gl shortlink
 *     must be expanded before it contains anything parseable. This IS an
 *     SSRF-relevant fetch of user input (the URL is attacker-influenceable),
 *     so it follows packages/llm/src/ssrf-guard.ts's style: hostname
 *     allowlist checked BEFORE every request (including each redirect hop),
 *     redirects followed MANUALLY with a hop cap, response bodies never
 *     downloaded.
 *  2. resolvePlace() — the actual Google API calls (Place Details / Text
 *     Search) hit a FIXED, trusted host (places.googleapis.com) and carry no
 *     user-controlled URL, so they use plain fetch() directly — no SSRF
 *     surface there.
 *
 * NEVER log the API key. NEVER log resolved business data (name/address/
 * phone/website/hours) at any level — only success/failure + place_id
 * (operator noise otherwise, and place_id alone isn't PII).
 */

import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** True when the server-side Places key is present (fail-safe gate). */
export function googlePlacesConfigured(): boolean {
  return Boolean(process.env["GOOGLE_PLACES_API_KEY"]);
}

function requireApiKey(): string {
  const key = process.env["GOOGLE_PLACES_API_KEY"];
  if (!key) throw new PlacesError("not_configured", "Google Maps lookup is not available right now.");
  return key;
}

const PLACES_TIMEOUT_MS = 8000;
const PLACES_API_BASE = "https://places.googleapis.com/v1";

// ---------------------------------------------------------------------------
// Photo proxy — Places photo BYTES are never stored; the generator points
// <img src> at our own key-bearing proxy, which streams the media server-side.
// ---------------------------------------------------------------------------

/** Public proxy path for a Google photo resource `name`. The API key stays
 *  server-side; the browser only ever sees this path. */
export function landingPhotoProxyPath(photoName: string): string {
  return `/api/public/landing-photo?ref=${encodeURIComponent(photoName)}`;
}

/** A visitor-supplied `ref` must look EXACTLY like a Places photo resource name
 *  (`places/<id>/photos/<id>`) before we proxy it — defense against using the
 *  proxy to fetch arbitrary Places resources. */
export function isValidPhotoName(ref: string): boolean {
  return /^places\/[A-Za-z0-9_.-]+\/photos\/[A-Za-z0-9_.-]+$/.test(ref);
}

/** Fetch a Places photo's bytes for the proxy route (key via header, never in
 *  the URL/logs). Returns the image Response (follows Google's redirect to the
 *  CDN). Throws PlacesError on any failure. */
export async function fetchPlacePhoto(photoName: string, maxWidthPx = 1200): Promise<Response> {
  if (!isValidPhotoName(photoName)) {
    throw new PlacesError("invalid_url", "Invalid photo reference.");
  }
  const apiKey = requireApiKey();
  const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method: "GET", headers: { "X-Goog-Api-Key": apiKey } });
  } catch (err) {
    logger.warn("google_places_photo_network_error", { message: (err as Error).message?.slice(0, 160) });
    throw new PlacesError("upstream", "Photo temporarily unavailable.");
  }
  if (!res.ok) {
    logger.warn("google_places_photo_failed", { status: res.status });
    throw new PlacesError(res.status === 404 ? "not_found" : "upstream", "Photo unavailable.");
  }
  return res;
}

// NARROW mask — the cheap Pro-SKU shape used by the "Fill from Google Maps"
// prefill + link resolution. No reviews/ratings/photos (keeps that click cheap).
export const PLACE_DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions,location";

export const TEXT_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.regularOpeningHours.weekdayDescriptions,places.location";

// RICH mask — the Enterprise-SKU shape used ONLY by the site generator
// (resolvePlaceById(id, { rich:true })), once per generation / weekly refresh.
// Adds: category (primaryTypeDisplayName), editorial summary, rating +
// userRatingCount, priceLevel, verbatim reviews (with author attribution), and
// photo resource names (with attribution). These power the GEO/SEO schema
// (LocalBusiness + AggregateRating + Review) and the rich page sections.
export const PLACE_DETAILS_RICH_FIELD_MASK =
  PLACE_DETAILS_FIELD_MASK +
  ",primaryTypeDisplayName,editorialSummary,rating,userRatingCount,priceLevel,reviews,photos";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type PlacesErrorCode = "not_configured" | "not_found" | "upstream" | "invalid_url";

export class PlacesError extends Error {
  readonly code: PlacesErrorCode;
  constructor(code: PlacesErrorCode, message: string) {
    super(message);
    this.name = "PlacesError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// expandMapsLink — hostname-allowlisted shortlink expansion
// ---------------------------------------------------------------------------

/**
 * Hostnames a pasted Maps link/redirect hop is allowed to be. EXACT match
 * only (never suffix/endsWith — "google.com.evil.com" must not pass).
 * goo.gl / google.com / www.google.com are further restricted to /maps
 * paths below since those bare hostnames serve plenty of non-Maps content;
 * maps.app.goo.gl and maps.google.com are maps-only hostnames.
 */
const ALLOWED_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
]);

/** Hosts that are shortlinks needing a redirect fetch to resolve further. */
const SHORTLINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

const PATH_RESTRICTED_HOSTS = new Set(["goo.gl", "google.com", "www.google.com"]);

const MAX_EXPAND_HOPS = 5;

/**
 * Whether a URL is safe to fetch/treat as a Maps reference. Pure/exported
 * for unit testing (the hostile-hostname matrix).
 */
export function isAllowedMapsUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_MAPS_HOSTS.has(host)) return false;
  if (PATH_RESTRICTED_HOSTS.has(host)) {
    return url.pathname.startsWith("/maps");
  }
  return true;
}

/**
 * Expands a user-supplied Google Maps link to its final destination URL.
 * Already-final URLs (google.com/maps/..., maps.google.com/..., a direct
 * www.google.com/maps/... link) are validated and returned unchanged — no
 * network call needed. Shortlinks (maps.app.goo.gl, goo.gl/maps) are
 * followed manually, re-validating the hostname allowlist on EVERY hop
 * (mirrors ssrf-guard.ts's guardedFetch style), up to MAX_EXPAND_HOPS.
 * Response bodies are never downloaded — only redirect headers are read.
 */
export async function expandMapsLink(rawUrl: string): Promise<string> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new PlacesError("invalid_url", "That doesn't look like a valid link.");
  }
  if (!isAllowedMapsUrl(current)) {
    throw new PlacesError(
      "invalid_url",
      "Paste a Google Maps link (maps.app.goo.gl or google.com/maps)."
    );
  }
  if (!SHORTLINK_HOSTS.has(current.hostname.toLowerCase())) {
    return current.toString();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_EXPAND_HOPS; hop++) {
      if (!isAllowedMapsUrl(current)) {
        throw new PlacesError("invalid_url", "That link redirected somewhere unexpected.");
      }
      if (!SHORTLINK_HOSTS.has(current.hostname.toLowerCase())) {
        return current.toString(); // reached a final, non-shortlink Maps URL
      }

      let res: Response;
      try {
        res = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        throw new PlacesError("upstream", "Could not reach that link.");
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!loc) throw new PlacesError("upstream", "That link didn't resolve to a page.");
        current = new URL(loc, current); // relative redirects resolved against current
        continue;
      }

      await res.body?.cancel().catch(() => {});
      if (res.ok) return current.toString(); // shortlink answered directly (no redirect) — treat as final
      throw new PlacesError("upstream", `That link returned an unexpected response (${res.status}).`);
    }
    throw new PlacesError("upstream", "That link redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// extractPlaceReference — pure URL parsing, never throws
// ---------------------------------------------------------------------------

export interface ExtractedPlaceRef {
  /** A modern Places API place_id, if the URL carried one explicitly
   *  (e.g. `?query_place_id=ChIJ...` or a literal `place_id:ChIJ...` token).
   *  This is the ONLY reference kind usable with Place Details below — the
   *  New Places API's `places/{id}` resource path requires this format. */
  placeId: string | null;
  /** A legacy CID/FID reference (the hex `!1s0x...:0x...` feature id found
   *  in `data=` params, or a numeric `?cid=` query param). Captured for
   *  completeness/testability but NOT used to call Place Details directly —
   *  Places API (New) does not accept this legacy identifier format as a
   *  resource id. When present alongside name+coords, resolution falls back
   *  to Text Search (below), which is the reliable general path anyway. */
  cid: string | null;
  /** The place name parsed from a `/maps/place/<name>/...` path segment. */
  name: string | null;
  lat: number | null;
  lng: number | null;
}

const PLACE_ID_RE = /place_id[:=]([A-Za-z0-9_-]{10,})/;
const CID_HEX_RE = /!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/;
const CID_QUERY_RE = /[?&]cid=(\d+)/;
// Exact pin coords embedded in the `data=` param (!3d<lat>!4d<lng>) — more
// precise than the viewport-center coords in the URL path.
const EXACT_COORD_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const PATH_NAME_COORD_RE = /\/maps\/place\/([^/@?]+)(?:\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))?/;
const VIEWPORT_COORD_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

function validCoord(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function decodePlaceName(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
    return decoded || null;
  } catch {
    const fallback = raw.replace(/\+/g, " ").trim();
    return fallback || null;
  }
}

/**
 * Parses a (post-expansion) Google Maps URL for whatever place reference it
 * carries. Never throws — malformed input simply yields all-null fields so
 * the caller can fall through to its own "couldn't identify a place" error.
 */
export function extractPlaceReference(url: string): ExtractedPlaceRef {
  const ref: ExtractedPlaceRef = { placeId: null, cid: null, name: null, lat: null, lng: null };
  if (typeof url !== "string" || !url) return ref;

  const placeIdMatch = url.match(PLACE_ID_RE);
  if (placeIdMatch?.[1]) ref.placeId = placeIdMatch[1];

  const cidHexMatch = url.match(CID_HEX_RE);
  if (cidHexMatch?.[1]) {
    ref.cid = cidHexMatch[1];
  } else {
    const cidQueryMatch = url.match(CID_QUERY_RE);
    if (cidQueryMatch?.[1]) ref.cid = cidQueryMatch[1];
  }

  const nameMatch = url.match(PATH_NAME_COORD_RE);
  if (nameMatch?.[1]) ref.name = decodePlaceName(nameMatch[1]);

  const exactCoord = url.match(EXACT_COORD_RE);
  if (exactCoord?.[1] && exactCoord[2]) {
    const lat = Number(exactCoord[1]);
    const lng = Number(exactCoord[2]);
    if (validCoord(lat, lng)) {
      ref.lat = lat;
      ref.lng = lng;
    }
  } else if (nameMatch?.[2] && nameMatch[3]) {
    const lat = Number(nameMatch[2]);
    const lng = Number(nameMatch[3]);
    if (validCoord(lat, lng)) {
      ref.lat = lat;
      ref.lng = lng;
    }
  } else {
    const viewport = url.match(VIEWPORT_COORD_RE);
    if (viewport?.[1] && viewport[2]) {
      const lat = Number(viewport[1]);
      const lng = Number(viewport[2]);
      if (validCoord(lat, lng)) {
        ref.lat = lat;
        ref.lng = lng;
      }
    }
  }

  return ref;
}

// ---------------------------------------------------------------------------
// Google API calls — fixed trusted host, no SSRF surface (no guardedFetch).
// ---------------------------------------------------------------------------

/** A single Google review, kept verbatim. `author` MUST be shown with the
 *  quote (Places ToS attribution). Only present on the rich fetch. */
export interface PlaceReview {
  author: string;
  authorPhoto: string | null;
  rating: number | null;
  text: string;
  relativeTime: string | null;
  publishTime: string | null;
}

/** A Google photo REFERENCE — the opaque resource `name` is streamed through
 *  our proxy at serve time (bytes never stored). `attribution` MUST be shown. */
export interface PlacePhoto {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  attribution: string | null;
}

export interface ResolvedPlace {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string[];
  lat: number | null;
  lng: number | null;
  // Rich fields — populated only by resolvePlaceById(id, { rich:true }); the
  // narrow prefill/link path leaves them null / empty.
  category: string | null;
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  reviews: PlaceReview[];
  photos: PlacePhoto[];
}

interface GoogleReviewShape {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishTimeDescription?: string;
  publishTime?: string;
  authorAttribution?: { displayName?: string; photoUri?: string };
}

interface GooglePhotoShape {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string }[];
}

interface GooglePlaceApiShape {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  editorialSummary?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  reviews?: GoogleReviewShape[];
  photos?: GooglePhotoShape[];
}

function mapReview(r: GoogleReviewShape): PlaceReview | null {
  const author = r.authorAttribution?.displayName?.trim();
  const text = (r.text?.text ?? r.originalText?.text ?? "").trim();
  // A review with no author cannot be shown (attribution is mandatory), and an
  // empty-text review is useless — drop both rather than render a bare star.
  if (!author || !text) return null;
  return {
    author,
    authorPhoto: r.authorAttribution?.photoUri ?? null,
    rating: typeof r.rating === "number" ? r.rating : null,
    text,
    relativeTime: r.relativePublishTimeDescription ?? null,
    publishTime: r.publishTime ?? null,
  };
}

function mapPhoto(p: GooglePhotoShape): PlacePhoto | null {
  if (typeof p.name !== "string" || !p.name) return null;
  return {
    name: p.name,
    widthPx: typeof p.widthPx === "number" ? p.widthPx : null,
    heightPx: typeof p.heightPx === "number" ? p.heightPx : null,
    attribution: p.authorAttributions?.[0]?.displayName ?? null,
  };
}

function mapPlaceToResolved(place: GooglePlaceApiShape): ResolvedPlace | null {
  const placeId = typeof place.id === "string" ? place.id : "";
  if (!placeId) return null;
  return {
    place_id: placeId,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    hours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours.weekdayDescriptions
      : [],
    lat: typeof place.location?.latitude === "number" ? place.location.latitude : null,
    lng: typeof place.location?.longitude === "number" ? place.location.longitude : null,
    category: place.primaryTypeDisplayName?.text ?? null,
    description: place.editorialSummary?.text ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    priceLevel: typeof place.priceLevel === "string" ? place.priceLevel : null,
    reviews: Array.isArray(place.reviews)
      ? place.reviews.map(mapReview).filter((r): r is PlaceReview => r !== null)
      : [],
    photos: Array.isArray(place.photos)
      ? place.photos.map(mapPhoto).filter((p): p is PlacePhoto => p !== null)
      : [],
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlaceDetails(
  placeId: string,
  fieldMask: string = PLACE_DETAILS_FIELD_MASK
): Promise<ResolvedPlace> {
  const apiKey = requireApiKey();
  const url = `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
    });
  } catch (err) {
    logger.warn("google_places_details_network_error", {
      message: (err as Error).message?.slice(0, 160),
    });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }

  if (res.status === 404) {
    throw new PlacesError("not_found", "That place couldn't be found on Google Maps.");
  }
  if (!res.ok) {
    logger.warn("google_places_details_failed", { status: res.status });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }

  const data = (await res.json()) as GooglePlaceApiShape;
  const resolved = mapPlaceToResolved(data);
  if (!resolved) throw new PlacesError("not_found", "That place couldn't be found on Google Maps.");
  return resolved;
}

async function searchTextBiased(name: string, lat: number, lng: number): Promise<ResolvedPlace> {
  const apiKey = requireApiKey();
  const url = `${PLACES_API_BASE}/places:searchText`;
  const body = {
    textQuery: name,
    locationBias: {
      circle: { center: { latitude: lat, longitude: lng }, radius: 200.0 },
    },
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn("google_places_text_search_network_error", {
      message: (err as Error).message?.slice(0, 160),
    });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }

  if (!res.ok) {
    logger.warn("google_places_text_search_failed", { status: res.status });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }

  const data = (await res.json()) as { places?: GooglePlaceApiShape[] };
  const top = Array.isArray(data.places) ? data.places[0] : undefined;
  if (!top) throw new PlacesError("not_found", "Couldn't find that business on Google Maps.");
  const resolved = mapPlaceToResolved(top);
  if (!resolved) throw new PlacesError("not_found", "Couldn't find that business on Google Maps.");
  return resolved;
}

// ---------------------------------------------------------------------------
// resolvePlace — the single entry point the API route calls.
// ---------------------------------------------------------------------------

/**
 * Fetches full business facts for a KNOWN place_id. With { rich:true } it uses
 * the Enterprise-SKU mask (reviews, photos, rating, category, price) — this is
 * the generator's entry point, called once per generation / weekly refresh, so
 * reviews stay fresh (ToS). Without it, returns the same narrow shape as the
 * prefill path. Typed PlacesError on failure; only place_id is logged.
 */
export async function resolvePlaceById(
  placeId: string,
  opts: { rich?: boolean } = {}
): Promise<ResolvedPlace> {
  if (!googlePlacesConfigured()) {
    throw new PlacesError("not_configured", "Google Maps lookup is not available right now.");
  }
  const id = (placeId ?? "").trim();
  if (!id) throw new PlacesError("invalid_url", "Missing place_id.");
  try {
    const resolved = await fetchPlaceDetails(
      id,
      opts.rich ? PLACE_DETAILS_RICH_FIELD_MASK : PLACE_DETAILS_FIELD_MASK
    );
    logger.info("google_places_details_by_id", {
      place_id: resolved.place_id,
      rich: Boolean(opts.rich),
      review_count: resolved.reviews.length,
      photo_count: resolved.photos.length,
    });
    return resolved;
  } catch (err) {
    if (err instanceof PlacesError) throw err;
    logger.warn("google_places_details_by_id_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }
}

/**
 * Resolves a pasted Google Maps link (or shortlink) to real business facts.
 * Never fabricates — an unresolvable link is a typed PlacesError, never a
 * best-guess. NEVER logs the resolved business data, only place_id.
 */
export async function resolvePlace(linkOrText: string): Promise<ResolvedPlace> {
  if (!googlePlacesConfigured()) {
    throw new PlacesError("not_configured", "Google Maps lookup is not available right now.");
  }

  const trimmed = (linkOrText ?? "").trim();
  if (!trimmed) throw new PlacesError("invalid_url", "Paste a Google Maps link.");

  const finalUrl = await expandMapsLink(trimmed);
  const ref = extractPlaceReference(finalUrl);

  try {
    let resolved: ResolvedPlace;
    if (ref.placeId) {
      resolved = await fetchPlaceDetails(ref.placeId);
    } else if (ref.name && ref.lat != null && ref.lng != null) {
      resolved = await searchTextBiased(ref.name, ref.lat, ref.lng);
    } else {
      throw new PlacesError("not_found", "Couldn't identify a business from that link.");
    }
    logger.info("google_places_resolved", { place_id: resolved.place_id });
    return resolved;
  } catch (err) {
    if (err instanceof PlacesError) {
      logger.warn("google_places_resolve_failed", { code: err.code });
      throw err;
    }
    logger.warn("google_places_resolve_failed", {
      code: "upstream",
      message: (err as Error).message?.slice(0, 160),
    });
    throw new PlacesError("upstream", "Google Maps is temporarily unavailable. Please try again.");
  }
}
