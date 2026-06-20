/**
 * Integration router — dispatchPublish
 *
 * Routes a publish call to the correct platform adapter based on
 * socialAccount.platform. All adapters share the same SocialAccountForPublish
 * + DraftForPublish contract from @organic-posts/shared.
 *
 * Security:
 *  - S-9 (token expiry): each adapter performs a pre-decrypt expiry check.
 *    dispatchPublish is a thin router; it does not duplicate the check.
 *  - Token logging guard: each adapter's logger calls are scoped to metadata
 *    only — never the raw token value. This function passes through
 *    without touching token fields.
 *
 * Throws:
 *  - PublishError (retryable/non-retryable) from the underlying adapter.
 *  - Error with code 'unsupported_platform' if platform is not registered.
 *
 * Architecture refs:
 *  - §5 API contracts (C2 Scheduler, worker publish flow)
 *  - §11 Sub-processors (LinkedIn, Instagram/Meta)
 */

import { publishToLinkedIn } from "./linkedin";
import { publishToInstagram } from "./instagram";
import { publishToFacebook } from "./facebook";
import {
  PublishError,
  type SocialAccountForPublish,
  type DraftForPublish,
  type PublishResult,
} from "../../../../packages/shared/src/index";

/**
 * dispatchPublish — routes a publish job to the correct platform adapter.
 *
 * @param socialAccount  social_accounts row with encrypted token.
 * @param draft          Approved draft row.
 * @returns              { post_id } from the platform.
 * @throws               PublishError for retryable/permanent platform errors.
 *                       Error('unsupported_platform') for unknown platforms.
 */
export async function dispatchPublish(
  socialAccount: SocialAccountForPublish,
  draft: DraftForPublish
): Promise<PublishResult> {
  switch (socialAccount.platform) {
    case "linkedin":
      return publishToLinkedIn(socialAccount, draft);

    case "instagram":
      return publishToInstagram(socialAccount, draft);

    case "facebook":
      return publishToFacebook(socialAccount, draft);

    default: {
      // TypeScript exhaustiveness: if Platform type grows, this will error at
      // compile time if a new platform is not handled here.
      const _exhaustive: never = socialAccount.platform;
      throw new PublishError(
        false,
        "platform_error",
        socialAccount.platform as never,
        `Unsupported platform: ${socialAccount.platform}`
      );
    }
  }
}

// Re-export adapters for direct use if needed
export { publishToLinkedIn } from "./linkedin";
export { publishToInstagram } from "./instagram";
export { publishToFacebook } from "./facebook";
