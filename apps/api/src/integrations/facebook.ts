/**
 * Facebook (Meta) OAuth 2.0 integration for C4-extension (Facebook OAuth).
 *
 * Flow: Authorization Code (Meta Graph API v19.0).
 * After user OAuth, we fetch the user's managed Pages via /me/accounts and
 * store the *Page* access token (not the user token) — Pages have their own
 * long-lived tokens needed for pages_manage_posts.
 *
 * Scopes: pages_manage_posts, pages_read_engagement, pages_show_list
 *
 * Architecture refs:
 *  - §6 OAuth social accounts
 *  - §9 Encryption (AES-256-GCM, key from OAUTH_TOKEN_KEY env)
 *  - §11 Sub-processors: Meta (Facebook) Graph API (performance of contract basis;
 *         same sub-processor as Instagram — no new compliance review required,
 *         founder decision 2026-05-05)
 *
 * Note on PKCE for Facebook:
 * Meta's Graph API (non-Instagram) does not natively support PKCE code_challenge.
 * We apply state-based CSRF protection at our server layer (same as Instagram):
 * the state param is an opaque server-generated nonce stored in Redis with the
 * tenant/user context. The server-to-Meta leg uses standard Auth Code grant
 * with client_secret (server-side). This matches the Instagram pattern.
 *
 * Token type: Page access tokens (NOT user access tokens).
 * After the user grants OAuth, we call GET /me/accounts to get the list of
 * Pages the user manages. We then use that Page's access_token (already
 * long-lived or exchangeable) as the stored token. If the user manages
 * multiple Pages, the caller must select one via the select-page flow.
 *
 * Token lifetime:
 * The user access token from OAuth is short-lived (~1 hour). We exchange it
 * for a long-lived user token first (fb_exchange_token, ~60 days), then use
 * it to fetch /me/accounts — which returns Page tokens that never expire
 * (unless the user revokes the app or changes their password). However, for
 * safety and consistency, we store the token_expires_at as 60 days (same as
 * Instagram) and rely on the pre-publish expiry check (S-9) for refresh logic.
 *
 * Structured-logger guard: NEVER log access_token or page_token values.
 * All token values are encrypted with AES-256-GCM before storage.
 * Identical pattern to instagram.ts.
 */

import { encryptToken, decryptToken } from "../../../../packages/shared/src/crypto";
import { logger } from "../../../../packages/shared/src/logger";
import {
  PublishError,
  type SocialAccountForPublish,
  type DraftForPublish,
  type PublishResult,
} from "../../../../packages/shared/src/index";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getConfig() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      "FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI must be set"
    );
  }

  return { appId, appSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// OAuth scopes — minimum necessary per C4-extension spec
// pages_show_list: enumerate managed Pages
// pages_manage_posts: publish posts to Pages
// pages_read_engagement: read post engagement (required for pages_manage_posts)
// ---------------------------------------------------------------------------
const FACEBOOK_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const;

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export function buildFacebookAuthUrl(state: string): string {
  const { appId, redirectUri } = getConfig();

  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}

// ---------------------------------------------------------------------------
// Facebook Page type (from /me/accounts)
// ---------------------------------------------------------------------------

export interface FacebookPage {
  id: string;           // Page ID (platform_user_id stored in social_accounts)
  name: string;         // Page name (stored as platform_username)
  access_token: string; // Page access token — TRANSIENT until encrypted
  category: string;
  tasks: string[];      // Permissions granted for this page
}

// ---------------------------------------------------------------------------
// Token exchange result — ready for social_accounts table
// ---------------------------------------------------------------------------

export interface FacebookTokenExchangeResult {
  accessTokenEnc: Buffer;     // Encrypted Page access token
  refreshTokenEnc: null;      // Facebook Page tokens don't use separate refresh tokens
  keyVersion: number;
  expiresAt: Date;            // 60-day window (long-lived user token basis)
  scope: string;
  platformUserId: string;     // Facebook Page ID
  platformUsername: string;   // Facebook Page name
  /**
   * All pages the user manages. Populated even for single-page accounts.
   * The caller (backend route) uses this to decide whether to auto-select
   * (single page) or prompt page selection (multiple pages).
   * Page access_tokens in this array are PLAINTEXT — do not log or persist
   * beyond the immediate request scope. Only the selected page token is
   * encrypted and stored.
   */
  pages: FacebookPage[];
}

/**
 * exchangeFacebookCode — full OAuth flow for Facebook Pages.
 *
 * Steps:
 *  1. Exchange auth code for short-lived user token
 *  2. Exchange short-lived user token for long-lived user token (~60 days)
 *  3. GET /me/accounts with long-lived user token → Page list (each with Page token)
 *  4. Return pages list + encrypted token of first page (auto-select) or all pages
 *     for the caller to present a page-picker.
 *
 * Returns the first page's encrypted token for auto-selection; the caller
 * must call selectFacebookPage() to get the final encrypted token for a
 * user-selected page if there are multiple pages.
 *
 * Never logs access_token or page tokens.
 */
export async function exchangeFacebookCode(
  code: string
): Promise<FacebookTokenExchangeResult> {
  const { appId, appSecret, redirectUri } = getConfig();

  // -------------------------------------------------------------------------
  // Step 1: Exchange code for short-lived user access token
  // -------------------------------------------------------------------------
  const shortLivedUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  shortLivedUrl.searchParams.set("client_id", appId);
  shortLivedUrl.searchParams.set("client_secret", appSecret);
  shortLivedUrl.searchParams.set("redirect_uri", redirectUri);
  shortLivedUrl.searchParams.set("code", code);

  let shortLivedToken: string;

  try {
    const step1Response = await fetchWithRetry(shortLivedUrl.toString(), {
      method: "GET",
    });

    if (!step1Response.ok) {
      logger.error("facebook_code_exchange_step1_failed", {
        status: step1Response.status,
        // token NOT logged
      });
      const isPermanent =
        step1Response.status >= 400 && step1Response.status < 500;
      throw new FacebookOAuthError(
        isPermanent ? "PERMANENT" : "RETRYABLE",
        `Facebook code exchange step 1 failed: HTTP ${step1Response.status}`
      );
    }

    const step1Data = (await step1Response.json()) as {
      access_token: string;
      token_type: string;
      expires_in?: number;
    };

    shortLivedToken = step1Data.access_token;
    // Short-lived token not logged
  } catch (err) {
    if (err instanceof FacebookOAuthError) throw err;
    logger.error("facebook_code_exchange_step1_network_error", {
      error: (err as Error).message,
    });
    throw new FacebookOAuthError(
      "RETRYABLE",
      "Network error during Facebook code exchange"
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Exchange short-lived user token for long-lived user token (~60 days)
  // Uses fb_exchange_token grant (Graph API long-lived token endpoint)
  // -------------------------------------------------------------------------
  const longLivedUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  let longLivedUserToken: string;
  let expiresInSeconds: number;

  try {
    const step2Response = await fetchWithRetry(longLivedUrl.toString(), {
      method: "GET",
    });

    if (!step2Response.ok) {
      logger.error("facebook_token_exchange_step2_failed", {
        status: step2Response.status,
      });
      throw new FacebookOAuthError(
        "RETRYABLE",
        `Facebook long-lived token exchange failed: HTTP ${step2Response.status}`
      );
    }

    const step2Data = (await step2Response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    longLivedUserToken = step2Data.access_token;
    expiresInSeconds = step2Data.expires_in ?? 5184000; // Default: 60 days in seconds
    // Long-lived user token not logged
  } catch (err) {
    if (err instanceof FacebookOAuthError) throw err;
    logger.error("facebook_token_exchange_step2_network_error", {
      error: (err as Error).message,
    });
    throw new FacebookOAuthError(
      "RETRYABLE",
      "Network error during Facebook long-lived token exchange"
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Fetch managed Pages via GET /me/accounts
  // Each Page entry has its own access_token (Page access token).
  // Page tokens derived from a long-lived user token are themselves long-lived
  // (they don't expire unless the user revokes the app or changes password).
  // -------------------------------------------------------------------------
  const accountsUrl = new URL(`${GRAPH_API_BASE}/me/accounts`);
  accountsUrl.searchParams.set("fields", "id,name,access_token,category,tasks");
  accountsUrl.searchParams.set("access_token", longLivedUserToken);

  let pages: FacebookPage[];

  try {
    const step3Response = await fetchWithRetry(accountsUrl.toString(), {
      method: "GET",
    });

    if (!step3Response.ok) {
      logger.error("facebook_pages_fetch_failed", {
        status: step3Response.status,
      });
      throw new FacebookOAuthError(
        "PERMANENT",
        `Failed to fetch Facebook Pages: HTTP ${step3Response.status}`
      );
    }

    const step3Data = (await step3Response.json()) as {
      data: FacebookPage[];
    };

    pages = step3Data.data ?? [];

    if (pages.length === 0) {
      logger.warn("facebook_no_pages_found", {
        // User token not logged; just the count
        pageCount: 0,
      });
      throw new FacebookOAuthError(
        "PERMANENT",
        "No Facebook Pages found for this account. " +
          "You must manage at least one Facebook Page to connect."
      );
    }

    logger.info("facebook_pages_fetched", {
      pageCount: pages.length,
      // Page IDs logged (not PII per architecture; same as platform_user_id)
      pageIds: pages.map((p) => p.id),
      // access_tokens NOT logged
    });
  } catch (err) {
    if (err instanceof FacebookOAuthError) throw err;
    logger.error("facebook_pages_fetch_network_error", {
      error: (err as Error).message,
    });
    throw new FacebookOAuthError(
      "RETRYABLE",
      "Network error fetching Facebook Pages"
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Encrypt the first page's token (used for auto-select / single-page flow).
  // For multi-page accounts, the caller will call selectFacebookPage() with the
  // user's chosen page ID to get the final encrypted token.
  // -------------------------------------------------------------------------
  const selectedPage = pages[0];
  const { encrypted: accessTokenEnc, keyVersion } = encryptToken(
    selectedPage.access_token
  );

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  logger.info("facebook_token_exchanged", {
    platformUserId: selectedPage.id,
    platformUsername: selectedPage.name,
    pageCount: pages.length,
    expiresAt: expiresAt.toISOString(),
    keyVersion,
    autoSelected: pages.length === 1,
    // access_token / page tokens NOT logged
  });

  return {
    accessTokenEnc,
    refreshTokenEnc: null,
    keyVersion,
    expiresAt,
    scope: FACEBOOK_SCOPES.join(","),
    platformUserId: selectedPage.id,
    platformUsername: selectedPage.name,
    pages,
  };
}

// ---------------------------------------------------------------------------
// Page selection — called when user picks a specific Page (multi-page flow)
// ---------------------------------------------------------------------------

export interface FacebookPageSelectionResult {
  accessTokenEnc: Buffer;
  refreshTokenEnc: null;
  keyVersion: number;
  expiresAt: Date;
  scope: string;
  platformUserId: string;
  platformUsername: string;
}

/**
 * selectFacebookPage — encrypts the token for a user-selected Page.
 *
 * Called by the backend route POST /api/social-accounts/:id/select-page
 * when the user has multiple managed Pages and picks one.
 *
 * The page's access_token is passed in plaintext from the pages[] array
 * returned by exchangeFacebookCode(). It is encrypted here and returned
 * ready for storage.
 *
 * Never logs the page token.
 */
export function selectFacebookPage(
  page: FacebookPage,
  expiresAt: Date
): FacebookPageSelectionResult {
  const { encrypted: accessTokenEnc, keyVersion } = encryptToken(
    page.access_token
  );

  logger.info("facebook_page_selected", {
    platformUserId: page.id,
    platformUsername: page.name,
    keyVersion,
    // access_token NOT logged
  });

  return {
    accessTokenEnc,
    refreshTokenEnc: null,
    keyVersion,
    expiresAt,
    scope: FACEBOOK_SCOPES.join(","),
    platformUserId: page.id,
    platformUsername: page.name,
  };
}

// ---------------------------------------------------------------------------
// Token revocation (best-effort on disconnect)
// ---------------------------------------------------------------------------

/**
 * revokeFacebookToken — revokes the app's access for a Page token.
 *
 * Meta Graph API supports token revocation via DELETE /{user-id}/permissions
 * using the user access token. Since we store the Page access token (not the
 * user access token), revocation here follows the best-effort approach:
 *
 * We call DELETE /me/permissions to revoke app permissions using the Page
 * access token as the auth token. This de-authorizes the app for that Page.
 *
 * On failure: log the error without the token value, continue with DB-side
 * revocation (revoked_at set, columns nulled). Same pattern as Instagram.
 *
 * Never logs the token value.
 */
export async function revokeFacebookToken(
  accessToken: string // TRANSIENT — never logged
): Promise<void> {
  const { appId } = getConfig();

  try {
    const revokeUrl = new URL(`${GRAPH_API_BASE}/me/permissions`);
    revokeUrl.searchParams.set("access_token", accessToken);
    // appId included for app-specific revocation
    revokeUrl.searchParams.set("client_id", appId);

    const response = await fetchWithRetry(revokeUrl.toString(), {
      method: "DELETE",
    });

    if (!response.ok) {
      logger.warn("facebook_token_revocation_api_failed", {
        status: response.status,
        // token NOT logged
      });
      // Best-effort: don't throw; DB-side revocation will proceed
      return;
    }

    logger.info("facebook_token_revoked", {
      // Page ID not available at this scope; token NOT logged
    });
  } catch (err) {
    logger.warn("facebook_token_revocation_network_error", {
      error: (err as Error).message,
      // token NOT logged
    });
    // Best-effort: swallow error; DB-side revocation proceeds regardless
  }
}

// ---------------------------------------------------------------------------
// Publish — Facebook Pages Graph API
//
// Endpoint: POST /{page-id}/feed
// Auth: Page access token (stored encrypted in social_accounts.access_token_enc)
//
// Security (S-9): caller MUST verify token_expires_at before calling this.
//   This function performs an additional defence-in-depth check and throws
//   PublishError(retryable=false, code='token_expired') if expired — without
//   logging the token value.
//
// Rate limits: Facebook Pages API applies per-Page limits.
//   429 response is retryable.
// ---------------------------------------------------------------------------

/**
 * publishToFacebook — publishes an approved draft to a Facebook Page.
 *
 * @param socialAccount  Row from social_accounts (access_token_enc is BYTEA).
 *                       platform_user_id is the Facebook Page ID.
 * @param draft          Approved draft row (body, hashtags, ai_generated flag).
 * @returns              { post_id } — Facebook post ID (page_id + '_' + post_id format).
 * @throws               PublishError with retryable + code for worker decision.
 */
export async function publishToFacebook(
  socialAccount: SocialAccountForPublish,
  draft: DraftForPublish
): Promise<PublishResult> {
  // S-9: Pre-publish token expiry check — before decrypt
  if (
    socialAccount.token_expires_at !== null &&
    socialAccount.token_expires_at <= new Date()
  ) {
    logger.warn("facebook_publish_token_expired", {
      social_account_id: socialAccount.id,
      platform: "facebook",
      // token NOT logged
    });
    throw new PublishError(
      false, // not retryable — needs re-auth
      "token_expired",
      "facebook",
      "Facebook Page access token has expired. User must reconnect the account."
    );
  }

  // Decrypt Page access token transiently — never stored in decrypted form, never logged
  let pageAccessToken: string;
  try {
    pageAccessToken = decryptToken(socialAccount.access_token_enc);
  } catch (err) {
    logger.error("facebook_publish_token_decrypt_failed", {
      social_account_id: socialAccount.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      false,
      "platform_error",
      "facebook",
      "Failed to decrypt Facebook Page access token."
    );
  }

  const pageId = socialAccount.platform_user_id;

  // Build message: body + hashtags (if present)
  const message = draft.hashtags && draft.hashtags.length > 0
    ? `${draft.body}\n\n${draft.hashtags.join(" ")}`
    : draft.body;

  // POST /{page-id}/feed with Page access token
  const feedUrl = `${GRAPH_API_BASE}/${pageId}/feed`;

  let response: Response;
  try {
    response = await fetchWithRetry(feedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        access_token: pageAccessToken,
      }),
    });
  } catch (err) {
    logger.error("facebook_publish_network_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      true, // retryable — network error
      "platform_error",
      "facebook",
      `Facebook publish network error: ${(err as Error).message}`
    );
  } finally {
    // Overwrite the decrypted token variable as soon as possible
    pageAccessToken = "";
  }

  if (!response.ok) {
    const status = response.status;

    if (status === 429) {
      logger.warn("facebook_publish_rate_limited", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(
        true,
        "rate_limit",
        "facebook",
        `Facebook API rate limit hit: HTTP ${status}`
      );
    }

    if (status === 401 || status === 403) {
      logger.warn("facebook_publish_unauthorized", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(
        false,
        "token_expired",
        "facebook",
        `Facebook API returned ${status} — Page token invalid, expired, or permissions revoked.`
      );
    }

    if (status >= 400 && status < 500) {
      logger.error("facebook_publish_content_rejected", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
        // response body intentionally not logged (may contain sensitive echo)
      });
      throw new PublishError(
        false,
        "content_rejected",
        "facebook",
        `Facebook rejected the post: HTTP ${status}`
      );
    }

    // 5xx — retryable
    logger.error("facebook_publish_platform_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      status,
    });
    throw new PublishError(
      true,
      "platform_error",
      "facebook",
      `Facebook platform error: HTTP ${status}`
    );
  }

  const responseData = (await response.json()) as { id?: string };
  const postId = responseData.id ?? "";

  logger.info("facebook_publish_success", {
    social_account_id: socialAccount.id,
    draft_id: draft.id,
    post_id: postId,
    ai_generated: draft.ai_generated,
    // token NOT logged
  });

  return { post_id: postId };
}

// ---------------------------------------------------------------------------
// Retry helper — same pattern as instagram.ts
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempt = 0
): Promise<Response> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 32000;

  const response = await fetch(url, options);

  const isRetryable =
    response.status === 429 ||
    (response.status >= 500 && response.status < 600);

  if (isRetryable && attempt < MAX_RETRIES) {
    const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    logger.warn("facebook_api_retrying", {
      status: response.status,
      attempt: attempt + 1,
      delayMs: delay,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, options, attempt + 1);
  }

  return response;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class FacebookOAuthError extends Error {
  constructor(
    public readonly kind: "PERMANENT" | "RETRYABLE",
    message: string
  ) {
    super(message);
    this.name = "FacebookOAuthError";
  }
}
