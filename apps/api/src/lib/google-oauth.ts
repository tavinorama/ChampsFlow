/**
 * Google OAuth helper library — Attribution v1 (#86)
 *
 * Supports:
 *  - GA4 (Google Analytics 4) via Analytics Data API v1beta
 *  - GSC (Google Search Console) via Search Console API v3
 *
 * Security:
 *  - Read-only scopes ONLY (analytics.readonly, webmasters.readonly)
 *  - Tokens are NEVER logged
 *  - Uses native fetch — no Google SDK dependency
 *  - access_type=offline + prompt=consent to always get a refresh token
 *
 * Env vars required (all three must be present for OAuth to be active):
 *  GOOGLE_OAUTH_CLIENT_ID
 *  GOOGLE_OAUTH_CLIENT_SECRET
 *  GOOGLE_OAUTH_REDIRECT_URI
 *
 * CRM EXTENSION POINT:
 * Future CRM connectors (HubSpot, Salesforce, Pipedrive) can be added here
 * following the same pattern: buildCrmAuthUrl, exchangeCrmCode, fetchCrmMetrics.
 * Each new connector needs: its own OAuth scopes, token exchange, and a
 * google_metric_cache equivalent (or a crm_metric_cache table via a new migration).
 * The google_connection table should NOT be reused for CRM — create a crm_connection
 * table with the same RLS pattern when the time comes.
 */

import { logger } from "../../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

/**
 * Returns true if all three Google OAuth env vars are present.
 * Called before any connect flow to show "not configured" degraded state.
 */
export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env["GOOGLE_OAUTH_CLIENT_ID"] &&
    process.env["GOOGLE_OAUTH_CLIENT_SECRET"] &&
    process.env["GOOGLE_OAUTH_REDIRECT_URI"]
  );
}

// ---------------------------------------------------------------------------
// Authorization URL builder
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";

const KIND_SCOPES: Record<"ga4" | "gsc", string> = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
};

/**
 * Builds the Google OAuth authorization URL for the given kind and state.
 * kind 'ga4' → scope: 'https://www.googleapis.com/auth/analytics.readonly'
 * kind 'gsc' → scope: 'https://www.googleapis.com/auth/webmasters.readonly'
 * Always includes 'openid email' for identity.
 * Always sets access_type=offline (to get refresh token) and prompt=consent.
 */
export function buildGoogleAuthUrl(kind: "ga4" | "gsc", state: string): string {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const redirectUri = process.env["GOOGLE_OAUTH_REDIRECT_URI"];

  if (!clientId || !redirectUri) {
    throw new Error("Google OAuth env vars not configured");
  }

  const scopes = ["openid", "email", KIND_SCOPES[kind]].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Exchanges the auth code for tokens.
 * Throws on HTTP error from Google.
 * NEVER log access_token or refresh_token.
 */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
}> {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth env vars not configured");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    // Never log client_secret or code — log status only
    logger.warn("google_token_exchange_failed", { status: response.status });
    const errText = await response.text().catch(() => "");
    throw new Error(`Google token exchange failed: HTTP ${response.status} — ${errText}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;

  // Defensive: Google should always return access_token; throw if absent
  if (!data.access_token) {
    throw new Error("Google token exchange: missing access_token in response");
  }

  logger.info("google_token_exchange_success", { scope: data.scope });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

/**
 * Refreshes an access token using the refresh token.
 * Returns { accessToken, expiresIn }.
 * Throws on failure (caller should revoke the connection if this fails persistently).
 * NEVER log tokens.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth env vars not configured");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    logger.warn("google_token_refresh_failed", { status: response.status });
    throw new Error(`Google token refresh failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as GoogleRefreshResponse;

  if (!data.access_token) {
    throw new Error("Google token refresh: missing access_token in response");
  }

  logger.info("google_token_refresh_success", {});

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

// ---------------------------------------------------------------------------
// GA4 — organic sessions fetch
// ---------------------------------------------------------------------------

interface GA4RunReportResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
  rowCount?: number;
}

/**
 * GA4 — runs a report for organic-search sessions + users over the last 90 days.
 * Uses the Google Analytics Data API v1 runReport endpoint.
 * Returns array of { date, sessions, users } sorted ascending.
 * Scoped to the given ga4PropertyId.
 *
 * Note: dimensionFilter on 'sessionDefaultChannelGroup' = 'Organic Search'
 * is applied when the API supports it. Some property configurations may not
 * return this dimension; if the filter fails we accept all traffic types.
 */
/** Validates ga4PropertyId before URL construction. Throws on invalid input. */
const GA4_PROPERTY_ID_RE = /^(\d+|properties\/\d+)$/;

function validateGa4PropertyId(ga4PropertyId: string): void {
  if (!GA4_PROPERTY_ID_RE.test(ga4PropertyId)) {
    throw new Error(
      `invalid_ga4_property_id: value "${ga4PropertyId}" must be numeric digits or "properties/<digits>"`
    );
  }
}

export async function fetchGA4OrganicSessions(
  accessToken: string,
  ga4PropertyId: string
): Promise<Array<{ date: string; sessions: number; users: number }>> {
  // Validate before any URL construction — reject path-traversal / non-numeric values.
  validateGa4PropertyId(ga4PropertyId);

  // ga4PropertyId may be e.g. "properties/123456789" or just "123456789"
  const propertyPath = ga4PropertyId.startsWith("properties/")
    ? ga4PropertyId
    : `properties/${ga4PropertyId}`;

  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`;

  const requestBody = {
    dateRanges: [{ startDate: "90daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: {
          matchType: "EXACT",
          value: "Organic Search",
        },
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
    limit: 91,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    logger.warn("ga4_fetch_failed", { status: response.status, propertyPath });
    throw new Error(`GA4 API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as GA4RunReportResponse;

  const rows = data.rows ?? [];

  return rows.map((row) => {
    const rawDate = row.dimensionValues[0]?.value ?? "";
    // API returns YYYYMMDD → convert to YYYY-MM-DD
    const date =
      rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;

    const sessions = parseInt(row.metricValues[0]?.value ?? "0", 10);
    const users = parseInt(row.metricValues[1]?.value ?? "0", 10);

    return { date, sessions, users };
  });
}

// ---------------------------------------------------------------------------
// GSC — search analytics fetch
// ---------------------------------------------------------------------------

interface GSCSearchAnalyticsResponse {
  rows?: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

/**
 * GSC — fetches clicks + impressions over the last 90 days.
 * Uses the Search Console API searchanalytics.query endpoint.
 * Returns array of { date, clicks, impressions } sorted ascending.
 * Scoped to the given siteUrl.
 * type is not filtered — fetches all to include AI Overview data.
 */
export async function fetchGSCSearchAnalytics(
  accessToken: string,
  siteUrl: string
): Promise<Array<{ date: string; clicks: number; impressions: number }>> {
  const encodedSite = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  // Compute date range: last 90 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  const fmt = (d: Date): string => d.toISOString().slice(0, 10);

  const requestBody = {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    dimensions: ["date"],
    rowLimit: 90,
    // No searchType filter — accept all traffic including AI Overview
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    logger.warn("gsc_fetch_failed", { status: response.status });
    throw new Error(`GSC API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as GSCSearchAnalyticsResponse;
  const rows = data.rows ?? [];

  return rows
    .map((row) => ({
      date: row.keys[0] ?? "",
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
