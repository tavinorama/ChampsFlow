/**
 * rls-client.ts — worker Postgres client with runtime RLS enforcement.
 *
 * Brings the BullMQ worker to parity with the API (apps/api/src/db/client.ts).
 *
 * The worker connects to Postgres as the privileged login role (op / postgres),
 * which BYPASSES Row-Level Security even under FORCE ROW LEVEL SECURITY. The API
 * already solved this: every tenant-scoped query runs inside a short transaction
 * that
 *   1. SET LOCAL app.current_tenant_id = <tenant>   (so RLS policies match), then
 *   2. SET LOCAL ROLE app_user                      (drop privileges → RLS applies).
 * Both are transaction-LOCAL, so they apply to the wrapped statement and reset
 * when the connection returns to the pool — no cross-job leakage.
 *
 * This module REUSES the API's AsyncLocalStorage tenant scope
 * (apps/api/src/db/tenant-context.ts) so both layers share one definition of
 * "the current tenant" and the app role. Job processors enter the scope with
 * runWithTenant(tenantId, …); inside that scope every query through the wrapped
 * client is RLS-enforced. Outside a scope (e.g. the publish bootstrap lookup of a
 * job's own control row by primary key, before its tenant is known) queries run
 * as the privileged login role — exactly as the API's unscoped paths do.
 *
 * Hard rules (mirrors apps/api/src/db/client.ts):
 *  - Parameterized queries ONLY — no string interpolation at any call site.
 *  - Set the tenant GUC as the privileged role FIRST, then drop into app_user.
 *  - Both settings are transaction-LOCAL → the pooled connection stays clean.
 */

import postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";
import { appDbRole, currentTenantId } from "../../../api/src/db/tenant-context";

// ---------------------------------------------------------------------------
// Factory: the worker's postgres-js client (pooled, modest limits).
// Lives here (not in jobs/) so the boot guard and every job share one factory.
// ---------------------------------------------------------------------------

export function createWorkerDb(): postgres.Sql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for worker");
  }
  return postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: (notice) => {
      logger.warn("worker_postgres_notice", { message: notice.message });
    },
  });
}

// ---------------------------------------------------------------------------
// RLS wrapper
//
// Wrap a postgres-js client so that, when a tenant scope is active
// (runWithTenant), each query runs inside a transaction that sets the tenant GUC
// and drops into app_user — activating RLS. When no scope is active the call
// passes straight through to the privileged connection (the bootstrap path).
//
// The wrapper preserves the subset of the postgres-js surface the worker jobs
// use: tagged-template calls (`sql`…``), `.unsafe`, `.json`, `.begin`, `.end`.
// It is typed as `postgres.Sql` for drop-in compatibility with the existing job
// code; only that subset is implemented at runtime. postgres-js's own type
// surface is large and overloaded, so the assembled object is built untyped and
// cast once at the boundary.
// ---------------------------------------------------------------------------

export function withRlsContext(baseSql: postgres.Sql): postgres.Sql {
  // Run `fn` inside a transaction scoped to the active tenant + app_user. The
  // LOCAL settings reset on COMMIT/ROLLBACK, so the pooled connection is clean
  // for the next job. Order matters: set the GUC as the privileged role first,
  // THEN drop into app_user so the real query is subject to RLS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (tenantId: string, run: (tx: any) => unknown): Promise<unknown> => {
    const role = appDbRole();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return baseSql.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`SELECT set_config('role', ${role}, true)`;
      return run(tx);
    }) as Promise<unknown>;
  };

  // The callable form is a tagged-template query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: any = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const tenantId = currentTenantId();
    if (!tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (baseSql as any)(strings, ...values);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return scoped(tenantId, (tx: any) => tx(strings, ...values));
  };

  // .unsafe(sqlStr, params)
  wrapped.unsafe = (sqlStr: string, params?: unknown[]) => {
    const tenantId = currentTenantId();
    if (!tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (baseSql as any).unsafe(sqlStr, params);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return scoped(tenantId, (tx: any) => tx.unsafe(sqlStr, params));
  };

  // Pure helpers / lifecycle — pass straight through to the underlying client.
  // `json` builds a connection-agnostic parameter descriptor, so it is reused
  // unchanged inside a scoped transaction's tagged template.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapped.json = (value: unknown) => (baseSql as any).json(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapped.begin = (...args: unknown[]) => (baseSql as any).begin(...args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapped.end = (...args: unknown[]) => (baseSql as any).end(...args);

  return wrapped as postgres.Sql;
}

// ---------------------------------------------------------------------------
// Boot guard (mirrors apps/api/src/db/client.ts → assertAppDbRoleSafe).
//
// Runtime tenant isolation rests entirely on every scoped query dropping into a
// NON-superuser, non-BYPASSRLS role (appDbRole()). A misconfiguration —
// APP_DB_ROLE pointed at a superuser, the role missing, or the worker's login
// role lacking membership to assume it — would SILENTLY disable RLS on every
// job. So we verify it once, loudly, at boot and refuse to process jobs
// otherwise. Throws on any failure. Run against a RAW client (createWorkerDb()),
// not the RLS wrapper.
// ---------------------------------------------------------------------------

export async function assertWorkerAppDbRoleSafe(sql: postgres.Sql): Promise<void> {
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
  // (catches a login role that isn't a member of the app role, e.g. on a managed
  // DB missing the GRANT in migration 20260618000001).
  const got = (await sql.begin(async (tx) => {
    await tx`SELECT set_config('role', ${role}, true)`;
    const who = (await tx`SELECT current_user AS u`) as unknown as Array<{ u: string }>;
    return who[0]?.u;
  })) as unknown as string;

  if (got !== role) {
    throw new Error(
      `Could not assume RLS role "${role}" (current_user resolved to "${got}"). The worker's login role must be a member of "${role}" — see migration 20260618000001.`
    );
  }
}
