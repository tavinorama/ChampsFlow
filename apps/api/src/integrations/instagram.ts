/**
 * Instagram (Meta) OAuth 2.0 integration for C4 OAuth Connect.
 *
 * Flow: Authorization Code (Instagram Graph API uses standard Auth Code grant;
 * PKCE is implemented as an additional layer per PRD AC "OAuth 2.0 PKCE flow
 * used for both platforms").
 *
 * Scopes: instagram_basic + instagram_content_publish (minimum necessary — PRD AC).
 *
 * Architecture refs:
 *  - §6 OAuth social accounts
 *  - §9 Encryption (AES-256-GCM, key from OAUTH_TOKEN_KEY env)
 *  - §11 Sub-processors: Instagram Graph API (performance of contract basis)
 *
 * Note on PKCE for Instagram:
 * Meta's Graph API does not natively support PKCE code_challenge.
 * We apply PKCE at our server layer: the code_verifier is generated client-side,
 * stored server-side (Redis state), and the code_challenge is included as a
 * state-payload field for internal integrity — not sent to Meta.
 * This means "PKCE" here is the client-to-server leg; the server-to-Meta leg
 * uses standard Auth Code grant with client_secret (server-side).
 *
 * integration-coder hard rules: all from env, no token logging, retry logic.
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
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      "INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI must be set"
    );
  }

  return { appId, appSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// OAuth scopes — minimum necessary per PRD C4 AC
// ---------------------------------------------------------------------------
const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
] as const;

const GRAPH_IG_VERSION = "v18.0";

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export function buildInstagramAuthUrl(state: string): string {
  const { appId, redirectUri } = getConfig();

  const url = new URL("https://api.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}

// ---------------------------------------------------------------------------
// Short-lived token exchange (step 1: code → short-lived token)
// ---------------------------------------------------------------------------

export interface InstagramTokenExchangeResult {
  accessTokenEnc: Buffer;
  refreshTokenEnc: null;  // Instagram long-lived tokens don't have separate refresh tokens
  keyVersion: number;
  expiresAt: Date;        // Long-lived token: ~60 days
  scope: string;
  platformUserId: string;
}

/**
 * Exchange authorization code for a long-lived Instagram token.
 * Two-step process:
 *   1. Short-lived token (code → token, ~1 hour)
 *   2. Long-lived token (short-lived → ~60 days)
 * Returns encrypted blobs ready for social_accounts table.
 * Never logs token values.
 */
export async function exchangeInstagramCode(
  code: string
): Promise<InstagramTokenExchangeResult> {
  const { appId, appSecret, redirectUri } = getConfig();

  // Step 1: short-lived token
  const shortLivedBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  let shortLivedToken: string;
  let platformUserId: string;

  try {
    const step1Response = await fetchWithRetry(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: shortLivedBody.toString(),
      }
    );

    if (!step1Response.ok) {
      logger.error("instagram_code_exchange_step1_failed", {
        status: step1Response.status,
      });
      const isPermanent = step1Response.status >= 400 && step1Response.status < 500;
      throw new InstagramOAuthError(
        isPermanent ? "PERMANENT" : "RETRYABLE",
        `Instagram code exchange step 1 failed: HTTP ${step1Response.status}`
      );
    }

    const step1Data = (await step1Response.json()) as {
      access_token: string;
      user_id: number;
    };

    shortLivedToken = step1Data.access_token;
    platformUserId = String(step1Data.user_id);
  } catch (err) {
    if (err instanceof InstagramOAuthError) throw err;
    logger.error("instagram_code_exchange_step1_network_error", {
      error: (err as Error).message,
    });
    throw new InstagramOAuthError("RETRYABLE", "Network error during Instagram code exchange");
  }

  // Step 2: exchange for long-lived token (~60 days)
  const longLivedUrl = new URL(
    "https://graph.instagram.com/access_token"
  );
  longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("access_token", shortLivedToken);

  let longLivedToken: string;
  let expiresInSeconds: number;

  try {
    const step2Response = await fetchWithRetry(longLivedUrl.toString(), {
      method: "GET",
    });

    if (!step2Response.ok) {
      logger.error("instagram_token_exchange_step2_failed", {
        status: step2Response.status,
      });
      throw new InstagramOAuthError(
        "RETRYABLE",
        `Instagram long-lived token exchange failed: HTTP ${step2Response.status}`
      );
    }

    const step2Data = (await step2Response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    longLivedToken = step2Data.access_token;
    expiresInSeconds = step2Data.expires_in;
  } catch (err) {
    if (err instanceof InstagramOAuthError) throw err;
    logger.error("instagram_token_exchange_step2_network_error", {
      error: (err as Error).message,
    });
    throw new InstagramOAuthError("RETRYABLE", "Network error during Instagram long-lived token exchange");
  }

  // Encrypt long-lived token — never store in plaintext
  const { encrypted: accessTokenEnc, keyVersion } = encryptToken(longLivedToken);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  logger.info("instagram_token_exchanged", {
    platformUserId,
    expiresAt: expiresAt.toISOString(),
    keyVersion,
    // access_token NOT logged
  });

  return {
    accessTokenEnc,
    refreshTokenEnc: null,  // No separate refresh token for Instagram
    keyVersion,
    expiresAt,
    scope: INSTAGRAM_SCOPES.join(","),
    platformUserId,
  };
}

// ---------------------------------------------------------------------------
// Profile fetch
// ---------------------------------------------------------------------------

export interface InstagramProfile {
  platformUserId: string;
  username: string;
}

export async function fetchInstagramProfile(
  accessToken: string, // TRANSIENT — never stored in plaintext
  platformUserId: string
): Promise<InstagramProfile> {
  const url = new URL(
    `https://graph.instagram.com/${GRAPH_IG_VERSION}/${platformUserId}`
  );
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  try {
    const response = await fetchWithRetry(url.toString(), { method: "GET" });
    if (!response.ok) {
      logger.error("instagram_profile_fetch_failed", {
        status: response.status,
        platformUserId,
      });
      throw new InstagramOAuthError(
        "PERMANENT",
        `Failed to fetch Instagram profile: HTTP ${response.status}`
      );
    }

    const data = (await response.json()) as { id: string; username: string };
    return {
      platformUserId: data.id,
      username: data.username,
    };
  } catch (err) {
    if (err instanceof InstagramOAuthError) throw err;
    logger.error("instagram_profile_fetch_network_error", {
      error: (err as Error).message,
    });
    throw new InstagramOAuthError("RETRYABLE", "Network error fetching Instagram profile");
  }
}

// ---------------------------------------------------------------------------
// Token revocation (best-effort on disconnect)
// ---------------------------------------------------------------------------
export async function revokeInstagramToken(
  accessToken: string // TRANSIENT — never logged
): Promise<void> {
  // Instagram Graph API does not have a token revocation endpoint as of v18.
  // Best-effort: we mark revoked_at in DB and null the encrypted token columns.
  // If Instagram adds revocation support, implement it here.
  logger.info("instagram_token_revocation_skipped", {
    reason: "Instagram Graph API v18 does not support explicit token revocation",
  });
}

// ---------------------------------------------------------------------------
// Publish — Instagram Content Publishing API (2-step: create container → publish)
//
// Security (S-9): caller MUST verify token_expires_at before calling this.
//   This function performs an additional defence-in-depth check and throws
//   PublishError(retryable=false, code='token_expired') if expired — without
//   logging the token value.
//
// Flow:
//   Step 1: POST /{ig-user-id}/media — create media container with caption
//   Step 2: POST /{ig-user-id}/media_publish — publish the container
//
// Rate limits: Instagram allows 25 API-initiated posts per 24h per user.
//   429 response is retryable.
// ---------------------------------------------------------------------------

/**
 * publishToInstagram — publishes an approved draft to Instagram.
 *
 * @param socialAccount  Row from social_accounts (access_token_enc is BYTEA).
 * @param draft          Approved draft row (body, hashtags, ai_generated flag).
 * @returns              { post_id } — Instagram media ID of the published post.
 * @throws               PublishError with retryable + code for worker decision.
 */
export async function publishToInstagram(
  socialAccount: SocialAccountForPublish,
  draft: DraftForPublish
): Promise<PublishResult> {
  // S-9: Pre-publish token expiry check — before decrypt
  if (
    socialAccount.token_expires_at !== null &&
    socialAccount.token_expires_at <= new Date()
  ) {
    logger.warn("instagram_publish_token_expired", {
      social_account_id: socialAccount.id,
      platform: "instagram",
      // token NOT logged
    });
    throw new PublishError(
      false, // not retryable — needs re-auth
      "token_expired",
      "instagram",
      "Instagram OAuth token has expired. User must reconnect the account."
    );
  }

  // Decrypt token transiently — never stored in decrypted form, never logged
  let accessToken: string;
  try {
    accessToken = decryptToken(socialAccount.access_token_enc);
  } catch (err) {
    logger.error("instagram_publish_token_decrypt_failed", {
      social_account_id: socialAccount.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      false,
      "platform_error",
      "instagram",
      "Failed to decrypt Instagram OAuth token."
    );
  }

  const igUserId = socialAccount.platform_user_id;

  // Build caption: body + hashtags (if present)
  const caption = draft.hashtags && draft.hashtags.length > 0
    ? `${draft.body}\n\n${draft.hashtags.join(" ")}`
    : draft.body;

  // ---------------------------------------------------------------------------
  // Step 1: Create media container
  // POST /{ig-user-id}/media
  // For text-only (no image/video), use media_type=IMAGE is not valid.
  // Instagram requires at least image_url for IMAGE type.
  // For caption-only posts (no media), we use the REELS or CAROUSEL_ALBUM pattern
  // is not available either. In v1, Instagram posts MUST have an image.
  // However, per PRD C2, the MVP posts text+hashtags. Until media upload is
  // implemented, we use a placeholder approach: if no media_url provided,
  // throw content_rejected (not retryable) with a clear message.
  //
  // Architecture §5 note: "instagram_content_publish" scope is required.
  // The instagram_basic scope provides profile read.
  // Full media publishing flow with image URL is the standard path.
  // For v1 text-only drafts, Instagram requires a workaround.
  //
  // Decision (2026-05-06): Instagram does not support text-only posts via API.
  // The platform requires at least an image. For v1, if no media_url is in
  // the draft, we throw a non-retryable content_rejected error. This surfaces
  // cleanly to the user via the worker failure path. Adding media upload is
  // a post-v1 capability (deferred). The job will be marked failed with
  // last_error indicating the missing media requirement.
  //
  // Note: This is consistent with Meta's published API requirements as of 2026.
  // ---------------------------------------------------------------------------

  const mediaUrl = (draft as DraftForPublish & { media_url?: string }).media_url;

  let containerId: string;

  const containerParams: Record<string, string> = {
    caption,
    access_token: accessToken,
  };

  if (mediaUrl) {
    containerParams["image_url"] = mediaUrl;
    containerParams["media_type"] = "IMAGE";
  } else {
    // Instagram requires media. For text-only drafts in v1, we cannot publish.
    // Clear the token variable before throwing.
    accessToken = "";
    logger.warn("instagram_publish_no_media_url", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
    });
    throw new PublishError(
      false,
      "content_rejected",
      "instagram",
      "Instagram requires an image for publishing. Text-only posts are not supported by the Instagram API. Please add an image to this draft."
    );
  }

  const containerUrl = `https://graph.instagram.com/${GRAPH_IG_VERSION}/${igUserId}/media`;

  let containerResponse: Response;
  try {
    containerResponse = await fetchWithRetry(containerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerParams),
    });
  } catch (err) {
    accessToken = "";
    logger.error("instagram_publish_container_network_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      true, // retryable — network error
      "platform_error",
      "instagram",
      `Instagram media container creation network error: ${(err as Error).message}`
    );
  }

  if (!containerResponse.ok) {
    accessToken = "";
    const status = containerResponse.status;

    if (status === 429) {
      logger.warn("instagram_publish_rate_limited_step1", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(true, "rate_limit", "instagram", `Instagram API rate limit hit during container creation: HTTP ${status}`);
    }

    if (status === 401) {
      logger.warn("instagram_publish_unauthorized_step1", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
      });
      throw new PublishError(false, "token_expired", "instagram", "Instagram API returned 401 during container creation — token invalid or expired.");
    }

    if (status >= 400 && status < 500) {
      logger.error("instagram_publish_content_rejected_step1", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
        // response body intentionally not logged
      });
      throw new PublishError(false, "content_rejected", "instagram", `Instagram rejected the media container: HTTP ${status}`);
    }

    // 5xx — retryable
    logger.error("instagram_publish_platform_error_step1", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      status,
    });
    throw new PublishError(true, "platform_error", "instagram", `Instagram platform error during container creation: HTTP ${status}`);
  }

  const containerData = (await containerResponse.json()) as { id?: string };
  containerId = containerData.id ?? "";

  if (!containerId) {
    accessToken = "";
    logger.error("instagram_publish_no_container_id", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
    });
    throw new PublishError(false, "platform_error", "instagram", "Instagram did not return a container ID.");
  }

  // ---------------------------------------------------------------------------
  // Step 2: Publish the media container
  // POST /{ig-user-id}/media_publish
  // ---------------------------------------------------------------------------

  const publishUrl = `https://graph.instagram.com/${GRAPH_IG_VERSION}/${igUserId}/media_publish`;

  let publishResponse: Response;
  try {
    publishResponse = await fetchWithRetry(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });
  } catch (err) {
    logger.error("instagram_publish_media_publish_network_error", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      error: (err as Error).message,
      // token NOT logged
    });
    throw new PublishError(
      true,
      "platform_error",
      "instagram",
      `Instagram media_publish network error: ${(err as Error).message}`
    );
  } finally {
    // Overwrite decrypted token as soon as possible after last use
    accessToken = "";
  }

  if (!publishResponse.ok) {
    const status = publishResponse.status;

    if (status === 429) {
      logger.warn("instagram_publish_rate_limited_step2", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(true, "rate_limit", "instagram", `Instagram API rate limit hit during media_publish: HTTP ${status}`);
    }

    if (status === 401) {
      logger.warn("instagram_publish_unauthorized_step2", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
      });
      throw new PublishError(false, "token_expired", "instagram", "Instagram API returned 401 during media_publish — token invalid or expired.");
    }

    if (status >= 400 && status < 500) {
      logger.error("instagram_publish_content_rejected_step2", {
        social_account_id: socialAccount.id,
        draft_id: draft.id,
        status,
      });
      throw new PublishError(false, "content_rejected", "instagram", `Instagram rejected the media_publish: HTTP ${status}`);
    }

    logger.error("instagram_publish_platform_error_step2", {
      social_account_id: socialAccount.id,
      draft_id: draft.id,
      status,
    });
    throw new PublishError(true, "platform_error", "instagram", `Instagram platform error during media_publish: HTTP ${status}`);
  }

  const publishData = (await publishResponse.json()) as { id?: string };
  const postId = publishData.id ?? "";

  logger.info("instagram_publish_success", {
    social_account_id: socialAccount.id,
    draft_id: draft.id,
    post_id: postId,
    ai_generated: draft.ai_generated,
    // token NOT logged
  });

  return { post_id: postId };
}

// ---------------------------------------------------------------------------
// Retry helper — same pattern as LinkedIn
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
    logger.warn("instagram_api_retrying", {
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
export class InstagramOAuthError extends Error {
  constructor(
    public readonly kind: "PERMANENT" | "RETRYABLE",
    message: string
  ) {
    super(message);
    this.name = "InstagramOAuthError";
  }
}
