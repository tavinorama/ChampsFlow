/**
 * Integration tests — DSR erasure cascade atomicity (GDPR Art. 17 integrity)
 *
 * Regression for the residual flagged in docs/AUDIT-2026-06-13.md "Residual":
 *  POST /api/dsr/:id/fulfill (erasure) ran its four-step cascade
 *    1. DELETE FROM drafts
 *    2. SELECT pseudonymize_generation_log_for_erasure(...)
 *    3. UPDATE social_accounts (revoke tokens)
 *    4. UPDATE users (soft-delete)
 *  as four SEPARATE autocommitted statements with NO surrounding transaction.
 *  A failure after step 1 left the data subject's personal data PARTIALLY
 *  erased — an Art. 17 integrity violation.
 *
 *  Fix: the cascade now runs inside a single PostgresClient.transaction()
 *  (sql.begin) — all four steps commit together or roll back together.
 *
 * Two layers of coverage:
 *  1. Deterministic (no DB): drive createPostgresClient() with a fake `sql`
 *     that models commit/rollback. Proves the helper opens ONE transaction,
 *     a mid-cascade throw aborts it (rollback, never commit), and later steps
 *     never run. Always runs in CI.
 *  2. Live Postgres (POSTGRES_TEST_URL set): force step 2 to throw and assert
 *     step 1's DELETE was actually rolled back in a real database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPostgresClient } from "../../../apps/api/src/db/client";
import { runWithTenant } from "../../../apps/api/src/db/tenant-context";
// Import the SHIPPED cascade so the test validates the real code path — if a
// step is ever moved outside db.transaction() in the route, this test catches it.
import { runErasureCascade } from "../../../apps/api/src/routes/dsr";

// ---------------------------------------------------------------------------
// Fake postgres-js `sql` that models transaction commit/rollback semantics.
// ---------------------------------------------------------------------------

interface ExecutedStmt {
  sql: string;
  params?: unknown[];
  tagged: boolean;
}

function makeFakeSql(opts: { failOn?: RegExp } = {}) {
  const executed: ExecutedStmt[] = [];
  const beginModes: Array<string | undefined> = [];
  let begins = 0;
  let commits = 0;
  let rollbacks = 0;

  // The transaction handle: callable as a tagged template (for set_config)
  // and carrying `.unsafe` for parameterized statements.
  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    executed.push({ sql: strings.join("?"), params: values, tagged: true });
    return Promise.resolve([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  tx.unsafe = (sqlStr: string, params: unknown[] = []) => {
    executed.push({ sql: sqlStr, params, tagged: false });
    if (opts.failOn && opts.failOn.test(sqlStr)) {
      return Promise.reject(new Error(`simulated DB failure on: ${sqlStr}`));
    }
    return Promise.resolve([]);
  };

  // sql.begin(cb) | sql.begin(mode, cb): runs cb on a real connection inside a
  // transaction. On success → COMMIT; on throw → ROLLBACK + rethrow. The fake
  // mirrors exactly that contract so a rejection means "rolled back".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const begin = async (a: any, b?: any) => {
    begins++;
    const mode: string | undefined = typeof a === "string" ? a : undefined;
    const cb: (t: unknown) => Promise<unknown> = typeof a === "string" ? b : a;
    beginModes.push(mode);
    try {
      const result = await cb(tx);
      commits++;
      return result;
    } catch (err) {
      rollbacks++;
      throw err;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql = { begin } as any;
  return {
    sql,
    executed,
    stats: () => ({ begins, commits, rollbacks, beginModes }),
  };
}

// ---------------------------------------------------------------------------
// Deterministic — no DB required
// ---------------------------------------------------------------------------

describe("DSR erasure cascade — atomicity (no DB)", () => {
  const USER = "user-to-erase";
  const TENANT = "tenant-1";

  it("runs all four steps inside ONE transaction and commits once (happy path)", async () => {
    const { sql, executed, stats } = makeFakeSql();
    const db = createPostgresClient(sql);

    await db.transaction((tx) => runErasureCascade(tx, USER, TENANT));

    const s = stats();
    expect(s.begins).toBe(1); // exactly one transaction opened
    expect(s.commits).toBe(1); // committed
    expect(s.rollbacks).toBe(0);

    // Unscoped (no tenant in async context, like the super-admin route): the
    // four data statements run, with NO set_config tenant/role tagged calls.
    const dataStmts = executed.filter((e) => !e.tagged);
    expect(dataStmts).toHaveLength(4);
    expect(dataStmts[0]?.sql).toContain("DELETE FROM drafts");
    expect(dataStmts[1]?.sql).toContain("pseudonymize_generation_log_for_erasure");
    expect(dataStmts[2]?.sql).toContain("UPDATE social_accounts");
    expect(dataStmts[3]?.sql).toContain("UPDATE users");
    expect(executed.some((e) => e.tagged)).toBe(false);
  });

  it("rolls the whole cascade back when step 2 throws — step 1's DELETE is undone", async () => {
    // Force the generation_log pseudonymization (step 2) to fail.
    const { sql, executed, stats } = makeFakeSql({
      failOn: /pseudonymize_generation_log_for_erasure/,
    });
    const db = createPostgresClient(sql);

    await expect(
      db.transaction((tx) => runErasureCascade(tx, USER, TENANT))
    ).rejects.toThrow(/simulated DB failure/);

    const s = stats();
    expect(s.begins).toBe(1);
    expect(s.commits).toBe(0); // NEVER committed
    expect(s.rollbacks).toBe(1); // transaction rolled back → step 1 DELETE undone

    // Step 1 (DELETE drafts) and step 2 (pseudonymize) were issued inside the
    // now-rolled-back transaction; steps 3 and 4 never executed because step 2
    // threw and aborted the cascade.
    const dataStmts = executed.filter((e) => !e.tagged);
    expect(dataStmts).toHaveLength(2); // execution stopped at the failure
    expect(dataStmts[0]?.sql).toContain("DELETE FROM drafts");
    expect(dataStmts.some((e) => /pseudonymize/.test(e.sql))).toBe(true);
    expect(dataStmts.some((e) => /UPDATE social_accounts/.test(e.sql))).toBe(false);
    expect(dataStmts.some((e) => /UPDATE users/.test(e.sql))).toBe(false);
  });

  it("sets the RLS GUC + drops to app_user FIRST when an async tenant scope is active", async () => {
    const { sql, executed } = makeFakeSql();
    const db = createPostgresClient(sql);

    await runWithTenant("tenant-xyz", async () => {
      await db.transaction((tx) => tx.query(`DELETE FROM drafts WHERE user_id = $1`, ["u"]));
    });

    const tagged = executed.filter((e) => e.tagged);
    expect(tagged).toHaveLength(2);
    expect(tagged[0]?.sql).toContain("set_config");
    expect(tagged[0]?.params).toContain("tenant-xyz");
    expect(tagged[1]?.sql).toContain("set_config");
    expect(tagged[1]?.params).toContain("app_user"); // dropped to non-superuser role
  });

  it("forwards opts.mode to BEGIN for the read-only export snapshot", async () => {
    const { sql, stats } = makeFakeSql();
    const db = createPostgresClient(sql);

    await db.transaction((tx) => tx.query(`SELECT 1`), {
      mode: "read only isolation level repeatable read",
    });

    expect(stats().beginModes).toEqual(["read only isolation level repeatable read"]);
  });
});

// ---------------------------------------------------------------------------
// Live Postgres — only when POSTGRES_TEST_URL is set (real rollback proof)
// ---------------------------------------------------------------------------

const POSTGRES_TEST_URL = process.env["POSTGRES_TEST_URL"];
const skipIfNoDb = POSTGRES_TEST_URL ? describe : describe.skip;

// Valid v4-shaped UUID for the atomicity test tenant.
const TENANT_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

skipIfNoDb("DSR erasure cascade — atomicity (live Postgres)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5 });

    // Seed a tenant + brand row as the privileged connection (RLS bypassed).
    // We use `brands` as a stand-in mutable table — the route deletes `drafts`,
    // but the atomicity guarantee under test is table-agnostic: a throw mid-
    // transaction must undo the preceding DELETE.
    await sql.unsafe(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_E]);
    await sql.unsafe(`DELETE FROM tenants WHERE id = $1`, [TENANT_E]);
    await sql.unsafe(
      `INSERT INTO tenants (id, name, plan, created_at) VALUES ($1, 'Tenant E', 'solo', NOW())`,
      [TENANT_E]
    );
    await sql.unsafe(
      `INSERT INTO brands (id, tenant_id, name, region)
       VALUES (gen_random_uuid(), $1, 'Erase Me', 'US')`,
      [TENANT_E]
    );
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_E]);
    await sql.unsafe(`DELETE FROM tenants WHERE id = $1`, [TENANT_E]);
    await sql.end({ timeout: 5 });
  });

  it("a throw after step 1's DELETE rolls the DELETE back (row survives)", async () => {
    const db = createPostgresClient(sql);

    // Mirrors the super-admin/unscoped route: no async tenant scope, so the
    // transaction runs as the privileged login role with explicit WHERE.
    await expect(
      db.transaction(async (tx) => {
        await tx.query(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_E]); // step 1
        throw new Error("boom: simulating step-2 failure"); // step 2 fails
      })
    ).rejects.toThrow(/boom/);

    // The DELETE must have been rolled back — the row is still there.
    const rows = await sql.unsafe(`SELECT name FROM brands WHERE tenant_id = $1`, [TENANT_E]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Erase Me");
  });

  it("positive control: a clean transaction commits the DELETE", async () => {
    const db = createPostgresClient(sql);

    await db.transaction(async (tx) => {
      await tx.query(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_E]);
    });

    const rows = await sql.unsafe(`SELECT 1 FROM brands WHERE tenant_id = $1`, [TENANT_E]);
    expect(rows).toHaveLength(0); // committed
  });
});
