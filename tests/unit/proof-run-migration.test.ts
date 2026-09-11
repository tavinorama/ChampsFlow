/**
 * proof-run-migration.test.ts — the SHAPE of ops.proof_run is load-bearing.
 *
 * This migration carries two guarantees that are easy to erase with a
 * well-meaning edit, so they are pinned here rather than left to review:
 *
 *  1. `proof_date DATE NOT NULL UNIQUE` is the COST CAP. The daily job inserts
 *     before it spends, so a retry, a double tick or a manual re-run reads the
 *     existing row instead of buying a second run of the engines. Drop the
 *     UNIQUE and the cap silently becomes "however many times the job runs".
 *  2. No UPDATE grant. A published post quotes these numbers; a measurement
 *     that can be edited afterwards is not evidence of anything.
 *
 * The anonymity split (identity columns exist, but the [__proof__] renderer
 * never reads them) is proven on the feature side, where the renderer lives.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const UP = join(ROOT, "packages/db/migrations/20260911000001_ops_proof_run.up.sql");
const DOWN = join(ROOT, "packages/db/migrations/20260911000001_ops_proof_run.down.sql");

describe("ops.proof_run — a forma que sustenta a prova diária", () => {
  const sql = readFileSync(UP, "utf8");

  it("uma prova por dia, garantido pelo banco e não por uma flag", () => {
    expect(sql).toMatch(/proof_date\s+DATE\s+NOT NULL UNIQUE/);
  });

  it("medição é append-only: sem UPDATE no grant", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT ON ops\.proof_run/);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*ops\.proof_run/i);
  });

  it("a mesma empresa nunca é medida duas vezes", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}lower\(target_email\)/);
  });

  it("guarda o que o post pode dizer e o que só a auditoria vê", () => {
    for (const col of ["segment", "city", "prompt", "engines_live", "cited_engines", "target_cited"]) {
      expect(sql, `coluna publica ${col}`).toContain(col);
    }
    for (const col of ["target_domain", "target_name", "target_email"]) {
      expect(sql, `coluna de auditoria ${col}`).toContain(col);
    }
    // E deixa escrito POR QUE as duas metades existem separadas.
    expect(sql).toMatch(/nunca nome de empresa sem consentimento/i);
  });

  it("o custo do dia fica registado na própria linha", () => {
    expect(sql).toMatch(/cost_cents\s+NUMERIC/);
  });

  it("é reversível", () => {
    expect(existsSync(DOWN)).toBe(true);
    expect(readFileSync(DOWN, "utf8")).toMatch(/DROP TABLE IF EXISTS ops\.proof_run/);
  });

  it("é idempotente — reaplicar não parte", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ops\.proof_run/);
    for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX(?! IF NOT EXISTS)/g)) {
      expect.unreachable(`índice sem IF NOT EXISTS: ${m[0]}`);
    }
  });
});
