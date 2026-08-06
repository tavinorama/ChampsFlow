/**
 * Agent substrate (#161a) — the organization's memory of itself.
 *
 * What these tests pin:
 *  - the migration's three decided shapes (parent_step_id IS the graph,
 *    vp_owner IS #151's chaining key, outcome IS the read-it-back row);
 *  - the privacy discipline: hashes and a bounded summary, never raw text —
 *    at the schema, in the lib's surface, and in the truncation behaviour;
 *  - append-only outcomes at the GRANT level (a verdict that can be edited
 *    is not a verdict);
 *  - computeLift's contract, because every specialist (#156) will speak in
 *    this unit and a quiet definition change would silently reweight every
 *    lesson ever learned.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeLift,
  MAX_STEP_SUMMARY_CHARS,
} from "../../apps/api/src/lib/agent-substrate";

const root = join(__dirname, "../..");
const migration = readFileSync(
  join(root, "packages/db/migrations/20260806000002_ops_agent_substrate.up.sql"),
  "utf8"
);
const lib = readFileSync(join(root, "apps/api/src/lib/agent-substrate.ts"), "utf8");

describe("the migration — three decided shapes", () => {
  it("lives in its own schema: ops data is unreachable through tenant paths", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS ops");
    for (const t of ["ops.agent_run", "ops.agent_step", "ops.agent_outcome"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it("parent_step_id IS the graph — one self-referencing column, no framework", () => {
    expect(migration).toMatch(/parent_step_id\s+UUID\s+REFERENCES ops\.agent_step \(id\)/);
  });

  it("vp_owner is constrained to the real org chart — #151's GROUP BY key", () => {
    expect(migration).toMatch(
      /vp_owner[\s\S]{0,200}CHECK \(vp_owner IN \('engineering', 'marketing', 'sales', 'finance', 'legal', 'cx', 'ceo'\)\)/
    );
  });

  it("stores hashes, never transcripts — no raw text column exists", () => {
    expect(migration).toContain("input_hash");
    expect(migration).toContain("output_hash");
    // Strip SQL comments first: the migration's prose EXPLAINS why transcripts
    // are excluded, and that explanation must not trip the check that enforces
    // it (today's third instance of the comment-vs-code lesson).
    const sql = migration.replace(/--.*$/gm, "");
    for (const forbidden of ["raw_text", "transcript", "prompt_text", "output_text"]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("outcomes are append-only by GRANT — no UPDATE for the runtime role", () => {
    expect(migration).toMatch(/GRANT SELECT, INSERT ON ops\.agent_outcome TO app_user/);
    expect(migration).toMatch(/REVOKE UPDATE, DELETE ON ops\.agent_outcome FROM app_user/);
  });

  it("the founder's rule is written where the schema lives: the watcher stays outside", () => {
    expect(migration.toLowerCase()).toContain("watcher stays outside the watched");
  });

  it("has a reversible down migration", () => {
    const down = readFileSync(
      join(root, "packages/db/migrations/20260806000002_ops_agent_substrate.down.sql"),
      "utf8"
    );
    for (const t of ["agent_outcome", "agent_step", "agent_run"]) {
      expect(down).toContain(`DROP TABLE IF EXISTS ops.${t}`);
    }
    expect(down).toContain("DROP SCHEMA IF EXISTS ops");
  });
});

describe("computeLift — the one unit every lesson speaks", () => {
  it("is after/before − 1", () => {
    expect(computeLift(100, 125)).toBeCloseTo(0.25, 10);
    expect(computeLift(200, 100)).toBeCloseTo(-0.5, 10);
    expect(computeLift(50, 50)).toBe(0);
  });

  it("refuses to invent a lift without a baseline — null, not zero, not Infinity", () => {
    expect(computeLift(0, 500)).toBeNull();
    expect(computeLift(null, 500)).toBeNull();
    expect(computeLift(undefined, 500)).toBeNull();
    expect(computeLift(100, null)).toBeNull();
    expect(computeLift(-5, 100)).toBeNull();
  });
});

describe("the lib's privacy surface", () => {
  it("run totals are summed from steps, never typed by the caller", () => {
    // finishRun computes cost_cents from agent_step — the api_spend disease
    // (a total that drifts from its parts) structurally cannot recur here.
    expect(lib).toMatch(/SELECT COALESCE\(SUM\(cost_cents\), 0\) FROM ops\.agent_step/);
  });

  it("summaries are capped, and an oversized one is logged, not hidden", () => {
    expect(MAX_STEP_SUMMARY_CHARS).toBe(500);
    expect(lib).toContain("agent_step_summary_truncated");
  });

  it("no parameter on the surface could carry a transcript", () => {
    // Strip comments first (the lesson testid-contract learned today): the
    // check must read the API surface, not the prose about it.
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["rawText", "transcript", "promptText", "outputText", "bodyText"]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("the loop-is-broken query exists — absent verdicts are queryable, not invisible", () => {
    expect(lib).toMatch(/NOT EXISTS \(SELECT 1 FROM ops\.agent_outcome/);
  });
});
