/**
 * db-client.ts — the structural type of a database handle, and nothing else.
 *
 * WHY THIS LIVES IN packages/shared
 * These interfaces were born in apps/api/src/routes/social-accounts.ts — a
 * Hono route file. That was harmless while only the API imported them, and a
 * production outage the moment the worker did: #423 added
 * `import type { PostgresClient } from "../routes/social-accounts"` to
 * lib/credits.ts, the worker imported credits.ts, and the worker's tsc closure
 * suddenly contained five Hono route files whose dependencies (`hono`, `jose`)
 * the worker container never installs. Result: 12 consecutive FAILED worker
 * deploys (2026-08-05 21:10 → 2026-08-07), a worker running a build from
 * before #423, and a credit ledger with zero rows because the debit code had
 * never actually shipped.
 *
 * A TYPE must be importable from anywhere without dragging a runtime layer
 * with it. Route files register routes; shared types live here. The old
 * location re-exports these for its existing importers.
 */

/**
 * A transaction-scoped database handle. Exposes the same parameterized query
 * API as PostgresClient, but every query runs inside the enclosing transaction
 * opened by PostgresClient.transaction() — they commit together or roll back
 * together.
 */
export interface TxClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Sets app.current_tenant_id in the Postgres session (for RLS) */
  setTenantId(tenantId: string): Promise<void>;
  /**
   * Run `fn` inside a single explicit DB transaction. Every query issued via the
   * supplied TxClient commits together or rolls back together — if `fn` throws,
   * the transaction is rolled back and the error propagates. Use this for any
   * multi-statement mutation whose partial application would leave data in an
   * inconsistent state (e.g. the GDPR Art. 17 erasure cascade).
   *
   * Tenant context: if the current async context carries a tenant scope, the
   * transaction sets the RLS GUC + drops to app_user first (mirroring query());
   * unscoped contexts (e.g. super-admin) run as the privileged login role.
   *
   * `opts.mode` is appended to BEGIN (e.g. "read only isolation level
   * repeatable read") for read-only / snapshot-consistent read sequences.
   */
  transaction<T>(
    fn: (tx: TxClient) => Promise<T>,
    opts?: { mode?: string }
  ): Promise<T>;
}
