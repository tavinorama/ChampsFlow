/**
 * LinkedIn OAuth 2.0 integration for C4 OAuth Connect.
 *
 * Flow: Authorization Code with PKCE (architecture §6, PRD C4 AC).
 * Scopes: w_member_social + r_basicprofile (minimum necessary — PRD AC).
 *
 * Architecture refs:
 *  - §6 OAuth social accounts
 *  - §9 Encryption (AES-256-GCM, key from OAUTH_TOKEN_KEY env)
 *  - §11 Sub-processors: LinkedIn API (performance of contract basis)
 *
 * integration-coder hard rules:
 *  - API keys from env only (#1)
 *  - Data minimization: send only required fields (#7)
 *  - Try-catch all outbound calls, classify retryable vs permanent (#10)
 *  - Never log full request/response bodies; redact tokens (#6)
 */

import { randomBytes, createHash } from "crypto";
import { encryptToken, decryptToken } from "../../../../packages/shared/src/crypto";
import { logger } from "../../../../packages/shared/src/logger";
import {
  PublishError,
  type SocialAccountForPublish,
  type DraftForPublish,
  type PublishResult,
} from "../../../../packages/shared/src/index";

// ---------------------------------------------------------------------------
// Configuration — all from env (integration-coder hard rule #1)
// ---------------------------------------------------------------------------

function getConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI must be set"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// OAuth scopes — minimum necessary per PRD C4 AC
// ---------------------------------------------------------------------------
const LINKEDIN_SCOPES = ["w_member_social", "r_basicprofile"] as const;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE code_verifier (RFC 7636).
 * Returns a 43-128 character URL-safe string.
 */
export function generateCodeVerifier(): string {
  // 32 bytes = 43 base64url chars (well within 43-128 range)
  return randomBytes(32)
    .toString("base64url")
    .replace(/=/g, "");
}

/**
 * Derive code_challenge from code_verifier using S256 method (RFC 7636 §4.2).
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url")
    .replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export interface LinkedInAuthUrlParams {
  state: string;       // Server-generated CSRF state token
  codeVerifier: string; // Stored server-side; challenge sent to LinkedIn
}

export function buildLinkedInAuthUrl(params: LinkedInAuthUrlParams): string {
  const { clientId, redirectUri } = getConfig();
  const { state, codeVerifier } = params;

  const codeChallenge = generateCodeChallenge(codeVerifier);

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface LinkedInTokenResponse {
  accessToken: string;          // Plain-text (encrypt before storing)
  refreshToken: string | null;  // LinkedIn may or may not issue refresh tokens
  expiresInSeconds: number;
  scope: string;
}

export interface LinkedInTokenExchangeResult {
  accessTokenEnc: Buffer;
  refreshTokenEnc: Buffer | null;
  keyVersion: number;
  expiresAt: Date;
  scope: string;
}

/**
 * Exchange authorization code for access token.
 * Returns encrypted blobs ready to store in social_accounts table.
 * Never logs token values — only metadata.
 */
export async function exchangeLinkedInCode(
  code: string,
  codeVerifier: string
): Promise<LinkedInTokenExchangeResult> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });

  let tokenData: LinkedInTokenResponse;

  try {
    const response = await fetchWithRetry(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      const isPermanent = response.status >= 400 && response.status < 500;
      logger.error("linkedin_token_exchange_failed", {
        status: response.status,
        retryable: !isPermanent,
        // errorBody intentionally omitted — may contain client_secret echo or partial token
      });
      throw new LinkedInOAuthError(
        isPermanent ? "PERMANENT" : "RETRYABLE",
        `LinkedIn token exchange failed: HTTP ${response.status}`
      );
    }

    const raw = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    tokenData = {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token ?? null,
      expiresInSeconds: raw.expires_in,
      scope: raw.scope,
    };
  } catch (err) {
    if (err instanceof LinkedInOAuthError) throw err;
    logger.error("linkedin_token_exchange_network_error", {
      error: (err as Error).message,
    });
    throw new LinkedInOAuthError("RETRYABLE", "Network error during LinkedIn token exchange");
  }

  // Encrypt tokens before returning — never stored in plaintext
  const { encrypted: accessTokenEnc, keyVersion } = encryptToken(
    tokenData.accessToken
  );

  let refreshTokenEnc: Buffer | null = null;
  if (tokenData.refreshToken) {
    refreshTokenEnc = encryptToken(tokenData.refreshToken).encrypted;
  }

  const expiresAt = new Date(Date.now() + tokenData.expiresInSeconds * 1000);

  logger.info("linkedin_token_exchanged", {
    expiresAt: expiresAt.toISOString(),
    scope: tokenData.scope,
    hasRefreshToken: refreshTokenEnc !== null,
    keyVersion,
    // accessToken and refreshToken NOT logged
  });

  return {
    accessTokenEnc,
    refreshTokenEnc,
    keyVersion,
    expiresAt,
    scope: tokenData.scope,
  };
}

// ---------------------------------------------------------------------------
// Profile fetch — r_basicprofile scope
// Used post-token-exchange to get the platform_user_id and display name.
// ---------------------------------------------------------------------------

export interface LinkedInProfile {
  platformUserId: string;  // LinkedIn member URN (e.g., "urn:li:member:123456")
  displayName: string;
}

export async function fetchLinkedInProfile(
  accessToken: string // TRANSIENT — never stored in plaintext, never logged
): Promise<LinkedInProfile> {
  let response: Response;
  try {
    response = await fetchWithRetry("https://api.linkedin.com/v2/userinfo", {
      headers: {
        // Authorization header value never logged (integration-coder rule #6)
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    logger.error("linkedin_profile_fetch_network_error", {
      error: (err as Error).message,
    });
    throw new LinkedInOAuthError("RETRYABLE", "Network error fetching LinkedIn profile");
  }

  if (!response.ok) {
    logger.error("linkedin_profile_fetch_failed", { status: response.status });
    throw new LinkedInOAuthError(
      "PERMANENT",
      `Failed to fetch LinkedIn profile: HTTP ${response.status}`
    );
  }

  const data = (await response.json()) as { sub: string; name?: string };

  return {
    platformUserId: data.sub,
    displayName: data.name ?? "LinkedIn user",
  };
}

// ---------------------------------------------------------------------------
// Token revocation (for disconnect)
// ---------------------------------------------------------------------------
export async function revokeLinkedInToken(
  accessToken: string // TRANSIENT — never logged
): Promise<void> {
  const { clientId, clientSecret } = getConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token: accessToken,
  });

  try {
    const response = await fetch(
      "https://www.linkedin.com/oauth/v2/revoke",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );
    if (!response.ok) {
      logger.warn("linkedin_token_revocation_failed", {
        status: response.status,
      });
      // Best-effort: if revocation fails, we still mark revoked_at in DB
    } else {
      logger.info("linkedin_token_revoked_at_provider");
    }
  } catch (err) {
    logger.warn("linkedin_token_revocation_network_error", {
      error: (err as Error).message,
    });
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Publish — UGC Posts API (LinkedIn v2)
//
// Security (S-9): caller MUST verify token_expires_at before calling this.
//   This function performs an additional check as defence-in-depth and throws
//   PublishError(retryable=false, code='token_expired') if expired — without
//   logging the token value.
//
// ai_generated flag: included in our internal record; LinkedIn UGC Posts API
//   has no third-party AI marking field as of 2026-05 (architecture §12 A3).
//   Obligation discharged at DB+API level (ai_generated column on publish_jobs).
// ---------------------------------------------------------------------------

/**
 * publishToLinkedIn — publishes an approved draft to LinkedIn.
 *
 * @param socialAccount  Row from social_accounts (access_token_enc is BYTEA).
 * @param draft          Approved draft row (body, ai_generated flag).
 * @returns              { post_id } — LinkedIn UGC post URN.
 * @throws               PublishError with retryable + code for worker decision.
 */
export async function publishToLinkedIn(
  socialAccount: SocialAccountForPublish,
  draft: DraftForPublish
): Promise<PublishResult> {
  // S-9: Pre-publish token expiry check — before decrypt
  if (
    socialAccount.token_expires_at !== null &&
    socialAccount.token_expires_at <= new Date()
  ) {
    logger.warn("linkedin_publish_token_expired", {
      social_account_id: socialAccount.id,
      platform: "linkedin",
      // token NOT logged
    });
    throw new PublishError(
      false, // not retryable — needs re-auth
      "token_expired",
      "linkedin",
      "LinkedIn OAuth token has expired. User must reconnect the account."
    );
  }

  // Decrypt token transiently — never stored in decrypted form, never logged
  let accessToken: string;
  try {
    accessToken = decryptToken(socialAccount.access_token_enc);
  } catch (err) {
    logger.error("linkedin_publish_token_decrypt_failed", {
      social_account_id: socialAccount.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      false,
      "platform_error",
      "linkedin",
      "Failed to decrypt LinkedIn OAuth token."
    );
  }

  // Build UGC Post payload per LinkedIn v2 UGC Posts API spec
  // Owner URN: urn:li:person:{platformUserId}
  const ownerUrn = `urn:li:person:${socialAccount.platform_user_id}`;

  const ugcPayload = {
    author: ownerUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: draft.body,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  let response: Response;
  try {
    response = await fetchWithRetry(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          // Authorization header value NEVER logged (logger scrubs it)
        },
        body: JSON.stringify(ugcPayload),
      }
    );
  } catch (err) {
    logger.error("linkedin_publish_network_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      true, // retryable — network error
      "platform_error",
      "linkedin",
      `LinkedIn publish network error: ${(err as Error).message}`
    );
  } finally {
    // Overwrite the decrypted token variable as soon as possible
    accessToken = "";
  }

  if (!response.ok) {
    const status = response.status;

    // Rate limit
    if (status === 429) {
      logger.warn("linkedin_publish_rate_limited", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(
        true,
        "rate_limit",
        "linkedin",
        `LinkedIn API rate limit hit: HTTP ${status}`
      );
    }

    // Content rejected (4xx that isn't 429 or 401)
    if (status >= 400 && status < 500 && status !== 401) {
      logger.error("linkedin_publish_content_rejected", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
        // response body intentionally not logged (may contain token echoes)
      });
      throw new PublishError(
        false,
        "content_rejected",
        "linkedin",
        `LinkedIn rejected the post: HTTP ${status}`
      );
    }

    // 401 = token invalid/expired at API layer
    if (status === 401) {
      logger.warn("linkedin_publish_unauthorized", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
      });
      throw new PublishError(
        false,
        "token_expired",
        "linkedin",
        "LinkedIn API returned 401 — token invalid or expired."
      );
    }

    // 5xx — retryable
    logger.error("linkedin_publish_platform_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      status,
    });
    throw new PublishError(
      true,
      "platform_error",
      "linkedin",
      `LinkedIn platform error: HTTP ${status}`
    );
  }

  // Extract the post ID from the response headers or body
  // LinkedIn UGC Posts API returns the URN in the X-RestLi-Id header
  const postUrn =
    response.headers.get("X-RestLi-Id") ??
    response.headers.get("x-restli-id") ??
    "";

  if (!postUrn) {
    // Parse from body as fallback
    try {
      const body = (await response.json()) as { id?: string };
      const postId = body.id ?? postUrn;
      logger.info("linkedin_publish_success", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        post_urn: postId,
        ai_generated: draft.ai_generated,
        // token NOT logged
      });
      return { post_id: postId };
    } catch {
      // Body parse failed; return empty string as post_id (log the gap)
      logger.warn("linkedin_publish_success_no_post_id", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
      });
      return { post_id: "" };
    }
  }

  logger.info("linkedin_publish_success", {
    social_account_id: socialAccount.id,
    draft_id: draft.id,
    post_urn: postUrn,
    ai_generated: draft.ai_generated,
    // token NOT logged
  });

  return { post_id: postUrn };
}

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff (integration-coder rule #3)
// Initial 1s, max 32s, max 3 retries, retryable: 429 + 5xx
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
    response.status === 429 || (response.status >= 500 && response.status < 600);

  if (isRetryable && attempt < MAX_RETRIES) {
    const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    logger.warn("linkedin_api_retrying", {
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
export class LinkedInOAuthError extends Error {
  constructor(
    public readonly kind: "PERMANENT" | "RETRYABLE",
    message: string
  ) {
    super(message);
    this.name = "LinkedInOAuthError";
  }
}
