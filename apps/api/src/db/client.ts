/**
 * PostgresClient adapter — wraps the postgres-js sql client to implement
 * the PostgresClient interface expected by route modules.
 *
 * Architecture refs:
 *  - §4.1 RLS: app.current_tenant_id must be set before every query
 *  - §4 Ownership boundaries: all tenant-scoped queries run with the
 *    current_tenant_id Postgres session variable set
 *
 * RUNTIME RLS ENFORCEMENT (audit HIGH fix — see db/tenant-context.ts):
 *  When the current async context carries a tenant (set by requireAuth for
 *  authenticated, non-super-admin requests), every query runs inside a short
 *  transaction that:
 *    1. SET LOCAL app.current_tenant_id = <tenant>   (so RLS policies match)
 *    2. SET LOCAL ROLE app_user                      (drop privileges → RLS
 *       actually applies; a superuser/owner connection would otherwise bypass
 *       even FORCE ROW LEVEL SECURITY)
 *  Both are transaction-LOCAL, so they apply to the wrapped statement and reset
 *  when the connection returns to the pool — no cross-request leakage.
 *  Unscoped contexts (unauthenticated, provisioning, super-admin) run the query
 *  directly as the privileged login role, exactly as before.
 *
 * Hard rules:
 *  - Parameterized queries ONLY — no string interpolation in any SQL call
 *  - setTenantId uses a parameterized SET via postgres-js tagged template
 *  - No PII in error messages surfaced to callers
 */

import postgres from "postgres";
import type { PostgresClient } from "../routes/social-accounts";
import { appDbRole, currentTenantId, tenantStore } from "./tenant-context";

// ---------------------------------------------------------------------------
// Factory: wrap a postgres-js Sql instance into the PostgresClient interface
// ---------------------------------------------------------------------------

export function createPostgresClient(sql: postgres.Sql): PostgresClient {
  return {
    /**
     * Execute a parameterized SQL query.
     *
     * postgres-js uses tagged template literals for parameterization.
     * This adapter bridges the { sql: string, params: unknown[] } interface
     * that the route modules use with postgres-js's internal escaping.
     *
     * Hard rule #1: postgres-js handles all parameter binding — no string
     * interpolation at any call site.
     */
    async query<T = unknown>(
      sqlStr: string,
      params: unknown[] = []
    ): Promise<{ rows: T[] }> {
      const tenantId = currentTenantId();

      // Unscoped context (unauthenticated / provisioning / super-admin): run as
      // the privileged login role, exactly as before. No RLS context applied.
      if (!tenantId) {
        const rows = await sql.unsafe(sqlStr, params as postgres.ParameterOrJSON<never>[]);
        return { rows: rows as unknown as T[] };
      }

      // Tenant-scoped: wrap in a transaction so the LOCAL settings actually
      // stick for the statement. set_config(..., is_local=true) === SET LOCAL.
      // Order matters: set the tenant GUC as the privileged role first, THEN
      // drop into app_user so the real query is subject to RLS.
      const role = appDbRole();
      return sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        await tx`SELECT set_config('role', ${role}, true)`;
        const rows = await tx.unsafe(sqlStr, params as postgres.ParameterOrJSON<never>[]);
        return { rows: rows as unknown as T[] };
      }) as Promise<{ rows: T[] }>;
    },

    /**
     * Set the tenant scope for subsequent queries on this async context.
     *
     * Runtime RLS now flows through the AsyncLocalStorage tenant scope that
     * requireAuth establishes per request (see db/tenant-context.ts), so the
     * per-query transaction in query() always picks up the right tenant. This
     * method is retained for backward-compatibility with the ~45 existing call
     * sites and for code paths that set the tenant explicitly: when a scope is
     * active it updates that scope; otherwise it is a safe no-op (the prior
     * implementation's SET LOCAL outside a transaction had no lasting effect
     * anyway, so this changes no behavior for unscoped callers).
     */
    async setTenantId(tenantId: string): Promise<void> {
      const store = tenantStore.getStore();
      if (store) store.tenantId = tenantId;
    },

    /**
     * Run `fn` inside a single explicit transaction (sql.begin). Every query
     * issued through the supplied handle runs on the same connection/transaction
     * and is committed atomically; if `fn` throws, postgres-js rolls the whole
     * transaction back and the error propagates to the caller.
     *
     * This mirrors the per-query RLS wrapping in query(): when the async context
     * carries a tenant scope we set the tenant GUC and drop into app_user FIRST,
     * so the transaction body is subject to RLS exactly like a normal scoped
     * query. Unscoped contexts (unauthenticated / provisioning / super-admin)
     * run the transaction directly as the privileged login role.
     *
     * `opts.mode` is forwarded to BEGIN (e.g. "read only isolation level
     * repeatable read") so read-only sequences can take a consistent snapshot.
     */
    async transaction<T>(
      fn: (tx: { query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[] }> }) => Promise<T>,
      opts: { mode?: string } = {}
    ): Promise<T> {
      const tenantId = currentTenantId();

      const run = async (tx: postgres.TransactionSql): Promise<T> => {
        if (tenantId) {
          const role = appDbRole();
          await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
          await tx`SELECT set_config('role', ${role}, true)`;
        }
        const txClient = {
          async query<R = unknown>(
            sqlStr: string,
            params: unknown[] = []
          ): Promise<{ rows: R[] }> {
            const rows = await tx.unsafe(
              sqlStr,
              params as postgres.ParameterOrJSON<never>[]
            );
            return { rows: rows as unknown as R[] };
          },
        };
        return fn(txClient);
      };

      const result = opts.mode
        ? await sql.begin(opts.mode, run)
        : await sql.begin(run);
      return result as T;
    },
  };
}

/**
 * Boot-time guard for the RLS enforcement role. Runtime tenant isolation rests
 * entirely on every scoped query dropping into a NON-superuser, non-BYPASSRLS
 * role (appDbRole()). A misconfiguration — APP_DB_ROLE pointed at a superuser,
 * the role missing, or the login role lacking membership to assume it — would
 * SILENTLY disable RLS on every request. So we verify it once, loudly, at
 * startup and refuse to serve traffic otherwise. Throws on any failure.
 */
export async function assertAppDbRoleSafe(sql: postgres.Sql): Promise<void> {
  const role = appDbRole();

  const meta = (await sql`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${role}
  `) as unknown as Array<{ rolsuper: boolean; rolbypassrls: boolean }>;

  if (!meta[0]) {
    throw new Error(
      `RLS role "${role}" does not exist. Apply migrations (it is created in the initial schema) or set APP_DB_ROLE to your non-superuser application role.`
    );
  }
  if (meta[0].rolsuper || meta[0].rolbypassrls) {
    throw new Error(
      `RLS role "${role}" is a superuser/BYPASSRLS role — Row-Level Security would be silently disabled. APP_DB_ROLE must be a non-privileged role.`
    );
  }

  // Verify the runtime role-drop actually takes effect on this connection
  // (catches a login role that isn't a member of the app role, e.g. on a
  // managed DB missing the GRANT in migration 20260618000001).
  const got = (await sql.begin(async (tx) => {
    await tx`SELECT set_config('role', ${role}, true)`;
    const who = (await tx`SELECT current_user AS u`) as unknown as Array<{ u: string }>;
    return who[0]?.u;
  })) as unknown as string;

  if (got !== role) {
    throw new Error(
      `Could not assume RLS role "${role}" (current_user resolved to "${got}"). The login role must be a member of "${role}" — see migration 20260618000001.`
    );
  }
}
