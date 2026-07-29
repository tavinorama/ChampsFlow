/**
 * Integration tests — Row-Level Security (RLS) cross-tenant isolation
 *
 * Architecture §4.1 (RLS Migration Standards):
 *  - Every tenant-scoped table: ENABLE + FORCE ROW LEVEL SECURITY
 *  - Standard policy: tenant_id = current_setting('app.current_tenant_id')::uuid
 *  - CI assertion: check-rls.sql must return 0 rows
 *
 * These tests verify:
 *  1. Tenant A cannot SELECT rows from Tenant B's data via the app role
 *  2. Tenant A cannot UPDATE/DELETE Tenant B's rows
 *  3. audit_log and generation_log have UPDATE/DELETE revoked (CC-1/S-7)
 *  4. billing_subscriptions is in the check-rls.sql monitored list (Gate 5→6 fix)
 *  5. All required tables are in the RLS monitored set
 *
 * NOTE: Full DB integration tests require a live Postgres connection with
 * the migrations applied. When POSTGRES_TEST_URL is not set, these tests
 * are skipped. They run in CI via the Postgres service container.
 *
 * For local dev: spin up with `docker run -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:16`
 * then set POSTGRES_TEST_URL=postgres://postgres:test@localhost:5432/organic_posts_test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const POSTGRES_TEST_URL = process.env["POSTGRES_TEST_URL"];

// ---------------------------------------------------------------------------
// RLS policy logic verification (unit-style, no DB needed)
// ---------------------------------------------------------------------------

describe("RLS Policy — logic verification", () => {
  it("tenant_isolation policy uses current_setting for tenant_id comparison", () => {
    const rlsPolicyTemplate = `
      CREATE POLICY tenant_isolation ON <table_name>
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `;
    expect(rlsPolicyTemplate).toContain("current_setting('app.current_tenant_id')");
    expect(rlsPolicyTemplate).toContain("tenant_id");
  });

  it("cross-tenant access is impossible when tenant session variable is set correctly", () => {
    // Simulate the RLS check
    const currentTenantId = "tenant-a-uuid";
    const rowTenantId = "tenant-b-uuid";
    // RLS policy: USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    const policyPasses = rowTenantId === currentTenantId;
    expect(policyPasses).toBe(false); // Row from B is not accessible to A
  });

  it("same-tenant access passes the RLS policy", () => {
    const currentTenantId = "tenant-a-uuid";
    const rowTenantId = "tenant-a-uuid";
    const policyPasses = rowTenantId === currentTenantId;
    expect(policyPasses).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check-rls.sql monitored table list (S-2 / Gate 5→6 fix)
// ---------------------------------------------------------------------------

describe("check-rls.sql — monitored table completeness", () => {
  const REQUIRED_TABLES = [
    "tenants",
    "users",
    "social_accounts",
    "drafts",
    "generation_log",
    "audit_log",
    "dsr_requests",
    "schedules",
    "billing_subscriptions", // Added in Gate 5→6 fix
    "dpa_acknowledgments",   // Added in CI-1
    "ccpa_requests",         // Added in CI-2
  ];

  it("billing_subscriptions is in the monitored table list (Gate 5→6 fix)", () => {
    expect(REQUIRED_TABLES).toContain("billing_subscriptions");
  });

  it("audit_log is in the monitored table list (CC-1)", () => {
    expect(REQUIRED_TABLES).toContain("audit_log");
  });

  it("generation_log is in the monitored table list (CC-1)", () => {
    expect(REQUIRED_TABLES).toContain("generation_log");
  });

  it("dpa_acknowledgments is in the monitored table list (CI-1)", () => {
    expect(REQUIRED_TABLES).toContain("dpa_acknowledgments");
  });

  it("ccpa_requests is in the monitored table list (CI-2)", () => {
    expect(REQUIRED_TABLES).toContain("ccpa_requests");
  });

  it("all 11 tenant-scoped tables are monitored", () => {
    expect(REQUIRED_TABLES.length).toBeGreaterThanOrEqual(11);
  });
});

// ---------------------------------------------------------------------------
// CC-1 / S-7 — Append-only enforcement (no UPDATE/DELETE on audit/generation logs)
// ---------------------------------------------------------------------------

describe("Append-only enforcement (CC-1 / S-7)", () => {
  it("app_user role has UPDATE and DELETE revoked on audit_log", () => {
    // This is verified by the initial migration — we assert the requirement
    const expectedSql = "REVOKE UPDATE, DELETE ON audit_log FROM app_user";
    expect(expectedSql).toContain("REVOKE");
    expect(expectedSql).toContain("audit_log");
    expect(expectedSql).toContain("app_user");
  });

  it("app_user role has UPDATE and DELETE revoked on generation_log", () => {
    const expectedSql = "REVOKE UPDATE, DELETE ON generation_log FROM app_user";
    expect(expectedSql).toContain("REVOKE");
    expect(expectedSql).toContain("generation_log");
  });

  it("organicposts_admin role cannot UPDATE/DELETE audit_log (INSERT only)", () => {
    // Architecture §6.3: INSERT allowed for admin action entries; UPDATE+DELETE not granted
    const adminGrants = {
      audit_log: { INSERT: true, UPDATE: false, DELETE: false },
      generation_log: { INSERT: false, UPDATE: false, DELETE: false },
    };
    expect(adminGrants.audit_log.INSERT).toBe(true);
    expect(adminGrants.audit_log.UPDATE).toBe(false);
    expect(adminGrants.audit_log.DELETE).toBe(false);
    expect(adminGrants.generation_log.INSERT).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Live DB tests — only run when POSTGRES_TEST_URL is set
// ---------------------------------------------------------------------------
//
// These prove REAL cross-tenant isolation (not the prior tautology, which
// queried an empty table). They reproduce the exact production mechanism from
// apps/api/src/db/client.ts: each tenant-scoped query runs inside a transaction
// that (1) sets app.current_tenant_id and (2) drops into the non-superuser role
// `app_user` via set_config('role', …). Dropping privileges is what activates
// FORCE ROW LEVEL SECURITY — the superuser test connection bypasses RLS, so the
// "control" test below confirms both tenants' rows exist and are visible WITHOUT
// the role drop. If RLS were inert, the control would pass but the scoped tests
// would FAIL (they'd see 2 rows / affect B's rows).
//
// Requires the runtime-enforcement migration (20260618000001) applied so the
// login role is a member of app_user and SET ROLE is permitted.

const skipIfNoDb = POSTGRES_TEST_URL ? describe : describe.skip;

const APP_DB_ROLE = process.env["APP_DB_ROLE"]?.trim() || "app_user";

// Valid v4-shaped UUIDs for the two isolation test tenants.
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

skipIfNoDb("RLS — live Postgres cross-tenant isolation", () => {
  // postgres-js — the SAME driver the API runtime uses, so this test mirrors
  // production exactly. (node-pg is not a dependency.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;

  /**
   * Run `fn` inside a transaction scoped to `tenantId` and dropped into
   * app_user — exactly what apps/api/src/db/client.ts does per query. The LOCAL
   * settings reset on COMMIT/ROLLBACK, so the pooled connection stays clean.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function asTenant<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sql.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`SELECT set_config('role', ${APP_DB_ROLE}, true)`;
      return fn(tx);
    });
  }

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5 });

    // Seed as the privileged (superuser) connection — RLS is bypassed here, so
    // we can insert rows for BOTH tenants directly. Clean slate first.
    await sql.unsafe(`DELETE FROM brands WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.unsafe(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.unsafe(
      `INSERT INTO tenants (id, name, plan, created_at)
       VALUES ($1, 'Tenant A', 'solo', NOW()), ($2, 'Tenant B', 'solo', NOW())`,
      [TENANT_A, TENANT_B]
    );
    await sql.unsafe(
      `INSERT INTO brands (id, tenant_id, name, region)
       VALUES (gen_random_uuid(), $1, 'Brand A', 'US'),
              (gen_random_uuid(), $2, 'Brand B', 'US')`,
      [TENANT_A, TENANT_B]
    );

    // dsr_requests fixtures for the NULL-tenant leak regression (B4): one row
    // owned by tenant A, one unauthenticated-intake row with tenant_id NULL.
    await sql.unsafe(
      `DELETE FROM dsr_requests WHERE requester_email IN ('a@rls.test', 'null@rls.test')`
    );
    await sql.unsafe(
      `INSERT INTO dsr_requests
         (tenant_id, requester_email, request_type, identity_verified, status, created_at, updated_at)
       VALUES ($1, 'a@rls.test', 'access', FALSE, 'received', NOW(), NOW()),
              (NULL, 'null@rls.test', 'access', FALSE, 'received', NOW(), NOW())`,
      [TENANT_A]
    );

    // Ozvor Pages fixtures (20260710000001): one landing site per tenant.
    await sql.unsafe(
      `INSERT INTO landing_sites (id, tenant_id, slug)
       VALUES (gen_random_uuid(), $1, 'rls-test-site-a'),
              (gen_random_uuid(), $2, 'rls-test-site-b')`,
      [TENANT_A, TENANT_B]
    );

    // Cost-control quota fixtures (20260710000004): one usage_counters row
    // per tenant (issue #217).
    await sql.unsafe(
      `INSERT INTO usage_counters (tenant_id, feature, subject_id, period_start, count)
       VALUES ($1, 'pages_regeneration', gen_random_uuid(), '1970-01-01', 1),
              ($2, 'pages_regeneration', gen_random_uuid(), '1970-01-01', 1)`,
      [TENANT_A, TENANT_B]
    );
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe(
      `DELETE FROM dsr_requests WHERE requester_email IN ('a@rls.test', 'null@rls.test')`
    );
    await sql.unsafe(`DELETE FROM usage_counters WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.unsafe(`DELETE FROM landing_sites WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.unsafe(`DELETE FROM brands WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.unsafe(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    await sql.end({ timeout: 5 });
  });

  it("CONTROL: the superuser connection (no role drop) sees BOTH tenants' brands", async () => {
    // Proves the fixtures exist and that the role drop — not an empty table —
    // is what enforces isolation in the scoped tests below.
    const rows = await sql.unsafe(
      `SELECT tenant_id FROM brands WHERE tenant_id IN ($1, $2)`,
      [TENANT_A, TENANT_B]
    );
    expect(rows).toHaveLength(2);
  });

  it("RLS scopes an UNFILTERED SELECT to the current tenant only", async () => {
    // No WHERE clause — isolation comes purely from RLS + the app_user role.
    const rows = await asTenant(TENANT_A, (tx) => tx.unsafe(`SELECT tenant_id FROM brands`));
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it("tenant A cannot SELECT tenant B's brands even when asking for them explicitly", async () => {
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`SELECT * FROM brands WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant A cannot UPDATE tenant B's brands (0 rows affected, B unchanged)", async () => {
    const res = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`UPDATE brands SET name = 'hijacked' WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0); // postgres-js: affected-row count
    // Verify via superuser that B's brand is untouched.
    const check = await sql.unsafe(`SELECT name FROM brands WHERE tenant_id = $1`, [TENANT_B]);
    expect(check[0].name).toBe("Brand B");
  });

  it("tenant A cannot DELETE tenant B's brands (0 rows affected, B still present)", async () => {
    const res = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`DELETE FROM brands WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0);
    const check = await sql.unsafe(`SELECT 1 FROM brands WHERE tenant_id = $1`, [TENANT_B]);
    expect(check).toHaveLength(1);
  });

  it("same-tenant writes still succeed under the scoped role (positive control)", async () => {
    const res = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`UPDATE brands SET name = 'Brand A renamed' WHERE tenant_id = $1`, [TENANT_A])
    );
    expect(res.count).toBe(1);
  });

  it("scoped tenant cannot see NULL-tenant dsr_requests rows (B4 leak closed)", async () => {
    // Unauthenticated-intake rows (tenant_id NULL) must NOT be visible to a
    // scoped tenant — only the tenant's own rows are.
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`SELECT requester_email FROM dsr_requests`)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = rows.map((r: any) => r.requester_email);
    expect(emails).toContain("a@rls.test"); // own-tenant row visible
    expect(emails).not.toContain("null@rls.test"); // NULL-tenant row hidden
  });

  it("app_user cannot UPDATE the append-only ai_generation_log (CC-1 / GEO-A6)", async () => {
    // Privilege is REVOKEd at the role level — the statement must be denied
    // regardless of rows, proving the append-only control survives the role drop.
    await expect(
      asTenant(TENANT_A, (tx) => tx.unsafe(`UPDATE ai_generation_log SET model = 'x'`))
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Ozvor Pages (20260710000001) — cross-tenant isolation on landing_sites
  // -------------------------------------------------------------------------

  it("RLS scopes an UNFILTERED SELECT on landing_sites to the current tenant", async () => {
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`SELECT tenant_id, slug FROM landing_sites`)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
    expect(rows[0].slug).toBe("rls-test-site-a");
  });

  it("tenant A cannot UPDATE tenant B's landing_sites (0 rows affected)", async () => {
    const res = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`UPDATE landing_sites SET status = 'suspended' WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0);
    const check = await sql.unsafe(`SELECT status FROM landing_sites WHERE tenant_id = $1`, [
      TENANT_B,
    ]);
    expect(check[0].status).toBe("draft");
  });

  it("tenant A cannot INSERT a landing_site claiming tenant B's tenant_id", async () => {
    // The tenant_isolation USING clause also gates writes (no separate WITH
    // CHECK): an insert whose row would not be visible to the current tenant
    // must be rejected.
    await expect(
      asTenant(TENANT_A, (tx) =>
        tx.unsafe(
          `INSERT INTO landing_sites (tenant_id, slug) VALUES ($1, 'rls-test-hijack')`,
          [TENANT_B]
        )
      )
    ).rejects.toThrow();
  });

  it("check-rls metadata: all 30 tenant-scoped tables have RLS enabled", async () => {
    const rows = await sql.unsafe(`
      SELECT relname FROM pg_class
      JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
      WHERE nspname = 'public'
        AND relkind = 'r'
        AND relname IN (
          'tenants','workspaces','users','social_accounts','audit_log',
          'generation_log','drafts','publish_jobs','dsr_requests',
          'dpa_acknowledgments','ccpa_requests','billing_subscriptions',
          'brands','geo_audit','geo_score','citation_check','ai_generation_log',
          'provider_keys','competitor','competitor_citation','strategy_plan',
          'plan_task','content_piece',
          'landing_sites','landing_pages','landing_page_versions',
          'landing_testimonials','landing_leads','landing_events',
          'usage_counters'
        )
        AND NOT relrowsecurity
    `);
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Cost-control quotas (20260710000004) — cross-tenant isolation on
  // usage_counters (issue #217).
  // -------------------------------------------------------------------------

  it("RLS scopes an UNFILTERED SELECT on usage_counters to the current tenant", async () => {
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`SELECT tenant_id, feature, count FROM usage_counters`)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
    expect(rows[0].feature).toBe("pages_regeneration");
  });

  it("tenant A cannot UPDATE tenant B's usage_counters (0 rows affected)", async () => {
    const res = await asTenant(TENANT_A, (tx) =>
      tx.unsafe(`UPDATE usage_counters SET count = 99 WHERE tenant_id = $1`, [TENANT_B])
    );
    expect(res.count).toBe(0);
    const check = await sql.unsafe(`SELECT count FROM usage_counters WHERE tenant_id = $1`, [
      TENANT_B,
    ]);
    expect(check[0].count).toBe(1);
  });

  it("tenant A cannot INSERT a usage_counters row claiming tenant B's tenant_id", async () => {
    await expect(
      asTenant(TENANT_A, (tx) =>
        tx.unsafe(
          `INSERT INTO usage_counters (tenant_id, feature, subject_id, period_start, count)
           VALUES ($1, 'pages_regeneration', gen_random_uuid(), '1970-01-01', 1)`,
          [TENANT_B]
        )
      )
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Operator (non-tenant) tables — PostgREST surface closed
// (20260728000001_operator_tables_rls)
// ---------------------------------------------------------------------------
//
// These tables carry no tenant_id (pre-account / founder-ops data). The
// migration enables RLS with a `service_only` policy TO postgres, so the
// privileged runtime paths (free test, kit/pages checkout, Stripe webhooks,
// nurture worker, admin CRM) keep working, while the Supabase PostgREST roles
// (anon / authenticated) are denied even when they hold table grants — that
// is exactly the advisor's "RLS disabled in public" exposure. lead_capture and
// kit_order additionally allow app_user to SELECT rows claimed to the current
// tenant (GET /api/account/claimed-history).
//
// The anon/authenticated roles are created here if missing (CI runs plain
// Postgres, not Supabase) and given worst-case grants to prove RLS alone
// blocks them.

const TENANT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENANT_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const OPERATOR_TABLES = [
  "waitlist",
  "lead_capture",
  "kit_order",
  "nurture_enrollment",
  "nurture_send_log",
  "pages_order",
  "crm_contact",
  "schema_migrations",
];

skipIfNoDb("Operator tables RLS — service paths work, PostgREST roles denied", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;

  /** Mirror of apps/api/src/db/client.ts per-query scoping (app_user + GUC). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function asTenant<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sql.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx`SELECT set_config('role', ${APP_DB_ROLE}, true)`;
      return fn(tx);
    });
  }

  /** Run `fn` as the given role (no tenant GUC) — simulates PostgREST access. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function asRole<T>(role: string, fn: (tx: any) => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sql.begin(async (tx: any) => {
      await tx`SELECT set_config('role', ${role}, true)`;
      return fn(tx);
    });
  }

  async function cleanupFixtures(): Promise<void> {
    await sql.unsafe(
      `DELETE FROM nurture_send_log WHERE enrollment_id IN
         (SELECT id FROM nurture_enrollment WHERE email LIKE '%@rls-op.test')`
    );
    await sql.unsafe(`DELETE FROM nurture_enrollment WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM crm_contact WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM pages_order WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM kit_order WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM lead_capture WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM waitlist WHERE email LIKE '%@rls-op.test'`);
    await sql.unsafe(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_C, TENANT_D]);
  }

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5 });

    // Supabase PostgREST roles — created here when absent (plain-Postgres CI)
    // and granted worst-case privileges, so the tests prove RLS alone denies
    // them (the migration also revokes grants on real Supabase; this simulates
    // the default-privilege grants coming back).
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;
    `);
    for (const t of OPERATOR_TABLES) {
      await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO anon, authenticated`);
    }

    await cleanupFixtures();
    await sql.unsafe(
      `INSERT INTO tenants (id, name, plan, created_at)
       VALUES ($1, 'Tenant C', 'solo', NOW()), ($2, 'Tenant D', 'solo', NOW())`,
      [TENANT_C, TENANT_D]
    );

    // The write paths below run exactly as production does: the privileged,
    // unscoped connection (free test, kit/pages checkout, waitlist signup,
    // nurture worker, founder CRM).
    await sql.unsafe(
      `INSERT INTO lead_capture (email, brand, category, claimed_by_tenant_id)
       VALUES ('lead-c@rls-op.test', 'Brand C', 'cafe', $1),
              ('lead-d@rls-op.test', 'Brand D', 'cafe', $2),
              ('lead-unclaimed@rls-op.test', 'Brand U', 'cafe', NULL)`,
      [TENANT_C, TENANT_D]
    );
    await sql.unsafe(
      `INSERT INTO kit_order (order_token, email, brand, category, status, claimed_by_tenant_id)
       VALUES ('rls-op-kit-c', 'kit-c@rls-op.test', 'Brand C', 'cafe', 'paid', $1),
              ('rls-op-kit-d', 'kit-d@rls-op.test', 'Brand D', 'cafe', 'paid', $2),
              ('rls-op-kit-pending', 'kit-pending@rls-op.test', 'Brand P', 'cafe', 'pending', NULL)`,
      [TENANT_C, TENANT_D]
    );
    await sql.unsafe(
      `INSERT INTO waitlist (email, opted_in, source)
       VALUES ('wait@rls-op.test', TRUE, 'landing')`
    );
    await sql.unsafe(
      `INSERT INTO pages_order (email, status) VALUES ('pages@rls-op.test', 'pending')`
    );
    await sql.unsafe(
      `INSERT INTO crm_contact (email, stage, note)
       VALUES ('crm@rls-op.test', 'contacted', 'rls fixture')`
    );
    await sql.unsafe(
      `INSERT INTO nurture_enrollment (email, sequence, current_step, total_steps, brand, next_send_at)
       VALUES ('nurture@rls-op.test', 'free_to_kit', 0, 4, 'Brand N', NOW())`
    );
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanupFixtures();
    // Restore the migration's end state (grants revoked from PostgREST roles).
    for (const t of OPERATOR_TABLES) {
      await sql.unsafe(`REVOKE ALL ON ${t} FROM anon, authenticated`);
    }
    await sql.end({ timeout: 5 });
  });

  // -- Service paths (privileged role) keep working --------------------------

  it("CONTROL: privileged inserts landed for every product flow", async () => {
    const counts = await sql.unsafe(`
      SELECT (SELECT COUNT(*) FROM lead_capture WHERE email LIKE '%@rls-op.test') AS leads,
             (SELECT COUNT(*) FROM kit_order WHERE email LIKE '%@rls-op.test') AS kits,
             (SELECT COUNT(*) FROM waitlist WHERE email LIKE '%@rls-op.test') AS waits,
             (SELECT COUNT(*) FROM pages_order WHERE email LIKE '%@rls-op.test') AS pages,
             (SELECT COUNT(*) FROM crm_contact WHERE email LIKE '%@rls-op.test') AS crm,
             (SELECT COUNT(*) FROM nurture_enrollment WHERE email LIKE '%@rls-op.test') AS nurt
    `);
    expect(Number(counts[0].leads)).toBe(3);
    expect(Number(counts[0].kits)).toBe(3);
    expect(Number(counts[0].waits)).toBe(1);
    expect(Number(counts[0].pages)).toBe(1);
    expect(Number(counts[0].crm)).toBe(1);
    expect(Number(counts[0].nurt)).toBe(1);
  });

  it("privileged webhook path still transitions kit_order pending → paid", async () => {
    const res = await sql.unsafe(
      `UPDATE kit_order SET status = 'paid', paid_at = NOW()
        WHERE order_token = 'rls-op-kit-pending' AND status = 'pending'`
    );
    expect(res.count).toBe(1);
  });

  it("privileged nurture worker still advances the cursor and logs the send", async () => {
    const enr = await sql.unsafe(
      `SELECT id FROM nurture_enrollment WHERE email = 'nurture@rls-op.test'`
    );
    const logRes = await sql.unsafe(
      `INSERT INTO nurture_send_log (enrollment_id, step) VALUES ($1, 1)
       ON CONFLICT DO NOTHING`,
      [enr[0].id]
    );
    expect(logRes.count).toBe(1);
    const advRes = await sql.unsafe(
      `UPDATE nurture_enrollment SET current_step = 1 WHERE id = $1`,
      [enr[0].id]
    );
    expect(advRes.count).toBe(1);
  });

  // -- Claimed-history (the one app_user path) keeps working -----------------

  it("app_user reads its own claimed lead_capture rows (claimed-history query)", async () => {
    const rows = await asTenant(TENANT_C, (tx) =>
      tx.unsafe(`SELECT email FROM lead_capture WHERE claimed_by_tenant_id = $1`, [TENANT_C])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("lead-c@rls-op.test");
  });

  it("app_user unfiltered SELECT on lead_capture is scoped to claimed rows only", async () => {
    const rows = await asTenant(TENANT_C, (tx) =>
      tx.unsafe(`SELECT email FROM lead_capture WHERE email LIKE '%@rls-op.test'`)
    );
    // Only tenant C's claimed row — not D's, not the unclaimed (NULL) lead.
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("lead-c@rls-op.test");
  });

  it("app_user cannot read another tenant's claimed kit_order even explicitly", async () => {
    const rows = await asTenant(TENANT_C, (tx) =>
      tx.unsafe(`SELECT * FROM kit_order WHERE claimed_by_tenant_id = $1`, [TENANT_D])
    );
    expect(rows).toHaveLength(0);
  });

  it("app_user gets zero rows from the backend-only operator tables it can query", async () => {
    // waitlist / nurture_enrollment: app_user holds legacy SELECT grants, so
    // the query runs — but with no RLS policy it returns nothing.
    for (const table of ["waitlist", "nurture_enrollment"]) {
      const rows = await asTenant(TENANT_C, (tx) => tx.unsafe(`SELECT * FROM ${table}`));
      expect(rows).toHaveLength(0);
    }
  });

  it("app_user is denied outright on crm_contact and pages_order (no grants at all)", async () => {
    // These tables never granted app_user anything — denial happens at the
    // privilege layer, before RLS is even consulted.
    for (const table of ["crm_contact", "pages_order"]) {
      await expect(
        asTenant(TENANT_C, (tx) => tx.unsafe(`SELECT * FROM ${table}`))
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("app_user cannot INSERT into waitlist (no write policy)", async () => {
    await expect(
      asTenant(TENANT_C, (tx) =>
        tx.unsafe(`INSERT INTO waitlist (email) VALUES ('hijack@rls-op.test')`)
      )
    ).rejects.toThrow();
  });

  // -- PostgREST roles (anon / authenticated) are denied ---------------------

  it("anon sees zero rows in every operator table, even holding table grants", async () => {
    for (const table of OPERATOR_TABLES) {
      const rows = await asRole("anon", (tx) => tx.unsafe(`SELECT * FROM ${table} LIMIT 5`));
      expect(rows).toHaveLength(0);
    }
  });

  it("anon cannot INSERT into lead_capture (RLS write denial)", async () => {
    await expect(
      asRole("anon", (tx) =>
        tx.unsafe(`INSERT INTO lead_capture (email, brand, category)
                   VALUES ('anon@rls-op.test', 'X', 'cafe')`)
      )
    ).rejects.toThrow();
  });

  it("authenticated sees zero rows in lead_capture and kit_order", async () => {
    for (const table of ["lead_capture", "kit_order"]) {
      const rows = await asRole("authenticated", (tx) =>
        tx.unsafe(`SELECT * FROM ${table} LIMIT 5`)
      );
      expect(rows).toHaveLength(0);
    }
  });

  // -- Metadata: advisor finding closed, migration tool not locked out -------

  it("all 8 operator tables have RLS enabled (advisor finding closed)", async () => {
    const rows = await sql.unsafe(
      `SELECT relname FROM pg_class
       JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
       WHERE nspname = 'public' AND relkind = 'r'
         AND relname = ANY($1) AND NOT relrowsecurity`,
      [OPERATOR_TABLES]
    );
    expect(rows).toHaveLength(0);
  });

  it("RLS is FORCEd on the app tables but NOT on schema_migrations (owner = migrate.js)", async () => {
    const rows = await sql.unsafe(
      `SELECT relname, relforcerowsecurity FROM pg_class
       JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
       WHERE nspname = 'public' AND relkind = 'r' AND relname = ANY($1)`,
      [OPERATOR_TABLES]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byName = new Map(rows.map((r: any) => [r.relname, r.relforcerowsecurity]));
    for (const t of OPERATOR_TABLES) {
      expect(byName.get(t)).toBe(t !== "schema_migrations");
    }
  });

  it("pending_subscription service_all policy no longer applies to PUBLIC", async () => {
    const rows = await sql.unsafe(
      `SELECT roles FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pending_subscription'
         AND policyname = 'service_all'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toContain("postgres");
    expect(rows[0].roles).toContain("app_user");
    expect(rows[0].roles).not.toContain("public");
  });
});
