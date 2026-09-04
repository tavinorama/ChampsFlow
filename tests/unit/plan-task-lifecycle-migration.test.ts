/**
 * plan-task-lifecycle-migration.test.ts — audit P0-02.
 *
 * Static guards on 20260903000001_plan_task_lifecycle. These do not need a
 * database: they assert the things that would be catastrophic and silent if
 * someone edited the SQL later — chiefly that no backfill path can produce
 * `verified`, and that the widened CHECK actually carries every state the
 * application can write.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(__dirname, "../../packages/db/migrations");
const up = readFileSync(resolve(dir, "20260903000001_plan_task_lifecycle.up.sql"), "utf8");
const down = readFileSync(resolve(dir, "20260903000001_plan_task_lifecycle.down.sql"), "utf8");

/** Statements with comment lines stripped, so prose cannot satisfy a match. */
const upSql = up
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("status CHECK grows to the full lifecycle", () => {
  // Every state packages/llm/src/plan-task-state.ts can write must be
  // accepted by the database, or the state machine 500s in production.
  const required = [
    "proposed",
    "drafting",
    "review",
    "published",
    "indexed",
    "cited",
    "verified",
    "rejected",
    "blocked",
    "expired",
    "regressed",
    "accepted",
    "client_acknowledged",
    "manual_done_pending_verification",
    "legacy_self_reported",
  ];

  it.each(required)("the CHECK accepts %s", (state) => {
    expect(upSql).toMatch(new RegExp(`'${state}'`));
  });

  it("keeps 'done' only as a tolerated legacy value, for deploy ordering", () => {
    expect(upSql).toMatch(/'done'/);
    // and it must be converted away, not left meaning "complete"
    expect(upSql).toMatch(/UPDATE plan_task[\s\S]*?status\s*=\s*'legacy_self_reported'[\s\S]*?WHERE status = 'done'/);
  });
});

describe("the backfill can never manufacture proof", () => {
  it("never writes 'verified' into plan_task", () => {
    // Any statement that writes to plan_task and mentions 'verified' is a bug.
    // The guard block's `WHERE status = 'verified'` is a SELECT, not a write,
    // so it is correctly out of scope here and covered by the next test.
    const writes = upSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => /^(UPDATE plan_task\b|INSERT INTO plan_task\s*\()/i.test(s));

    expect(writes.length).toBeGreaterThan(0); // the backfill exists at all
    for (const stmt of writes) {
      expect(stmt).not.toMatch(/'verified'/);
    }
  });

  it("raises rather than commits if any verified row appears", () => {
    expect(upSql).toMatch(/RAISE EXCEPTION/);
    expect(upSql).toMatch(/COUNT\(\*\) INTO n FROM plan_task WHERE status = 'verified'/);
  });

  it("writes a history row for every pre-existing task", () => {
    expect(upSql).toMatch(/INSERT INTO plan_task_transition/);
    expect(upSql).toMatch(/FROM plan_task t/);
  });

  it("is re-runnable — the history insert skips tasks already recorded", () => {
    expect(upSql).toMatch(/WHERE NOT EXISTS[\s\S]*?plan_task_transition x WHERE x\.task_id = t\.id/);
  });
});

describe("history is append-only", () => {
  it("grants app_user INSERT and SELECT, never UPDATE or DELETE", () => {
    const grant = upSql.match(/GRANT[^;]*plan_task_transition TO app_user/)?.[0] ?? "";
    expect(grant).toContain("SELECT");
    expect(grant).toContain("INSERT");
    expect(grant).not.toContain("UPDATE");
    expect(grant).not.toContain("DELETE");
  });

  it("carries actor, timestamp, evidence, reason and artifact URL", () => {
    for (const col of ["actor_type", "created_at", "evidence", "reason", "artifact_url", "from_state", "to_state"]) {
      expect(upSql).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("is tenant-isolated like every other tenant table", () => {
    expect(upSql).toMatch(/ALTER TABLE plan_task_transition ENABLE ROW LEVEL SECURITY/);
    expect(upSql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(upSql).toMatch(/CREATE POLICY tenant_isolation ON plan_task_transition/);
  });
});

describe("verified_at cannot outlive the state", () => {
  it("the database refuses a verified_at stamp on a non-verified row", () => {
    expect(upSql).toMatch(/plan_task_verified_at_check[\s\S]*?verified_at IS NULL OR status = 'verified'/);
  });
});

describe("down migration", () => {
  it("narrows the CHECK back to the four legacy values", () => {
    expect(down).toMatch(/CHECK \(status IN \('proposed', 'accepted', 'rejected', 'done'\)\)/);
  });

  it("collapses lifecycle states before narrowing, so the constraint can apply", () => {
    const collapseAt = down.indexOf("UPDATE plan_task SET status = 'done'");
    const constraintAt = down.indexOf("ADD CONSTRAINT plan_task_status_check");
    expect(collapseAt).toBeGreaterThan(-1);
    expect(constraintAt).toBeGreaterThan(collapseAt);
  });

  it("drops every column and object the up migration added", () => {
    for (const col of ["verified_at", "artifact_url", "state_reason", "state_actor", "state_changed_at"]) {
      expect(down).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`));
    }
    expect(down).toMatch(/DROP TABLE IF EXISTS plan_task_transition/);
  });

  it("says in writing that rolling back loses the evidence", () => {
    expect(down.toLowerCase()).toContain("loses evidence");
  });
});

describe("both files are transactional", () => {
  it.each([
    ["up", up],
    ["down", down],
  ])("%s runs in a single transaction", (_name, sql) => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
