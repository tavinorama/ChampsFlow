/**
 * tenant-context.ts — per-request tenant scope for runtime RLS enforcement.
 *
 * The problem this solves (audit HIGH finding, "runtime RLS inert"):
 *   - The API connects to Postgres as a privileged role (postgres/op), which
 *     BYPASSES Row-Level Security even with FORCE ROW LEVEL SECURITY.
 *   - The old setTenantId() ran `set_config(..., is_local=true)` OUTSIDE any
 *     transaction, so the LOCAL setting reset immediately (postgres-js
 *     autocommit) and never reached the next query.
 *   Net effect: isolation rested only on explicit `WHERE tenant_id` filters.
 *
 * The fix (see db/client.ts): carry the authenticated tenant id in an
 * AsyncLocalStorage scope established by requireAuth, then have every query run
 * inside a short transaction that (1) sets app.current_tenant_id and (2) drops
 * into the non-privileged role `app_user` via `set_config('role', …)`. Dropping
 * privileges is what *activates* RLS; the transaction is what makes the LOCAL
 * settings stick for the statement and reset cleanly on the pooled connection.
 *
 * Scope boundary (intentional):
 *   - Authenticated, non-super-admin requests  → run inside a tenant scope
 *     (RLS enforced as app_user).
 *   - Unauthenticated / system / provisioning / super-admin requests → NO scope
 *     (run as the privileged login role, exactly as before). Provisioning must
 *     create tenants; super-admins (organicposts_admin design) are cross-tenant.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantStore {
  tenantId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantStore>();

/** Run `fn` (and everything it awaits) with the given tenant in scope. */
export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStore.run({ tenantId }, fn);
}

/** The tenant id for the current async context, or undefined if unscoped. */
export function currentTenantId(): string | undefined {
  return tenantStore.getStore()?.tenantId;
}

/**
 * The Postgres role the runtime drops into for tenant-scoped queries. Must be a
 * NON-superuser, non-BYPASSRLS role (so RLS applies) that has the table grants
 * the app needs. Defaults to `app_user` (created in the initial migration).
 * Overridable per-deploy via APP_DB_ROLE for managed databases whose
 * application role differs.
 */
export function appDbRole(): string {
  const r = process.env["APP_DB_ROLE"];
  return r && r.trim().length > 0 ? r.trim() : "app_user";
}
