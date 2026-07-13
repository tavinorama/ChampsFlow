/**
 * Resolve a tenant's owner email — the ultimate fallback for deliverables/
 * notification emails when Stripe has no email on the checkout session OR the
 * customer (observed on 100%-off subscription checkouts). On a subscription
 * grant the tenant is always known, so this guarantees the buyer is reachable.
 *
 * Never throws — returns null on any failure so it can't break the webhook.
 */

import type { PostgresClient } from "../routes/social-accounts";

export async function ownerEmailForTenant(
  db: PostgresClient,
  tenantId: string | null | undefined
): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const { rows } = await db.query<{ email: string }>(
      `SELECT email
         FROM users
        WHERE tenant_id = $1
          AND role = 'owner'
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`,
      [tenantId]
    );
    return rows[0]?.email ?? null;
  } catch {
    return null;
  }
}
