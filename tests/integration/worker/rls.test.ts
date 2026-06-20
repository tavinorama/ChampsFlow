/**
 * Integration tests — BullMQ worker runtime RLS parity (cross-tenant isolation)
 *
 * Proves the worker now enforces Row-Level Security exactly like the API: a job
 * scoped to one tenant (runWithTenant) cannot read or write another tenant's
 * rows, because every query goes through the RLS-aware worker client
 * (apps/worker/src/db/rls-client.ts), which drops into the non-superuser
 * `app_user` role inside a transaction with app.current_tenant_id set.
 *
 * Before this fix the worker connected as the privileged login role (op/postgres)
 * and isolation rested SOLELY on explicit `WHERE tenant_id` filters — a single
 * omission would have leaked across tenants (docs/AUDIT-2026-06-13.md gap #6).
 *
 * The test exercises BOTH call styles the jobs use:
 *   - `.unsafe(sql, params)`  → publish.ts
 *   - tagged template + `sql.json` → audit-run.ts
 * and both scope states:
 *   - UNSCOPED (privileged) → the publish bootstrap lookup of a job's own row
 *   - SCOPED (app_user)     → all tenant-touching work
 *
 * NOTE: requires a live Postgres with migrations applied (incl. the runtime
 * enforcement migration 20260618000001 so the login role can SET ROLE app_user).
 * Skipped unless POSTGRES_TEST_URL is set — same gating as
 * tests/integration/db/rls.test.ts.
 *
 * Local dev: docker run -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:16
 * then POSTGRES_TEST_URL=postgres://postgres:test@localhost:5432/organic_posts_test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { withRlsContext } from "../../../apps/worker/src/db/rls-client";
import { runWithTenant } from "../../../apps/api/src/db/tenant-context";

const POSTGRES_TEST_URL = process.env["POSTGRES_TEST_URL"];
const skipIfNoDb = POSTGRES_TEST_URL ? describe : describe.skip;

// Valid v4-shaped UUIDs for the two isolation test tenants.
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

skipIfNoDb("Worker RLS — cross-tenant isolation through the worker DB client", () => {
  // `seed`: privileged connection for fixtures + out-of-band verification.
  // `sql`:  the RLS-wrapped worker client — the actual code under test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seed: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  let brandA = "";
  let brandB = "";

  beforeAll(async () => {
    seed = postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5 });
    sql = withRlsContext(postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5 }));

    // Seed as the privileged connection (RLS bypassed) so both tenants exist.
    await seed.unsafe(`DELETE FROM brands WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await seed.unsafe(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await seed.unsafe(
      `INSERT INTO tenants (id, name, plan, created_at)
       VALUES ($1, 'Tenant A', 'solo', NOW()), ($2, 'Tenant B', 'solo', NOW())`,
      [TENANT_A, TENANT_B]
    );
    const rows = await seed.unsafe(
      `INSERT INTO brands (id, tenant_id, name, region)
       VALUES (gen_random_uuid(), $1, 'Brand A', 'US'),
              (gen_random_uuid(), $2, 'Brand B', 'US')
       RETURNING id, tenant_id`,
      [TENANT_A, TENANT_B]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brandA = rows.find((r: any) => r.tenant_id === TENANT_A).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brandB = rows.find((r: any) => r.tenant_id === TENANT_B).id;
  });

  afterAll(async () => {
    if (seed) {
      await seed.unsafe(`DELETE FROM brands WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      await seed.unsafe(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      await seed.end({ timeout: 5 });
    }
    if (sql) await sql.end({ timeout: 5 });
  });

  it("CONTROL: outside a tenant scope the worker client runs privileged (publish bootstrap) and sees both tenants", async () => {
    // This is the publish-job bootstrap path: a job's own control row is read by
    // primary key before its tenant is known. No scope → privileged → RLS bypassed.
    const rows = await sql.unsafe(
      `SELECT tenant_id FROM brands WHERE tenant_id IN ($1, $2)`,
      [TENANT_A, TENANT_B]
    );
    expect(rows).toHaveLength(2);
  });

  it("a scoped job sees ONLY its tenant via an unfiltered tagged-template SELECT (audit-run path)", async () => {
    // No WHERE clause — isolation comes purely from RLS + the app_user role drop.
    const rows = await runWithTenant(TENANT_A, () => sql`SELECT tenant_id FROM brands`);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it("a scoped job cannot SELECT another tenant's rows even when asking by tenant_id (.unsafe path)", async () => {
    const rows = await runWithTenant(TENANT_A, () =>
      sql.unsafe(`SELECT * FROM brands WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(rows).toHaveLength(0);
  });

  it("a scoped job cannot UPDATE another tenant's rows (0 affected, B untouched)", async () => {
    const res = await runWithTenant(TENANT_A, () =>
      sql.unsafe(`UPDATE brands SET name = 'hijacked' WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0); // postgres-js: affected-row count
    const check = await seed.unsafe(`SELECT name FROM brands WHERE id = $1`, [brandB]);
    expect(check[0].name).toBe("Brand B");
  });

  it("a scoped job cannot DELETE another tenant's rows (0 affected, B still present)", async () => {
    const res = await runWithTenant(TENANT_A, () =>
      sql.unsafe(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0);
    const check = await seed.unsafe(`SELECT 1 FROM brands WHERE id = $1`, [brandB]);
    expect(check).toHaveLength(1);
  });

  it("a scoped job cannot move a row into another tenant (RLS WITH CHECK on write)", async () => {
    await expect(
      runWithTenant(TENANT_A, () =>
        sql.unsafe(`UPDATE brands SET tenant_id = $1 WHERE id = $2`, [TENANT_B, brandA])
      )
    ).rejects.toThrow();
    const check = await seed.unsafe(`SELECT tenant_id FROM brands WHERE id = $1`, [brandA]);
    expect(check[0].tenant_id).toBe(TENANT_A);
  });

  it("positive control: same-tenant writes still succeed under the scoped role", async () => {
    const res = await runWithTenant(TENANT_A, () =>
      sql.unsafe(`UPDATE brands SET name = 'Brand A renamed' WHERE tenant_id = $1`, [TENANT_A])
    );
    expect(res.count).toBe(1);
    await seed.unsafe(`UPDATE brands SET name = 'Brand A' WHERE id = $1`, [brandA]);
  });

  it("the wrapper plumbs tagged templates + sql.json through the scoped transaction (audit-run write shape)", async () => {
    // audit-run embeds ${sql.json(...)} inside tagged-template INSERTs; prove that
    // path works through the RLS wrapper (begin → set tenant + role → query).
    const rows = await runWithTenant(TENANT_A, () =>
      sql`SELECT ${sql.json({ ok: true })}::jsonb AS payload`
    );
    expect(rows[0].payload).toEqual({ ok: true });
  });
});
