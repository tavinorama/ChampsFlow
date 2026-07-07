/**
 * API-side platform-key refresh — fetches override rows with the api's
 * postgres adapter and applies them via the shared module. Runs unscoped
 * (no tenant context): platform_provider_key has RLS with no policies, so
 * only the privileged login role can read it.
 */

import { applyPlatformKeyOverrides } from "../../../../packages/shared/src/platform-keys";
import { logger } from "../../../../packages/shared/src/logger";
import type { PostgresClient } from "../routes/social-accounts";

export async function refreshPlatformKeys(db: PostgresClient): Promise<number> {
  return applyPlatformKeyOverrides(
    async () => {
      const res = await db.query<{ provider: string; key_encrypted: Buffer | Uint8Array }>(
        `SELECT provider, key_encrypted FROM platform_provider_key`
      );
      return res.rows;
    },
    (event, meta) => logger.info(event, meta as Record<string, string>)
  );
}
