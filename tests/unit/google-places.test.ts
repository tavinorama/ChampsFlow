/**
 * Unit tests — apps/api/src/lib/google-places.ts (issue #208 PR-9)
 *
 * Covers:
 *  1. isAllowedMapsUrl — hostname allowlist matrix (hostile hosts rejected,
 *     exact match only — no suffix matching).
 *  2. extractPlaceReference — link parsing matrix (name+coords path, exact
 *     !3d/!4d coords, explicit place_id, legacy CID/FID hex, malformed input).
 *  3. expandMapsLink — shortlink redirect-following (mocked fetch), already-
 *     final URLs skip the network call, hostile redirect targets rejected.
 *  4. Field masks contain NO reviews/photos fields.
 *  5. resolvePlace() returns a typed not_configured error without the env key.
 *  6. resolvePlace() happy paths (Place Details by place_id, Text Search
 *     fallback by name+coords) with mocked fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isAllowedMapsUrl,
  extractPlaceReference,
  expandMapsLink,
  googlePlacesConfigured,
  resolvePlace,
  resolvePlaceById,
  PlacesError,
  PLACE_DETAILS_FIELD_MASK,
  PLACE_DETAILS_RICH_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
} from "../../apps/api/src/lib/google-places";

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function setPlacesEnv(): void {
  process.env["GOOGLE_PLACES_API_KEY"] = "test-places-key";
}

function clearPlacesEnv(): void {
  delete process.env["GOOGLE_PLACES_API_KEY"];
}

function fakeResponse(init: {
  status: number;
  location?: string;
  json?: unknown;
}) {
  return {
    status: init.status,
    ok: init.status >= 200 && init.status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === "location" ? init.location ?? null : null) },
    body: { cancel: async () => {} },
    json: async () => init.json ?? {},
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearPlacesEnv();
});

// ---------------------------------------------------------------------------
// googlePlacesConfigured
// ---------------------------------------------------------------------------

describe("googlePlacesConfigured()", () => {
  beforeEach(() => clearPlacesEnv());

  it("is false without the env key", () => {
    expect(googlePlacesConfigured()).toBe(false);
  });

  it("is true when the env key is set", () => {
    setPlacesEnv();
    expect(googlePlacesConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAllowedMapsUrl — hostname allowlist
// ---------------------------------------------------------------------------

describe("isAllowedMapsUrl() — hostname allowlist", () => {
  it("accepts maps.app.goo.gl (any path — maps-only hostname)", () => {
    expect(isAllowedMapsUrl(new URL("https://maps.app.goo.gl/abc123"))).toBe(true);
  });

  it("accepts maps.google.com (any path — maps-only hostname)", () => {
    expect(isAllowedMapsUrl(new URL("https://maps.google.com/?q=acme"))).toBe(true);
  });

  it("accepts goo.gl/maps/... but rejects goo.gl on a non-maps path", () => {
    expect(isAllowedMapsUrl(new URL("https://goo.gl/maps/abc123"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://goo.gl/other-shortlink"))).toBe(false);
  });

  it("accepts google.com/maps/... but rejects google.com on a non-maps path", () => {
    expect(isAllowedMapsUrl(new URL("https://google.com/maps/place/Acme/@1,1,1z"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://google.com/search?q=acme"))).toBe(false);
  });

  it("accepts www.google.com/maps/... but rejects www.google.com on a non-maps path", () => {
    expect(isAllowedMapsUrl(new URL("https://www.google.com/maps/place/Acme/@1,1,1z"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://www.google.com/search?q=acme"))).toBe(false);
  });

  it("rejects a completely unrelated host", () => {
    expect(isAllowedMapsUrl(new URL("https://evil.com/maps/place/Acme"))).toBe(false);
  });

  it("rejects a lookalike subdomain host (exact match only, never suffix)", () => {
    expect(isAllowedMapsUrl(new URL("https://google.com.evil.com/maps/place/Acme"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("https://evilmaps.google.com.attacker.io/"))).toBe(false);
  });

  it("rejects a lookalike prefixed host", () => {
    expect(isAllowedMapsUrl(new URL("https://notmaps.google.com/maps/place/Acme"))).toBe(false);
  });

  it("rejects non-http(s) protocols", () => {
    // URL parsing of javascript: URIs doesn't populate hostname the way http(s)
    // does, so the protocol check must reject them outright.
    const url = new URL("javascript:alert(1)");
    expect(isAllowedMapsUrl(url)).toBe(false);
  });

  it("rejects ftp on an otherwise-allowed host", () => {
    expect(isAllowedMapsUrl(new URL("ftp://maps.google.com/"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractPlaceReference — pure parsing, never throws
// ---------------------------------------------------------------------------

describe("extractPlaceReference() — link parsing matrix", () => {
  it("parses name + viewport coords from a /maps/place/<name>/@lat,lng path", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps/place/Joe's+Plumbing/@40.7128,-74.006,17z"
    );
    expect(ref.name).toBe("Joe's Plumbing");
    expect(ref.lat).toBeCloseTo(40.7128);
    expect(ref.lng).toBeCloseTo(-74.006);
    expect(ref.placeId).toBeNull();
  });

  it("decodes a percent-encoded place name", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps/place/Acme%20Plumbing%20%26%20Heating/@40.7,-74.0,17z"
    );
    expect(ref.name).toBe("Acme Plumbing & Heating");
  });

  it("prefers exact !3d/!4d pin coords over the viewport @lat,lng when both present", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps/place/Joe's+Plumbing/@40.0,-74.0,17z/data=!4m6!3m5!1s0x89c25a316e8e7f4b:0x123456789abcdef0!8m2!3d40.7128!4d-74.006"
    );
    expect(ref.lat).toBeCloseTo(40.7128);
    expect(ref.lng).toBeCloseTo(-74.006);
  });

  it("extracts the legacy CID/FID hex pattern from the data= param", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps/place/Joe's+Plumbing/@40.0,-74.0,17z/data=!4m6!3m5!1s0x89c25a316e8e7f4b:0x123456789abcdef0!8m2!3d40.7128!4d-74.006"
    );
    expect(ref.cid).toBe("0x89c25a316e8e7f4b:0x123456789abcdef0");
    // A CID/FID alone (no explicit place_id:) is NOT a concrete Places API
    // (New) resource id — resolvePlace() must fall back to Text Search.
    expect(ref.placeId).toBeNull();
  });

  it("extracts a legacy numeric ?cid= query param", () => {
    const ref = extractPlaceReference("https://www.google.com/maps?cid=12345678901234567890");
    expect(ref.cid).toBe("12345678901234567890");
  });

  it("extracts an explicit place_id: token", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4"
    );
    expect(ref.placeId).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  it("extracts a query_place_id= param via the place_id[:=] pattern", () => {
    const ref = extractPlaceReference(
      "https://www.google.com/maps?query_place_id=ChIJrTLr-GyuEmsRBfy61i59si0"
    );
    expect(ref.placeId).toBe("ChIJrTLr-GyuEmsRBfy61i59si0");
  });

  it("returns all-null fields for a URL with no recognizable place reference", () => {
    const ref = extractPlaceReference("https://www.google.com/maps");
    expect(ref).toEqual({ placeId: null, cid: null, name: null, lat: null, lng: null });
  });

  it("never throws on garbage input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => extractPlaceReference(undefined as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => extractPlaceReference(null as any)).not.toThrow();
    expect(() => extractPlaceReference("")).not.toThrow();
    expect(() => extractPlaceReference("not a url at all !!!")).not.toThrow();
  });

  it("discards out-of-range coordinates rather than propagating garbage", () => {
    const ref = extractPlaceReference("https://www.google.com/maps/place/Acme/@999,999,17z");
    expect(ref.lat).toBeNull();
    expect(ref.lng).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// expandMapsLink — shortlink redirect-following
// ---------------------------------------------------------------------------

describe("expandMapsLink()", () => {
  it("returns an already-final google.com/maps URL unchanged, without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await expandMapsLink("https://www.google.com/maps/place/Acme/@1,1,17z");
    expect(result).toBe("https://www.google.com/maps/place/Acme/@1,1,17z");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("follows a maps.app.goo.gl redirect to its final google.com/maps destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse({
          status: 302,
          location: "https://www.google.com/maps/place/Acme/@1,1,17z",
        })
      )
    );
    const result = await expandMapsLink("https://maps.app.goo.gl/abc123");
    expect(result).toBe("https://www.google.com/maps/place/Acme/@1,1,17z");
  });

  it("follows multiple redirect hops", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return fakeResponse({ status: 301, location: "https://goo.gl/maps/xyz" });
        }
        return fakeResponse({ status: 302, location: "https://www.google.com/maps/place/Acme/@1,1,17z" });
      })
    );
    const result = await expandMapsLink("https://maps.app.goo.gl/abc123");
    expect(result).toBe("https://www.google.com/maps/place/Acme/@1,1,17z");
    expect(calls).toBe(2);
  });

  it("rejects a shortlink redirecting to a hostile host (never fetched)", async () => {
    const fetchSpy = vi.fn(async () => fakeResponse({ status: 302, location: "https://evil.com/steal" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(expandMapsLink("https://maps.app.goo.gl/abc123")).rejects.toThrow(PlacesError);
    // Only the FIRST hop (the shortlink itself) is fetched — the malicious
    // redirect target fails the allowlist BEFORE a second fetch would occur.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-Maps URL outright", async () => {
    await expect(expandMapsLink("https://evil.com/not-maps")).rejects.toThrow(PlacesError);
  });

  it("rejects an unparseable URL", async () => {
    await expect(expandMapsLink("not a url")).rejects.toThrow(PlacesError);
  });

  it("stops after too many redirect hops", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ status: 302, location: "https://maps.app.goo.gl/loop" }))
    );
    await expect(expandMapsLink("https://maps.app.goo.gl/loop")).rejects.toThrow(PlacesError);
  });
});

// ---------------------------------------------------------------------------
// Field masks — no reviews, no ratings, no photos this PR
// ---------------------------------------------------------------------------

describe("Field masks — narrow prefill stays cheap; rich generator mask adds reviews/photos", () => {
  it("PLACE_DETAILS_FIELD_MASK (prefill) contains no review/rating/photo fields", () => {
    const lower = PLACE_DETAILS_FIELD_MASK.toLowerCase();
    expect(lower).not.toContain("review");
    expect(lower).not.toContain("rating");
    expect(lower).not.toContain("photo");
  });

  it("TEXT_SEARCH_FIELD_MASK contains no review/rating/photo fields", () => {
    const lower = TEXT_SEARCH_FIELD_MASK.toLowerCase();
    expect(lower).not.toContain("review");
    expect(lower).not.toContain("rating");
    expect(lower).not.toContain("photo");
  });

  it("PLACE_DETAILS_FIELD_MASK carries the fields the wizard needs", () => {
    for (const field of ["id", "displayName", "formattedAddress", "websiteUri", "location"]) {
      expect(PLACE_DETAILS_FIELD_MASK).toContain(field);
    }
  });

  it("PLACE_DETAILS_RICH_FIELD_MASK adds reviews, ratings, photos + category/price for the generator", () => {
    const lower = PLACE_DETAILS_RICH_FIELD_MASK.toLowerCase();
    for (const field of ["reviews", "photos", "rating", "userratingcount", "pricelevel", "primarytypedisplayname", "editorialsummary"]) {
      expect(lower).toContain(field);
    }
    // Still a superset of the narrow prefill fields.
    expect(PLACE_DETAILS_RICH_FIELD_MASK).toContain("formattedAddress");
  });
});

// ---------------------------------------------------------------------------
// resolvePlace() — not_configured fail-safe
// ---------------------------------------------------------------------------

describe("resolvePlace() — fail-safe without the env key", () => {
  beforeEach(() => clearPlacesEnv());

  it("throws a typed not_configured error and never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolvePlace("https://www.google.com/maps/place/Acme/@1,1,17z")).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty string as invalid_url, not a network call", async () => {
    setPlacesEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolvePlace("   ")).rejects.toMatchObject({ code: "invalid_url" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolvePlace() — happy paths (mocked Google API responses)
// ---------------------------------------------------------------------------

describe("resolvePlace() — Place Details by explicit place_id", () => {
  beforeEach(() => setPlacesEnv());

  it("maps a Place Details response to the wizard shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4");
        return fakeResponse({
          status: 200,
          json: {
            id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
            displayName: { text: "Acme Plumbing" },
            formattedAddress: "123 Main St, Austin, TX",
            nationalPhoneNumber: "(512) 555-0100",
            websiteUri: "https://acmeplumbing.com",
            regularOpeningHours: { weekdayDescriptions: ["Monday: 8am–5pm"] },
            location: { latitude: 30.27, longitude: -97.74 },
          },
        });
      })
    );

    const resolved = await resolvePlace(
      "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4"
    );
    expect(resolved).toEqual({
      place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      name: "Acme Plumbing",
      address: "123 Main St, Austin, TX",
      phone: "(512) 555-0100",
      website: "https://acmeplumbing.com",
      hours: ["Monday: 8am–5pm"],
      lat: 30.27,
      lng: -97.74,
      // Rich fields are absent on the narrow prefill mask → null / empty.
      category: null,
      description: null,
      rating: null,
      reviewCount: null,
      priceLevel: null,
      reviews: [],
      photos: [],
    });
  });

  it("maps a 404 Place Details response to a typed not_found error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 404, json: {} })));
    await expect(
      resolvePlace("https://www.google.com/maps/place/?q=place_id:ChIJdoesnotexist00000000000")
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("maps an upstream 500 to a typed upstream error, never leaking response text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 500, json: { error: "boom" } })));
    await expect(
      resolvePlace("https://www.google.com/maps/place/?q=place_id:ChIJsomeplace000000000000")
    ).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("resolvePlace() — Text Search fallback (name + coords, no explicit place_id)", () => {
  beforeEach(() => setPlacesEnv());

  it("uses Text Search biased by coords when only a name+coords link is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("places.googleapis.com/v1/places:searchText");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(init?.body as string);
        expect(body.textQuery).toBe("Joe's Plumbing");
        expect(body.locationBias.circle.center.latitude).toBeCloseTo(40.7128);
        return fakeResponse({
          status: 200,
          json: {
            places: [
              {
                id: "ChIJTextSearchResult00000000",
                displayName: { text: "Joe's Plumbing" },
                formattedAddress: "456 Elm St, NY",
                location: { latitude: 40.7128, longitude: -74.006 },
              },
            ],
          },
        });
      })
    );

    const resolved = await resolvePlace(
      "https://www.google.com/maps/place/Joe's+Plumbing/@40.7128,-74.006,17z"
    );
    expect(resolved.place_id).toBe("ChIJTextSearchResult00000000");
    expect(resolved.name).toBe("Joe's Plumbing");
  });

  it("throws a typed not_found error when Text Search returns no results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 200, json: { places: [] } })));
    await expect(
      resolvePlace("https://www.google.com/maps/place/Nobody+Here/@1,1,17z")
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found when the link carries neither a place_id nor name+coords", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolvePlace("https://www.google.com/maps")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceById({ rich:true }) — the generator's enrichment fetch
// ---------------------------------------------------------------------------

describe("resolvePlaceById() — rich generator fetch (reviews, photos, rating)", () => {
  beforeEach(() => setPlacesEnv());

  it("requests the RICH field mask and maps reviews/photos with attribution", async () => {
    let sentMask = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sentMask = String((init?.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "");
        expect(url).toContain("places.googleapis.com/v1/places/ChIJrich0000000000000000000");
        return fakeResponse({
          status: 200,
          json: {
            id: "ChIJrich0000000000000000000",
            displayName: { text: "Marigold Café" },
            formattedAddress: "1123 E 6th St, Austin, TX",
            location: { latitude: 30.26, longitude: -97.72 },
            primaryTypeDisplayName: { text: "Café" },
            editorialSummary: { text: "Neighborhood café and bakery." },
            rating: 4.7,
            userRatingCount: 328,
            priceLevel: "PRICE_LEVEL_MODERATE",
            reviews: [
              {
                rating: 5,
                text: { text: "Best cortado on the East Side." },
                relativePublishTimeDescription: "2 weeks ago",
                authorAttribution: { displayName: "Marcus R." },
              },
              // dropped: no author attribution (cannot be shown)
              { rating: 4, text: { text: "no author" } },
              // dropped: empty text
              { rating: 5, text: { text: "" }, authorAttribution: { displayName: "Ghost" } },
            ],
            photos: [
              { name: "places/ChIJrich/photos/AbC", widthPx: 4000, heightPx: 3000, authorAttributions: [{ displayName: "A. Photographer" }] },
              { widthPx: 100 }, // dropped: no name
            ],
          },
        });
      })
    );

    const r = await resolvePlaceById("ChIJrich0000000000000000000", { rich: true });

    expect(sentMask).toBe(PLACE_DETAILS_RICH_FIELD_MASK);
    expect(r.category).toBe("Café");
    expect(r.description).toBe("Neighborhood café and bakery.");
    expect(r.rating).toBe(4.7);
    expect(r.reviewCount).toBe(328);
    expect(r.priceLevel).toBe("PRICE_LEVEL_MODERATE");
    // Only the well-formed, attributed, non-empty review survives.
    expect(r.reviews).toHaveLength(1);
    expect(r.reviews[0]).toMatchObject({ author: "Marcus R.", rating: 5, text: "Best cortado on the East Side." });
    // Only the photo with a resource name survives, attribution captured.
    expect(r.photos).toHaveLength(1);
    expect(r.photos[0]).toMatchObject({ name: "places/ChIJrich/photos/AbC", attribution: "A. Photographer" });
  });

  it("without { rich } uses the narrow mask (no Enterprise-SKU reviews/photos)", async () => {
    let sentMask = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentMask = String((init?.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "");
        return fakeResponse({ status: 200, json: { id: "ChIJnarrow", displayName: { text: "X" } } });
      })
    );
    const r = await resolvePlaceById("ChIJnarrow");
    expect(sentMask).toBe(PLACE_DETAILS_FIELD_MASK);
    expect(r.reviews).toEqual([]);
    expect(r.photos).toEqual([]);
  });

  it("fails safe (not_configured) without the API key", async () => {
    clearPlacesEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolvePlaceById("ChIJx", { rich: true })).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
